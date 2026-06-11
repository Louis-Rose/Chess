"""Fit sub-app — native fitness tracker (replaces the old Notion-synced Gym).

Has its own independent auth session, fully isolated from the main lumna.co
login: distinct cookie names (fit_access_token / fit_refresh_token), path-scoped
to /api/fit so they're never sent on — nor populated by — the main app.
Per-user data lives in fit_profile.
"""

import logging
from collections import OrderedDict
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
    'Pectoraux': ['Développé couché — Barre', 'Développé couché — Haltères', 'Développé incliné — Barre', 'Développé incliné — Haltères', 'Dips', 'Pec Deck — Poignées', 'Pec Deck — Boudins'],
    'Dos': ['Tractions — Pronation', 'Tractions — Supination', 'Tractions — Prise neutre', 'Tirage vertical (poulie haute) — Pronation', 'Tirage vertical (poulie haute) — Supination', 'Tirage vertical (poulie haute) — Prise neutre', 'Rowing assis — Machine', 'Rowing assis — Poulie basse', 'Rowing assis — Pronation', 'Rowing assis — Supination', 'Rowing assis — Prise neutre'],
    'Biceps': ['Curl incliné — Supination', 'Curl incliné — Rotation', 'Curl pupitre — Machine', 'Curl pupitre — Haltères', 'Curl pupitre — Barre EZ'],
    'Triceps': ['Extension poulie haute — Barre', 'Extension poulie haute — Corde', 'Extension poulie basse (overhead) — Barre', 'Extension poulie basse (overhead) — Corde'],
    'Avant-bras': ['Curl marteau', 'Flexions de poignets', 'Extensions de poignets'],
    'Abdos': ['Crunch', 'Enroulements de bassin', 'Gainage planche', 'Relevés de jambes'],
    'Fessiers': ['Hip thrust', 'Squat gobelet', 'Soulevé de terre sumo'],
    'Quadriceps': ['Soulevé de terre barre hex', 'Hack squat', 'Leg extension', 'Presse à cuisses', 'Presse à cuisses incliné', 'Presse à cuisses horizontale'],
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


@fit_bp.route('/api/fit/work-weights', methods=['GET'])
@fit_login_required
def get_work_weights():
    """The user's persisted working weight per exercise ({exercise: weight})."""
    with get_db() as conn:
        rows = conn.execute(
            'SELECT exercise, weight FROM fit_work_weights WHERE user_id = ?', (request.user_id,)
        ).fetchall()
    return jsonify({'weights': {r['exercise']: r['weight'] for r in rows}})


@fit_bp.route('/api/fit/work-weights', methods=['PUT'])
@fit_login_required
def set_work_weight():
    """Upsert (or clear, when weight is null) the working weight of one exercise."""
    data = request.get_json(silent=True) or {}
    exercise = data.get('exercise')
    weight = data.get('weight')
    if exercise not in ALL_EXERCISES:
        return jsonify({'error': 'Invalid exercise'}), 400
    with get_db() as conn:
        if weight is None:
            conn.execute(
                'DELETE FROM fit_work_weights WHERE user_id = ? AND exercise = ?',
                (request.user_id, exercise)
            )
        else:
            if isinstance(weight, bool) or not isinstance(weight, (int, float)) or not 0 <= weight <= 1000:
                return jsonify({'error': 'Invalid weight'}), 400
            conn.execute(
                """INSERT INTO fit_work_weights (user_id, exercise, weight) VALUES (?, ?, ?)
                   ON CONFLICT (user_id, exercise) DO UPDATE SET weight = EXCLUDED.weight""",
                (request.user_id, exercise, weight)
            )
    return jsonify({'ok': True})


# ── Sessions (workout logging) ───────────────────────────────────────────────

def _owned_session(conn, session_id):
    """Return the session row if it belongs to the current user, else None."""
    return conn.execute(
        'SELECT id, started_at, ended_at, comment FROM fit_sessions WHERE id = ? AND user_id = ?',
        (session_id, request.user_id)
    ).fetchone()


def _session_number(conn, row):
    """The session's 1-based chronological number: its rank by start date among
    the user's finished sessions that have logged sets. An in-progress session
    (latest start) gets the next number it will keep once finished."""
    if not row['started_at']:
        return None
    n = conn.execute(
        """SELECT COUNT(*) AS c FROM fit_sessions s
           WHERE s.user_id = ? AND s.ended_at IS NOT NULL AND s.started_at < ?
             AND EXISTS (SELECT 1 FROM fit_session_sets ss WHERE ss.session_id = s.id)""",
        (request.user_id, row['started_at'])
    ).fetchone()['c']
    return n + 1


