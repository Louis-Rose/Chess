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
    'Épaules': ['Développé épaules — Machine', 'Développé épaules — Haltères', 'Développé épaules — Pronation', 'Développé épaules — Prise neutre', 'Développé militaire', 'Élévations latérales — Poulie basse', 'Élévations latérales — Haltères'],
    'Pectoraux': ['Développé couché barre', 'Développé couché haltères', 'Développé incliné barre', 'Développé incliné haltères'],
    'Dos': ['Tractions — Pronation', 'Tractions — Supination', 'Tractions — Prise neutre', 'Tirage vertical (poulie haute) — Pronation', 'Tirage vertical (poulie haute) — Supination', 'Tirage vertical (poulie haute) — Prise neutre', 'Rowing assis — Machine', 'Rowing assis — Poulie basse', 'Rowing assis — Pronation', 'Rowing assis — Supination', 'Rowing assis — Prise neutre'],
    'Biceps': ['Curl incliné — Supination', 'Curl incliné — Rotation', 'Curl pupitre — Machine', 'Curl pupitre — Haltères', 'Curl pupitre — Barre EZ'],
    'Triceps': ['Extension poulie haute — Barre', 'Extension poulie haute — Corde', 'Extension poulie basse (overhead) — Barre', 'Extension poulie basse (overhead) — Corde'],
    'Avant-bras': ['Curl marteau', 'Flexions de poignets', 'Extensions de poignets'],
    'Abdos': ['Crunch', 'Enroulements de bassin', 'Gainage planche'],
    'Fessiers': ['Hip thrust', 'Squat gobelet', 'Soulevé de terre sumo'],
    'Quadriceps': ['Soulevé de terre barre hex', 'Hack squat', 'Presse à cuisses'],
    'Ischio-jambiers': ['Soulevé de terre jambes tendues', 'Leg curl allongé', 'Leg curl assis'],
    'Mollets': ['Extensions de mollets debout', 'Extensions de mollets assis', 'Extensions à la presse à cuisses'],
}
VALID_MUSCLES = set(MUSCLE_EXERCISES)
# Every valid exercise leaf, across all muscles — used to validate logged sets.
ALL_EXERCISES = {ex for exercises in MUSCLE_EXERCISES.values() for ex in exercises}


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
            'SELECT split, work_sets FROM fit_profile WHERE user_id = ?', (request.user_id,)
        ).fetchone()
    return jsonify({
        'split': row['split'] if row else None,
        'work_sets': row['work_sets'] if row else None,
    })


# Allowed working-sets-per-exercise range — keep in sync with the frontend.
WORK_SETS_MIN, WORK_SETS_MAX = 2, 6


@fit_bp.route('/api/fit/profile', methods=['PUT'])
@fit_login_required
def update_profile():
    """Upsert the chosen split and/or working-sets-per-exercise count."""
    data = request.get_json(silent=True) or {}
    updates = {}
    if 'split' in data:
        if data['split'] not in VALID_SPLITS:
            return jsonify({'error': 'Invalid split'}), 400
        updates['split'] = data['split']
    if 'work_sets' in data:
        ws = data['work_sets']
        if not isinstance(ws, int) or isinstance(ws, bool) or not WORK_SETS_MIN <= ws <= WORK_SETS_MAX:
            return jsonify({'error': 'Invalid work_sets'}), 400
        updates['work_sets'] = ws
    if not updates:
        return jsonify({'error': 'Nothing to update'}), 400

    cols = list(updates.keys())
    insert_cols = ', '.join(['user_id', *cols, 'updated_at'])
    insert_vals = ', '.join(['?'] * (1 + len(cols)) + ['CURRENT_TIMESTAMP'])
    set_clause = ', '.join([f'{c} = EXCLUDED.{c}' for c in cols] + ['updated_at = CURRENT_TIMESTAMP'])
    params = (request.user_id, *(updates[c] for c in cols))

    with get_db() as conn:
        conn.execute(
            f"""INSERT INTO fit_profile ({insert_cols})
                VALUES ({insert_vals})
                ON CONFLICT (user_id) DO UPDATE SET {set_clause}""",
            params,
        )
    return jsonify(updates)


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


# ── Sessions (workout logging) ───────────────────────────────────────────────

def _owned_session(conn, session_id):
    """Return the session row if it belongs to the current user, else None."""
    return conn.execute(
        'SELECT id, started_at, ended_at FROM fit_sessions WHERE id = ? AND user_id = ?',
        (session_id, request.user_id)
    ).fetchone()


