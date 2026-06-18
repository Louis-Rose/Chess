"""Fit sub-app — native fitness tracker (replaces the old Notion-synced Gym).

Has its own independent auth session, fully isolated from the main lumna.co
login: distinct cookie names (fit_access_token / fit_refresh_token), path-scoped
to /api/fit so they're never sent on — nor populated by — the main app.
Per-user data lives in fit_profile.
"""

import json
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
VALID_SPLITS = {'full_body', 'upper_lower', 'upper_lower_upper', 'lower_upper_lower', 'push_pull_legs', 'body_part', 'no_split'}
# A muscle's training priority within a program — keep in sync with the frontend.
VALID_PRIORITIES = {'weak', 'strong'}

# Allowed exercises per muscle group — keep in sync with FitExercises.tsx.
MUSCLE_EXERCISES = {
    'Épaules': ['Développé épaules — Machine', 'Développé épaules — Haltères', 'Développé militaire', 'Élévations latérales — Poulie basse', 'Élévations latérales — Haltères'],
    'Pectoraux': ['Développé couché — Barre', 'Développé couché — Haltères', 'Développé incliné — Barre', 'Développé incliné — Haltères', 'Dips (Pectoraux)', 'Pec Deck — Poignées', 'Pec Deck — Boudins'],
    'Dorsaux': ['Tractions — Pronation', 'Tractions — Supination', 'Tractions — Prise neutre', 'Tirage vertical (poulie haute) — Pronation', 'Tirage vertical (poulie haute) — Supination', 'Tirage vertical (poulie haute) — Prise neutre', 'Rowing assis — Machine', 'Rowing assis — Poulie basse', 'Rowing assis — Pronation', 'Rowing assis — Supination', 'Rowing assis — Prise neutre'],
    'Trapèzes': ['Shrugs — Haltères', 'Shrugs — Barre', 'Shrugs — Machine'],
    'Biceps': ['Curl incliné — Supination', 'Curl incliné — Rotation', 'Curl pupitre — Machine', 'Curl pupitre — Haltères', 'Curl pupitre — Barre EZ', 'Curl marteau'],
    'Triceps': ['Extension poulie haute — Barre', 'Extension poulie haute — Corde', 'Extension poulie basse (overhead) — Barre', 'Extension poulie basse (overhead) — Corde', 'Dips (Triceps)'],
    'Avant-bras': ['Flexions de poignets', 'Extensions de poignets'],
    'Abdos': ['Crunch', 'Enroulements de bassin', 'Gainage planche', 'Relevés de jambes'],
    'Fessiers': ['Hip thrust', 'Soulevé de terre sumo'],
    'Quadriceps': ['Soulevé de terre barre hex', 'Hack squat', 'Leg extension', 'Squat gobelet', 'Presse à cuisses', 'Presse à cuisses incliné', 'Presse à cuisses horizontale'],
    'Ischio-jambiers': ['Soulevé de terre jambes tendues', 'Leg curl allongé', 'Leg curl assis'],
    'Mollets': ['Extensions de mollets debout', 'Extensions de mollets assis', 'Extensions à la presse à cuisses'],
}
VALID_MUSCLES = set(MUSCLE_EXERCISES)
# Every valid exercise leaf, across all muscles — used to validate logged sets.
ALL_EXERCISES = {ex for exercises in MUSCLE_EXERCISES.values() for ex in exercises}
# Base exercise names (leaf without its " — variant" suffix) — machine settings
# are keyed by base, since a setting belongs to the machine, not the grip.
ALL_EXERCISE_BASES = {ex.split(' — ')[0] for ex in ALL_EXERCISES}


def _variant_leaf(name, variant):
    """The stored leaf for a (base name, variant) pair: '<name> — <variant>'."""
    return f'{name} — {variant}'


def _custom_exercises(conn, user_id):
    """The user's custom exercises, parsed (primary/secondary/variants as lists)."""
    rows = conn.execute(
        'SELECT id, name, muscle, primary_muscles, secondary_muscles, variants, isolation '
        'FROM fit_custom_exercises WHERE user_id = ? ORDER BY name',
        (user_id,)
    ).fetchall()
    return [{
        'id': r['id'], 'name': r['name'], 'muscle': r['muscle'],
        'primary': json.loads(r['primary_muscles']),
        'secondary': json.loads(r['secondary_muscles']),
        'variants': json.loads(r['variants']),
        'isolation': bool(r['isolation']),
    } for r in rows]


def _custom_leaves(conn, user_id, muscle=None):
    """Valid stored leaves from the user's custom exercises, optionally for one
    muscle. A variant-less custom exercise stores its bare name as the leaf."""
    leaves = set()
    for c in _custom_exercises(conn, user_id):
        if muscle is not None and c['muscle'] != muscle:
            continue
        if c['variants']:
            leaves.update(_variant_leaf(c['name'], v) for v in c['variants'])
        else:
            leaves.add(c['name'])
    return leaves


def _user_leaves(conn, user_id):
    """Every exercise leaf the user may log: the catalogue plus their customs."""
    return ALL_EXERCISES | _custom_leaves(conn, user_id)


def _user_bases(conn, user_id):
    """Every base exercise name the user may set a machine setting on."""
    return ALL_EXERCISE_BASES | {c['name'] for c in _custom_exercises(conn, user_id)}


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