def _perf_by_session(conn):
    """For every finished session, the performance status of each exercise vs the
    running personal record (highest working weight, and total working reps at
    that weight), warmups excluded. Replays the whole history chronologically.

    Per exercise, the record is (W, R). A session's (w = max working weight,
    r = total working reps) compares as:
      w > W  -> '+' if r >= R else '='      (new top weight)
      w == W -> '+' if r > R, '=' if r == R, else '-'
      w < W  -> '-'                          (lighter than the record)
    The first time an exercise appears sets the record (no status).

    Returns {session_id: {'plus','equal','minus', 'exercises': {exercise: status|None}}}.
    """
    rows = conn.execute(
        """SELECT s.id AS session_id, ss.exercise, ss.weight, ss.reps
           FROM fit_sessions s
           JOIN fit_session_sets ss ON ss.session_id = s.id
           WHERE s.user_id = ? AND s.ended_at IS NOT NULL AND ss.warmup = FALSE
           ORDER BY s.started_at ASC, s.id ASC, ss.id ASC""",
        (request.user_id,)
    ).fetchall()

    # Aggregate per (session, exercise) in chronological order: top weight + total reps.
    agg = OrderedDict()          # (session_id, exercise) -> [max_weight, total_reps]
    session_order = []
    seen = set()
    for r in rows:
        sid, ex = r['session_id'], r['exercise']
        w = r['weight'] if r['weight'] is not None else 0
        key = (sid, ex)
        if key not in agg:
            agg[key] = [w, r['reps']]
        else:
            agg[key][0] = max(agg[key][0], w)
            agg[key][1] += r['reps']
        if sid not in seen:
            seen.add(sid)
            session_order.append(sid)

    records = {}                 # exercise -> (W, R)
    per_session = {sid: {'plus': 0, 'equal': 0, 'minus': 0, 'exercises': {}} for sid in session_order}
    for (sid, ex), (w, r) in agg.items():
        rec = records.get(ex)
        if rec is None:
            status = None
            records[ex] = (w, r)
        else:
            W, R = rec
            if w > W:
                status = '+' if r >= R else '='
                records[ex] = (w, r)
            elif w == W:
                status = '+' if r > R else ('=' if r == R else '-')
                if r > R:
                    records[ex] = (w, r)
            else:
                status = '-'
        per_session[sid]['exercises'][ex] = status
        if status == '+':
            per_session[sid]['plus'] += 1
        elif status == '=':
            per_session[sid]['equal'] += 1
        elif status == '-':
            per_session[sid]['minus'] += 1
    return per_session


def _session_payload(conn, row):
    """Serialize a session row together with its logged sets (in order)."""
    sets = conn.execute(
        'SELECT id, exercise, weight, reps, warmup FROM fit_session_sets WHERE session_id = ? ORDER BY id',
        (row['id'],)
    ).fetchall()
    return {
        'id': row['id'],
        'number': _session_number(conn, row),
        'started_at': row['started_at'].isoformat() if row['started_at'] else None,
        'ended_at': row['ended_at'].isoformat() if row['ended_at'] else None,
        'comment': row['comment'],
        'sets': [{'id': s['id'], 'exercise': s['exercise'], 'weight': s['weight'],
                  'reps': s['reps'], 'warmup': bool(s['warmup'])} for s in sets],
    }


def _active_session(conn):
    """The user's current in-progress session (not yet finished), if any."""
    return conn.execute(
        'SELECT id, started_at, ended_at, comment FROM fit_sessions WHERE user_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1',
        (request.user_id,)
    ).fetchone()


@fit_bp.route('/api/fit/sessions', methods=['POST'])
@fit_login_required
def create_session():
    """Resume the in-progress session if there is one, otherwise start a new
    (empty) one. A session stays in progress until it is finished, so leaving
    the page never loses or validates it."""
    with get_db() as conn:
        row = _active_session(conn)
        if row:
            # An active session with no sets is just an empty shell from an
            # earlier start (e.g. started a few days ago and left). Treat it as a
            # fresh session today rather than inheriting its old date.
            has_sets = conn.execute(
                'SELECT 1 FROM fit_session_sets WHERE session_id = ? LIMIT 1', (row['id'],)
            ).fetchone()
            if not has_sets:
                conn.execute(
                    'UPDATE fit_sessions SET started_at = CURRENT_TIMESTAMP WHERE id = ?', (row['id'],)
                )
                row = _owned_session(conn, row['id'])
        else:
            row = conn.execute(
                'INSERT INTO fit_sessions (user_id) VALUES (?) RETURNING id, started_at, ended_at, comment',
                (request.user_id,)
            ).fetchone()
        return jsonify(_session_payload(conn, row))


