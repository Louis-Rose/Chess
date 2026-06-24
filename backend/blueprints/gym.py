"""Gym sub-app — syncs a Notion gym log and serves dashboard data.

Private to a single owner (see blueprints.auth_utils.owner_required).
Notion page layout: first table block on the page; column headers are dates
(DD/MM/YY), rows alternate between muscle-group labels and exercise rows.
"""

import logging
import os
import re
from datetime import date, datetime, timedelta

import requests as http_requests
from flask import Blueprint, jsonify, request

from auth import get_current_user
from database import get_db
from blueprints.auth_utils import is_owner, owner_required

logger = logging.getLogger(__name__)

gym_bp = Blueprint('gym', __name__)

NOTION_API = 'https://api.notion.com/v1'
NOTION_VERSION = '2022-06-28'

MUSCLE_HEADERS = {
    'SHOULDERS', 'CHEST', 'BACK', 'TRICEPS', 'BICEPS',
    'ABS', 'LEGS', 'OTHER', 'BODY WEIGHT', 'RESULTS',
}

SKIP_ROW_LABELS = {'RESULTS', 'BODY WEIGHT'}


# ── Notion fetch ─────────────────────────────────────────────────────────────

def _notion_headers():
    token = os.environ.get('NOTION_GYM_TOKEN')
    if not token:
        raise RuntimeError('NOTION_GYM_TOKEN not set')
    return {
        'Authorization': f'Bearer {token}',
        'Notion-Version': NOTION_VERSION,
    }


def _fetch_children(block_id: str) -> list:
    """Fetch all children of a block, paginating."""
    out = []
    start_cursor = None
    while True:
        params = {'page_size': 100}
        if start_cursor:
            params['start_cursor'] = start_cursor
        r = http_requests.get(
            f'{NOTION_API}/blocks/{block_id}/children',
            headers=_notion_headers(),
            params=params,
            timeout=30,
        )
        r.raise_for_status()
        data = r.json()
        out.extend(data.get('results', []))
        if not data.get('has_more'):
            break
        start_cursor = data.get('next_cursor')
    return out


def _cell_text(cell) -> str:
    return ''.join(r.get('plain_text', '') for r in cell)


def _fetch_gym_table() -> list:
    """Return the gym table rows as lists of cell strings. First row = headers."""
    page_id = os.environ.get('NOTION_GYM_PAGE_ID')
    if not page_id:
        raise RuntimeError('NOTION_GYM_PAGE_ID not set')
    blocks = _fetch_children(page_id)
    # Pick the widest table on the page (the main log)
    tables = [b for b in blocks if b['type'] == 'table']
    if not tables:
        raise RuntimeError('No table block found on gym page')
    main_table = max(tables, key=lambda b: b['table']['table_width'])
    rows = _fetch_children(main_table['id'])
    return [[_cell_text(c) for c in r['table_row']['cells']] for r in rows]


# ── Parsing ──────────────────────────────────────────────────────────────────

DATE_RE = re.compile(r'^\s*(\d{1,2})/(\d{1,2})/(\d{2,4})\s*$')
# Matches "N x W" possibly with comma-separated reps and/or comma-separated weights
SET_RE = re.compile(r'([\d,\s]+)\s*[x×]\s*([\d.,\s]+)')


def _parse_date(s: str) -> date | None:
    m = DATE_RE.match(s.strip())
    if not m:
        return None
    d, mo, y = m.group(1), m.group(2), m.group(3)
    if len(y) == 2:
        y = '20' + y
    try:
        return date(int(y), int(mo), int(d))
    except ValueError:
        return None


def _exercise_name(label: str) -> str:
    """Normalize exercise label from column 0 (strip #N, parenthetical notes)."""
    parts = [p.strip() for p in label.split('\n') if p.strip()]
    cleaned = []
    for p in parts:
        if p.startswith('(') and p.endswith(')'):
            continue
        p = re.sub(r'^#\d+\s*', '', p)
        p = re.sub(r'^#\?\s*', '', p)
        if p:
            cleaned.append(p)
    return ' '.join(cleaned).strip() or label.split('\n')[0].strip()


