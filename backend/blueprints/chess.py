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


def _fill_months(counts):
    """Return a continuous, chronologically-ordered list of {month, count} from
    the first to the last month seen, filling gaps with zero so the bar chart
    reads as a timeline."""
    if not counts:
        return []
    keys = sorted(counts)  # 'YYYY-MM' sorts chronologically
    start_y, start_m = (int(p) for p in keys[0].split('-'))
    end_y, end_m = (int(p) for p in keys[-1].split('-'))
    out = []
    y, m = start_y, start_m
    while (y, m) <= (end_y, end_m):
        key = f'{y:04d}-{m:02d}'
        out.append({'month': key, 'count': counts.get(key, 0)})
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

    def count_archive(url):
        # Archive URLs end with /YYYY/MM
        parts = url.rstrip('/').split('/')
        month = f'{parts[-2]}-{parts[-1]}'
        try:
            games = _fetch_json(url).get('games', [])
        except Exception as e:
            logger.warning('chess.com archive fetch failed for %s: %s', url, e)
            return month, 0
        return month, sum(1 for g in games if g.get('time_class') == 'rapid')

    counts = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        for month, n in ex.map(count_archive, archives):
            counts[month] = n

    months = _fill_months(counts)
    total = sum(m['count'] for m in months)
    return jsonify({'username': CHESS_USERNAME, 'total': total, 'months': months})
