"""Chess sub-app — private, owner-only.

Fetches the owner's chess.com rapid games and serves three things in one pass:
  - monthly game counts (bar chart),
  - per-day points of {games that day, average per-game elo change that day},
  - a linear regression of average per-game elo change on daily game volume.

Gated to the site owner via GYM_OWNER_EMAIL (reused as the single owner email).
"""

import logging
import os
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import wraps

import numpy as np
import requests as http_requests
from flask import Blueprint, jsonify
from scipy import stats

from auth import get_current_user
from database import get_db

logger = logging.getLogger(__name__)

chess_bp = Blueprint('chess', __name__)

CHESS_USERNAME = 'akyrosu'
_USER_AGENT = 'LUMNA/1.0 (https://lumna.co; rose.louis.mail@gmail.com)'
_MIN_GAMES_PER_DAY = 3  # 1-2 game days are too noisy to average, so they're dropped


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


def _result(code):
    if code == 'win':
        return 'win'
    if code in _DRAW_RESULTS:
        return 'draw'
    return 'loss'


def _fetch_rapid(url):
    """Return [(end_time, post_game_rating, result)] for the owner's rapid games
    in one monthly archive. result is 'win' | 'loss' | 'draw'."""
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
            out.append((end, rating, _result(side.get('result'))))
    return out


def _months(games):
    """Continuous, chronological list of {month, count}, gaps filled with zero."""
    counts = defaultdict(int)
    for end, _rating, _result_ in games:
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


def _days(games):
    """Per-day {date, games, avg_elo}. A game's elo change is its post-game
    rating minus the previous rapid game's rating, so the first game ever (no
    predecessor) is excluded."""
    by_day = defaultdict(list)
    for i in range(1, len(games)):
        end, rating, _result_ = games[i]
        delta = rating - games[i - 1][1]
        day = datetime.fromtimestamp(end, tz=timezone.utc).strftime('%Y-%m-%d')
        by_day[day].append(delta)
    return [
        {'date': day, 'games': len(deltas), 'avg_elo': round(sum(deltas) / len(deltas), 2)}
        for day, deltas in sorted(by_day.items())
    ]


def _regression(days):
    """OLS of average per-game elo change (y) on daily game volume (x)."""
    if len(days) < 3:
        return None
    xs = np.array([d['games'] for d in days], dtype=float)
    ys = np.array([d['avg_elo'] for d in days], dtype=float)
    if np.ptp(xs) == 0:
        return None
    r = stats.linregress(xs, ys)
    return {
        'n': len(days),
        'slope': round(float(r.slope), 4),
        'intercept': round(float(r.intercept), 4),
        'r': round(float(r.rvalue), 4),
        'r2': round(float(r.rvalue) ** 2, 4),
        'stderr': round(float(r.stderr), 4),
        'p_value': float(r.pvalue),
        'significant': bool(r.pvalue < 0.05),
    }


def _streaks(games):
    """Bucket each game by the win/loss streak immediately before it and report
    the win rate of the games that follow.

    The streak is signed: negative = consecutive losses, positive = consecutive
    wins, 0 = right after a draw or the very first game. A draw resets the
    streak. win_rate counts draws as half a win."""
    buckets = defaultdict(list)
    streak = 0
    for _end, _rating, result in games:
        buckets[streak].append(_SCORE[result])
        if result == 'win':
            streak = streak + 1 if streak > 0 else 1
        elif result == 'loss':
            streak = streak - 1 if streak < 0 else -1
        else:
            streak = 0
    out = []
    for s in sorted(buckets):
        scores = buckets[s]
        n = len(scores)
        avg = sum(scores) / n
        # Two-sided one-sample t-test of the game scores against 0.5 (no edge).
        if n >= 2 and np.var(scores) > 0:
            p = float(stats.ttest_1samp(scores, 0.5).pvalue)
        else:
            p = float('nan')
        out.append({
            'streak': s,
            'games': n,
            'win_rate': round(avg * 100, 1),
            'p_value': round(p, 4) if np.isfinite(p) else None,
            'significant': bool(np.isfinite(p) and p < 0.05),
        })
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

    days = [d for d in _days(games) if d['games'] >= _MIN_GAMES_PER_DAY]
    return jsonify({
        'username': CHESS_USERNAME,
        'total': len(games),
        'months': _months(games),
        'days': days,
        'regression': _regression(days),
        'streaks': _streaks(games),
    })
