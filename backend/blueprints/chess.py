"""Chess sub-app — private, owner-only.

Fetches the owner's chess.com rapid games and serves these in one pass:
  - overall win/draw/loss record,
  - monthly game counts (bar chart),
  - win/draw/loss split by a game's position within its day (stacked bars),
  - win rate after a win/draw/loss for consecutive same-day games (table),
  - wait time vs. result for games that follow a same-day win (scatter).

Gated to the site owner via GYM_OWNER_EMAIL (reused as the single owner email).
"""

import logging
import os
import re
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from functools import wraps
from zoneinfo import ZoneInfo

import requests as http_requests
from flask import Blueprint, jsonify, request

from auth import get_current_user
from database import get_db

logger = logging.getLogger(__name__)

chess_bp = Blueprint('chess', __name__)

CHESS_USERNAME = 'akyrosu'
_USER_AGENT = 'LUMNA/1.0 (https://lumna.co; rose.louis.mail@gmail.com)'


# ── Owner gate ───────────────────────────────────────────────────────────────

def owner_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        owner_email = os.environ.get('GYM_OWNER_EMAIL', '').strip().lower()
        if not owner_email:
            return jsonify({'error': 'Owner not configured'}), 500
        user_id = get_current_user()
        if user_id is None:
            return jsonify({'error': 'Authentication required'}), 401
        with get_db() as conn:
            row = conn.execute('SELECT email FROM users WHERE id = ?', (user_id,)).fetchone()
        if not row or (row['email'] or '').strip().lower() != owner_email:
            return jsonify({'error': 'Forbidden'}), 403
        return f(*args, **kwargs)
    return wrapper


def _fetch_json(url):
    resp = http_requests.get(url, headers={'User-Agent': _USER_AGENT}, timeout=20)
    resp.raise_for_status()
    return resp.json()


_DRAW_RESULTS = {'stalemate', 'agreed', 'repetition', 'insufficient', '50move', 'timevsinsufficient'}
_SCORE = {'win': 1.0, 'draw': 0.5, 'loss': 0.0}

_PARIS = ZoneInfo('Europe/Paris')
_DAY_CUTOFF_HOUR = 3  # a "chess day" runs 3am → 3am Paris time


def _result(code):
    if code == 'win':
        return 'win'
    if code in _DRAW_RESULTS:
        return 'draw'
    return 'loss'


def _parse_start_time(g):
    """Game start as a unix timestamp, parsed from the PGN's UTCDate/UTCTime
    (both UTC). None when the PGN lacks them."""
    pgn = g.get('pgn') or ''
    d = re.search(r'\[UTCDate "([\d.]+)"\]', pgn)
    t = re.search(r'\[UTCTime "([\d:]+)"\]', pgn)
    if not (d and t):
        return None
    try:
        dt = datetime.strptime(f'{d.group(1)} {t.group(1)}', '%Y.%m.%d %H:%M:%S')
        return dt.replace(tzinfo=timezone.utc).timestamp()
    except ValueError:
        return None


def _fetch_rapid(url):
    """Return [(end_time, post_game_rating, result, start_time)] for the owner's
    rapid games in one monthly archive. result is 'win' | 'loss' | 'draw';
    start_time may be None when the PGN lacks the UTC start tags."""
    try:
        games = _fetch_json(url).get('games', [])
    except Exception as e:
        logger.warning('chess.com archive fetch failed for %s: %s', url, e)
        return []
    out = []
    for g in games:
        if g.get('time_class') != 'rapid':
            continue
        white = g.get('white', {})
        side = white if white.get('username', '').lower() == CHESS_USERNAME else g.get('black', {})
        rating, end = side.get('rating'), g.get('end_time')
        if rating is not None and end is not None:
            out.append((end, rating, _result(side.get('result')), _parse_start_time(g)))
    return out


def _record(games):
    """Overall win/draw/loss counts across all games."""
    counts = {'win': 0, 'draw': 0, 'loss': 0}
    for _end, _rating, result, _start in games:
        counts[result] += 1
    return counts


def _months(games):
    """Continuous, chronological list of {month, count}, gaps filled with zero."""
    counts = defaultdict(int)
    for end, _rating, _result_, _start in games:
        counts[datetime.fromtimestamp(end, tz=timezone.utc).strftime('%Y-%m')] += 1
    if not counts:
        return []
    keys = sorted(counts)
    sy, sm = (int(p) for p in keys[0].split('-'))
    ey, em = (int(p) for p in keys[-1].split('-'))
    out = []
    y, m = sy, sm
    while (y, m) <= (ey, em):
        key = f'{y:04d}-{m:02d}'
        out.append({'month': key, 'count': counts.get(key, 0)})
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def _chess_day(end_time):
    """The 'chess day' a unix timestamp belongs to: its Paris-local date with the
    day boundary shifted to 3am, so a game before 3am counts as the prior day."""
    local = datetime.fromtimestamp(end_time, tz=_PARIS) - timedelta(hours=_DAY_CUTOFF_HOUR)
    return local.date()