_BODYWEIGHT_RE = re.compile(r'^\d+(?:\s*\+\s*\d+)*$')


def _parse_cell_lines(cell_text: str) -> list[dict]:
    """Return one entry per logged line in a cell:
        {is_warmup, raw_line, pairs}
    where `pairs` is the ordered list of (reps, weight_kg) parsed from the
    line's comma-separated tokens. _parse_table decides what the tokens mean:
    for a single exercise they are successive sets (a dropset), and for an
    "A → B" superset row they map positionally to the two exercises.

    Handles:
      - "10 x 52.3"        → pairs [(10, 52.3)]
      - "(10 x 27)"        → warmup, pairs [(10, 27)]
      - "15,12 x 24.8,18"  → pairs [(15, 24.8), (12, 18)]
      - "12,7 x 24.8,18"   → pairs [(12, 24.8), (7, 18)]
      - "3 x 30% ROM"      → pairs [(3, 0.0)]  (`%` = ROM, not kilograms)
      - "4"                → bodyweight, pairs [(4, 0.0)]
      - "2 + 4 (50%)"      → bodyweight, pairs [(2, 0.0), (4, 0.0)]
    A lone +/=/-/*/→ line is a marker (PR / same / down / next), not a set.
    """
    entries = []
    for raw_line in cell_text.split('\n'):
        line = raw_line.strip()
        if not line or line in {'+', '=', '-', '*', '→'}:
            continue

        is_warmup = line.startswith('(') and ')' in line
        if is_warmup:
            content = line[1:line.rindex(')')].strip()
        else:
            # Strip trailing "(...)" annotations on non-warmup lines
            content = re.sub(r'\s*\([^)]*\)\s*$', '', line).strip()

        pairs = []
        m = SET_RE.search(content)
        if m:
            rep_tokens = [t.strip() for t in m.group(1).split(',') if t.strip()]
            weight_tokens = [t.strip() for t in m.group(2).split(',') if t.strip()]
            if not rep_tokens or not weight_tokens:
                continue
            for i, rep_tok in enumerate(rep_tokens):
                mrep = re.match(r'^(\d+)', rep_tok)
                if not mrep:
                    continue
                reps = int(mrep.group(1))
                weight_tok = weight_tokens[i] if i < len(weight_tokens) else weight_tokens[-1]
                mw = re.match(r'^(\d+(?:\.\d+)?)', weight_tok)
                # `30% ROM` means partial range of motion, not kilograms —
                # the regex captured '30', but '%' follows in the raw content.
                post = content[m.end(2):m.end(2) + 2] if mw else ''
                weight = float(mw.group(1)) if (mw and '%' not in weight_tok and '%' not in post) else 0.0
                pairs.append((reps, weight))
        elif _BODYWEIGHT_RE.match(content):
            pairs = [(int(part), 0.0) for part in re.split(r'\s*\+\s*', content)]

        if pairs:
            entries.append({'is_warmup': is_warmup, 'raw_line': raw_line.strip(), 'pairs': pairs})
    return entries