# ── Programs ─────────────────────────────────────────────────────────────────
# A user can have several programs; one is active (fit_profile.active_program_id)
# and drives the whole app. A program owns the split, the working-sets count and
# the exercise selection. Working weights / machine settings stay global.

# Allowed working-sets-per-exercise range — keep in sync with the frontend.
WORK_SETS_MIN, WORK_SETS_MAX = 2, 6
# Program name length cap — keep in sync with the frontend input.
PROGRAM_NAME_MAX = 60


def _splits_of(row):
    """A program row's splits as a list. Stored as a JSON array in the `splits`
    column (a program can carry several; the user picks which applies each week)."""
    raw = row['splits'] if row is not None else None
    if not raw:
        return []
    try:
        val = json.loads(raw)
        return val if isinstance(val, list) else []
    except (ValueError, TypeError):
        return []


def _body_part_order_of(row):
    """A program's Body-part day order as a list of muscle names. Stored as a JSON
    array in `body_part_order` (one muscle group per day, the user's chosen order)."""
    raw = row['body_part_order'] if row is not None else None
    if not raw:
        return []
    try:
        val = json.loads(raw)
    except (ValueError, TypeError):
        return []
    return [m for m in val if m in VALID_MUSCLES] if isinstance(val, list) else []


def _muscle_order_of(row):
    """The program's muscle execution order (used within each priority tier).
    Stored as a JSON array in `muscle_order`; unknown muscles are dropped and any
    valid muscle missing from it is appended in the catalogue order, so the result
    always lists every muscle. Empty/absent → the catalogue (anatomical) order."""
    raw = row['muscle_order'] if row is not None else None
    stored = []
    if raw:
        try:
            val = json.loads(raw)
            if isinstance(val, list):
                stored = [m for m in val if m in VALID_MUSCLES]
        except (ValueError, TypeError):
            stored = []
    seen = set(stored)
    return stored + [m for m in MUSCLE_EXERCISES if m not in seen]


def _priorities_of(row):
    """A program row's per-muscle priorities as a {muscle: 'weak'|'strong'} dict.
    Stored as a JSON object in the `priorities` column (muscles absent from it are
    neutral). Filters to known muscles / states defensively."""
    raw = row['priorities'] if row is not None else None
    if not raw:
        return {}
    try:
        val = json.loads(raw)
    except (ValueError, TypeError):
        return {}
    if not isinstance(val, dict):
        return {}
    return {m: s for m, s in val.items() if m in VALID_MUSCLES and s in VALID_PRIORITIES}


# Target reps per working set, per exercise category — keep in sync with the
# frontend. The session averages the working-set reps; reaching the goal is the
# cue to move up in weight. Each category picks one of three options.
REP_GOAL_OPTIONS = {'upper': [8, 10, 12], 'lower': [10, 12, 15], 'isolation': [10, 12, 15]}
REP_GOAL_DEFAULT = {'upper': 10, 'lower': 12, 'isolation': 12}


def _rep_goals_of(row):
    """A program's target reps per category {upper, lower, isolation}. Stored as a
    JSON object in `rep_goals`; missing/invalid entries fall back to the default."""
    raw = row['rep_goals'] if row is not None else None
    val = {}
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                val = parsed
        except (ValueError, TypeError):
            val = {}
    return {c: (val[c] if val.get(c) in REP_GOAL_OPTIONS[c] else REP_GOAL_DEFAULT[c]) for c in REP_GOAL_OPTIONS}


def _active_program(conn):
    """The user's active program row (id, name, splits, work_sets), or None.
    Falls back to the most recent program when no explicit active pointer is set."""
    row = conn.execute(
        """SELECT p.id, p.name, p.splits, p.work_sets, p.priorities, p.body_part_order, p.rep_goals, p.muscle_order
           FROM fit_programs p
           JOIN fit_profile f ON f.active_program_id = p.id
           WHERE f.user_id = ?""",
        (request.user_id,)
    ).fetchone()
    if row:
        return row
    return conn.execute(
        'SELECT id, name, splits, work_sets, priorities, body_part_order, rep_goals, muscle_order FROM fit_programs WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
        (request.user_id,)
    ).fetchone()


def _owned_program(conn, program_id):
    """Return the program row if it belongs to the current user, else None."""
    return conn.execute(
        'SELECT id, name, splits, work_sets, priorities, body_part_order, rep_goals, muscle_order FROM fit_programs WHERE id = ? AND user_id = ?',
        (program_id, request.user_id)
    ).fetchone()


def _set_active_program(conn, program_id):
    """Point the user's active-program pointer at program_id (upsert)."""
    conn.execute(
        """INSERT INTO fit_profile (user_id, active_program_id) VALUES (?, ?)
           ON CONFLICT (user_id) DO UPDATE SET active_program_id = EXCLUDED.active_program_id""",
        (request.user_id, program_id)
    )


@fit_bp.route('/api/fit/profile', methods=['GET'])
@fit_login_required
def get_profile():
    """Return the active program's split and working-sets count (nulls if none).
    Kept for the session / Accueil / Performances flows, which only ever read the
    active program."""
    with get_db() as conn:
        prog = _active_program(conn)
    return jsonify({
        'splits': _splits_of(prog),
        'work_sets': prog['work_sets'] if prog else None,
    })


