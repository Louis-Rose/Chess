"""Chess sub-app — private, owner-only.

Fetches the owner's chess.com games and aggregates rapid-game counts by month.
Gated to the site owner via GYM_OWNER_EMAIL (reused as the single owner email).
"""

import logging
import os
from concurrent.futures import ThreadPoolExecutor
from functools import wraps

import requests as http_requests
from flask import Blueprint, jsonify

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


def _build_months(stats):
    """Return a continuous, chronologically-ordered list of
    {month, count, elo_change} from the first to the last month seen.

    Gaps and game-less months get zero. Monthly elo change is the player's
    rating after the last rapid game of the month minus their rating at the end
    of the previous month that had games (for the first such month, the rating
    after its first rapid game)."""
    if not stats:
        return []
    keys = sorted(stats)  # 'YYYY-MM' sorts chronologically
    start_y, start_m = (int(p) for p in keys[0].split('-'))
    end_y, end_m = (int(p) for p in keys[-1].split('-'))
    out = []
    prev_last = None  # rating at the end of the previous month with games
    y, m = start_y, start_m
    while (y, m) <= (end_y, end_m):
        key = f'{y:04d}-{m:02d}'
        s = stats.get(key)
        if s and s['count'] > 0:
            base = prev_last if prev_last is not None else s['first']
            change = s['last'] - base
            prev_last = s['last']
            out.append({'month': key, 'count': s['count'], 'elo_change': change})
        else:
            out.append({'month': key, 'count': 0, 'elo_change': 0})
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


@chess_bp.route('/api/chess/rapid-by-month', methods=['GET'])
@owner_required
def rapid_by_month():
    archives_url = f'https://api.chess.com/pub/player/{CHESS_USERNAME}/games/archives'
    try:
        archives = _fetch_json(archives_url).get('archives', [])
    except Exception as e:
        logger.warning('chess.com archives fetch failed: %s', e)
        return jsonify({'error': 'Could not reach chess.com'}), 502

    def my_rating(game):
        white = game.get('white', {})
        side = white if white.get('username', '').lower() == CHESS_USERNAME else game.get('black', {})
        return side.get('rating')

    def scan_archive(url):
        # Archive URLs end with /YYYY/MM
        parts = url.rstrip('/').split('/')
        month = f'{parts[-2]}-{parts[-1]}'
        try:
            games = _fetch_json(url).get('games', [])
        except Exception as e:
            logger.warning('chess.com archive fetch failed for %s: %s', url, e)
            return month, 0, None, None
        rapid = sorted(
            (g for g in games if g.get('time_class') == 'rapid'),
            key=lambda g: g.get('end_time', 0),
        )
        if not rapid:
            return month, 0, None, None
        return month, len(rapid), my_rating(rapid[0]), my_rating(rapid[-1])

    stats = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        for month, count, first, last in ex.map(scan_archive, archives):
            stats[month] = {'count': count, 'first': first, 'last': last}

    months = _build_months(stats)
    total = sum(m['count'] for m in months)
    return jsonify({'username': CHESS_USERNAME, 'total': total, 'months': months})