def _parse_table(rows: list[list[str]]) -> list[dict]:
    """Walk the table and emit one record per set.

    Returns list of dicts: {session_date, muscle_group, exercise, reps, weight_kg,
    raw_line, is_warmup}.
    """
    if not rows:
        return []
    header = rows[0]
    dates = [_parse_date(c) for c in header]
    records = []
    current_muscle = 'UNKNOWN'
    for row in rows[1:]:
        if not row:
            continue
        label = row[0].strip()
        if not label:
            continue
        label_first = label.split('\n')[0].strip()
        if label_first in SKIP_ROW_LABELS:
            continue
        # Muscle-group header row: single cell with only the group name, rest blank
        if label_first.upper() in MUSCLE_HEADERS and all(not c.strip() for c in row[1:]):
            current_muscle = label_first.upper()
            continue
        exercise = _exercise_name(label)
        if not exercise:
            continue
        # "A → B" is two exercises supersetted on one line: each line's comma
        # tokens map positionally to the parts (first → A, second → B). A single
        # exercise keeps the dropset reading — every token is one of its sets.
        parts = [p.strip() for p in exercise.split('→') if p.strip()] or [exercise]
        for col_idx, cell in enumerate(row[1:], start=1):
            if col_idx >= len(dates):
                continue
            d = dates[col_idx]
            if not d or not cell.strip():
                continue
            for entry in _parse_cell_lines(cell):
                for i, (reps, weight) in enumerate(entry['pairs']):
                    name = parts[0] if len(parts) == 1 else parts[min(i, len(parts) - 1)]
                    records.append({
                        'session_date': d,
                        'muscle_group': current_muscle,
                        'exercise': name,
                        'reps': reps,
                        'weight_kg': weight,
                        'is_warmup': entry['is_warmup'],
                        'raw_line': entry['raw_line'],
                    })
    return records


# ── Endpoints ────────────────────────────────────────────────────────────────

@gym_bp.route('/api/gym/access', methods=['GET'])
def gym_access():
    """Lightweight probe: does the current user own the gym app?"""
    return jsonify({'allowed': is_owner(get_current_user())})


