"""Fit sub-app — native fitness tracker (replaces the old Notion-synced Gym).

Has its own independent auth session, fully isolated from the main lumna.co
login: distinct cookie names (fit_access_token / fit_refresh_token), path-scoped
to /api/fit so they're never sent on — nor populated by — the main app.
Per-user data lives in fit_profile.
"""

import logging
from functools import wraps

from flask import Blueprint, jsonify, make_response, request

from auth import (
    clear_auth_cookies,
    consume_refresh_token,
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_or_create_user,
    revoke_refresh_token,
    set_auth_cookies,
    verify_google_token,
)
from database import get_db

logger = logging.getLogger(__name__)

fit_bp = Blueprint('fit', __name__)

# Independent, path-scoped cookie session for the fit app.
FIT_ACCESS_COOKIE = 'fit_access_token'
FIT_REFRESH_COOKIE = 'fit_refresh_token'
FIT_ACCESS_PATH = '/api/fit'
FIT_REFRESH_PATH = '/api/fit/auth'

# Allowed training splits — keep in sync with the frontend selector.
VALID_SPLITS = {'full_body', 'upper_lower', 'push_pull_legs', 'body_part', 'no_split'}

# Allowed exercises per muscle group — keep in sync with FitExercises.tsx.
MUSCLE_EXERCISES = {
    'Pectoraux': ['Développé couché barre', 'Développé couché haltères', 'Développé incliné barre', 'Développé incliné haltères'],
    'Dos': ['Tractions — Pronation', 'Tractions — Supination', 'Tractions — Prise neutre', 'Tirage vertical (poulie haute) — Pronation', 'Tirage vertical (poulie haute) — Supination', 'Tirage vertical (poulie haute) — Prise neutre', 'Rowing assis — Machine', 'Rowing assis — Poulie basse', 'Rowing assis — Pronation', 'Rowing assis — Supination', 'Rowing assis — Prise neutre'],
    'Quadriceps': ['Squat arrière', 'Hack squat', 'Presse à cuisses'],
    'Ischio-jambiers': ['Soulevé de terre jambes tendues', 'Leg curl allongé', 'Leg curl assis'],
    'Fessiers': ['Hip thrust', 'Squat gobelet', 'Soulevé de terre sumo'],
    'Épaules': ['Développé militaire', 'Élévations latérales', 'Oiseau'],
    'Triceps': ['Extensions à la poulie', 'Développé couché prise serrée', 'Extensions barre au front'],
    'Biceps': ['Curl barre', 'Curl incliné', 'Curl pupitre'],
    'Avant-bras': ['Curl marteau', 'Flexions de poignets', 'Extensions de poignets'],
    'Mollets': ['Extensions de mollets debout', 'Extensions de mollets assis', 'Extensions à la presse à cuisses'],
    'Sangle Abdominale': ['Crunch', 'Enroulements de bassin', 'Gainage planche'],
}
VALID_MUSCLES = set(MUSCLE_EXERCISES)


def _set_fit_cookies(response, access_token, refresh_token):
    set_auth_cookies(
        response, access_token, refresh_token,
        access_name=FIT_ACCESS_COOKIE, refresh_name=FIT_REFRESH_COOKIE,
        access_path=FIT_ACCESS_PATH, refresh_path=FIT_REFRESH_PATH,
    )


def _clear_fit_cookies(response):
    clear_auth_cookies(
        response,
        access_name=FIT_ACCESS_COOKIE, refresh_name=FIT_REFRESH_COOKIE,
        access_path=FIT_ACCESS_PATH, refresh_path=FIT_REFRESH_PATH,
    )


