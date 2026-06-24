"""Work-block sub-app — the site-blocking switch behind Lumna's profile menu.

One boolean lives in workblock_state (a single row). The owner flips it from
the Lumna profile dropdown; a local watcher on the owner's Mac polls the public
status endpoint and closes distracting browser tabs while it's on.

Endpoints:
  GET  /api/workblock          -> owner-only: current state (for the toggle UI)
  POST /api/workblock          -> owner-only: set state {blocking: bool}
  GET  /api/workblock/status   -> token-gated: {blocking} for the Mac watcher
                                  (no browser session, so it uses WORKBLOCK_TOKEN)
"""

import logging
import os

from flask import Blueprint, jsonify, request

from database import get_db
from blueprints.chess import owner_required  # reuse the single owner gate

logger = logging.getLogger(__name__)

workblock_bp = Blueprint('workblock', __name__)


def _read_state(conn) -> bool:
    row = conn.execute("SELECT blocking FROM workblock_state WHERE id = 1").fetchone()
    return bool(row['blocking']) if row else False


@workblock_bp.route('/api/workblock', methods=['GET'])
@owner_required
def get_state():
    with get_db() as conn:
        return jsonify({'blocking': _read_state(conn)})


@workblock_bp.route('/api/workblock', methods=['POST'])
@owner_required
def set_state():
    data = request.get_json(silent=True) or {}
    blocking = bool(data.get('blocking'))
    with get_db() as conn:
        conn.execute(
            "UPDATE workblock_state SET blocking = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
            (blocking,),
        )
    return jsonify({'blocking': blocking})


@workblock_bp.route('/api/workblock/status', methods=['GET'])
def status():
    """Read-only state for the Mac watcher, gated by a shared token."""
    expected = os.environ.get('WORKBLOCK_TOKEN', '').strip()
    token = (request.args.get('token') or '').strip()
    if not expected or not token or token != expected:
        return jsonify({'error': 'forbidden'}), 403
    with get_db() as conn:
        return jsonify({'blocking': _read_state(conn)})
