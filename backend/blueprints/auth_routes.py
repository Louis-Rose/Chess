"""Auth, preferences, activity/heartbeat, and shared user routes."""

import hashlib
import json
import logging
import os
import secrets as py_secrets
from datetime import datetime, timezone

from flask import Blueprint, jsonify, make_response, request

from auth import (
    clear_auth_cookies,
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_or_create_user,
    login_required,
    set_auth_cookies,
    verify_google_token,
)
from database import get_db
from email_utils import send_admin_deletion_alert, send_homework_email

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth_routes', __name__)

from config import IS_PRODUCTION, APP_ORIGIN

BLOCKED_EMAILS = set()
INVITE_EXPIRY_DAYS = 30

# Temp store for OAuth state tokens (maps token → user_id, short-lived)
_oauth_states: dict[str, int] = {}


def _is_invite_expired(invite: dict) -> bool:
    """Check if an invite has expired (30 days)."""
    created = invite['created_at']
    if isinstance(created, str):
        created = datetime.fromisoformat(created)
    return (datetime.now(timezone.utc) - created.replace(tzinfo=timezone.utc)).days > INVITE_EXPIRY_DAYS


def _upsert_language(conn, user_id: int, language: str) -> None:
    """Upsert the user's language preference into language_usage."""
    conn.execute('''
        INSERT INTO language_usage (user_id, language, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            language = excluded.language,
            updated_at = CURRENT_TIMESTAMP
    ''', (user_id, language))


def _build_user_payload(user: dict) -> dict:
    """Build the user payload dict returned by auth endpoints."""
    payload = {
        'id': user['id'],
        'email': user['email'],
        'name': user['name'],
        'picture': user['picture'],
        'role': user.get('role', 'coach'),
        'is_admin': bool(user.get('is_admin')),
        'cookie_consent': user.get('cookie_consent'),
        'language': user.get('language'),
        'preferences': {
            'chess_username': user['chess_username'],
            'preferred_time_class': user['preferred_time_class']
        }
    }
    if user['email'] in BLOCKED_EMAILS:
        payload['_t'] = 1
    return payload


# ============= AUTH ROUTES =============

