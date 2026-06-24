"""Work-block sub-app — the website-blocking switch behind Lumna's Focus app.

Focus is open to everyone, with optional login:
  - logged-in users are scoped by their account (workblock_state/items, keyed
    by user_id) so their list syncs across devices;
  - anonymous users are scoped by a random token their browser generates and
    sends in the X-Focus-Token header (workblock_anon_state/items, keyed by
    token). No login required.

Enforcement is the browser extension: it polls /feed with the user's token and
blocks the listed sites in their own browser. There is no per-account special
case anywhere here — every user runs the identical path.

Endpoints:
  GET    /api/workblock              -> {blocking, items:[{id,kind,value}]}
  POST   /api/workblock              -> set {blocking: bool}
  POST   /api/workblock/items        -> add {value}
  DELETE /api/workblock/items/<id>   -> remove (only own items)
  GET    /api/workblock/token        -> the caller's extension token
  POST   /api/workblock/token        -> rotate the caller's extension token
  GET    /api/workblock/feed         -> token-gated {blocking, sites} for the extension
"""

import logging
import secrets

from flask import Blueprint, jsonify, request

from database import get_db
from auth import login_optional

logger = logging.getLogger(__name__)

workblock_bp = Blueprint('workblock', __name__)

# Per-identity table sets. A "scope" is (state_table, items_table, key_col, key):
# logged-in users live in the account tables keyed by user_id, anonymous users in
# the anon tables keyed by their browser token. The read/write helpers below take
# a scope so there's a single code path for both.
_USER_SCOPE = ('workblock_state', 'workblock_items', 'user_id')
_ANON_SCOPE = ('workblock_anon_state', 'workblock_anon_items', 'token')


def _scope():
    """Resolve the storage scope for this request, or None if anonymous with no
    token. Requires @login_optional to have set request.user_id.

    The X-Focus-Token header may be either a logged-in user's server token (the
    one the browser extension holds, which maps to their account) or an
    anonymous browser token (its own list). This lets the extension popup read
    and edit the same list it enforces, using just its token."""
    user_id = getattr(request, 'user_id', None)
    if user_id is not None:
        return (*_USER_SCOPE, user_id)
    token = (request.headers.get('X-Focus-Token') or '').strip()
    if not token:
        return None
    with get_db() as conn:
        row = conn.execute(
            "SELECT user_id FROM workblock_tokens WHERE token = ?", (token,)
        ).fetchone()
    if row:
        return (*_USER_SCOPE, row['user_id'])
    return (*_ANON_SCOPE, token)


def _read_blocking(conn, state_table, key_col, key) -> bool:
    row = conn.execute(
        f"SELECT blocking FROM {state_table} WHERE {key_col} = ?", (key,)
    ).fetchone()
    return bool(row['blocking']) if row else False


def _read_sites(conn, items_table, key_col, key):
    rows = conn.execute(
        f"SELECT id, value FROM {items_table} WHERE {key_col} = ? AND kind = 'site' "
        f"ORDER BY value",
        (key,),
    ).fetchall()
    return [{'id': r['id'], 'kind': 'site', 'value': r['value']} for r in rows]


def _normalize_site(value: str) -> str:
    """Reduce a pasted URL to a bare host fragment good for substring matching."""
    v = value.strip().lower()
    for pre in ('https://', 'http://'):
        if v.startswith(pre):
            v = v[len(pre):]
    if v.startswith('www.'):
        v = v[4:]
    v = v.split('/')[0].split('?')[0]  # drop any path and query string
    return v


@workblock_bp.route('/api/workblock', methods=['GET'])
@login_optional
def get_state():
    scope = _scope()
    if scope is None:
        return jsonify({'blocking': False, 'items': []})
    state_table, items_table, key_col, key = scope
    with get_db() as conn:
        return jsonify({
            'blocking': _read_blocking(conn, state_table, key_col, key),
            'items': _read_sites(conn, items_table, key_col, key),
        })


@workblock_bp.route('/api/workblock', methods=['POST'])
@login_optional
def set_state():
    scope = _scope()
    if scope is None:
        return jsonify({'error': 'no identity'}), 400
    state_table, _items_table, key_col, key = scope
    data = request.get_json(silent=True) or {}
    blocking = bool(data.get('blocking'))
    with get_db() as conn:
        conn.execute(
            f"""INSERT INTO {state_table} ({key_col}, blocking, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT ({key_col}) DO UPDATE
                  SET blocking = EXCLUDED.blocking,
                      updated_at = EXCLUDED.updated_at""",
            (key, blocking),
        )
    return jsonify({'blocking': blocking})