def fit_login_required(f):
    """Require a valid fit session (reads fit_access_token only)."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        user_id = get_current_user(FIT_ACCESS_COOKIE)
        if user_id is None:
            return jsonify({'error': 'Authentication required'}), 401
        request.user_id = user_id
        return f(*args, **kwargs)
    return wrapper


def _user_payload(user_id):
    """Minimal user payload for the fit app."""
    with get_db() as conn:
        row = conn.execute(
            'SELECT id, email, name, picture FROM users WHERE id = ?', (user_id,)
        ).fetchone()
    if not row:
        return None
    return {'id': row['id'], 'email': row['email'], 'name': row['name'], 'picture': row['picture']}


# ── Auth (independent fit session) ───────────────────────────────────────────

@fit_bp.route('/api/fit/auth/google', methods=['POST'])
def fit_google_auth():
    """Log in to the fit app with a Google ID token. Sets fit-only cookies."""
    data = request.get_json(silent=True) or {}
    credential = data.get('credential')
    if not credential:
        return jsonify({'error': 'No credential provided'}), 400

    google_user = verify_google_token(credential)
    if not google_user:
        return jsonify({'error': 'Invalid Google token'}), 401

    user_id = get_or_create_user(google_user, registered_app='fit')
    access_token = create_access_token(user_id)
    refresh_token, _ = create_refresh_token(user_id)

    # Build the payload from data already in hand (avoids a redundant SELECT).
    user_payload = {
        'id': user_id,
        'email': google_user['email'],
        'name': google_user['name'],
        'picture': google_user['picture'],
    }
    response = make_response(jsonify({'user': user_payload}))
    _set_fit_cookies(response, access_token, refresh_token)
    return response


@fit_bp.route('/api/fit/auth/refresh', methods=['POST'])
def fit_refresh():
    """Rotate the fit session using the fit refresh cookie."""
    raw = request.cookies.get(FIT_REFRESH_COOKIE)
    if not raw:
        return jsonify({'error': 'No refresh token'}), 401
    user_id = consume_refresh_token(raw)
    if user_id is None:
        return jsonify({'error': 'Invalid refresh token'}), 401

    access_token = create_access_token(user_id)
    new_refresh, _ = create_refresh_token(user_id)
    response = make_response(jsonify({'success': True}))
    _set_fit_cookies(response, access_token, new_refresh)
    return response


@fit_bp.route('/api/fit/auth/logout', methods=['POST'])
def fit_logout():
    """Clear the fit session only (does not touch the main app login)."""
    raw = request.cookies.get(FIT_REFRESH_COOKIE)
    if raw:
        revoke_refresh_token(raw)
    response = make_response(jsonify({'success': True}))
    _clear_fit_cookies(response)
    return response


@fit_bp.route('/api/fit/auth/me', methods=['GET'])
def fit_me():
    """Return the current fit user, or null."""
    user_id = get_current_user(FIT_ACCESS_COOKIE)
    return jsonify({'user': _user_payload(user_id) if user_id else None})


# ── Profile ──────────────────────────────────────────────────────────────────

@fit_bp.route('/api/fit/profile', methods=['GET'])
@fit_login_required
def get_profile():
    """Return the current user's training profile."""
    with get_db() as conn:
        row = conn.execute(
            'SELECT split FROM fit_profile WHERE user_id = ?', (request.user_id,)
        ).fetchone()
    return jsonify({'split': row['split'] if row else None})


@fit_bp.route('/api/fit/profile', methods=['PUT'])
@fit_login_required
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


@fit_bp.route('/api/fit/profile', methods=['DELETE'])
@fit_login_required
def delete_profile():
    """Delete the user's whole program — chosen split and all selected exercises."""
    with get_db() as conn:
        conn.execute('DELETE FROM fit_exercises WHERE user_id = ?', (request.user_id,))
        conn.execute('DELETE FROM fit_profile WHERE user_id = ?', (request.user_id,))
    return jsonify({'ok': True})


@fit_bp.route('/api/fit/exercises', methods=['GET'])
@fit_login_required
def get_exercises():
    """Return the user's selected exercises grouped by muscle."""
    with get_db() as conn:
        rows = conn.execute(
            'SELECT muscle, exercise FROM fit_exercises WHERE user_id = ?', (request.user_id,)
        ).fetchall()
    selections: dict[str, list] = {}
    for r in rows:
        selections.setdefault(r['muscle'], []).append(r['exercise'])
    return jsonify({'selections': selections})


@fit_bp.route('/api/fit/exercises', methods=['PUT'])
@fit_login_required
def update_exercises():
    """Replace the selected exercises for one muscle group."""
    data = request.get_json(silent=True) or {}
    muscle = data.get('muscle')
    exercises = data.get('exercises')
    if muscle not in VALID_MUSCLES or not isinstance(exercises, list):
        return jsonify({'error': 'Invalid payload'}), 400
    allowed = set(MUSCLE_EXERCISES[muscle])
    exercises = list({e for e in exercises if e in allowed})

    with get_db() as conn:
        conn.execute(
            'DELETE FROM fit_exercises WHERE user_id = ? AND muscle = ?',
            (request.user_id, muscle)
        )
        for ex in exercises:
            conn.execute(
                'INSERT INTO fit_exercises (user_id, muscle, exercise) VALUES (?, ?, ?)',
                (request.user_id, muscle, ex)
            )
    return jsonify({'ok': True})