@fit_bp.route('/api/fit/sessions/active', methods=['GET'])
@fit_login_required
def active_session():
    """Return the in-progress session if it has at least one logged set (worth
    resuming), else {active: null}. An empty started-but-untouched session does
    not count as something to resume."""
    with get_db() as conn:
        row = _active_session(conn)
        if row and conn.execute(
            'SELECT 1 FROM fit_session_sets WHERE session_id = ? LIMIT 1', (row['id'],)
        ).fetchone():
            return jsonify({'active': _session_payload(conn, row)})
        return jsonify({'active': None})


@fit_bp.route('/api/fit/sessions', methods=['GET'])
@fit_login_required
def list_sessions():
    """History: the user's finished sessions that have at least one logged set,
    newest first. In-progress sessions are excluded."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT s.id, s.started_at, s.ended_at,
                      COUNT(ss.id) AS set_count,
                      COUNT(DISTINCT ss.exercise) AS exercise_count,
                      ROW_NUMBER() OVER (ORDER BY s.started_at ASC) AS number
               FROM fit_sessions s
               JOIN fit_session_sets ss ON ss.session_id = s.id
               WHERE s.user_id = ? AND s.ended_at IS NOT NULL
               GROUP BY s.id, s.started_at, s.ended_at
               ORDER BY s.started_at DESC""",
            (request.user_id,)
        ).fetchall()
        perf = _perf_by_session(conn)
    return jsonify({'sessions': [{
        'id': r['id'],
        'number': r['number'],
        'started_at': r['started_at'].isoformat() if r['started_at'] else None,
        'ended_at': r['ended_at'].isoformat() if r['ended_at'] else None,
        'set_count': r['set_count'],
        'exercise_count': r['exercise_count'],
        'plus': perf.get(r['id'], {}).get('plus', 0),
        'equal': perf.get(r['id'], {}).get('equal', 0),
        'minus': perf.get(r['id'], {}).get('minus', 0),
    } for r in rows]})


@fit_bp.route('/api/fit/sessions/<int:session_id>', methods=['GET'])
@fit_login_required
def get_session(session_id):
    """Return a session and its logged sets, plus the per-exercise performance
    status (+/=/-) vs the running personal record."""
    with get_db() as conn:
        row = _owned_session(conn, session_id)
        if not row:
            return jsonify({'error': 'Not found'}), 404
        payload = _session_payload(conn, row)
        payload['perf'] = _perf_by_session(conn).get(session_id, {}).get('exercises', {})
        return jsonify(payload)


@fit_bp.route('/api/fit/sessions/<int:session_id>', methods=['DELETE'])
@fit_login_required
def delete_session(session_id):
    """Delete a whole session and its sets (cascade)."""
    with get_db() as conn:
        if not _owned_session(conn, session_id):
            return jsonify({'error': 'Not found'}), 404
        conn.execute('DELETE FROM fit_sessions WHERE id = ? AND user_id = ?', (session_id, request.user_id))
    return jsonify({'ok': True})


@fit_bp.route('/api/fit/sessions/<int:session_id>/comment', methods=['PUT'])
@fit_login_required
def set_session_comment(session_id):
    """Set (or clear, when empty) an optional free-text comment on a session."""
    data = request.get_json(silent=True) or {}
    comment = data.get('comment')
    if comment is not None and not isinstance(comment, str):
        return jsonify({'error': 'Invalid comment'}), 400
    comment = (comment or '').strip()[:2000] or None
    with get_db() as conn:
        if not _owned_session(conn, session_id):
            return jsonify({'error': 'Not found'}), 404
        conn.execute(
            'UPDATE fit_sessions SET comment = ? WHERE id = ? AND user_id = ?',
            (comment, session_id, request.user_id)
        )
    return jsonify({'ok': True, 'comment': comment})


