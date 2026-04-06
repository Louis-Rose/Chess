"""Auth, preferences, activity/heartbeat, and shared user routes."""

import hashlib
import json
import logging
from datetime import datetime

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
from email_utils import send_admin_deletion_alert

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth_routes', __name__)

BLOCKED_EMAILS = set()


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

    # Get user data for response
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT u.*, up.chess_username, up.preferred_time_class
            FROM users u
            LEFT JOIN user_preferences up ON u.id = up.user_id
            WHERE u.id = ?
        ''', (user_id,))
        user = dict(cursor.fetchone())

    user_payload = {
            'id': user['id'],
            'email': user['email'],
            'name': user['name'],
            'picture': user['picture'],
            'is_admin': bool(user.get('is_admin')),
            'cookie_consent': user.get('cookie_consent'),
            'preferences': {
                'chess_username': user['chess_username'],
                'preferred_time_class': user['preferred_time_class']
            }
    }
    if user['email'] in BLOCKED_EMAILS:
        user_payload['_t'] = 1

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
        if expires_at.replace(tzinfo=None) < datetime.utcnow():
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


@auth_bp.route('/api/auth/me', methods=['GET'])
def get_current_user_info():
    """Get current user info if authenticated."""
    user_id = get_current_user()

    if not user_id:
        return jsonify({'user': None})

    with get_db() as conn:
        cursor = conn.execute('''
            SELECT u.*, up.chess_username, up.preferred_time_class
            FROM users u
            LEFT JOIN user_preferences up ON u.id = up.user_id
            WHERE u.id = ?
        ''', (user_id,))
        row = cursor.fetchone()

        if not row:
            return jsonify({'user': None})

        user = dict(row)

    user_payload = {
            'id': user['id'],
            'email': user['email'],
            'name': user['name'],
            'picture': user['picture'],
            'is_admin': bool(user.get('is_admin')),
            'cookie_consent': user.get('cookie_consent'),
            'preferences': {
                'chess_username': user['chess_username'],
                'preferred_time_class': user['preferred_time_class']
            }
    }
    if user['email'] in BLOCKED_EMAILS:
        user_payload['_t'] = 1

    return jsonify({ 'user': user_payload })


# ============= PREFERENCES ROUTES =============

@auth_bp.route('/api/preferences', methods=['GET'])
@login_required
def get_preferences():
    """Get user preferences."""
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT chess_username, preferred_time_class
            FROM user_preferences WHERE user_id = ?
        ''', (request.user_id,))
        row = cursor.fetchone()

    return jsonify(dict(row) if row else {})


@auth_bp.route('/api/preferences', methods=['PUT'])
@login_required
def update_preferences():
    """Update user preferences."""
    data = request.get_json()

    allowed_fields = ['chess_username', 'preferred_time_class']
    updates = {k: v for k, v in data.items() if k in allowed_fields}

    if not updates:
        return jsonify({'error': 'No valid fields to update'}), 400

    # Validate time_class
    if 'preferred_time_class' in updates:
        if updates['preferred_time_class'] not in ['rapid', 'blitz', 'bullet']:
            return jsonify({'error': 'Invalid time_class'}), 400

    set_clause = ', '.join(f'{k} = ?' for k in updates.keys())
    values = list(updates.values()) + [request.user_id]

    with get_db() as conn:
        conn.execute(f'''
            UPDATE user_preferences
            SET {set_clause}, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        ''', values)

    return jsonify({'success': True, 'preferences': updates})




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
        'home', 'calendar', 'students', 'payments', 'scoresheets', 'mistakes', 'diagram', 'about', 'admin',
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
                minutes_since_last = (datetime.utcnow() - last_ping_time.replace(tzinfo=None)).total_seconds() / 60
                is_new_session = minutes_since_last > 30
            except:
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
            conn.execute('''
                INSERT INTO language_usage (user_id, language, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id) DO UPDATE SET
                    language = excluded.language,
                    updated_at = CURRENT_TIMESTAMP
            ''', (request.user_id, language))

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


# ============= THEME / LANGUAGE / COOKIE / DEVICE ROUTES =============

@auth_bp.route('/api/theme', methods=['POST'])
@login_required
def record_theme():
    """Record user's theme preference for analytics."""
    data = request.get_json()
    theme = data.get('theme')  # 'light', 'dark', 'system'
    resolved_theme = data.get('resolved_theme')  # 'light' or 'dark'

    if not theme or not resolved_theme:
        return jsonify({'error': 'theme and resolved_theme required'}), 400

    with get_db() as conn:
        conn.execute('''
            INSERT INTO theme_usage (user_id, theme, resolved_theme, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                theme = excluded.theme,
                resolved_theme = excluded.resolved_theme,
                updated_at = CURRENT_TIMESTAMP
        ''', (request.user_id, theme, resolved_theme))

    return jsonify({'success': True})


@auth_bp.route('/api/language', methods=['POST'])
@login_required
def record_language():
    """Record user's language preference for analytics."""
    data = request.get_json()
    language = data.get('language')  # 'en' or 'fr'

    if not language:
        return jsonify({'error': 'language required'}), 400

    with get_db() as conn:
        conn.execute('''
            INSERT INTO language_usage (user_id, language, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                language = excluded.language,
                updated_at = CURRENT_TIMESTAMP
        ''', (request.user_id, language))

    return jsonify({'success': True})


