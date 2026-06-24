"""Work-block sub-app — the site/app-blocking switch behind Lumna's Focus app.

State lives in two tables:
  - workblock_state : one boolean (`blocking`)
  - workblock_items : the editable block list — each row is a website ('site')
                      or a macOS app ('app').

The owner flips the switch and edits the list from Lumna's Focus app; a local
watcher on the owner's Mac polls the status endpoint and, while blocking is on,
closes matching browser tabs and quits the listed apps.

Endpoints:
  GET    /api/workblock              -> owner: {blocking, items:[{id,kind,value}]}
  POST   /api/workblock              -> owner: set {blocking: bool}
  POST   /api/workblock/items        -> owner: add {kind, value}
  DELETE /api/workblock/items/<id>   -> owner: remove
  GET    /api/workblock/status       -> token-gated: {blocking, sites, apps}
"""

import logging
import os

from flask import Blueprint, jsonify, request

from database import get_db
from blueprints.auth_utils import owner_required

logger = logging.getLogger(__name__)

workblock_bp = Blueprint('workblock', __name__)

VALID_KINDS = ('site', 'app')


def _read_blocking(conn) -> bool:
    row = conn.execute("SELECT blocking FROM workblock_state WHERE id = 1").fetchone()
    return bool(row['blocking']) if row else False


def _read_items(conn):
    rows = conn.execute(
        "SELECT id, kind, value FROM workblock_items ORDER BY kind, value"
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
@owner_required
def get_state():
    with get_db() as conn:
        return jsonify({'blocking': _read_blocking(conn), 'items': _read_items(conn)})


@workblock_bp.route('/api/workblock', methods=['POST'])
@owner_required
def set_state():
    data = request.get_json(silent=True) or {}
    blocking = bool(data.get('blocking'))
    with get_db() as conn:
        # Upsert so a missing sentinel row (e.g. after a DB reset) is created
        # rather than silently no-op'd.
        conn.execute(
            """INSERT INTO workblock_state (id, blocking, updated_at)
               VALUES (1, ?, CURRENT_TIMESTAMP)
               ON CONFLICT (id) DO UPDATE
                 SET blocking = EXCLUDED.blocking,
                     updated_at = EXCLUDED.updated_at""",
            (blocking,),
        )
    return jsonify({'blocking': blocking})


@workblock_bp.route('/api/workblock/items', methods=['POST'])
@owner_required
def add_item():
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
        # UNIQUE(kind, value)). RETURNING avoids a second round-trip.
        row = conn.execute(
            """INSERT INTO workblock_items (kind, value) VALUES (?, ?)
               ON CONFLICT (kind, value) DO UPDATE SET value = EXCLUDED.value
               RETURNING id""",
            (kind, value),
        ).fetchone()
        item_id = row['id']
    return jsonify({'id': item_id, 'kind': kind, 'value': value})


@workblock_bp.route('/api/workblock/items/<int:item_id>', methods=['DELETE'])
@owner_required
def remove_item(item_id):
    with get_db() as conn:
        conn.execute("DELETE FROM workblock_items WHERE id = ?", (item_id,))
    return jsonify({'ok': True})


@workblock_bp.route('/api/workblock/status', methods=['GET'])
def status():
    """Read-only state for the Mac watcher, gated by a shared token."""
    expected = os.environ.get('WORKBLOCK_TOKEN', '').strip()
    token = (request.args.get('token') or '').strip()
    if not expected or not token or token != expected:
        return jsonify({'error': 'forbidden'}), 403
    with get_db() as conn:
        blocking = _read_blocking(conn)
        items = _read_items(conn)
    return jsonify({
        'blocking': blocking,
        'sites': [i['value'] for i in items if i['kind'] == 'site'],
        'apps': [i['value'] for i in items if i['kind'] == 'app'],
    })