def resync_gym_sets():
    """Fetch the Notion page, re-parse, and replace all gym_sets rows.

    Returns (set_count, exercise_count). Shared by the /api/gym/sync endpoint
    and the one-off migration CLI (backend/resync_gym.py) so both stay in sync.
    """
    rows = _fetch_gym_table()
    records = _parse_table(rows)
    with get_db() as conn:
        conn.execute('DELETE FROM gym_sets')
        for r in records:
            conn.execute(
                """INSERT INTO gym_sets
                   (session_date, muscle_group, exercise, reps, weight_kg, raw_line, is_warmup)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (r['session_date'], r['muscle_group'], r['exercise'],
                 r['reps'], r['weight_kg'], r['raw_line'], r['is_warmup'])
            )
        conn.execute('DELETE FROM gym_sync_meta')
        conn.execute(
            'INSERT INTO gym_sync_meta (id, last_synced_at, last_status) VALUES (1, CURRENT_TIMESTAMP, ?)',
            ('ok',)
        )
    return len(records), len({r['exercise'] for r in records})


@gym_bp.route('/api/gym/sync', methods=['POST'])
@owner_required
def sync_gym():
    """Fetch the Notion page, re-parse, replace all rows."""
    try:
        set_count, exercise_count = resync_gym_sets()
    except http_requests.HTTPError as e:
        logger.exception('Notion fetch failed')
        return jsonify({'error': f'Notion API error: {e}'}), 502
    except Exception as e:
        logger.exception('Gym sync failed')
        return jsonify({'error': str(e)}), 500

    return jsonify({'synced': True, 'set_count': set_count, 'exercise_count': exercise_count})


AUTO_ARCHIVE_DAYS = 30


@gym_bp.route('/api/gym/exercises/ignore', methods=['POST'])
@owner_required
def gym_toggle_ignore():
    """Archive or restore an exercise.

    state='archived'     → always ignored
    state='forced_active' → never auto-archived even if days_since > threshold
    no row               → auto-archive applies (ignored iff days_since > 30)
    """
    body = request.get_json(silent=True) or {}
    exercise = (body.get('exercise') or '').strip()
    ignored = bool(body.get('ignored'))
    if not exercise:
        return jsonify({'error': 'exercise required'}), 400
    new_state = 'archived' if ignored else 'forced_active'
    with get_db() as conn:
        conn.execute(
            """INSERT INTO gym_ignored_exercises (exercise, state) VALUES (?, ?)
               ON CONFLICT (exercise) DO UPDATE SET state = EXCLUDED.state""",
            (exercise, new_state)
        )
    return jsonify({'ok': True, 'exercise': exercise, 'ignored': ignored})


@gym_bp.route('/api/gym/dashboard', methods=['GET'])
@owner_required
def gym_dashboard():
    """Return: exercises with days-since-last + sets-per-week series.

    Excludes warmups from all stats.
    """
    today = date.today()
    # Build a list of the last 12 ISO week keys ending at this week, so
    # charts show empty weeks instead of silently compressing gaps.
    week_window = []
    for i in range(11, -1, -1):
        d = today - timedelta(weeks=i)
        iso_year, iso_week, _ = d.isocalendar()
        week_window.append(f'{iso_year}-W{iso_week:02d}')

    with get_db() as conn:
        sync_row = conn.execute(
            'SELECT last_synced_at FROM gym_sync_meta WHERE id = 1'
        ).fetchone()
        sets = conn.execute(
            """SELECT session_date, muscle_group, exercise, reps, weight_kg, is_warmup
               FROM gym_sets
               ORDER BY session_date ASC, id ASC"""
        ).fetchall()
        states = {r['exercise']: r['state'] for r in conn.execute(
            'SELECT exercise, state FROM gym_ignored_exercises'
        ).fetchall()}

    by_ex: dict[str, dict] = {}
    weekly_by_ex: dict[tuple[str, str], int] = {}
    sessions_by_ex: dict[str, dict[str, list]] = {}
    for s in sets:
        ex = s['exercise']
        d = s['session_date']
        # Collect per-session set lists (warmups included for display)
        session_map = sessions_by_ex.setdefault(ex, {})
        session_map.setdefault(d.isoformat(), []).append({
            'reps': s['reps'],
            'weight_kg': s['weight_kg'],
            'is_warmup': s['is_warmup'],
        })
        if s['is_warmup']:
            continue
        slot = by_ex.setdefault(ex, {
            'exercise': ex,
            'muscle_group': s['muscle_group'],
            'last_date': d,
            'set_count': 0,
            'sets_last_7d': 0,
            'best_weight_kg': 0.0,
        })
        if d > slot['last_date']:
            slot['last_date'] = d
        slot['set_count'] += 1
        if (today - d).days < 7:
            slot['sets_last_7d'] += 1
        if (s['weight_kg'] or 0) > slot['best_weight_kg']:
            slot['best_weight_kg'] = s['weight_kg'] or 0
        iso_year, iso_week, _ = d.isocalendar()
        wkey = f'{iso_year}-W{iso_week:02d}'
        weekly_by_ex[(ex, wkey)] = weekly_by_ex.get((ex, wkey), 0) + 1

    exercises = []
    for ex, slot in by_ex.items():
        ex_weekly = {w: n for (e, w), n in weekly_by_ex.items() if e == ex}
        series = [{'week': w, 'sets': ex_weekly.get(w, 0)} for w in week_window]
        days_since = (today - slot['last_date']).days
        state = states.get(ex)
        if state == 'archived':
            is_ignored = True
        elif state == 'forced_active':
            is_ignored = False
        else:
            is_ignored = days_since > AUTO_ARCHIVE_DAYS
        sessions = [
            {'date': d, 'sets': sets_list}
            for d, sets_list in sorted(sessions_by_ex.get(ex, {}).items(), reverse=True)
        ][:20]  # keep payload bounded
        exercises.append({
            'exercise': ex,
            'muscle_group': slot['muscle_group'],
            'last_date': slot['last_date'].isoformat(),
            'days_since': days_since,
            'total_sets': slot['set_count'],
            'sets_last_7d': slot['sets_last_7d'],
            'best_weight_kg': slot['best_weight_kg'],
            'weekly_sets': series,
            'ignored': is_ignored,
            'sessions': sessions,
        })

    exercises.sort(key=lambda e: e['days_since'], reverse=True)

    return jsonify({
        'last_synced_at': sync_row['last_synced_at'].isoformat() if sync_row and sync_row['last_synced_at'] else None,
        'today': today.isoformat(),
        'exercises': exercises,
    })