def _after_results(games):
    """Win rate of a game grouped by the result of the game right before it.

    A game only counts as 'after' the previous one when both fall on the same
    chess day (see _chess_day), so the first game of each day has no predecessor
    and is skipped. win_rate counts draws as half a win."""
    buckets = {'win': [], 'draw': [], 'loss': []}
    for i in range(1, len(games)):
        prev_end, _prev_rating, prev_result, _prev_start = games[i - 1]
        end, _rating, result, _start = games[i]
        if _chess_day(prev_end) != _chess_day(end):
            continue
        buckets[prev_result].append(_SCORE[result])
    out = []
    for prev in ('win', 'draw', 'loss'):
        scores = buckets[prev]
        n = len(scores)
        out.append({
            'after': prev,
            'games': n,
            'win_rate': round(sum(scores) / n * 100, 1) if n else None,
        })
    return out


def _by_game_index(games):
    """Win/draw/loss counts bucketed by a game's position within its chess day
    (1 = first game of the day, 2 = second, ...). `games` must be sorted
    chronologically so per-day order matches play order."""
    seen_per_day = defaultdict(int)  # chess_day -> games encountered so far
    buckets = defaultdict(lambda: {'win': 0, 'draw': 0, 'loss': 0})
    for end, _rating, result, _start in games:
        day = _chess_day(end)
        idx = seen_per_day[day]  # 0-based position within the day
        seen_per_day[day] += 1
        buckets[idx][result] += 1
    out = []
    for idx in sorted(buckets):
        c = buckets[idx]
        out.append({
            'index': idx + 1,
            'win': c['win'],
            'draw': c['draw'],
            'loss': c['loss'],
            'total': c['win'] + c['draw'] + c['loss'],
        })
    return out


def _after_win_waits(games):
    """For each game that follows a win on the same chess day, the idle minutes
    waited (previous game's end to this game's start) and this game's result.
    Games whose start time couldn't be parsed are skipped."""
    out = []
    for i in range(1, len(games)):
        prev_end, _prev_rating, prev_result, _prev_start = games[i - 1]
        end, _rating, result, start = games[i]
        if prev_result != 'win' or start is None:
            continue
        if _chess_day(prev_end) != _chess_day(end):
            continue
        wait_min = max(0.0, (start - prev_end) / 60)
        out.append({'wait': round(wait_min, 2), 'result': result})
    return out


@chess_bp.route('/api/chess/rapid-stats', methods=['GET'])
@owner_required
def rapid_stats():
    archives_url = f'https://api.chess.com/pub/player/{CHESS_USERNAME}/games/archives'
    try:
        archives = _fetch_json(archives_url).get('archives', [])
    except Exception as e:
        logger.warning('chess.com archives fetch failed: %s', e)
        return jsonify({'error': 'Could not reach chess.com'}), 502

    games = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        for chunk in ex.map(_fetch_rapid, archives):
            games.extend(chunk)
    games.sort(key=lambda g: g[0])

    return jsonify({
        'username': CHESS_USERNAME,
        'total': len(games),
        'record': _record(games),
        'months': _months(games),
        'by_game_index': _by_game_index(games),
        'after_results': _after_results(games),
        'after_win_waits': _after_win_waits(games),
    })


# ── FIDE rankings ────────────────────────────────────────────────────────────

# Scraped from the public profile page — the old fide-api.vercel.app mirror is
# dead and FIDE has no official API. Only the rapid rating is used; the roster of
# names lives on the client, which keeps the last-known ratings while this updates.
_FIDE_PROFILE = 'https://ratings.fide.com/profile/{}'
_FIDE_CACHE_TTL = 86400  # 24h — FIDE ratings only change monthly
_fide_cache = {}  # {fide_id: (rapid_rating, fetched_at)}
_FIDE_HEADERS = {
    'User-Agent': ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
                   '(KHTML, like Gecko) Chrome/124.0 Safari/537.36'),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}


def _fide_rapid_rating(html):
    """The player's RAPID rating, or None when unrated. Each rating renders as
    '<value> <LABEL>' where value is a number or 'Not rated'."""
    m = re.search(r'(\d{3,4}|Not rated)\s*</[^>]+>\s*<[^>]*>\s*RAPID', html)
    return int(m.group(1)) if m and m.group(1).isdigit() else None


def _fetch_fide_rapid(fide_id):
    """Current FIDE rapid rating for one player, cached 24h. Returns
    {'fide_id', 'rapid_rating'} or None if the page can't be fetched."""
    cached = _fide_cache.get(fide_id)
    if cached and time.time() - cached[1] < _FIDE_CACHE_TTL:
        return {'fide_id': fide_id, 'rapid_rating': cached[0]}

    for attempt in range(2):
        try:
            resp = http_requests.get(_FIDE_PROFILE.format(fide_id), headers=_FIDE_HEADERS, timeout=20)
            resp.raise_for_status()
            rating = _fide_rapid_rating(resp.text)
            _fide_cache[fide_id] = (rating, time.time())
            return {'fide_id': fide_id, 'rapid_rating': rating}
        except Exception as e:
            logger.warning('FIDE fetch failed for %s (attempt %d): %s', fide_id, attempt + 1, e)
    return None


@chess_bp.route('/api/chess/fide-rankings', methods=['GET'])
@owner_required
def fide_rankings():
    """Current FIDE rapid rating for each requested FIDE ID (comma-separated
    `ids`), fetched in parallel."""
    ids = [i.strip() for i in (request.args.get('ids') or '').split(',') if i.strip()][:50]
    with ThreadPoolExecutor(max_workers=8) as ex:
        players = [p for p in ex.map(_fetch_fide_rapid, ids) if p]
    return jsonify({'players': players})
