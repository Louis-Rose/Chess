"""Knowledge Center — folders tree + saved chess positions with notes."""

import logging
from flask import Blueprint, jsonify, request

from auth import login_required, get_current_user
from database import get_db

logger = logging.getLogger(__name__)

knowledge_bp = Blueprint('knowledge', __name__)


def _datetimes(row):
    for k in ('created_at', 'updated_at'):
        if row.get(k) and hasattr(row[k], 'isoformat'):
            row[k] = row[k].isoformat()
    return row


def _folder_owned(conn, folder_id, user_id):
    """Return True if the folder belongs to the user; False if missing or foreign."""
    row = conn.execute(
        'SELECT user_id FROM knowledge_folders WHERE id = ?', (folder_id,)
    ).fetchone()
    return bool(row and row['user_id'] == user_id)


@knowledge_bp.route('/api/knowledge/tree', methods=['GET'])
@login_required
def get_tree():
    """Return the user's folders as a flat list plus counts of positions per folder.
    (Endpoint kept for compatibility; there's no hierarchy anymore.)"""
    user_id = get_current_user()
    with get_db() as conn:
        folders = [
            _datetimes(dict(r)) for r in conn.execute(
                'SELECT id, name, created_at, updated_at FROM knowledge_folders '
                'WHERE user_id = ? ORDER BY name ASC',
                (user_id,)
            ).fetchall()
        ]
        counts = {
            r['folder_id']: r['c'] for r in conn.execute(
                'SELECT folder_id, COUNT(*) AS c FROM knowledge_positions '
                'WHERE user_id = ? GROUP BY folder_id',
                (user_id,)
            ).fetchall()
        }
    for f in folders:
        f['position_count'] = counts.get(f['id'], 0)
    return jsonify({'folders': folders, 'root_count': counts.get(None, 0)})


@knowledge_bp.route('/api/knowledge/folders', methods=['POST'])
@login_required
def create_folder():
    user_id = get_current_user()
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name required'}), 400
    with get_db() as conn:
        cursor = conn.execute(
            'INSERT INTO knowledge_folders (user_id, name) VALUES (?, ?) RETURNING id, name, created_at, updated_at',
            (user_id, name)
        )
        row = _datetimes(dict(cursor.fetchone()))
        row['position_count'] = 0
    return jsonify(row), 201


@knowledge_bp.route('/api/knowledge/folders/<int:folder_id>', methods=['PATCH'])
@login_required
def update_folder(folder_id):
    """Rename a folder. Body: { name }."""
    user_id = get_current_user()
    data = request.get_json() or {}
    with get_db() as conn:
        if not _folder_owned(conn, folder_id, user_id):
            return jsonify({'error': 'folder not found'}), 404
        new_name = (data.get('name') or '').strip()
        if not new_name:
            return jsonify({'error': 'name cannot be empty'}), 400
        conn.execute(
            'UPDATE knowledge_folders SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            (new_name, folder_id)
        )
    return jsonify({'ok': True})


@knowledge_bp.route('/api/knowledge/folders/<int:folder_id>', methods=['DELETE'])
@login_required
def delete_folder(folder_id):
    """Delete a folder recursively. Positions in it (and descendants) become folder_id=NULL."""
    user_id = get_current_user()
    with get_db() as conn:
        if not _folder_owned(conn, folder_id, user_id):
            return jsonify({'error': 'folder not found'}), 404
        conn.execute('DELETE FROM knowledge_folders WHERE id = ?', (folder_id,))
    return jsonify({'ok': True})


def _position_row(r):
    return _datetimes(dict(r))