def _session_payload(conn, row):
    """Serialize a session row together with its logged sets (in order)."""
    sets = conn.execute(
        'SELECT id, exercise, weight, reps, warmup FROM fit_session_sets WHERE session_id = ? ORDER BY id',
        (row['id'],)
    ).fetchall()
    return {
        'id': row['id'],
        'started_at': row['started_at'].isoformat() if row['started_at'] else None,
        'ended_at': row['ended_at'].isoformat() if row['ended_at'] else None,
        'sets': [{'id': s['id'], 'exercise': s['exercise'], 'weight': s['weight'],
                  'reps': s['reps'], 'warmup': bool(s['warmup'])} for s in sets],
    }


@fit_bp.route('/api/fit/sessions', methods=['POST'])
@fit_login_required
def create_session():
    """Start a new (empty) workout session."""
    with get_db() as conn:
        row = conn.execute(
            'INSERT INTO fit_sessions (user_id) VALUES (?) RETURNING id, started_at, ended_at',
            (request.user_id,)
        ).fetchone()
        return jsonify(_session_payload(conn, row))


@fit_bp.route('/api/fit/sessions', methods=['GET'])
@fit_login_required
def list_sessions():
    """History: the user's sessions that have at least one logged set, newest first."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT s.id, s.started_at, s.ended_at,
                      COUNT(ss.id) AS set_count,
                      COUNT(DISTINCT ss.exercise) AS exercise_count
               FROM fit_sessions s
               JOIN fit_session_sets ss ON ss.session_id = s.id
               WHERE s.user_id = ?
               GROUP BY s.id, s.started_at, s.ended_at
               ORDER BY s.started_at DESC""",
            (request.user_id,)
        ).fetchall()
    return jsonify({'sessions': [{
        'id': r['id'],
        'started_at': r['started_at'].isoformat() if r['started_at'] else None,
        'ended_at': r['ended_at'].isoformat() if r['ended_at'] else None,
        'set_count': r['set_count'],
        'exercise_count': r['exercise_count'],
    } for r in rows]})


@fit_bp.route('/api/fit/sessions/<int:session_id>', methods=['GET'])
@fit_login_required
def get_session(session_id):
    """Return a session and its logged sets."""
    with get_db() as conn:
        row = _owned_session(conn, session_id)
        if not row:
            return jsonify({'error': 'Not found'}), 404
        return jsonify(_session_payload(conn, row))


@fit_bp.route('/api/fit/sessions/<int:session_id>/sets', methods=['POST'])
@fit_login_required
def add_session_set(session_id):
    """Log one set (exercise + weight + reps) onto a session."""
    data = request.get_json(silent=True) or {}
    exercise = data.get('exercise')
    weight = data.get('weight')
    reps = data.get('reps')
    warmup = bool(data.get('warmup'))
    if exercise not in ALL_EXERCISES:
        return jsonify({'error': 'Invalid exercise'}), 400
    if not isinstance(reps, int) or isinstance(reps, bool) or not 1 <= reps <= 1000:
        return jsonify({'error': 'Invalid reps'}), 400
    if weight is not None:
        if isinstance(weight, bool) or not isinstance(weight, (int, float)) or not 0 <= weight <= 1000:
            return jsonify({'error': 'Invalid weight'}), 400

    with get_db() as conn:
        if not _owned_session(conn, session_id):
            return jsonify({'error': 'Not found'}), 404
        row = conn.execute(
            'INSERT INTO fit_session_sets (session_id, exercise, weight, reps, warmup) VALUES (?, ?, ?, ?, ?) RETURNING id',
            (session_id, exercise, weight, reps, warmup)
        ).fetchone()
    return jsonify({'id': row['id'], 'exercise': exercise, 'weight': weight, 'reps': reps, 'warmup': warmup})


@fit_bp.route('/api/fit/sessions/<int:session_id>/sets/<int:set_id>', methods=['DELETE'])
@fit_login_required
def delete_session_set(session_id, set_id):
    """Remove a logged set from a session."""
    with get_db() as conn:
        if not _owned_session(conn, session_id):
            return jsonify({'error': 'Not found'}), 404
        conn.execute(
            'DELETE FROM fit_session_sets WHERE id = ? AND session_id = ?',
            (set_id, session_id)
        )
    return jsonify({'ok': True})


@fit_bp.route('/api/fit/sessions/<int:session_id>/finish', methods=['POST'])
@fit_login_required
def finish_session(session_id):
    """Mark a session as ended."""
    with get_db() as conn:
        if not _owned_session(conn, session_id):
            return jsonify({'error': 'Not found'}), 404
        conn.execute(
            'UPDATE fit_sessions SET ended_at = CURRENT_TIMESTAMP WHERE id = ?',
            (session_id,)
        )
    return jsonify({'ok': True})