def _validate_set_values(reps, weight):
    """Shared reps/weight validation for logging and editing a set. Returns an
    error message, or None when the values are valid."""
    if not isinstance(reps, int) or isinstance(reps, bool) or not 1 <= reps <= 1000:
        return 'Invalid reps'
    if weight is not None:
        if isinstance(weight, bool) or not isinstance(weight, (int, float)) or not 0 <= weight <= 1000:
            return 'Invalid weight'
    return None


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
    err = _validate_set_values(reps, weight)
    if err:
        return jsonify({'error': err}), 400

    with get_db() as conn:
        if not _owned_session(conn, session_id):
            return jsonify({'error': 'Not found'}), 404
        row = conn.execute(
            'INSERT INTO fit_session_sets (session_id, exercise, weight, reps, warmup) VALUES (?, ?, ?, ?, ?) RETURNING id',
            (session_id, exercise, weight, reps, warmup)
        ).fetchone()
    return jsonify({'id': row['id'], 'exercise': exercise, 'weight': weight, 'reps': reps, 'warmup': warmup})


@fit_bp.route('/api/fit/sessions/<int:session_id>/sets/<int:set_id>', methods=['PATCH'])
@fit_login_required
def update_session_set(session_id, set_id):
    """Edit an existing set's weight, reps and warmup flag in place."""
    data = request.get_json(silent=True) or {}
    weight = data.get('weight')
    reps = data.get('reps')
    warmup = bool(data.get('warmup'))
    err = _validate_set_values(reps, weight)
    if err:
        return jsonify({'error': err}), 400

    with get_db() as conn:
        if not _owned_session(conn, session_id):
            return jsonify({'error': 'Not found'}), 404
        row = conn.execute(
            'UPDATE fit_session_sets SET weight = ?, reps = ?, warmup = ? WHERE id = ? AND session_id = ? RETURNING id',
            (weight, reps, warmup, set_id, session_id)
        ).fetchone()
        if not row:
            return jsonify({'error': 'Not found'}), 404
    return jsonify({'id': set_id, 'weight': weight, 'reps': reps, 'warmup': warmup})


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


@fit_bp.route('/api/fit/stats', methods=['GET'])
@fit_login_required
def stats():
    """Year-to-date figures for the Accueil tab: average sessions per week and
    average working sets per session this calendar year, plus the hours since
    the last session. Warmup sets are excluded from the working-set count."""
    with get_db() as conn:
        sessions_row = conn.execute(
            """SELECT COUNT(*) AS n FROM (
                   SELECT s.id
                   FROM fit_sessions s
                   JOIN fit_session_sets ss ON ss.session_id = s.id
                   WHERE s.user_id = ? AND s.ended_at IS NOT NULL
                     AND EXTRACT(YEAR FROM s.started_at) = EXTRACT(YEAR FROM CURRENT_DATE)
                   GROUP BY s.id
               ) t""",
            (request.user_id,)
        ).fetchone()
        sets_row = conn.execute(
            """SELECT COUNT(*) AS n
               FROM fit_sessions s
               JOIN fit_session_sets ss ON ss.session_id = s.id
               WHERE s.user_id = ? AND s.ended_at IS NOT NULL
                 AND ss.warmup = FALSE
                 AND EXTRACT(YEAR FROM s.started_at) = EXTRACT(YEAR FROM CURRENT_DATE)""",
            (request.user_id,)
        ).fetchone()
        # Total distinct exercises across this year's finished sessions, for the
        # average exercises-per-session.
        exercises_row = conn.execute(
            """SELECT COUNT(*) AS n FROM (
                   SELECT s.id, ss.exercise
                   FROM fit_sessions s
                   JOIN fit_session_sets ss ON ss.session_id = s.id
                   WHERE s.user_id = ? AND s.ended_at IS NOT NULL
                     AND EXTRACT(YEAR FROM s.started_at) = EXTRACT(YEAR FROM CURRENT_DATE)
                   GROUP BY s.id, ss.exercise
               ) t""",
            (request.user_id,)
        ).fetchone()
        # Calendar days since the most recent finished session (one with at least
        # one set). Date difference, so it increments at midnight rather than on
        # a rolling 24-hour basis.
        last_row = conn.execute(
            """SELECT (CURRENT_DATE - MAX(s.started_at)::date) AS days
               FROM fit_sessions s
               JOIN fit_session_sets ss ON ss.session_id = s.id
               WHERE s.user_id = ? AND s.ended_at IS NOT NULL""",
            (request.user_id,)
        ).fetchone()
        # Weeks elapsed since Jan 1 (DB-side), for the per-week average.
        weeks_row = conn.execute(
            "SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - date_trunc('year', CURRENT_TIMESTAMP))) / 604800.0 AS weeks"
        ).fetchone()
    sessions = sessions_row['n']
    work_sets = sets_row['n']
    exercises = exercises_row['n']
    weeks = weeks_row['weeks'] or 0
    days = last_row['days']
    return jsonify({
        'sessions_this_year': sessions,
        'work_sets_this_year': work_sets,
        'avg_sessions_per_week': round(sessions / float(weeks), 1) if weeks else None,
        'avg_exercises_per_session': round(exercises / sessions, 1) if sessions else None,
        'days_since_last_session': int(days) if days is not None else None,
    })


