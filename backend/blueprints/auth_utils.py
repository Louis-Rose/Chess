"""Shared auth helpers for the owner-only sub-apps (Focus, Chess, Gym).

A single owner gate lives here so the email-match logic is not duplicated per
blueprint. The owner email is read from OWNER_EMAIL, falling back to the legacy
GYM_OWNER_EMAIL name so existing environments keep working.
"""

import os
from functools import wraps

from flask import jsonify

from auth import get_current_user
from database import get_db


def owner_email() -> str:
    """The configured site-owner email, lowercased (empty if unset)."""
    return (
        os.environ.get('OWNER_EMAIL')
        or os.environ.get('GYM_OWNER_EMAIL')
        or ''
    ).strip().lower()


def is_owner(user_id) -> bool:
    """True if the given user id belongs to the configured owner."""
    expected = owner_email()
    if not expected or user_id is None:
        return False
    with get_db() as conn:
        row = conn.execute('SELECT email FROM users WHERE id = ?', (user_id,)).fetchone()
    return bool(row and (row['email'] or '').strip().lower() == expected)


def owner_required(f):
    """Restrict an endpoint to the configured site owner."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not owner_email():
            return jsonify({'error': 'Owner not configured'}), 500
        user_id = get_current_user()
        if user_id is None:
            return jsonify({'error': 'Authentication required'}), 401
        if not is_owner(user_id):
            return jsonify({'error': 'Forbidden'}), 403
        return f(*args, **kwargs)
    return wrapper