@auth_bp.route('/api/auth/google', methods=['POST'])
def google_auth():
    """Handle Google OAuth login with ID token."""
    data = request.get_json()
    google_token = data.get('credential')

    if not google_token:
        return jsonify({'error': 'No credential provided'}), 400

    # Verify Google token
    google_user = verify_google_token(google_token)
    if not google_user:
        return jsonify({'error': 'Invalid Google token'}), 401

    # Get or create user
    registered_app = data.get('registered_app')
    user_id = get_or_create_user(google_user, registered_app=registered_app)

    # Create tokens
    access_token = create_access_token(user_id)
    refresh_token, _ = create_refresh_token(user_id)

    # If the client passed a language preference (chosen on the login screen),
    # persist it immediately so the returned user payload reflects it.
    client_language = data.get('language')
    if client_language in ('en', 'fr', 'es'):
        with get_db() as conn:
            _upsert_language(conn, user_id, client_language)

    # Get user data for response
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT u.*, up.chess_username, up.preferred_time_class, lu.language
            FROM users u
            LEFT JOIN user_preferences up ON u.id = up.user_id
            LEFT JOIN language_usage lu ON u.id = lu.user_id
            WHERE u.id = ?
        ''', (user_id,))
        user = dict(cursor.fetchone())

    user_payload = _build_user_payload(user)

    response = make_response(jsonify({
        'user': user_payload,
        'is_new_user': user.get('sign_in_count') == 1
    }))

    set_auth_cookies(response, access_token, refresh_token)
    return response


@auth_bp.route('/api/auth/refresh', methods=['POST'])
def refresh_auth():
    """Refresh access token using refresh token."""
    refresh_token = request.cookies.get('refresh_token')
    if not refresh_token:
        return jsonify({'error': 'No refresh token'}), 401

    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()

    with get_db() as conn:
        cursor = conn.execute('''
            SELECT user_id, expires_at FROM refresh_tokens
            WHERE token_hash = ?
        ''', (token_hash,))
        row = cursor.fetchone()

        if not row:
            return jsonify({'error': 'Invalid refresh token'}), 401

        expires_at = row['expires_at']
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            # Delete expired token
            conn.execute('DELETE FROM refresh_tokens WHERE token_hash = ?', (token_hash,))
            return jsonify({'error': 'Refresh token expired'}), 401

        user_id = row['user_id']

        # Rotate refresh token (delete old, create new)
        conn.execute('DELETE FROM refresh_tokens WHERE token_hash = ?', (token_hash,))

    # Create new tokens
    access_token = create_access_token(user_id)
    new_refresh_token, _ = create_refresh_token(user_id)

    response = make_response(jsonify({'success': True}))
    set_auth_cookies(response, access_token, new_refresh_token)
    return response


@auth_bp.route('/api/auth/logout', methods=['POST'])
def logout():
    """Clear auth cookies and invalidate refresh token."""
    refresh_token = request.cookies.get('refresh_token')

    if refresh_token:
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        with get_db() as conn:
            conn.execute('DELETE FROM refresh_tokens WHERE token_hash = ?', (token_hash,))

    response = make_response(jsonify({'success': True}))
    clear_auth_cookies(response)
    return response


@auth_bp.route('/api/auth/account', methods=['DELETE'])
@login_required
def delete_user_account():
    """Delete user account and all associated data."""
    user_id = request.user_id

    with get_db() as conn:
        # Get user info and stats before deletion
        cursor = conn.execute('SELECT name, email, created_at FROM users WHERE id = ?', (user_id,))
        user = cursor.fetchone()

        if user:
            # Send admin notification before deletion
            try:
                send_admin_deletion_alert(
                    user_name=user['name'],
                    user_email=user['email'],
                    deletion_type='user_account',
                    details={
                        'User ID': user_id,
                        'Account created': user['created_at'],
                    }
                )
            except Exception as e:
                logger.error(f"Failed to send deletion alert: {e}")

        # Delete user (cascades to all related tables)
        conn.execute('DELETE FROM users WHERE id = ?', (user_id,))

    response = make_response(jsonify({'success': True}))
    clear_auth_cookies(response)
    return response


@auth_bp.route('/api/auth/language', methods=['POST'])
@login_required
def set_user_language():
    """Persist the user's language preference (immediate, not via heartbeat)."""
    data = request.get_json() or {}
    language = data.get('language')
    if language not in ('en', 'fr', 'es'):
        return jsonify({'error': 'Invalid language'}), 400
    with get_db() as conn:
        _upsert_language(conn, request.user_id, language)
    return jsonify({'ok': True})


@auth_bp.route('/api/auth/me', methods=['GET'])
def get_current_user_info():
    """Get current user info if authenticated."""
    user_id = get_current_user()

    if not user_id:
        return jsonify({'user': None})

    with get_db() as conn:
        cursor = conn.execute('''
            SELECT u.*, up.chess_username, up.preferred_time_class, lu.language
            FROM users u
            LEFT JOIN user_preferences up ON u.id = up.user_id
            LEFT JOIN language_usage lu ON u.id = lu.user_id
            WHERE u.id = ?
        ''', (user_id,))
        row = cursor.fetchone()

        if not row:
            return jsonify({'user': None})

        user = dict(row)

    user_payload = _build_user_payload(user)

    return jsonify({ 'user': user_payload })




# ============= ACTIVITY TRACKING =============

@auth_bp.route('/api/activity/heartbeat', methods=['POST'])
@login_required
def activity_heartbeat():
    """Record a heartbeat for activity tracking (called every 15s by frontend when user is active)."""
    today = datetime.now().strftime('%Y-%m-%d')
    data = request.get_json() or {}
    page = data.get('page', 'other')

    # Settings data (optional, sent with heartbeat)
    theme = data.get('theme')
    resolved_theme = data.get('resolved_theme')
    language = data.get('language')
    device_type = data.get('device_type')

    # Normalize page names to categories
    KNOWN_PAGES = {
        'home', 'calendar', 'students', 'payments', 'mistakes', 'diagram', 'about', 'admin',
    }
    if page not in KNOWN_PAGES:
        page = 'other'

    with get_db() as conn:
        # Check if this is a new session (30+ min since last ping)
        cursor = conn.execute(
            'SELECT last_session_ping FROM users WHERE id = ?',
            (request.user_id,)
        )
        row = cursor.fetchone()
        last_ping = row['last_session_ping'] if row else None

        is_new_session = True
        if last_ping:
            try:
                last_ping_time = datetime.fromisoformat(last_ping.replace('Z', '+00:00')) if isinstance(last_ping, str) else last_ping
                minutes_since_last = (datetime.now(timezone.utc) - last_ping_time.replace(tzinfo=timezone.utc)).total_seconds() / 60
                is_new_session = minutes_since_last > 30
            except Exception:
                is_new_session = True

        # Update session tracking
        if is_new_session:
            conn.execute('''
                UPDATE users SET session_count = COALESCE(session_count, 0) + 1, last_session_ping = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (request.user_id,))
        else:
            conn.execute('''
                UPDATE users SET last_session_ping = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (request.user_id,))

        # Track daily activity
        conn.execute('''
            INSERT INTO user_activity (user_id, activity_date, seconds, last_ping)
            VALUES (?, ?, 15, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, activity_date) DO UPDATE SET
                seconds = user_activity.seconds + 15,
                last_ping = CURRENT_TIMESTAMP
        ''', (request.user_id, today))

        # Track page-level activity
        conn.execute('''
            INSERT INTO page_activity (user_id, page, seconds)
            VALUES (?, ?, 15)
            ON CONFLICT(user_id, page) DO UPDATE SET
                seconds = page_activity.seconds + 15
        ''', (request.user_id, page))

        # Track daily page-level activity (for per-page daily charts)
        conn.execute('''
            INSERT INTO page_daily_activity (user_id, activity_date, page, seconds)
            VALUES (?, ?, ?, 15)
            ON CONFLICT(user_id, activity_date, page) DO UPDATE SET
                seconds = page_daily_activity.seconds + 15
        ''', (request.user_id, today, page))

        # Track theme preference (if provided)
        if theme and resolved_theme:
            conn.execute('''
                INSERT INTO theme_usage (user_id, theme, resolved_theme, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id) DO UPDATE SET
                    theme = excluded.theme,
                    resolved_theme = excluded.resolved_theme,
                    updated_at = CURRENT_TIMESTAMP
            ''', (request.user_id, theme, resolved_theme))

        # Track language preference (if provided)
        if language:
            _upsert_language(conn, request.user_id, language)

        # Track device usage seconds (if provided)
        if device_type in ('mobile', 'desktop'):
            conn.execute('''
                INSERT INTO device_usage (user_id, device_type, seconds, updated_at)
                VALUES (?, ?, 15, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, device_type) DO UPDATE SET
                    seconds = device_usage.seconds + 15,
                    updated_at = CURRENT_TIMESTAMP
            ''', (request.user_id, device_type))

        # Track coaches usernames (if provided)
        coaches_chess = data.get('coaches_chess_username')
        lichess = data.get('lichess_username')
        if coaches_chess or lichess:
            sets = []
            params = []
            if coaches_chess:
                sets.append('coaches_chess_username = ?')
                params.append(coaches_chess)
            if lichess:
                sets.append('lichess_username = ?')
                params.append(lichess)
            params.append(request.user_id)
            # Ensure row exists
            conn.execute('''
                INSERT INTO user_preferences (user_id) VALUES (?)
                ON CONFLICT(user_id) DO NOTHING
            ''', (request.user_id,))
            conn.execute(f'''
                UPDATE user_preferences SET {', '.join(sets)}
                WHERE user_id = ?
            ''', params)

    return jsonify({'success': True})


# ============= ROLE SELECTION =============

@auth_bp.route('/api/auth/set-role', methods=['POST'])
@login_required
def set_role():
    """Set the user's role after first login."""
    data = request.get_json()
    role = data.get('role')
    if role not in ('coach', 'student'):
        return jsonify({'error': 'Invalid role'}), 400

    with get_db() as conn:
        # Only allow setting role if it's currently NULL (first time)
        row = conn.execute('SELECT role FROM users WHERE id = ?', (request.user_id,)).fetchone()
        if row and row['role'] is not None:
            return jsonify({'error': 'Role already set'}), 400

        conn.execute("UPDATE users SET role = ? WHERE id = ?", (role, request.user_id))

    return jsonify({'success': True, 'role': role})


@auth_bp.route('/api/auth/debug-student', methods=['POST'])
@login_required
def debug_become_student():
    """Admin debug: become a student of yourself (links to your first student record)."""
    with get_db() as conn:
        row = conn.execute('SELECT is_admin FROM users WHERE id = ?', (request.user_id,)).fetchone()
        if not row or not row['is_admin']:
            return jsonify({'error': 'Admin only'}), 403

        # Find first student owned by this coach
        student = conn.execute(
            'SELECT id FROM coach_students WHERE coach_user_id = ? ORDER BY id LIMIT 1',
            (request.user_id,)
        ).fetchone()
        if not student:
            return jsonify({'error': 'No students found — add one first'}), 400

        # Set role and link
        conn.execute("UPDATE users SET role = 'student' WHERE id = ?", (request.user_id,))
        conn.execute("UPDATE coach_students SET linked_user_id = ? WHERE id = ?", (request.user_id, student['id']))

    logger.warning(f'[Debug] User {request.user_id} used debug-student')
    return jsonify({'success': True})


@auth_bp.route('/api/auth/reset-role', methods=['POST'])
@login_required
def reset_role():
    """Admin debug: reset role to NULL to re-trigger role selection."""
    with get_db() as conn:
        row = conn.execute('SELECT is_admin FROM users WHERE id = ?', (request.user_id,)).fetchone()
        if not row or not row['is_admin']:
            return jsonify({'error': 'Admin only'}), 403
        conn.execute("UPDATE users SET role = NULL WHERE id = ?", (request.user_id,))
        # Delete lessons (via cascade from students), students, profile, and bundles
        conn.execute("""
            DELETE FROM coach_lessons WHERE student_id IN (
                SELECT id FROM coach_students WHERE coach_user_id = ?
            )
        """, (request.user_id,))
        conn.execute("DELETE FROM coach_students WHERE coach_user_id = ?", (request.user_id,))
        conn.execute("DELETE FROM coach_profiles WHERE user_id = ?", (request.user_id,))
        conn.execute("DELETE FROM coach_bundle_offers WHERE user_id = ?", (request.user_id,))
    logger.warning(f'[Debug] User {request.user_id} used reset-role (wiped students/lessons/profile)')
    return jsonify({'success': True})


# ============= GOOGLE CALENDAR =============

@auth_bp.route('/api/auth/google-calendar/status', methods=['GET'])
@login_required
def google_calendar_status():
    """Check if the user has connected Google Calendar."""
    with get_db() as conn:
        row = conn.execute(
            'SELECT google_calendar_refresh_token FROM users WHERE id = ?',
            (request.user_id,)
        ).fetchone()
    connected = bool(row and row['google_calendar_refresh_token'])
    return jsonify({'connected': connected})


@auth_bp.route('/api/auth/google-calendar/connect', methods=['POST'])
@login_required
def google_calendar_connect():
    """Start the Google Calendar OAuth flow. Returns the auth URL."""
    from google_calendar import get_auth_url
    state_token = py_secrets.token_urlsafe(24)
    _oauth_states[state_token] = request.user_id
    url = get_auth_url(state_token)
    return jsonify({'auth_url': url})


@auth_bp.route('/api/auth/google-calendar/callback', methods=['GET'])
def google_calendar_callback():
    """OAuth callback — exchanges code for tokens and stores refresh token."""
    from google_calendar import exchange_code
    code = request.args.get('code')
    state = request.args.get('state')
    error = request.args.get('error')

    if error or not code or not state:
        return '<script>window.close()</script>', 200

    # Validate CSRF state token
    user_id = _oauth_states.pop(state, None)
    if not user_id:
        logger.warning(f'[Calendar] Invalid OAuth state token: {state}')
        return '<script>window.close()</script>', 200

    try:
        tokens = exchange_code(code)
        if tokens.get('refresh_token'):
            with get_db() as conn:
                conn.execute(
                    'UPDATE users SET google_calendar_refresh_token = ? WHERE id = ?',
                    (tokens['refresh_token'], user_id)
                )
            logger.info(f'[Calendar] Stored refresh token for user {user_id}')
    except Exception as e:
        logger.error(f'[Calendar] OAuth callback error: {e}')

    # Close the popup window — restrict postMessage to app origin
    return f'<html><body><script>window.opener?.postMessage("calendar-connected","{APP_ORIGIN}");window.close()</script><p>Connected! You can close this window.</p></body></html>', 200


@auth_bp.route('/api/auth/google-calendar/disconnect', methods=['POST'])
@login_required
def google_calendar_disconnect():
    """Disconnect Google Calendar."""
    with get_db() as conn:
        conn.execute(
            'UPDATE users SET google_calendar_refresh_token = NULL WHERE id = ?',
            (request.user_id,)
        )
    return jsonify({'success': True})


# ============= INVITE ROUTES =============

@auth_bp.route('/api/invite/<token>', methods=['GET'])
def get_invite_info(token):
    """Get invite details (no auth required — shown on the invite landing page)."""
    with get_db() as conn:
        invite = conn.execute('''
            SELECT si.*, cs.student_name, u.name AS coach_name, u.picture AS coach_picture
            FROM student_invites si
            JOIN coach_students cs ON si.student_id = cs.id
            JOIN users u ON si.coach_user_id = u.id
            WHERE si.token = ?
        ''', (token,)).fetchone()

    if not invite:
        return jsonify({'error': 'Invite not found'}), 404
    if invite['accepted_at']:
        return jsonify({'error': 'Invite already used'}), 410
    if _is_invite_expired(invite):
        return jsonify({'error': 'Invite has expired'}), 410

    return jsonify({
        'coach_name': invite['coach_name'],
        'coach_picture': invite['coach_picture'],
        'student_name': invite['student_name'],
    })


@auth_bp.route('/api/invite/<token>/accept', methods=['POST'])
@login_required
def accept_invite(token):
    """Accept an invite — links the current user as a student."""
    user_id = request.user_id

    with get_db() as conn:
        invite = conn.execute('''
            SELECT si.*, cs.student_name, cs.linked_user_id
            FROM student_invites si
            JOIN coach_students cs ON si.student_id = cs.id
            WHERE si.token = ?
        ''', (token,)).fetchone()

        if not invite:
            return jsonify({'error': 'Invite not found'}), 404
        if invite['accepted_at']:
            return jsonify({'error': 'Invite already used'}), 410
        if invite['linked_user_id']:
            return jsonify({'error': 'Student already has an account'}), 400
        if _is_invite_expired(invite):
            return jsonify({'error': 'Invite has expired'}), 410

        # Prevent one user from linking to multiple students
        already = conn.execute(
            'SELECT id FROM coach_students WHERE linked_user_id = ?', (user_id,)
        ).fetchone()
        if already:
            return jsonify({'error': 'Your account is already linked to a student'}), 400

        # Link user to student record and set role
        conn.execute(
            'UPDATE coach_students SET linked_user_id = ? WHERE id = ?',
            (user_id, invite['student_id'])
        )
        conn.execute(
            "UPDATE users SET role = 'student' WHERE id = ?",
            (user_id,)
        )
        conn.execute(
            'UPDATE student_invites SET accepted_at = CURRENT_TIMESTAMP WHERE id = ?',
            (invite['id'],)
        )

    return jsonify({'success': True, 'student_name': invite['student_name']})


# ============= MESSAGING =============

@auth_bp.route('/api/messages/unread-count', methods=['GET'])
@login_required
def get_unread_count():
    """Get total unread message count for the current user."""
    with get_db() as conn:
        row = conn.execute(
            'SELECT COUNT(*) AS cnt FROM messages WHERE receiver_id = ? AND read_at IS NULL',
            (request.user_id,)
        ).fetchone()
    return jsonify({'count': row['cnt'] if row else 0})



@auth_bp.route('/api/messages/conversations', methods=['GET'])
@login_required
def get_conversations():
    """List conversations for the current user (coach sees students, student sees coach)."""
    user_id = request.user_id

    with get_db() as conn:
        # Get all users this person has exchanged messages with, plus linked students/coaches
        # For coaches: include all linked students even if no messages yet
        role = conn.execute('SELECT role FROM users WHERE id = ?', (user_id,)).fetchone()
        user_role = role['role'] if role else 'coach'

        if user_role == 'coach':
            contacts = conn.execute('''
                SELECT u.id, u.name, u.picture, cs.id AS student_id, cs.student_name,
                    last_msg.content AS last_message, last_msg.created_at AS last_message_at,
                    COALESCE(unread.cnt, 0) AS unread_count
                FROM coach_students cs
                JOIN users u ON cs.linked_user_id = u.id
                LEFT JOIN LATERAL (
                    SELECT content, created_at FROM messages
                    WHERE (sender_id = ? AND receiver_id = u.id) OR (sender_id = u.id AND receiver_id = ?)
                    ORDER BY created_at DESC LIMIT 1
                ) last_msg ON true
                LEFT JOIN LATERAL (
                    SELECT COUNT(*) AS cnt FROM messages
                    WHERE sender_id = u.id AND receiver_id = ? AND read_at IS NULL
                ) unread ON true
                WHERE cs.coach_user_id = ?
                ORDER BY last_message_at DESC NULLS LAST
            ''', (user_id, user_id, user_id, user_id)).fetchall()
        else:
            contacts = conn.execute('''
                SELECT u.id, u.name, u.picture, cp.display_name AS coach_display_name,
                    last_msg.content AS last_message, last_msg.created_at AS last_message_at,
                    COALESCE(unread.cnt, 0) AS unread_count
                FROM coach_students cs
                JOIN users u ON cs.coach_user_id = u.id
                LEFT JOIN coach_profiles cp ON u.id = cp.user_id
                LEFT JOIN LATERAL (
                    SELECT content, created_at FROM messages
                    WHERE (sender_id = ? AND receiver_id = u.id) OR (sender_id = u.id AND receiver_id = ?)
                    ORDER BY created_at DESC LIMIT 1
                ) last_msg ON true
                LEFT JOIN LATERAL (
                    SELECT COUNT(*) AS cnt FROM messages
                    WHERE sender_id = u.id AND receiver_id = ? AND read_at IS NULL
                ) unread ON true
                WHERE cs.linked_user_id = ?
                ORDER BY last_message_at DESC NULLS LAST
            ''', (user_id, user_id, user_id, user_id)).fetchall()

    result = []
    for c in contacts:
        result.append({
            'user_id': c['id'],
            'student_id': c.get('student_id'),
            'name': c.get('coach_display_name') or c.get('student_name') or c['name'],
            'picture': c['picture'],
            'last_message': c['last_message'],
            'last_message_at': c['last_message_at'].isoformat() if c['last_message_at'] else None,
            'unread_count': c['unread_count'] or 0,
        })

    return jsonify({'conversations': result})


@auth_bp.route('/api/messages/<int:other_user_id>', methods=['GET'])
@login_required
def get_messages(other_user_id):
    """Get message history with a specific user."""
    user_id = request.user_id
    before = request.args.get('before')  # pagination cursor

    with get_db() as conn:
        # Verify coach-student relationship
        linked = conn.execute('''
            SELECT 1 FROM coach_students
            WHERE (coach_user_id = ? AND linked_user_id = ?)
               OR (coach_user_id = ? AND linked_user_id = ?)
        ''', (user_id, other_user_id, other_user_id, user_id)).fetchone()
        if not linked:
            return jsonify({'error': 'Not authorized'}), 403

        params = [user_id, other_user_id, user_id, other_user_id]
        query = '''
            SELECT id, sender_id, receiver_id, content, invoice_id, position_id, read_at, created_at
            FROM messages
            WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        '''
        if before:
            query += ' AND created_at < ?'
            params.append(before)
        query += ' ORDER BY created_at DESC LIMIT 50'

        rows = conn.execute(query, tuple(params)).fetchall()

        # Mark unread messages from the other user as read
        conn.execute('''
            UPDATE messages SET read_at = CURRENT_TIMESTAMP
            WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL
        ''', (other_user_id, user_id))

    messages = [{
        'id': r['id'],
        'sender_id': r['sender_id'],
        'content': r['content'],
        'invoice_id': r['invoice_id'],
        'position_id': r['position_id'],
        'read_at': r['read_at'].isoformat() if r['read_at'] else None,
        'created_at': r['created_at'].isoformat() if r['created_at'] else None,
    } for r in reversed(rows)]  # reverse to chronological order

    return jsonify({'messages': messages})


@auth_bp.route('/api/messages/<int:other_user_id>', methods=['POST'])
@login_required
def send_message(other_user_id):
    """Send a message to another user. Optional position_id attaches a saved
    knowledge-center position as homework (coach → student only)."""
    user_id = request.user_id
    data = request.get_json()
    content = (data.get('content') or '').strip()
    position_id = data.get('position_id')
    if not content and position_id is None:
        return jsonify({'error': 'Message cannot be empty'}), 400
    if len(content) > 5000:
        return jsonify({'error': 'Message too long'}), 400

    with get_db() as conn:
        # Verify the other user exists and is linked (coach-student relationship)
        linked = conn.execute('''
            SELECT 1 FROM coach_students
            WHERE (coach_user_id = ? AND linked_user_id = ?)
               OR (coach_user_id = ? AND linked_user_id = ?)
        ''', (user_id, other_user_id, other_user_id, user_id)).fetchone()
        if not linked:
            return jsonify({'error': 'Not authorized to message this user'}), 403

        homework_email_payload = None
        if position_id is not None:
            owns = conn.execute(
                'SELECT fen FROM knowledge_positions WHERE id = ? AND user_id = ?',
                (position_id, user_id),
            ).fetchone()
            if not owns:
                return jsonify({'error': 'position not found'}), 404
            # Look up both parties so the email can be fired after the commit.
            parties = conn.execute(
                '''SELECT s.name AS coach_name, r.name AS student_name, r.email AS student_email
                   FROM users s, users r WHERE s.id = ? AND r.id = ?''',
                (user_id, other_user_id),
            ).fetchone()
            if parties and parties['student_email']:
                homework_email_payload = {
                    'coach_name': parties['coach_name'] or 'Your coach',
                    'student_name': parties['student_name'] or '',
                    'student_email': parties['student_email'],
                    'note': content,
                    'fen': owns['fen'],
                }

        cursor = conn.execute('''
            INSERT INTO messages (sender_id, receiver_id, content, position_id)
            VALUES (?, ?, ?, ?) RETURNING id, created_at
        ''', (user_id, other_user_id, content, position_id))
        row = cursor.fetchone()

    # Fire the email alert in a background thread so the HTTP response isn't
    # blocked on SMTP. Failure is logged but never surfaces to the caller.
    if homework_email_payload is not None:
        import threading
        threading.Thread(
            target=send_homework_email,
            kwargs=homework_email_payload,
            daemon=True,
        ).start()

    return jsonify({
        'id': row['id'],
        'sender_id': user_id,
        'content': content,
        'position_id': position_id,
        'created_at': row['created_at'].isoformat(),
    }), 201


# ============= STUDENT ROUTES =============

@auth_bp.route('/api/student/dashboard', methods=['GET'])
@login_required
def student_dashboard():
    """Get the student's dashboard data (their coach, packs, lessons)."""
    user_id = request.user_id

    with get_db() as conn:
        # Find the student record linked to this user
        student = conn.execute('''
            SELECT cs.*, u.name AS coach_name, u.picture AS coach_picture,
                   cp.display_name AS coach_display_name, cp.city AS coach_city
            FROM coach_students cs
            JOIN users u ON cs.coach_user_id = u.id
            LEFT JOIN coach_profiles cp ON cs.coach_user_id = cp.user_id
            WHERE cs.linked_user_id = ?
        ''', (user_id,)).fetchone()

        if not student:
            return jsonify({'error': 'No student record found'}), 404

        # Get active packs with live consumed count
        packs = conn.execute('''
            SELECT p.id, p.total_lessons, p.price, p.currency, p.source, p.status, p.created_at,
                   COUNT(CASE WHEN l.status = 'completed' THEN 1 END) AS consumed
            FROM coach_packs p
            LEFT JOIN coach_lessons l ON l.pack_id = p.id AND l.deleted_at IS NULL
            WHERE p.student_id = ? AND p.status = 'active'
            GROUP BY p.id
            ORDER BY p.created_at DESC
        ''', (student['id'],)).fetchall()

        # Get recent lessons
        lessons = conn.execute('''
            SELECT id, scheduled_at, duration_minutes, status, created_at
            FROM coach_lessons
            WHERE student_id = ? AND deleted_at IS NULL
            ORDER BY scheduled_at DESC
            LIMIT 20
        ''', (student['id'],)).fetchall()

    return jsonify({
        'student': {
            'id': student['id'],
            'name': student['student_name'],
        },
        'coach_user_id': student['coach_user_id'],
        'coach': {
            'name': student['coach_display_name'] or student['coach_name'],
            'picture': student['coach_picture'],
            'city': student['coach_city'],
        },
        'packs': [dict(p) for p in packs],
        'lessons': [dict(l) for l in lessons],
    })