@fit_bp.route('/api/fit/exercises', methods=['GET'])
@fit_login_required
def get_exercises():
    """Return the active program's selected exercises grouped by muscle, plus its
    per-muscle priorities (the session uses them to order the exercise picker)."""
    selections: dict[str, list] = {}
    unilateral: list = []
    with get_db() as conn:
        prog = _active_program(conn)
        if prog:
            rows = conn.execute(
                'SELECT muscle, exercise FROM fit_exercises WHERE program_id = ?', (prog['id'],)
            ).fetchall()
            for r in rows:
                selections.setdefault(r['muscle'], []).append(r['exercise'])
            unilateral = _program_unilateral(conn, prog['id'])
    return jsonify({
        'selections': selections,
        'priorities': _priorities_of(prog),
        'splits': _splits_of(prog),
        'body_part_order': _body_part_order_of(prog),
        'rep_goals': _rep_goals_of(prog),
        'muscle_order': _muscle_order_of(prog),
        'unilateral': unilateral,
    })


@fit_bp.route('/api/fit/programs', methods=['GET'])
@fit_login_required
def list_programs():
    """All of the user's programs (with exercise counts) plus the active one's id."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT p.id, p.name, p.splits, p.work_sets, p.priorities, p.body_part_order, p.rep_goals, p.muscle_order,
                      COUNT(e.exercise) AS exercise_count
               FROM fit_programs p
               LEFT JOIN fit_exercises e ON e.program_id = p.id
               WHERE p.user_id = ?
               GROUP BY p.id
               ORDER BY p.created_at, p.id""",
            (request.user_id,)
        ).fetchall()
        active = _active_program(conn)
    return jsonify({
        'programs': [{'id': r['id'], 'name': r['name'], 'splits': _splits_of(r),
                      'work_sets': r['work_sets'], 'priorities': _priorities_of(r),
                      'body_part_order': _body_part_order_of(r), 'rep_goals': _rep_goals_of(r),
                      'muscle_order': _muscle_order_of(r),
                      'exercise_count': r['exercise_count']} for r in rows],
        'active_id': active['id'] if active else None,
    })


@fit_bp.route('/api/fit/programs', methods=['POST'])
@fit_login_required
def create_program():
    """Create a new (empty) program. Names default to "Programme N". The first
    program a user creates becomes active automatically."""
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    with get_db() as conn:
        if not name:
            n = conn.execute(
                'SELECT COUNT(*) AS c FROM fit_programs WHERE user_id = ?', (request.user_id,)
            ).fetchone()['c']
            name = f'Programme {n + 1}'
        row = conn.execute(
            "INSERT INTO fit_programs (user_id, name, splits) VALUES (?, ?, '[]') RETURNING id, name, splits, work_sets, priorities, body_part_order, rep_goals, muscle_order",
            (request.user_id, name[:PROGRAM_NAME_MAX])
        ).fetchone()
        # Make it active if the user has no active program yet.
        cur = conn.execute(
            'SELECT active_program_id FROM fit_profile WHERE user_id = ?', (request.user_id,)
        ).fetchone()
        if not cur or cur['active_program_id'] is None:
            _set_active_program(conn, row['id'])
    return jsonify({'id': row['id'], 'name': row['name'], 'splits': _splits_of(row),
                    'work_sets': row['work_sets'], 'priorities': _priorities_of(row),
                    'body_part_order': _body_part_order_of(row), 'rep_goals': _rep_goals_of(row),
                    'muscle_order': _muscle_order_of(row)})


@fit_bp.route('/api/fit/programs/active', methods=['PUT'])
@fit_login_required
def set_active_program():
    """Set which program is active (the one used everywhere in the app)."""
    data = request.get_json(silent=True) or {}
    program_id = data.get('program_id')
    with get_db() as conn:
        if not _owned_program(conn, program_id):
            return jsonify({'error': 'Not found'}), 404
        _set_active_program(conn, program_id)
    return jsonify({'ok': True, 'active_id': program_id})


