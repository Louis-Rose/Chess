"""Gym sub-app — syncs a Notion gym log and serves dashboard data.

Private to a single owner, gated by email match against GYM_OWNER_EMAIL.
Notion page layout: first table block on the page; column headers are dates
(DD/MM/YY), rows alternate between muscle-group labels and exercise rows.
"""

import logging
import os
import re
from datetime import date, datetime, timedelta
from functools import wraps

import requests as http_requests
from flask import Blueprint, jsonify, request

from auth import get_current_user
from database import get_db

logger = logging.getLogger(__name__)

gym_bp = Blueprint('gym', __name__)

NOTION_API = 'https://api.notion.com/v1'
NOTION_VERSION = '2022-06-28'

MUSCLE_HEADERS = {
    'SHOULDERS', 'CHEST', 'BACK', 'TRICEPS', 'BICEPS',
    'ABS', 'LEGS', 'OTHER', 'BODY WEIGHT', 'RESULTS',
}

SKIP_ROW_LABELS = {'RESULTS', 'BODY WEIGHT'}


def owner_required(f):
    """Restrict to the configured gym owner email."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        owner_email = os.environ.get('GYM_OWNER_EMAIL', '').strip().lower()
        if not owner_email:
            return jsonify({'error': 'Gym app not configured'}), 500
        user_id = get_current_user()
        if user_id is None:
            return jsonify({'error': 'Authentication required'}), 401
        with get_db() as conn:
            row = conn.execute('SELECT email FROM users WHERE id = ?', (user_id,)).fetchone()
        if not row or (row['email'] or '').strip().lower() != owner_email:
            return jsonify({'error': 'Forbidden'}), 403
        return f(*args, **kwargs)
    return wrapper


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


def _parse_cell_sets(cell_text: str) -> list[dict]:
    """Return a list of {reps, weight_kg, is_warmup, raw_line} from one cell."""
    out = []
    for raw_line in cell_text.split('\n'):
        line = raw_line.strip()
        if not line:
            continue
        # Skip session ratings on their own line
        if line in {'+', '=', '-', '*', '→'}:
            continue
        is_warmup = line.startswith('(') and ')' in line
        content = line.strip('()').split(')')[0] if is_warmup else line
        # Strip trailing rating / annotation after whitespace
        # Example lines to handle: "10 x 52.3", "11, 12 x 4.5",
        # "15,12 x 24.8,18", "13+7 x 20.3", "4 (slow, 50%)", "3 x 30% ROM"
        m = SET_RE.search(content)
        if not m:
            continue
        reps_part = m.group(1)
        weight_part = m.group(2)
        # Reps: split on comma — multi-set shorthand. Otherwise single value.
        rep_tokens = [t.strip() for t in reps_part.split(',') if t.strip()]
        weight_tokens = [t.strip() for t in weight_part.split(',') if t.strip()]
        if not rep_tokens or not weight_tokens:
            continue
        for i, rep_tok in enumerate(rep_tokens):
            # Reps must be a plain integer (ignore things like "+7")
            mrep = re.match(r'^(\d+)', rep_tok)
            if not mrep:
                continue
            reps = int(mrep.group(1))
            weight_tok = weight_tokens[i] if i < len(weight_tokens) else weight_tokens[-1]
            mw = re.match(r'^(\d+(?:\.\d+)?)', weight_tok)
            weight = float(mw.group(1)) if mw else 0.0
            out.append({
                'reps': reps,
                'weight_kg': weight,
                'is_warmup': is_warmup,
                'raw_line': raw_line.strip(),
            })
    return out


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
        for col_idx, cell in enumerate(row[1:], start=1):
            if col_idx >= len(dates):
                continue
            d = dates[col_idx]
            if not d or not cell.strip():
                continue
            for s in _parse_cell_sets(cell):
                records.append({
                    'session_date': d,
                    'muscle_group': current_muscle,
                    'exercise': exercise,
                    **s,
                })
    return records


# ── Endpoints ────────────────────────────────────────────────────────────────

@gym_bp.route('/api/gym/access', methods=['GET'])
def gym_access():
    """Lightweight probe: does the current user own the gym app?"""
    owner_email = os.environ.get('GYM_OWNER_EMAIL', '').strip().lower()
    user_id = get_current_user()
    if not owner_email or user_id is None:
        return jsonify({'allowed': False})
    with get_db() as conn:
        row = conn.execute('SELECT email FROM users WHERE id = ?', (user_id,)).fetchone()
    allowed = bool(row and (row['email'] or '').strip().lower() == owner_email)
    return jsonify({'allowed': allowed})


@gym_bp.route('/api/gym/sync', methods=['POST'])
@owner_required
def sync_gym():
    """Fetch the Notion page, re-parse, replace all rows."""
    try:
        rows = _fetch_gym_table()
    except http_requests.HTTPError as e:
        logger.exception('Notion fetch failed')
        return jsonify({'error': f'Notion API error: {e}'}), 502
    except Exception as e:
        logger.exception('Gym sync failed')
        return jsonify({'error': str(e)}), 500

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
    return jsonify({
        'synced': True,
        'set_count': len(records),
        'exercise_count': len({r['exercise'] for r in records}),
    })


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
            """SELECT session_date, muscle_group, exercise, reps, weight_kg
               FROM gym_sets
               WHERE is_warmup = FALSE
               ORDER BY session_date ASC"""
        ).fetchall()
        states = {r['exercise']: r['state'] for r in conn.execute(
            'SELECT exercise, state FROM gym_ignored_exercises'
        ).fetchall()}

    by_ex: dict[str, dict] = {}
    weekly_by_ex: dict[tuple[str, str], int] = {}
    for s in sets:
        ex = s['exercise']
        d = s['session_date']
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
        # Week key: ISO year-week of the session date
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
        })

    exercises.sort(key=lambda e: e['days_since'], reverse=True)

    return jsonify({
        'last_synced_at': sync_row['last_synced_at'].isoformat() if sync_row and sync_row['last_synced_at'] else None,
        'today': today.isoformat(),
        'exercises': exercises,
    })