@workblock_bp.route('/api/workblock/items', methods=['POST'])
@login_optional
def add_item():
    scope = _scope()
    if scope is None:
        return jsonify({'error': 'no identity'}), 400
    _state_table, items_table, key_col, key = scope
    data = request.get_json(silent=True) or {}
    value = _normalize_site(data.get('value') or '')
    if not value:
        return jsonify({'error': 'empty value'}), 400
    with get_db() as conn:
        # Insert if new, else recover the existing id (deduped on the unique
        # (key, kind, value)). RETURNING avoids a second round-trip.
        row = conn.execute(
            f"""INSERT INTO {items_table} ({key_col}, kind, value) VALUES (?, 'site', ?)
                ON CONFLICT ({key_col}, kind, value) DO UPDATE SET value = EXCLUDED.value
                RETURNING id""",
            (key, value),
        ).fetchone()
        item_id = row['id']
    return jsonify({'id': item_id, 'kind': 'site', 'value': value})


@workblock_bp.route('/api/workblock/items/<int:item_id>', methods=['DELETE'])
@login_optional
def remove_item(item_id):
    scope = _scope()
    if scope is None:
        return jsonify({'error': 'no identity'}), 400
    _state_table, items_table, key_col, key = scope
    with get_db() as conn:
        conn.execute(
            f"DELETE FROM {items_table} WHERE id = ? AND {key_col} = ?", (item_id, key)
        )
    return jsonify({'ok': True})


# --- Browser-extension connection -------------------------------------------
# Logged-in users get a stable server token (workblock_tokens, linked to their
# account). Anonymous users use the same browser token they already send in the
# X-Focus-Token header. Either way /feed maps the token back to the right list.

def _get_or_create_user_token(conn, user_id) -> str:
    row = conn.execute(
        "SELECT token FROM workblock_tokens WHERE user_id = ?", (user_id,)
    ).fetchone()
    if row:
        return row['token']
    conn.execute(
        "INSERT INTO workblock_tokens (user_id, token) VALUES (?, ?) "
        "ON CONFLICT (user_id) DO NOTHING",
        (user_id, secrets.token_urlsafe(24)),
    )
    return conn.execute(
        "SELECT token FROM workblock_tokens WHERE user_id = ?", (user_id,)
    ).fetchone()['token']


@workblock_bp.route('/api/workblock/token', methods=['GET'])
@login_optional
def get_token():
    user_id = getattr(request, 'user_id', None)
    if user_id is not None:
        with get_db() as conn:
            return jsonify({'token': _get_or_create_user_token(conn, user_id)})
    # Anonymous: the extension token is just the browser token.
    token = (request.headers.get('X-Focus-Token') or '').strip()
    if not token:
        return jsonify({'error': 'no identity'}), 400
    return jsonify({'token': token})


@workblock_bp.route('/api/workblock/token', methods=['POST'])
@login_optional
def rotate_token():
    """Issue a fresh token for a logged-in user, invalidating the old one.
    Anonymous tokens are the browser token and can't be rotated server-side."""
    user_id = getattr(request, 'user_id', None)
    if user_id is None:
        return jsonify({'error': 'login required to rotate'}), 400
    token = secrets.token_urlsafe(24)
    with get_db() as conn:
        conn.execute(
            "INSERT INTO workblock_tokens (user_id, token) VALUES (?, ?) "
            "ON CONFLICT (user_id) DO UPDATE SET token = EXCLUDED.token, "
            "created_at = CURRENT_TIMESTAMP",
            (user_id, token),
        )
    return jsonify({'token': token})


@workblock_bp.route('/api/workblock/feed', methods=['GET'])
def feed():
    """Per-identity block list for the browser extension, gated by the token.

    The token is either a logged-in user's server token (mapped to their
    account list) or an anonymous browser token (its own anon list).
    """
    token = (request.args.get('token') or '').strip()
    if not token:
        return jsonify({'error': 'forbidden'}), 403
    with get_db() as conn:
        row = conn.execute(
            "SELECT user_id FROM workblock_tokens WHERE token = ?", (token,)
        ).fetchone()
        if row:
            state_table, items_table, key_col, key = (*_USER_SCOPE, row['user_id'])
        else:
            state_table, items_table, key_col, key = (*_ANON_SCOPE, token)
        blocking = _read_blocking(conn, state_table, key_col, key)
        sites = _read_sites(conn, items_table, key_col, key)
    return jsonify({
        'blocking': blocking,
        'sites': [i['value'] for i in sites],
    })