@fit_bp.route('/api/fit/programs/<int:program_id>', methods=['PUT'])
@fit_login_required
def update_program(program_id):
    """Update a program's name, splits, working-sets count and/or priorities."""
    data = request.get_json(silent=True) or {}
    updates = {}
    if 'name' in data:
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'error': 'Invalid name'}), 400
        updates['name'] = name[:PROGRAM_NAME_MAX]
    if 'splits' in data:
        # A program may carry several splits (the user picks which one each week).
        splits = data['splits']
        if not isinstance(splits, list) or any(s not in VALID_SPLITS for s in splits):
            return jsonify({'error': 'Invalid splits'}), 400
        deduped = list(dict.fromkeys(splits))   # keep order, drop duplicates
        updates['splits'] = json.dumps(deduped)
    if 'work_sets' in data:
        ws = data['work_sets']
        if not isinstance(ws, int) or isinstance(ws, bool) or not WORK_SETS_MIN <= ws <= WORK_SETS_MAX:
            return jsonify({'error': 'Invalid work_sets'}), 400
        updates['work_sets'] = ws
    if 'priorities' in data:
        # {muscle: 'weak'|'strong'}; absent muscles are neutral. {} clears all.
        pr = data['priorities']
        if not isinstance(pr, dict) or any(
            m not in VALID_MUSCLES or s not in VALID_PRIORITIES for m, s in pr.items()
        ):
            return jsonify({'error': 'Invalid priorities'}), 400
        updates['priorities'] = json.dumps(pr)
    if 'body_part_order' in data:
        # Ordered list of muscle groups (one per day) for a Body part split.
        order = data['body_part_order']
        if not isinstance(order, list) or any(m not in VALID_MUSCLES for m in order):
            return jsonify({'error': 'Invalid body_part_order'}), 400
        updates['body_part_order'] = json.dumps(order)
    if 'muscle_order' in data:
        # The muscle execution order (within priority tiers): a list of valid muscles.
        order = data['muscle_order']
        if not isinstance(order, list) or any(m not in VALID_MUSCLES for m in order):
            return jsonify({'error': 'Invalid muscle_order'}), 400
        updates['muscle_order'] = json.dumps(list(dict.fromkeys(order)))
    if 'rep_goals' in data:
        # {upper, lower, isolation}: each one of its category's allowed options.
        rg = data['rep_goals']
        if not isinstance(rg, dict) or any(
            c not in REP_GOAL_OPTIONS or v not in REP_GOAL_OPTIONS[c] for c, v in rg.items()
        ):
            return jsonify({'error': 'Invalid rep_goals'}), 400
        # Merge onto the defaults so a partial update keeps the other categories.
        merged = {**REP_GOAL_DEFAULT, **{c: v for c, v in rg.items()}}
        updates['rep_goals'] = json.dumps(merged)
    if not updates:
        return jsonify({'error': 'Nothing to update'}), 400

    with get_db() as conn:
        if not _owned_program(conn, program_id):
            return jsonify({'error': 'Not found'}), 404
        set_clause = ', '.join(f'{c} = ?' for c in updates)
        conn.execute(
            f'UPDATE fit_programs SET {set_clause} WHERE id = ? AND user_id = ?',
            (*updates.values(), program_id, request.user_id)
        )
    resp = dict(updates)
    if 'splits' in resp:
        resp['splits'] = json.loads(resp['splits'])   # send the array, not its JSON text
    if 'priorities' in resp:
        resp['priorities'] = json.loads(resp['priorities'])   # send the object, not its JSON text
    if 'body_part_order' in resp:
        resp['body_part_order'] = json.loads(resp['body_part_order'])
    if 'rep_goals' in resp:
        resp['rep_goals'] = json.loads(resp['rep_goals'])
    if 'muscle_order' in resp:
        resp['muscle_order'] = json.loads(resp['muscle_order'])
    return jsonify(resp)


@fit_bp.route('/api/fit/programs/<int:program_id>', methods=['DELETE'])
@fit_login_required
def delete_program(program_id):
    """Delete a program and its exercises. If it was active, the most recent
    remaining program becomes active."""
    with get_db() as conn:
        if not _owned_program(conn, program_id):
            return jsonify({'error': 'Not found'}), 404
        conn.execute('DELETE FROM fit_programs WHERE id = ? AND user_id = ?', (program_id, request.user_id))
        # ON DELETE SET NULL clears the active pointer when the active program
        # was the one removed — re-point it at the most recent remaining program.
        cur = conn.execute(
            'SELECT active_program_id FROM fit_profile WHERE user_id = ?', (request.user_id,)
        ).fetchone()
        if not cur or cur['active_program_id'] is None:
            fallback = conn.execute(
                'SELECT id FROM fit_programs WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
                (request.user_id,)
            ).fetchone()
            if fallback:
                _set_active_program(conn, fallback['id'])
    return jsonify({'ok': True})


# ── Week split (which split applies this week) ───────────────────────────────
# A program can carry several splits; at the first session of the week the user
# picks which one applies. Stored per week, Monday-anchored.

def _week_done_count(conn):
    """Finished sessions (with >=1 logged set) started in the current week."""
    return conn.execute(
        """SELECT COUNT(*) AS c FROM (
               SELECT s.id FROM fit_sessions s
               JOIN fit_session_sets ss ON ss.session_id = s.id
               WHERE s.user_id = ? AND s.ended_at IS NOT NULL
                 AND s.started_at >= date_trunc('week', CURRENT_DATE)
               GROUP BY s.id
           ) t""",
        (request.user_id,)
    ).fetchone()['c']