@auth_bp.route('/api/cookie-consent', methods=['POST'])
@login_required
def save_cookie_consent():
    """Save user's cookie consent. Only 'accepted' is persisted; refusals increment a counter."""
    data = request.get_json()
    consent = data.get('consent')  # 'accepted' or 'refused'

    if consent not in ('accepted', 'refused'):
        return jsonify({'error': 'consent must be "accepted" or "refused"'}), 400

    with get_db() as conn:
        if consent == 'accepted':
            # Store acceptance permanently
            conn.execute('''
                UPDATE users SET cookie_consent = 'accepted', cookie_consent_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (request.user_id,))
        else:
            # Increment refusal count (but don't set cookie_consent, so they'll be asked again)
            conn.execute('''
                UPDATE users SET cookie_refusal_count = COALESCE(cookie_refusal_count, 0) + 1
                WHERE id = ?
            ''', (request.user_id,))

    return jsonify({'success': True, 'consent': consent if consent == 'accepted' else None})


@auth_bp.route('/api/device', methods=['POST'])
@login_required
def record_device():
    """Record user's device type for analytics."""
    data = request.get_json()
    device_type = data.get('device_type')  # 'mobile' or 'desktop'

    if device_type not in ('mobile', 'desktop'):
        return jsonify({'error': 'device_type must be mobile or desktop'}), 400

    with get_db() as conn:
        conn.execute('''
            INSERT INTO device_usage (user_id, device_type, seconds, updated_at)
            VALUES (?, ?, 0, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, device_type) DO UPDATE SET
                updated_at = CURRENT_TIMESTAMP
        ''', (request.user_id, device_type))

    return jsonify({'success': True})


# ============= REWARD / FEEDBACK ROUTES =============

@auth_bp.route('/api/reward/eligibility', methods=['GET'])
@login_required
def check_reward_eligibility():
    """Check if user is eligible for the 5th visit reward (5+ sessions, not yet claimed by this user)."""
    with get_db() as conn:
        # Check if this user has already claimed the reward
        cursor = conn.execute('SELECT id FROM first_visitor_reward WHERE user_id = ?', (request.user_id,))
        if cursor.fetchone():
            return jsonify({'eligible': False, 'reason': 'already_claimed'})

        # Check if current user has 5+ sessions
        cursor = conn.execute('SELECT session_count FROM users WHERE id = ?', (request.user_id,))
        user = cursor.fetchone()

        if not user:
            return jsonify({'eligible': False, 'reason': 'user_not_found'})

        if user['session_count'] >= 5:
            return jsonify({'eligible': True})
        else:
            return jsonify({'eligible': False, 'reason': 'not_enough_sessions', 'current_sessions': user['session_count']})


@auth_bp.route('/api/reward/claim', methods=['POST'])
@login_required
def claim_reward():
    """Claim the 5th visit reward by selecting a company for analysis."""
    from email_utils import send_reward_notification_email

    data = request.get_json()
    selected_company = data.get('company', '').strip().upper()

    if not selected_company:
        return jsonify({'error': 'Company ticker is required'}), 400

    with get_db() as conn:
        # Check if this user already claimed
        cursor = conn.execute('SELECT id FROM first_visitor_reward WHERE user_id = ?', (request.user_id,))
        if cursor.fetchone():
            return jsonify({'error': 'You have already claimed this reward'}), 409

        # Check user has 5+ sessions
        cursor = conn.execute('SELECT session_count, name, email FROM users WHERE id = ?', (request.user_id,))
        user = cursor.fetchone()

        if not user:
            return jsonify({'error': 'User not found'}), 404

        if user['session_count'] < 5:
            return jsonify({'error': 'Not enough sessions to claim reward'}), 403

        user_name = user['name'] or 'Unknown User'
        user_email = user['email']

        # Claim the reward
        conn.execute('''
            INSERT INTO first_visitor_reward (user_id, user_name, user_email, selected_company)
            VALUES (?, ?, ?, ?)
        ''', (request.user_id, user_name, user_email, selected_company))

        # Send notification email
        send_reward_notification_email(user_name, user_email, selected_company)

    return jsonify({'success': True, 'message': 'Reward claimed successfully!'})


@auth_bp.route('/api/feedback', methods=['POST'])
@login_required
def submit_feedback():
    """Submit user feedback via email, with optional screenshot attachments."""
    from email_utils import send_feedback_email

    data = request.get_json()
    message = data.get('message', '').strip()
    images = data.get('images', [])  # List of base64 data URIs

    if not message and not images:
        return jsonify({'error': 'Message or screenshot is required'}), 400

    if len(message) > 5000:
        return jsonify({'error': 'Message too long (max 5000 characters)'}), 400

    # Limit number of images
    if len(images) > 5:
        return jsonify({'error': 'Too many images (max 5)'}), 400

    # Get user info
    with get_db() as conn:
        cursor = conn.execute('SELECT name, email FROM users WHERE id = ?', (request.user_id,))
        user = cursor.fetchone()

    if not user:
        return jsonify({'error': 'User not found'}), 404

    user_name = user['name'] or 'Unknown User'
    user_email = user['email']

    success = send_feedback_email(user_name, user_email, message, images)

    if success:
        return jsonify({'success': True, 'message': 'Feedback sent successfully'})
    else:
        return jsonify({'error': 'Failed to send feedback. Please try again later.'}), 500
