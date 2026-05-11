"""Stocks sub-app — private big-tech earnings table.

Gated to the site owner via GYM_OWNER_EMAIL (reused as the single owner email).
No data yet — the table is filled in later.
"""

import os

from flask import Blueprint, jsonify

from auth import get_current_user
from database import get_db

stocks_bp = Blueprint('stocks', __name__)


@stocks_bp.route('/api/stocks/access', methods=['GET'])
def stocks_access():
    """Lightweight probe: does the current user own the stocks app?"""
    owner_email = os.environ.get('GYM_OWNER_EMAIL', '').strip().lower()
    user_id = get_current_user()
    if not owner_email or user_id is None:
        return jsonify({'allowed': False})
    with get_db() as conn:
        row = conn.execute('SELECT email FROM users WHERE id = ?', (user_id,)).fetchone()
    allowed = bool(row and (row['email'] or '').strip().lower() == owner_email)
    return jsonify({'allowed': allowed})