@fit_bp.route('/api/fit/week-split', methods=['GET'])
@fit_login_required
def get_week_split():
    """The split chosen for the current week (Monday-anchored), or null, plus how
    many sessions are already done this week (to locate the current day)."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT split FROM fit_week_splits WHERE user_id = ? AND week_start = date_trunc('week', CURRENT_DATE)::date",
            (request.user_id,)
        ).fetchone()
        done = _week_done_count(conn)
    return jsonify({'split': row['split'] if row else None, 'done_this_week': done})


@fit_bp.route('/api/fit/week-split', methods=['PUT'])
@fit_login_required
def set_week_split():
    """Set the split for the current week. Must be one of the active program's
    splits (excluding "Pas de split")."""
    data = request.get_json(silent=True) or {}
    split = data.get('split')
    with get_db() as conn:
        prog = _active_program(conn)
        options = [s for s in _splits_of(prog) if s != 'no_split']
        if split not in options:
            return jsonify({'error': 'Invalid split'}), 400
        conn.execute(
            """INSERT INTO fit_week_splits (user_id, week_start, split)
               VALUES (?, date_trunc('week', CURRENT_DATE)::date, ?)
               ON CONFLICT (user_id, week_start) DO UPDATE SET split = EXCLUDED.split""",
            (request.user_id, split)
        )
        done = _week_done_count(conn)
    return jsonify({'split': split, 'done_this_week': done})


def _program_unilateral(conn, program_id):
    """The base exercises logged per side (unilateral) within a program."""
    rows = conn.execute(
        'SELECT exercise FROM fit_program_unilateral WHERE program_id = ?', (program_id,)
    ).fetchall()
    return [r['exercise'] for r in rows]


@fit_bp.route('/api/fit/programs/<int:program_id>/exercises', methods=['GET'])
@fit_login_required
def get_program_exercises(program_id):
    """Return one program's selected exercises grouped by muscle, plus its
    per-side (unilateral) exercises."""
    with get_db() as conn:
        if not _owned_program(conn, program_id):
            return jsonify({'error': 'Not found'}), 404
        rows = conn.execute(
            'SELECT muscle, exercise FROM fit_exercises WHERE program_id = ?', (program_id,)
        ).fetchall()
        unilateral = _program_unilateral(conn, program_id)
    selections: dict[str, list] = {}
    for r in rows:
        selections.setdefault(r['muscle'], []).append(r['exercise'])
    return jsonify({'selections': selections, 'unilateral': unilateral})


@fit_bp.route('/api/fit/programs/<int:program_id>/exercises', methods=['PUT'])
@fit_login_required
def update_program_exercises(program_id):
    """Replace the selected exercises for one muscle group within a program."""
    data = request.get_json(silent=True) or {}
    muscle = data.get('muscle')
    exercises = data.get('exercises')
    if muscle not in VALID_MUSCLES or not isinstance(exercises, list):
        return jsonify({'error': 'Invalid payload'}), 400

    with get_db() as conn:
        if not _owned_program(conn, program_id):
            return jsonify({'error': 'Not found'}), 404
        allowed = set(MUSCLE_EXERCISES[muscle]) | _custom_leaves(conn, request.user_id, muscle)
        exercises = list({e for e in exercises if e in allowed})
        conn.execute(
            'DELETE FROM fit_exercises WHERE program_id = ? AND muscle = ?',
            (program_id, muscle)
        )
        for ex in exercises:
            conn.execute(
                'INSERT INTO fit_exercises (user_id, program_id, muscle, exercise) VALUES (?, ?, ?, ?)',
                (request.user_id, program_id, muscle, ex)
            )
    return jsonify({'ok': True})


@fit_bp.route('/api/fit/programs/<int:program_id>/unilateral', methods=['PUT'])
@fit_login_required
def set_program_unilateral(program_id):
    """Mark a base exercise as unilateral (per-side logging) within a program,
    or clear it."""
    data = request.get_json(silent=True) or {}
    exercise = data.get('exercise')
    unilateral = bool(data.get('unilateral'))
    with get_db() as conn:
        if not _owned_program(conn, program_id):
            return jsonify({'error': 'Not found'}), 404
        if exercise not in _user_bases(conn, request.user_id):
            return jsonify({'error': 'Invalid exercise'}), 400
        if unilateral:
            conn.execute(
                'INSERT INTO fit_program_unilateral (program_id, exercise) VALUES (?, ?) '
                'ON CONFLICT (program_id, exercise) DO NOTHING',
                (program_id, exercise)
            )
        else:
            conn.execute(
                'DELETE FROM fit_program_unilateral WHERE program_id = ? AND exercise = ?',
                (program_id, exercise)
            )
    return jsonify({'ok': True, 'unilateral': unilateral})


# ── Custom exercises ─────────────────────────────────────────────────────────
# User-defined exercises (free-text name, manual primary/secondary muscles, an
# optional single row of variants). Merged into the catalogue everywhere.

CUSTOM_NAME_MAX = 60
CUSTOM_VARIANT_MAX = 40


def _clean_custom(data):
    """Validate a custom-exercise payload. Returns (clean_dict, None) or
    (None, error_message)."""
    name = (data.get('name') or '').strip()
    if not name or len(name) > CUSTOM_NAME_MAX:
        return None, 'Invalid name'
    if name in ALL_EXERCISE_BASES:
        return None, 'Name already exists'
    if data.get('muscle') not in VALID_MUSCLES:
        return None, 'Invalid muscle'

    def clean_muscles(v):
        if not isinstance(v, list):
            return None
        return list(dict.fromkeys(m for m in v if m in VALID_MUSCLES))

    primary = clean_muscles(data.get('primary', []))
    secondary = clean_muscles(data.get('secondary', []))
    if primary is None or secondary is None:
        return None, 'Invalid muscles'
    if not primary:
        return None, 'Pick at least one primary muscle'
    secondary = [m for m in secondary if m not in primary]   # primary wins

    raw_variants = data.get('variants', [])
    if not isinstance(raw_variants, list):
        return None, 'Invalid variants'
    variants = list(dict.fromkeys(str(v).strip() for v in raw_variants if str(v).strip()))
    if any(len(v) > CUSTOM_VARIANT_MAX for v in variants):
        return None, 'Invalid variant'

    return {'name': name, 'muscle': data['muscle'], 'primary': primary,
            'secondary': secondary, 'variants': variants,
            'isolation': bool(data.get('isolation'))}, None


def _rename_custom_base(conn, user_id, old, new):
    """When a custom exercise is renamed, carry the rename across the user's
    program selections and working weights (the base part of each leaf, keeping
    any ' — variant' suffix). Logged history is left as-is."""
    swap = (
        "? || CASE WHEN position(' — ' in exercise) > 0 "
        "THEN substr(exercise, position(' — ' in exercise)) ELSE '' END"
    )
    conn.execute(
        f"UPDATE fit_exercises SET exercise = {swap} "
        "WHERE user_id = ? AND split_part(exercise, ' — ', 1) = ?",
        (new, user_id, old)
    )
    conn.execute(
        f"UPDATE fit_work_weights SET exercise = {swap} "
        "WHERE user_id = ? AND split_part(exercise, ' — ', 1) = ?",
        (new, user_id, old)
    )


@fit_bp.route('/api/fit/custom-exercises', methods=['GET'])
@fit_login_required
def list_custom_exercises():
    """All of the user's custom exercises."""
    with get_db() as conn:
        return jsonify({'exercises': _custom_exercises(conn, request.user_id)})