@knowledge_bp.route('/api/knowledge/positions', methods=['GET'])
@login_required
def list_positions():
    """List positions in a folder. ?folder_id=<id|null>. If null/omitted, returns unfoldered ones."""
    user_id = get_current_user()
    folder_id_raw = request.args.get('folder_id')
    with get_db() as conn:
        if folder_id_raw in (None, '', 'null'):
            rows = conn.execute(
                'SELECT * FROM knowledge_positions WHERE user_id = ? AND folder_id IS NULL ORDER BY created_at DESC',
                (user_id,)
            ).fetchall()
        else:
            try:
                folder_id = int(folder_id_raw)
            except ValueError:
                return jsonify({'error': 'invalid folder_id'}), 400
            if not _folder_owned(conn, folder_id, user_id):
                return jsonify({'error': 'folder not found'}), 404
            rows = conn.execute(
                'SELECT * FROM knowledge_positions WHERE user_id = ? AND folder_id = ? ORDER BY created_at DESC',
                (user_id, folder_id)
            ).fetchall()
    return jsonify({'positions': [_position_row(r) for r in rows]})


@knowledge_bp.route('/api/knowledge/positions', methods=['POST'])
@login_required
def create_position():
    """Save a position. Body: { folder_id?, fen, white_player?, black_player?, active_color?,
    diagram_number?, crop_data_url?, notes? }."""
    user_id = get_current_user()
    data = request.get_json() or {}
    fen = (data.get('fen') or '').strip()
    if not fen:
        return jsonify({'error': 'fen required'}), 400
    folder_id = data.get('folder_id')
    with get_db() as conn:
        if folder_id is not None and not _folder_owned(conn, folder_id, user_id):
            return jsonify({'error': 'folder not found'}), 404
        active_color = (data.get('active_color') or '').strip().lower()[:1] or None
        diagram_number = data.get('diagram_number')
        try:
            diagram_number = int(diagram_number) if diagram_number not in (None, '') else None
        except (TypeError, ValueError):
            diagram_number = None
        cursor = conn.execute(
            """INSERT INTO knowledge_positions
               (user_id, folder_id, fen, white_player, black_player, active_color,
                diagram_number, crop_data_url, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
               RETURNING *""",
            (
                user_id, folder_id, fen,
                (data.get('white_player') or '').strip() or None,
                (data.get('black_player') or '').strip() or None,
                active_color,
                diagram_number,
                data.get('crop_data_url') or None,
                (data.get('notes') or '').strip() or None,
            )
        )
        row = _position_row(cursor.fetchone())
    return jsonify(row), 201


@knowledge_bp.route('/api/knowledge/positions/<int:position_id>', methods=['PATCH'])
@login_required
def update_position(position_id):
    """Update notes or move to another folder."""
    user_id = get_current_user()
    data = request.get_json() or {}
    with get_db() as conn:
        row = conn.execute(
            'SELECT user_id FROM knowledge_positions WHERE id = ?', (position_id,)
        ).fetchone()
        if not row or row['user_id'] != user_id:
            return jsonify({'error': 'position not found'}), 404
        updates = []
        params = []
        if 'notes' in data:
            updates.append('notes = ?')
            params.append((data.get('notes') or '').strip() or None)
        if 'folder_id' in data:
            folder_id = data.get('folder_id')
            if folder_id is not None and not _folder_owned(conn, folder_id, user_id):
                return jsonify({'error': 'folder not found'}), 404
            updates.append('folder_id = ?')
            params.append(folder_id)
        if not updates:
            return jsonify({'error': 'nothing to update'}), 400
        updates.append('updated_at = CURRENT_TIMESTAMP')
        params.append(position_id)
        conn.execute(
            f"UPDATE knowledge_positions SET {', '.join(updates)} WHERE id = ?",
            tuple(params)
        )
    return jsonify({'ok': True})


@knowledge_bp.route('/api/knowledge/positions/<int:position_id>', methods=['DELETE'])
@login_required
def delete_position(position_id):
    user_id = get_current_user()
    with get_db() as conn:
        row = conn.execute(
            'SELECT user_id FROM knowledge_positions WHERE id = ?', (position_id,)
        ).fetchone()
        if not row or row['user_id'] != user_id:
            return jsonify({'error': 'position not found'}), 404
        conn.execute('DELETE FROM knowledge_positions WHERE id = ?', (position_id,))
    return jsonify({'ok': True})
