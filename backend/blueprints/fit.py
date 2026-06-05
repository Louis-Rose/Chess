"""Fit sub-app — native fitness tracker (replaces the old Notion-synced Gym).

Per-user, authenticated via the standard access-token cookie. Stores one
training profile per user in fit_profile.
"""

import logging

from flask import Blueprint, jsonify, request

from auth import login_required
from database import get_db

logger = logging.getLogger(__name__)

fit_bp = Blueprint('fit', __name__)

# Allowed training splits — keep in sync with the frontend selector.
VALID_SPLITS = {'full_body', 'upper_lower', 'push_pull_legs', 'body_part', 'no_split'}


@fit_bp.route('/api/fit/profile', methods=['GET'])
@login_required
def get_profile():
    """Return the current user's training profile."""
    with get_db() as conn:
        row = conn.execute(
            'SELECT split FROM fit_profile WHERE user_id = ?', (request.user_id,)
        ).fetchone()
    return jsonify({'split': row['split'] if row else None})


@fit_bp.route('/api/fit/profile', methods=['PUT'])
@login_required
def update_profile():
    """Upsert the current user's chosen split."""
    data = request.get_json(silent=True) or {}
    split = data.get('split')
    if split not in VALID_SPLITS:
        return jsonify({'error': 'Invalid split'}), 400

    with get_db() as conn:
        conn.execute(
            """INSERT INTO fit_profile (user_id, split, updated_at)
               VALUES (?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT (user_id)
               DO UPDATE SET split = EXCLUDED.split, updated_at = CURRENT_TIMESTAMP""",
            (request.user_id, split)
        )
    return jsonify({'split': split})