@fit_bp.route('/api/fit/custom-exercises', methods=['POST'])
@fit_login_required
def create_custom_exercise():
    """Create a custom exercise. Names are unique per user."""
    clean, err = _clean_custom(request.get_json(silent=True) or {})
    if err:
        return jsonify({'error': err}), 400
    with get_db() as conn:
        if conn.execute(
            'SELECT 1 FROM fit_custom_exercises WHERE user_id = ? AND name = ?',
            (request.user_id, clean['name'])
        ).fetchone():
            return jsonify({'error': 'Name already exists'}), 409
        row = conn.execute(
            """INSERT INTO fit_custom_exercises
                   (user_id, name, muscle, primary_muscles, secondary_muscles, variants, isolation)
               VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id""",
            (request.user_id, clean['name'], clean['muscle'],
             json.dumps(clean['primary']), json.dumps(clean['secondary']), json.dumps(clean['variants']),
             clean['isolation'])
        ).fetchone()
    return jsonify({'id': row['id'], **clean})


@fit_bp.route('/api/fit/custom-exercises/<int:ex_id>', methods=['PUT'])
@fit_login_required
def update_custom_exercise(ex_id):
    """Update a custom exercise. A rename carries over program selections and
    working weights (history keeps the name it was logged with)."""
    clean, err = _clean_custom(request.get_json(silent=True) or {})
    if err:
        return jsonify({'error': err}), 400
    with get_db() as conn:
        old = conn.execute(
            'SELECT name FROM fit_custom_exercises WHERE id = ? AND user_id = ?',
            (ex_id, request.user_id)
        ).fetchone()
        if not old:
            return jsonify({'error': 'Not found'}), 404
        if conn.execute(
            'SELECT 1 FROM fit_custom_exercises WHERE user_id = ? AND name = ? AND id <> ?',
            (request.user_id, clean['name'], ex_id)
        ).fetchone():
            return jsonify({'error': 'Name already exists'}), 409
        conn.execute(
            """UPDATE fit_custom_exercises
               SET name = ?, muscle = ?, primary_muscles = ?, secondary_muscles = ?, variants = ?, isolation = ?
               WHERE id = ? AND user_id = ?""",
            (clean['name'], clean['muscle'], json.dumps(clean['primary']),
             json.dumps(clean['secondary']), json.dumps(clean['variants']), clean['isolation'], ex_id, request.user_id)
        )
        if old['name'] != clean['name']:
            _rename_custom_base(conn, request.user_id, old['name'], clean['name'])
    return jsonify({'id': ex_id, **clean})


