"""Work-block sub-app — the site/app-blocking switch behind Lumna's Focus app.

State is per logged-in user, in two tables:
  - workblock_state : one boolean (`blocking`) per user
  - workblock_items : that user's block list — each row is a website ('site')
                      or a macOS app ('app').

Any logged-in user flips their switch and edits their list from the Focus app.
Enforcement lives outside this service: the owner runs a local Mac watcher that
polls /status (closing matching tabs and quitting listed apps), and other users
can run a browser extension that polls /api/workblock and blocks the sites in
their own browser.

Endpoints:
  GET    /api/workblock              -> user: {blocking, items:[{id,kind,value}]}
  POST   /api/workblock              -> user: set {blocking: bool}
  POST   /api/workblock/items        -> user: add {kind, value}
  DELETE /api/workblock/items/<id>   -> user: remove (only own items)
  GET    /api/workblock/status       -> token-gated: the owner's {blocking, sites, apps}
"""

import logging
import os

from flask import Blueprint, jsonify, request

from database import get_db
from auth import login_required
from blueprints.auth_utils import owner_email

logger = logging.getLogger(__name__)

workblock_bp = Blueprint('workblock', __name__)

VALID_KINDS = ('site', 'app')


def _read_blocking(conn, user_id) -> bool:
    row = conn.execute(
        "SELECT blocking FROM workblock_state WHERE user_id = ?", (user_id,)
    ).fetchone()
    return bool(row['blocking']) if row else False


def _read_items(conn, user_id):
    rows = conn.execute(
        "SELECT id, kind, value FROM workblock_items WHERE user_id = ? ORDER BY kind, value",
        (user_id,),
    ).fetchall()
    return [{'id': r['id'], 'kind': r['kind'], 'value': r['value']} for r in rows]


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
@login_required
def get_state():
    user_id = request.user_id
    with get_db() as conn:
        return jsonify({
            'blocking': _read_blocking(conn, user_id),
            'items': _read_items(conn, user_id),
        })


@workblock_bp.route('/api/workblock', methods=['POST'])
@login_required
def set_state():
    user_id = request.user_id
    data = request.get_json(silent=True) or {}
    blocking = bool(data.get('blocking'))
    with get_db() as conn:
        # Upsert so the user's row is created on first toggle.
        conn.execute(
            """INSERT INTO workblock_state (user_id, blocking, updated_at)
               VALUES (?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT (user_id) DO UPDATE
                 SET blocking = EXCLUDED.blocking,
                     updated_at = EXCLUDED.updated_at""",
            (user_id, blocking),
        )
    return jsonify({'blocking': blocking})


@workblock_bp.route('/api/workblock/items', methods=['POST'])
@login_required
def add_item():
    user_id = request.user_id
    data = request.get_json(silent=True) or {}
    kind = (data.get('kind') or '').strip().lower()
    value = (data.get('value') or '').strip()
    if kind not in VALID_KINDS:
        return jsonify({'error': 'invalid kind'}), 400
    value = _normalize_site(value) if kind == 'site' else value.lower()
    if not value:
        return jsonify({'error': 'empty value'}), 400
    with get_db() as conn:
        # Insert if new, else recover the existing id (the list dedupes on
        # UNIQUE(user_id, kind, value)). RETURNING avoids a second round-trip.
        row = conn.execute(
            """INSERT INTO workblock_items (user_id, kind, value) VALUES (?, ?, ?)
               ON CONFLICT (user_id, kind, value) DO UPDATE SET value = EXCLUDED.value
               RETURNING id""",
            (user_id, kind, value),
        ).fetchone()
        item_id = row['id']
    return jsonify({'id': item_id, 'kind': kind, 'value': value})


@workblock_bp.route('/api/workblock/items/<int:item_id>', methods=['DELETE'])
@login_required
def remove_item(item_id):
    user_id = request.user_id
    with get_db() as conn:
        conn.execute(
            "DELETE FROM workblock_items WHERE id = ? AND user_id = ?", (item_id, user_id)
        )
    return jsonify({'ok': True})


@workblock_bp.route('/api/workblock/status', methods=['GET'])
def status():
    """Read-only state for the owner's Mac watcher, gated by a shared token.

    The watcher is the owner's, so this returns the owner's list specifically.
    """
    expected = os.environ.get('WORKBLOCK_TOKEN', '').strip()
    token = (request.args.get('token') or '').strip()
    if not expected or not token or token != expected:
        return jsonify({'error': 'forbidden'}), 403
    oe = (owner_email() or '').strip().lower()
    with get_db() as conn:
        owner_row = conn.execute(
            "SELECT id FROM users WHERE lower(email) = ?", (oe,)
        ).fetchone() if oe else None
        if not owner_row:
            return jsonify({'blocking': False, 'sites': [], 'apps': []})
        owner_id = owner_row['id']
        blocking = _read_blocking(conn, owner_id)
        items = _read_items(conn, owner_id)
    return jsonify({
        'blocking': blocking,
        'sites': [i['value'] for i in items if i['kind'] == 'site'],
        'apps': [i['value'] for i in items if i['kind'] == 'app'],
    })