@fit_bp.route('/api/fit/last-done', methods=['GET'])
@fit_login_required
def last_done():
    """Per exercise (leaf), the calendar days since it was last logged in a
    finished session. Used for the per-exercise recency view and its average."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT DISTINCT ON (ss.exercise) ss.exercise,
                      (CURRENT_DATE - s.started_at::date) AS days
               FROM fit_sessions s
               JOIN fit_session_sets ss ON ss.session_id = s.id
               WHERE s.user_id = ? AND s.ended_at IS NOT NULL
               ORDER BY ss.exercise, s.started_at DESC""",
            (request.user_id,)
        ).fetchall()
    return jsonify({'exercises': [{'exercise': r['exercise'], 'days': int(r['days'])} for r in rows]})


@fit_bp.route('/api/fit/exercise-history', methods=['GET'])
@fit_login_required
def exercise_history():
    """Every session in which the given base exercise was logged, newest first,
    each with its sets. Matched by base (the part before ' — '), so all variant
    leaves of the exercise are included."""
    base = request.args.get('base', '').strip()
    if not base:
        return jsonify({'sessions': []})
    with get_db() as conn:
        rows = conn.execute(
            """SELECT s.id AS session_id, s.started_at, ss.weight, ss.reps, ss.warmup
               FROM fit_sessions s
               JOIN fit_session_sets ss ON ss.session_id = s.id
               WHERE s.user_id = ? AND split_part(ss.exercise, ' — ', 1) = ?
               ORDER BY s.started_at DESC, ss.id""",
            (request.user_id, base)
        ).fetchall()
    sessions, by_id = [], {}
    for r in rows:
        sess = by_id.get(r['session_id'])
        if sess is None:
            sess = {'session_id': r['session_id'],
                    'date': r['started_at'].isoformat() if r['started_at'] else None,
                    'sets': []}
            by_id[r['session_id']] = sess
            sessions.append(sess)
        sess['sets'].append({'weight': r['weight'], 'reps': r['reps'], 'warmup': bool(r['warmup'])})
    return jsonify({'sessions': sessions})


@fit_bp.route('/api/fit/performances', methods=['GET'])
@fit_login_required
def performances():
    """Per-exercise progression: for each exercise the user has logged working
    sets on, one data point per session (date + total working reps + the
    session's working weight), oldest first. Warmup sets are excluded."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT s.id AS session_id, s.started_at, ss.exercise, ss.weight, ss.reps
               FROM fit_sessions s
               JOIN fit_session_sets ss ON ss.session_id = s.id
               WHERE s.user_id = ? AND ss.warmup = FALSE
               ORDER BY s.started_at, ss.id""",
            (request.user_id,)
        ).fetchall()

    # exercise -> session_id -> {date, sets:[(weight, reps)]} (insertion = time order)
    by_exercise = {}
    for r in rows:
        sessions = by_exercise.setdefault(r['exercise'], {})
        sess = sessions.get(r['session_id'])
        if sess is None:
            sess = {'date': r['started_at'].isoformat() if r['started_at'] else None, 'sets': []}
            sessions[r['session_id']] = sess
        sess['sets'].append((r['weight'], r['reps']))

    exercises = []
    for exercise, sessions in by_exercise.items():
        points = []
        for sess in sessions.values():
            total_reps = sum(reps for (_, reps) in sess['sets'])
            weights = [w for (w, _) in sess['sets'] if w is not None]
            weight = max(weights) if weights else None
            points.append({'date': sess['date'], 'weight': weight, 'reps': total_reps})
        exercises.append({'exercise': exercise, 'points': points})

    return jsonify({'exercises': exercises})


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