@fit_bp.route('/api/fit/custom-exercises/<int:ex_id>', methods=['DELETE'])
@fit_login_required
def delete_custom_exercise(ex_id):
    """Delete a custom exercise and drop it from program selections. Logged
    history and working weights are kept."""
    with get_db() as conn:
        row = conn.execute(
            'SELECT name FROM fit_custom_exercises WHERE id = ? AND user_id = ?',
            (ex_id, request.user_id)
        ).fetchone()
        if not row:
            return jsonify({'error': 'Not found'}), 404
        conn.execute('DELETE FROM fit_custom_exercises WHERE id = ? AND user_id = ?', (ex_id, request.user_id))
        conn.execute(
            "DELETE FROM fit_exercises WHERE user_id = ? AND split_part(exercise, ' — ', 1) = ?",
            (request.user_id, row['name'])
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
    with get_db() as conn:
        if exercise not in _user_leaves(conn, request.user_id):
            return jsonify({'error': 'Invalid exercise'}), 400
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


@fit_bp.route('/api/fit/exercise-settings', methods=['GET'])
@fit_login_required
def get_exercise_settings():
    """The user's machine-setting override per exercise base ({base: setting})."""
    with get_db() as conn:
        rows = conn.execute(
            'SELECT exercise, setting FROM fit_exercise_settings WHERE user_id = ?', (request.user_id,)
        ).fetchall()
    return jsonify({'settings': {r['exercise']: r['setting'] for r in rows}})


@fit_bp.route('/api/fit/exercise-settings', methods=['PUT'])
@fit_login_required
def set_exercise_setting():
    """Upsert (or clear, when empty/null) the machine setting of one exercise base."""
    data = request.get_json(silent=True) or {}
    exercise = data.get('exercise')
    setting = data.get('setting')
    with get_db() as conn:
        if exercise not in _user_bases(conn, request.user_id):
            return jsonify({'error': 'Invalid exercise'}), 400
        if setting is None or not str(setting).strip():
            conn.execute(
                'DELETE FROM fit_exercise_settings WHERE user_id = ? AND exercise = ?',
                (request.user_id, exercise)
            )
        else:
            if not isinstance(setting, str) or len(setting) > 100:
                return jsonify({'error': 'Invalid setting'}), 400
            conn.execute(
                """INSERT INTO fit_exercise_settings (user_id, exercise, setting) VALUES (?, ?, ?)
                   ON CONFLICT (user_id, exercise) DO UPDATE SET setting = EXCLUDED.setting""",
                (request.user_id, exercise, setting.strip())
            )
    return jsonify({'ok': True})


def _recompute_work_weight(conn, user_id, exercise):
    """Derive an exercise's working weight from history and persist it: the
    heaviest weight used on a working set across the three most recent finished
    sessions in which the exercise was worked (warmups excluded). Leaves the
    existing value untouched when no session qualifies (never clears it)."""
    row = conn.execute(
        """
        WITH recent AS (
            SELECT s.id
            FROM fit_sessions s
            JOIN fit_session_sets ss ON ss.session_id = s.id
            WHERE s.user_id = ? AND s.ended_at IS NOT NULL AND ss.exercise = ?
                  AND ss.warmup = FALSE AND ss.weight IS NOT NULL
            GROUP BY s.id, s.started_at
            ORDER BY s.started_at DESC
            LIMIT 3
        )
        SELECT MAX(ss.weight) AS weight
        FROM fit_session_sets ss
        JOIN recent r ON r.id = ss.session_id
        WHERE ss.exercise = ? AND ss.warmup = FALSE AND ss.weight IS NOT NULL
        """,
        (user_id, exercise, exercise)
    ).fetchone()
    if row and row['weight'] is not None:
        conn.execute(
            """INSERT INTO fit_work_weights (user_id, exercise, weight) VALUES (?, ?, ?)
               ON CONFLICT (user_id, exercise) DO UPDATE SET weight = EXCLUDED.weight""",
            (user_id, exercise, row['weight'])
        )


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
        """SELECT s.id AS session_id, ss.exercise, ss.weight, ss.reps, ss.reps_right
           FROM fit_sessions s
           JOIN fit_session_sets ss ON ss.session_id = s.id
           WHERE s.user_id = ? AND s.ended_at IS NOT NULL AND ss.warmup = FALSE
           ORDER BY s.started_at ASC, s.id ASC, ss.id ASC""",
        (request.user_id,)
    ).fetchall()

    # Aggregate per (session, exercise) in chronological order: top weight + total
    # reps (both sides of a unilateral set count).
    agg = OrderedDict()          # (session_id, exercise) -> [max_weight, total_reps]
    session_order = []
    seen = set()
    for r in rows:
        sid, ex = r['session_id'], r['exercise']
        w = r['weight'] if r['weight'] is not None else 0
        reps = r['reps'] + (r['reps_right'] or 0)
        key = (sid, ex)
        if key not in agg:
            agg[key] = [w, reps]
        else:
            agg[key][0] = max(agg[key][0], w)
            agg[key][1] += reps
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
        'SELECT id, exercise, weight, reps, reps_right, warmup FROM fit_session_sets WHERE session_id = ? ORDER BY id',
        (row['id'],)
    ).fetchall()
    notes = conn.execute(
        'SELECT exercise, note FROM fit_session_exercise_notes WHERE session_id = ?',
        (row['id'],)
    ).fetchall()
    return {
        'id': row['id'],
        'number': _session_number(conn, row),
        'started_at': row['started_at'].isoformat() if row['started_at'] else None,
        'ended_at': row['ended_at'].isoformat() if row['ended_at'] else None,
        'comment': row['comment'],
        'sets': [{'id': s['id'], 'exercise': s['exercise'], 'weight': s['weight'],
                  'reps': s['reps'], 'reps_right': s['reps_right'], 'warmup': bool(s['warmup'])} for s in sets],
        'notes': {n['exercise']: n['note'] for n in notes},
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


@fit_bp.route('/api/fit/sessions/<int:session_id>/exercise-notes', methods=['PUT'])
@fit_login_required
def set_exercise_note(session_id):
    """Set (or clear, when empty) a free-text note for one exercise within a
    session — captured when the exercise is validated."""
    data = request.get_json(silent=True) or {}
    exercise = data.get('exercise')
    note = data.get('note')
    if not isinstance(exercise, str) or not exercise.strip():
        return jsonify({'error': 'Invalid exercise'}), 400
    if note is not None and not isinstance(note, str):
        return jsonify({'error': 'Invalid note'}), 400
    exercise = exercise.strip()
    note = (note or '').strip()[:2000] or None
    with get_db() as conn:
        if not _owned_session(conn, session_id):
            return jsonify({'error': 'Not found'}), 404
        if note is None:
            conn.execute(
                'DELETE FROM fit_session_exercise_notes WHERE session_id = ? AND exercise = ?',
                (session_id, exercise)
            )
        else:
            conn.execute(
                """INSERT INTO fit_session_exercise_notes (session_id, exercise, note)
                   VALUES (?, ?, ?)
                   ON CONFLICT (session_id, exercise) DO UPDATE SET note = EXCLUDED.note""",
                (session_id, exercise, note)
            )
    return jsonify({'ok': True, 'note': note})


def _valid_reps(reps):
    return isinstance(reps, int) and not isinstance(reps, bool) and 1 <= reps <= 1000


def _validate_set_values(reps, weight, reps_right=None):
    """Shared reps/weight validation for logging and editing a set. reps_right is
    the optional right-side count of a unilateral set (None = bilateral). Returns
    an error message, or None when the values are valid."""
    if not _valid_reps(reps):
        return 'Invalid reps'
    if reps_right is not None and not _valid_reps(reps_right):
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
    reps_right = data.get('reps_right')
    warmup = bool(data.get('warmup'))
    err = _validate_set_values(reps, weight, reps_right)
    if err:
        return jsonify({'error': err}), 400

    with get_db() as conn:
        if not _owned_session(conn, session_id):
            return jsonify({'error': 'Not found'}), 404
        if exercise not in _user_leaves(conn, request.user_id):
            return jsonify({'error': 'Invalid exercise'}), 400
        row = conn.execute(
            'INSERT INTO fit_session_sets (session_id, exercise, weight, reps, reps_right, warmup) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
            (session_id, exercise, weight, reps, reps_right, warmup)
        ).fetchone()
    return jsonify({'id': row['id'], 'exercise': exercise, 'weight': weight, 'reps': reps, 'reps_right': reps_right, 'warmup': warmup})


@fit_bp.route('/api/fit/sessions/<int:session_id>/sets/<int:set_id>', methods=['PATCH'])
@fit_login_required
def update_session_set(session_id, set_id):
    """Edit an existing set's weight, reps and warmup flag in place."""
    data = request.get_json(silent=True) or {}
    weight = data.get('weight')
    reps = data.get('reps')
    reps_right = data.get('reps_right')
    warmup = bool(data.get('warmup'))
    err = _validate_set_values(reps, weight, reps_right)
    if err:
        return jsonify({'error': err}), 400

    with get_db() as conn:
        if not _owned_session(conn, session_id):
            return jsonify({'error': 'Not found'}), 404
        row = conn.execute(
            'UPDATE fit_session_sets SET weight = ?, reps = ?, reps_right = ?, warmup = ? WHERE id = ? AND session_id = ? RETURNING id',
            (weight, reps, reps_right, warmup, set_id, session_id)
        ).fetchone()
        if not row:
            return jsonify({'error': 'Not found'}), 404
    return jsonify({'id': set_id, 'weight': weight, 'reps': reps, 'reps_right': reps_right, 'warmup': warmup})


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
            """SELECT s.id AS session_id, s.started_at, ss.weight, ss.reps, ss.reps_right, ss.warmup
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
        sess['sets'].append({'weight': r['weight'], 'reps': r['reps'], 'reps_right': r['reps_right'], 'warmup': bool(r['warmup'])})
    return jsonify({'sessions': sessions})


@fit_bp.route('/api/fit/performances', methods=['GET'])
@fit_login_required
def performances():
    """Per-exercise progression: for each exercise the user has logged working
    sets on, one data point per session (date + total working reps + the
    session's working weight), oldest first. Warmup sets are excluded."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT s.id AS session_id, s.started_at, ss.exercise, ss.weight, ss.reps, ss.reps_right
               FROM fit_sessions s
               JOIN fit_session_sets ss ON ss.session_id = s.id
               WHERE s.user_id = ? AND ss.warmup = FALSE
               ORDER BY s.started_at, ss.id""",
            (request.user_id,)
        ).fetchall()

    # exercise -> session_id -> {date, sets:[(weight, reps)]} (insertion = time
    # order; a unilateral set's reps total both sides).
    by_exercise = {}
    for r in rows:
        sessions = by_exercise.setdefault(r['exercise'], {})
        sess = sessions.get(r['session_id'])
        if sess is None:
            sess = {'date': r['started_at'].isoformat() if r['started_at'] else None, 'sets': []}
            sessions[r['session_id']] = sess
        sess['sets'].append((r['weight'], r['reps'] + (r['reps_right'] or 0)))

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
    """Mark a session as ended, then refresh the working weight of each exercise
    it contained from the (now updated) history."""
    with get_db() as conn:
        if not _owned_session(conn, session_id):
            return jsonify({'error': 'Not found'}), 404
        conn.execute(
            'UPDATE fit_sessions SET ended_at = CURRENT_TIMESTAMP WHERE id = ?',
            (session_id,)
        )
        exercises = conn.execute(
            'SELECT DISTINCT exercise FROM fit_session_sets WHERE session_id = ?', (session_id,)
        ).fetchall()
        for r in exercises:
            _recompute_work_weight(conn, request.user_id, r['exercise'])
    return jsonify({'ok': True})
