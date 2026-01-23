# backend/app.py
import os
import hashlib
import secrets
import re
from datetime import datetime, timedelta
from flask import Flask, jsonify, request, Response, make_response
from flask_cors import CORS
from dotenv import load_dotenv
import utils
from database import get_db, init_db, get_all_cached_stats, save_all_cached_stats, USE_POSTGRES

# In-memory storage for mobile upload tokens (short-lived, ~5 min)
# Structure: { token: { user_id, created_at, transactions, status } }
_upload_tokens = {}
from auth import (
    verify_google_token, get_or_create_user, create_access_token,
    create_refresh_token, set_auth_cookies, clear_auth_cookies,
    get_current_user, login_required, admin_required
)

# Load environment-specific .env file
env = os.environ.get('FLASK_ENV', 'dev')
env_file = f'.env.{env}'
load_dotenv(env_file)

app = Flask(__name__)
# Allow React (running on localhost:5173) to talk to this API
# Support credentials for cookies
CORS(app, supports_credentials=True)

# Initialize database on startup
init_db() 

@app.route('/api/stats', methods=['GET'])
def get_chess_stats():
    username = request.args.get('username')
    time_class = request.args.get('time_class', 'rapid')  # Default to rapid

    if not username:
        return jsonify({"error": "Username required"}), 400

    if time_class not in ['rapid', 'blitz', 'bullet']:
        return jsonify({"error": "Invalid time_class. Use 'rapid', 'blitz', or 'bullet'"}), 400

    try:
        # 1. Fetch Player data
        player_data = utils.fetch_player_data_and_stats(username)

        # 2. Fetch archives once - reuse for all functions
        archives = utils.fetch_player_games_archives(username)

        # 3. Fetch History (weekly) - filtered by time class
        history = utils.fetch_games_played_per_week(username, time_class=time_class, archives=archives)

        # 4. Fetch Elo history - filtered by time class
        elo_history, total_games = utils.fetch_elo_per_week(username, time_class=time_class, archives=archives)

        # 5. Fetch Openings
        raw_openings = utils.fetch_all_openings(username, archives)
        processed_openings = utils.process_openings_for_json(raw_openings)

        # 6. Fetch win rate by game number per day
        game_number_stats = utils.fetch_win_rate_by_game_number(username, time_class=time_class, archives=archives)

        return jsonify({
            "player": {
                "name": player_data.get("name", username),
                "username": player_data.get("username", username),
                "avatar": player_data.get("avatar"),
                "followers": player_data.get("followers", 0),
                "joined": player_data.get("joined")
            },
            "time_class": time_class,
            "history": history,
            "elo_history": elo_history,
            "total_games": total_games,
            "openings": processed_openings,
            "game_number_stats": game_number_stats
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/stats-stream', methods=['GET'])
def get_chess_stats_stream():
    """SSE endpoint that streams progress while fetching stats. Uses caching for performance.

    Optimization: Fetches ALL time classes (rapid, blitz) in a single pass through archives.
    This makes switching between time classes instant after the first fetch.
    """
    import json as json_module

    username = request.args.get('username')
    time_class = request.args.get('time_class', 'rapid')

    if not username:
        return jsonify({"error": "Username required"}), 400

    if time_class not in ['rapid', 'blitz', 'bullet']:
        return jsonify({"error": "Invalid time_class"}), 400

    def generate():
        try:
            # First, fetch player data (always fresh for profile info)
            player_data = utils.fetch_player_data_and_stats(username)
            player_info = {
                'name': player_data.get('name', username),
                'username': player_data.get('username', username),
                'avatar': player_data.get('avatar'),
                'followers': player_data.get('followers', 0),
                'joined': player_data.get('joined')
            }
            yield f"data: {json_module.dumps({'type': 'player', 'player': player_info})}\n\n"

            # Check cache for ALL time classes
            all_cached = get_all_cached_stats(username)

            # Check if requested time class has fresh cache
            if time_class in all_cached:
                cached_stats, _, is_fresh = all_cached[time_class]
                if is_fresh:
                    # Return cached data immediately
                    yield f"data: {json_module.dumps({'type': 'start', 'total_archives': 0, 'incremental': False, 'cached': True})}\n\n"
                    yield f"data: {json_module.dumps({'type': 'complete', 'data': cached_stats})}\n\n"
                    return

            # Need to fetch - prepare cached stats map for incremental update
            cached_stats_map = None
            last_archive = None
            if all_cached:
                # Use any existing cache for incremental update
                cached_stats_map = {}
                for tc, (stats, archive, _) in all_cached.items():
                    cached_stats_map[tc] = stats
                    if archive:
                        last_archive = archive  # They should all be the same

            # Fetch stats for ALL time classes
            all_time_classes_data = None
            final_stats = None
            for chunk in utils.fetch_all_time_classes_streaming(username, time_class, cached_stats_map, last_archive):
                yield chunk
                # Parse the chunk to capture final data for caching
                if chunk.startswith('data: '):
                    try:
                        msg = json_module.loads(chunk[6:].strip())
                        if msg.get('type') == 'complete':
                            final_stats = msg.get('data')
                            all_time_classes_data = msg.get('all_time_classes')
                    except:
                        pass

            # Save ALL time classes to cache after successful fetch
            if all_time_classes_data:
                last_archive_new = None
                # Clean up last_archive from each time class data before caching
                for tc, tc_data in all_time_classes_data.items():
                    if 'last_archive' in tc_data:
                        last_archive_new = tc_data.pop('last_archive')
                save_all_cached_stats(username, player_info, all_time_classes_data, last_archive_new)

        except Exception as e:
            yield f"data: {json_module.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'  # Disable nginx buffering
        }
    )

@app.route('/api/fatigue-analysis', methods=['GET'])
def get_fatigue_analysis():
    username = request.args.get('username')
    time_class = request.args.get('time_class', 'rapid')

    if not username:
        return jsonify({"error": "Username required"}), 400

    if time_class not in ['rapid', 'blitz', 'bullet']:
        return jsonify({"error": "Invalid time_class"}), 400

    try:
        fatigue_analysis = utils.compute_fatigue_analysis(username, time_class=time_class)
        return jsonify(fatigue_analysis)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/win-prediction-stream', methods=['GET'])
def get_win_prediction_stream():
    """SSE endpoint that streams progress while analyzing win prediction patterns."""
    import json as json_module

    username = request.args.get('username')
    time_class = request.args.get('time_class', 'rapid')

    if not username:
        return jsonify({"error": "Username required"}), 400

    if time_class not in ['rapid', 'blitz', 'bullet']:
        return jsonify({"error": "Invalid time_class"}), 400

    def generate():
        try:
            for chunk in utils.compute_win_prediction_analysis_streaming(username, time_class=time_class):
                yield chunk
        except Exception as e:
            yield f"data: {json_module.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        }
    )

@app.route('/api/youtube-videos', methods=['GET'])
def get_youtube_videos():
    opening = request.args.get('opening')
    side = request.args.get('side')  # 'White' or 'Black' or 'tips'

    if not opening:
        return jsonify({"error": "Opening name required"}), 400

    api_key = os.environ.get('YOUTUBE_API_KEY')
    if not api_key:
        return jsonify({"error": "YouTube API key not configured"}), 500

    try:
        # Enable transcript scoring for pro tips videos
        use_transcript_scoring = (side == 'tips')
        videos = utils.fetch_youtube_videos(opening, side, api_key, use_transcript_scoring=use_transcript_scoring)
        return jsonify({"videos": videos})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ============= AUTH ROUTES =============

@app.route('/api/auth/google', methods=['POST'])
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
    user_id = get_or_create_user(google_user)

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

    response = make_response(jsonify({
        'user': {
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
        },
        'is_new_user': user.get('sign_in_count') == 1
    }))

    set_auth_cookies(response, access_token, refresh_token)
    return response


@app.route('/api/auth/refresh', methods=['POST'])
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


@app.route('/api/auth/logout', methods=['POST'])
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


@app.route('/api/auth/account', methods=['DELETE'])
@login_required
def delete_user_account():
    """Delete user account and all associated data."""
    user_id = request.user_id

    with get_db() as conn:
        # Delete user (cascades to all related tables)
        conn.execute('DELETE FROM users WHERE id = ?', (user_id,))

    response = make_response(jsonify({'success': True}))
    clear_auth_cookies(response)
    return response


@app.route('/api/auth/me', methods=['GET'])
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

    return jsonify({
        'user': {
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
    })


# ============= PREFERENCES ROUTES =============

@app.route('/api/preferences', methods=['GET'])
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


@app.route('/api/preferences', methods=['PUT'])
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

@app.route('/api/activity/heartbeat', methods=['POST'])
@login_required
def activity_heartbeat():
    """Record a heartbeat for activity tracking (called every 60s by frontend)."""
    today = datetime.now().strftime('%Y-%m-%d')
    data = request.get_json() or {}
    page = data.get('page', 'other')

    # Settings data (optional, sent with heartbeat)
    theme = data.get('theme')
    resolved_theme = data.get('resolved_theme')
    language = data.get('language')
    device_type = data.get('device_type')

    # Normalize page names to categories
    if page.startswith('stock/'):
        page = 'stock'  # Aggregate all company pages
    elif page not in ('portfolio', 'watchlist', 'earnings', 'financials', 'admin'):
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
            INSERT INTO user_activity (user_id, activity_date, minutes, last_ping)
            VALUES (?, ?, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, activity_date) DO UPDATE SET
                minutes = user_activity.minutes + 1,
                last_ping = CURRENT_TIMESTAMP
        ''', (request.user_id, today))

        # Track page-level activity
        conn.execute('''
            INSERT INTO page_activity (user_id, page, minutes)
            VALUES (?, ?, 1)
            ON CONFLICT(user_id, page) DO UPDATE SET
                minutes = page_activity.minutes + 1
        ''', (request.user_id, page))

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

        # Track device usage minutes (if provided)
        if device_type in ('mobile', 'desktop'):
            conn.execute('''
                INSERT INTO device_usage (user_id, device_type, minutes, updated_at)
                VALUES (?, ?, 1, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, device_type) DO UPDATE SET
                    minutes = device_usage.minutes + 1,
                    updated_at = CURRENT_TIMESTAMP
            ''', (request.user_id, device_type))

    return jsonify({'success': True})


@app.route('/api/theme', methods=['POST'])
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


@app.route('/api/language', methods=['POST'])
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


@app.route('/api/cookie-consent', methods=['POST'])
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


@app.route('/api/device', methods=['POST'])
@login_required
def record_device():
    """Record user's device type for analytics."""
    data = request.get_json()
    device_type = data.get('device_type')  # 'mobile' or 'desktop'

    if device_type not in ('mobile', 'desktop'):
        return jsonify({'error': 'device_type must be mobile or desktop'}), 400

    with get_db() as conn:
        conn.execute('''
            INSERT INTO device_usage (user_id, device_type, minutes, updated_at)
            VALUES (?, ?, 0, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, device_type) DO UPDATE SET
                updated_at = CURRENT_TIMESTAMP
        ''', (request.user_id, device_type))

    return jsonify({'success': True})


# ============= ADMIN ROUTES =============

@app.route('/api/admin/theme-stats', methods=['GET'])
@admin_required
def get_theme_stats():
    """Get theme usage statistics (admin only). Excludes admin users."""
    with get_db() as conn:
        # Get counts by resolved theme (actual display) - exclude admins
        cursor = conn.execute('''
            SELECT t.resolved_theme, COUNT(*) as count
            FROM theme_usage t
            INNER JOIN users u ON t.user_id = u.id
            WHERE u.is_admin = 0
            GROUP BY t.resolved_theme
        ''')
        by_resolved = {row['resolved_theme']: row['count'] for row in cursor.fetchall()}

        # Get counts by theme setting (includes 'system') - exclude admins
        cursor = conn.execute('''
            SELECT t.theme, COUNT(*) as count
            FROM theme_usage t
            INNER JOIN users u ON t.user_id = u.id
            WHERE u.is_admin = 0
            GROUP BY t.theme
        ''')
        by_setting = {row['theme']: row['count'] for row in cursor.fetchall()}

        # Get total users with theme data - exclude admins
        cursor = conn.execute('''
            SELECT COUNT(*) as total
            FROM theme_usage t
            INNER JOIN users u ON t.user_id = u.id
            WHERE u.is_admin = 0
        ''')
        total = cursor.fetchone()['total']

    return jsonify({
        'total': total,
        'by_resolved': by_resolved,
        'by_setting': by_setting
    })


@app.route('/api/admin/language-stats', methods=['GET'])
@admin_required
def get_language_stats():
    """Get language usage statistics (admin only). Excludes admin users."""
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT l.language, COUNT(*) as count
            FROM language_usage l
            INNER JOIN users u ON l.user_id = u.id
            WHERE u.is_admin = 0
            GROUP BY l.language
        ''')
        by_language = {row['language']: row['count'] for row in cursor.fetchall()}

        cursor = conn.execute('''
            SELECT COUNT(*) as total
            FROM language_usage l
            INNER JOIN users u ON l.user_id = u.id
            WHERE u.is_admin = 0
        ''')
        total = cursor.fetchone()['total']

    return jsonify({
        'total': total,
        'by_language': by_language
    })


@app.route('/api/admin/device-stats', methods=['GET'])
@admin_required
def get_device_stats():
    """Get device type usage statistics (admin only). Excludes admin users."""
    with get_db() as conn:
        # Get total minutes per device type - exclude admins
        cursor = conn.execute('''
            SELECT d.device_type, SUM(d.minutes) as total_minutes
            FROM device_usage d
            INNER JOIN users u ON d.user_id = u.id
            WHERE u.is_admin = 0
            GROUP BY d.device_type
        ''')
        by_device = {row['device_type']: row['total_minutes'] for row in cursor.fetchall()}

        # Get total users with device data - exclude admins
        cursor = conn.execute('''
            SELECT COUNT(DISTINCT d.user_id) as total
            FROM device_usage d
            INNER JOIN users u ON d.user_id = u.id
            WHERE u.is_admin = 0
        ''')
        total = cursor.fetchone()['total']

        # Calculate total minutes for percentage
        total_minutes = sum(by_device.values())

    return jsonify({
        'total': total,
        'total_minutes': total_minutes,
        'by_device': by_device
    })


@app.route('/api/admin/users-by-theme/<theme>', methods=['GET'])
@admin_required
def get_users_by_theme(theme):
    """Get list of users with a specific resolved theme (admin only). Excludes admin users."""
    if theme not in ('dark', 'light'):
        return jsonify({'error': 'Invalid theme'}), 400

    with get_db() as conn:
        cursor = conn.execute('''
            SELECT u.id, u.name, u.picture
            FROM users u
            INNER JOIN theme_usage t ON u.id = t.user_id
            WHERE t.resolved_theme = ? AND u.is_admin = 0
            ORDER BY u.name
        ''', (theme,))
        users = [{'id': row['id'], 'name': row['name'], 'picture': row['picture']} for row in cursor.fetchall()]

    return jsonify({'users': users})


@app.route('/api/admin/users-by-language/<lang>', methods=['GET'])
@admin_required
def get_users_by_language(lang):
    """Get list of users with a specific language setting (admin only). Excludes admin users."""
    if lang not in ('en', 'fr'):
        return jsonify({'error': 'Invalid language'}), 400

    with get_db() as conn:
        cursor = conn.execute('''
            SELECT u.id, u.name, u.picture
            FROM users u
            INNER JOIN language_usage l ON u.id = l.user_id
            WHERE l.language = ? AND u.is_admin = 0
            ORDER BY u.name
        ''', (lang,))
        users = [{'id': row['id'], 'name': row['name'], 'picture': row['picture']} for row in cursor.fetchall()]

    return jsonify({'users': users})


@app.route('/api/admin/users-by-device/<device>', methods=['GET'])
@admin_required
def get_users_by_device(device):
    """Get list of users with a specific device type (admin only). Excludes admin users."""
    if device not in ('mobile', 'desktop'):
        return jsonify({'error': 'Invalid device type'}), 400

    with get_db() as conn:
        cursor = conn.execute('''
            SELECT u.id, u.name, u.picture, d.minutes
            FROM users u
            INNER JOIN device_usage d ON u.id = d.user_id
            WHERE d.device_type = ? AND u.is_admin = 0
            ORDER BY d.minutes DESC
        ''', (device,))
        users = [{'id': row['id'], 'name': row['name'], 'picture': row['picture'], 'minutes': row['minutes']} for row in cursor.fetchall()]

    return jsonify({'users': users})


@app.route('/api/admin/settings-crosstab', methods=['GET'])
@admin_required
def get_settings_crosstab():
    """Get cross-tabulation of theme x language, weighted by time spent."""
    with get_db() as conn:
        # Join theme_usage, language_usage, and user activity to get weighted crosstab
        cursor = conn.execute('''
            SELECT
                t.resolved_theme,
                l.language,
                COUNT(*) as user_count,
                COALESCE(SUM(u.total_minutes), 0) as total_minutes
            FROM theme_usage t
            INNER JOIN language_usage l ON t.user_id = l.user_id
            LEFT JOIN (
                SELECT user_id, SUM(duration_minutes) as total_minutes
                FROM user_activity
                GROUP BY user_id
            ) u ON t.user_id = u.user_id
            GROUP BY t.resolved_theme, l.language
        ''')

        results = cursor.fetchall()

        # Build crosstab data
        crosstab = {}
        total_minutes = 0
        total_users = 0

        for row in results:
            theme = row['resolved_theme']
            lang = row['language']
            minutes = row['total_minutes']
            users = row['user_count']

            key = f"{theme}_{lang}"
            crosstab[key] = {
                'users': users,
                'minutes': minutes
            }
            total_minutes += minutes
            total_users += users

    return jsonify({
        'crosstab': crosstab,
        'total_minutes': total_minutes,
        'total_users': total_users
    })


@app.route('/api/admin/users', methods=['GET'])
@admin_required
def list_users():
    """List all registered users (admin only)."""
    # Hidden accounts (still functional, just not displayed)
    hidden_emails = ['rose.louis.mail@gmail.com', 'u6965441974@gmail.com']

    with get_db() as conn:
        cursor = conn.execute('''
            SELECT u.id, u.email, u.name, u.picture, u.is_admin, u.created_at, u.updated_at, u.sign_in_count, u.session_count,
                   COALESCE(SUM(a.minutes), 0) as total_minutes,
                   MAX(a.last_ping) as last_active,
                   (SELECT COUNT(*) FROM graph_downloads g WHERE g.user_id = u.id) as graph_downloads,
                   (SELECT COUNT(*) FROM investment_accounts ia WHERE ia.user_id = u.id) as account_count
            FROM users u
            LEFT JOIN user_activity a ON u.id = a.user_id
            GROUP BY u.id
            ORDER BY u.created_at DESC
        ''')
        users = []
        for row in cursor.fetchall():
            if row['email'] in hidden_emails:
                continue
            user = dict(row)
            # Convert datetime objects to ISO strings for consistent JSON serialization
            if user.get('created_at') and hasattr(user['created_at'], 'isoformat'):
                user['created_at'] = user['created_at'].isoformat()
            if user.get('updated_at') and hasattr(user['updated_at'], 'isoformat'):
                user['updated_at'] = user['updated_at'].isoformat()
            if user.get('last_active') and hasattr(user['last_active'], 'isoformat'):
                user['last_active'] = user['last_active'].isoformat()
            users.append(user)

    return jsonify({'users': users, 'total': len(users)})


@app.route('/api/admin/users/<int:user_id>/activity', methods=['GET'])
@admin_required
def get_user_activity(user_id):
    """Get daily activity breakdown for a user (admin only)."""
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT activity_date, minutes
            FROM user_activity
            WHERE user_id = ?
            ORDER BY activity_date DESC
        ''', (user_id,))
        activity = [dict(row) for row in cursor.fetchall()]

    return jsonify({'activity': activity})


@app.route('/api/admin/users/<int:user_id>/accounts', methods=['GET'])
@admin_required
def get_user_accounts(user_id):
    """Get investment accounts for a user (admin only)."""
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT id, name, account_type, bank, created_at
            FROM investment_accounts
            WHERE user_id = ?
            ORDER BY created_at ASC
        ''', (user_id,))
        accounts = [dict(row) for row in cursor.fetchall()]

    return jsonify({'accounts': accounts})


@app.route('/api/admin/users/<int:user_id>', methods=['GET'])
@admin_required
def get_user_detail(user_id):
    """Get detailed info for a specific user (admin only)."""
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT u.id, u.email, u.name, u.picture, u.is_admin, u.created_at, u.updated_at,
                   COALESCE(SUM(a.minutes), 0) as total_minutes,
                   MAX(a.last_ping) as last_active
            FROM users u
            LEFT JOIN user_activity a ON u.id = a.user_id
            WHERE u.id = ?
            GROUP BY u.id
        ''', (user_id,))
        user = cursor.fetchone()

    if not user:
        return jsonify({'error': 'User not found'}), 404

    user_dict = dict(user)
    # Convert datetime objects to ISO strings for JSON serialization
    if user_dict.get('created_at') and hasattr(user_dict['created_at'], 'isoformat'):
        user_dict['created_at'] = user_dict['created_at'].isoformat()
    if user_dict.get('updated_at') and hasattr(user_dict['updated_at'], 'isoformat'):
        user_dict['updated_at'] = user_dict['updated_at'].isoformat()
    if user_dict.get('last_active') and hasattr(user_dict['last_active'], 'isoformat'):
        user_dict['last_active'] = user_dict['last_active'].isoformat()

    return jsonify({'user': user_dict})


@app.route('/api/admin/users/<int:user_id>/watchlist', methods=['GET'])
@admin_required
def get_user_watchlist(user_id):
    """Get a user's watchlist (admin only)."""
    with get_db() as conn:
        cursor = conn.execute(
            'SELECT stock_ticker FROM watchlist WHERE user_id = ? ORDER BY created_at ASC',
            (user_id,)
        )
        rows = cursor.fetchall()

    symbols = [row['stock_ticker'] for row in rows]
    return jsonify({'symbols': symbols})


@app.route('/api/admin/users/<int:user_id>/portfolio', methods=['GET'])
@admin_required
def get_user_portfolio(user_id):
    """Get a user's portfolio composition grouped by account (admin only)."""
    # Get all accounts for this user
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT id, name, account_type, bank, created_at
            FROM investment_accounts
            WHERE user_id = ?
            ORDER BY created_at ASC
        ''', (user_id,))
        accounts = [dict(row) for row in cursor.fetchall()]

    result = []
    total_value_eur = 0

    for account in accounts:
        holdings = compute_holdings_from_transactions(user_id, account['id'])
        if holdings:
            try:
                composition = compute_portfolio_composition(holdings)
                account_data = {
                    'account': account,
                    'holdings': composition.get('holdings', []),
                    'total_value_eur': composition.get('total_value_eur', 0)
                }
                total_value_eur += composition.get('total_value_eur', 0)
            except:
                account_data = {
                    'account': account,
                    'holdings': [],
                    'total_value_eur': 0
                }
        else:
            account_data = {
                'account': account,
                'holdings': [],
                'total_value_eur': 0
            }
        result.append(account_data)

    return jsonify({
        'accounts': result,
        'total_value_eur': total_value_eur
    })


@app.route('/api/admin/users/<int:user_id>/graph-downloads', methods=['GET'])
@admin_required
def get_user_graph_downloads(user_id):
    """Get a user's graph download history (admin only)."""
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT id, graph_type, downloaded_at
            FROM graph_downloads
            WHERE user_id = ?
            ORDER BY downloaded_at DESC
        ''', (user_id,))
        downloads = [dict(row) for row in cursor.fetchall()]

    return jsonify({'downloads': downloads})


# ============= INVESTING ROUTES =============

from investing_utils import (
    compute_portfolio_composition, compute_portfolio_performance_from_transactions,
    fetch_stock_price, get_previous_weekday, set_db_getter, get_news_feed_videos,
    get_stock_currency
)

# Initialize database getter for caching in investing_utils
set_db_getter(get_db)

@app.route('/api/investing/transactions', methods=['GET'])
@login_required
def get_transactions():
    """Get user's transaction history."""
    with get_db() as conn:
        cursor = conn.execute(
            '''SELECT pt.id, pt.stock_ticker, pt.transaction_type, pt.quantity,
                      pt.transaction_date, pt.price_per_share, pt.price_currency, pt.account_id,
                      ia.name as account_name, ia.account_type, ia.bank
               FROM portfolio_transactions pt
               LEFT JOIN investment_accounts ia ON pt.account_id = ia.id
               WHERE pt.user_id = ?
               ORDER BY pt.transaction_date DESC, pt.id DESC''',
            (request.user_id,)
        )
        rows = cursor.fetchall()

    transactions = [{
        'id': row['id'],
        'stock_ticker': row['stock_ticker'],
        'transaction_type': row['transaction_type'],
        'quantity': row['quantity'],
        'transaction_date': row['transaction_date'],
        'price_per_share': row['price_per_share'],
        'price_currency': row['price_currency'] or 'EUR',  # Default to EUR for legacy data
        'account_id': row['account_id'],
        'account_name': row['account_name'],
        'account_type': row['account_type'],
        'bank': row['bank'],
    } for row in rows]
    return jsonify({'transactions': transactions})


@app.route('/api/investing/transactions', methods=['POST'])
@login_required
def add_transaction():
    """Add a new transaction (BUY or SELL) with auto-fetched price."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    stock_ticker = data.get('stock_ticker', '').upper().strip()
    transaction_type = data.get('transaction_type', '').upper().strip()
    quantity = data.get('quantity')
    transaction_date = data.get('transaction_date')  # YYYY-MM-DD format
    account_id = data.get('account_id')  # Optional: link to investment account
    provided_price = data.get('price_per_share')  # Optional: price from import
    provided_currency = data.get('price_currency')  # Optional: currency of provided price

    if not stock_ticker:
        return jsonify({'error': 'Stock ticker required'}), 400
    if transaction_type not in ['BUY', 'SELL']:
        return jsonify({'error': 'Transaction type must be BUY or SELL'}), 400
    if quantity is None or not isinstance(quantity, (int, float)) or quantity <= 0:
        return jsonify({'error': 'Valid quantity required (must be > 0)'}), 400
    if not transaction_date:
        return jsonify({'error': 'Transaction date required (YYYY-MM-DD)'}), 400

    quantity = int(quantity)

    # Validate account_id if provided
    if account_id is not None:
        with get_db() as conn:
            cursor = conn.execute(
                'SELECT id FROM investment_accounts WHERE id = ? AND user_id = ?',
                (account_id, request.user_id)
            )
            if not cursor.fetchone():
                return jsonify({'error': 'Invalid account_id'}), 400

    # Validate date format
    try:
        datetime.strptime(transaction_date, "%Y-%m-%d")
    except ValueError:
        return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400

    # Adjust for weekends (markets closed)
    transaction_date = get_previous_weekday(transaction_date)

    # Use provided price if available, otherwise fetch from Yahoo Finance
    if provided_price is not None:
        price_per_share = float(provided_price)
        # Use provided currency or default to EUR (CM import is in EUR)
        price_currency = provided_currency or 'EUR'
    else:
        # Fetch historical price at transaction date
        try:
            price_per_share = fetch_stock_price(stock_ticker, transaction_date)
            # Convert numpy types to native Python types for PostgreSQL compatibility
            if price_per_share is not None:
                price_per_share = float(price_per_share)
            # Price from Yahoo is in stock's native currency
            price_currency = get_stock_currency(stock_ticker)
        except Exception as e:
            return jsonify({'error': f'Could not fetch price for {stock_ticker} on {transaction_date}: {str(e)}'}), 400

    try:
        with get_db() as conn:
            cursor = conn.execute('''
                INSERT INTO portfolio_transactions (user_id, account_id, stock_ticker, transaction_type, quantity, transaction_date, price_per_share, price_currency)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
            ''', (request.user_id, account_id, stock_ticker, transaction_type, quantity, transaction_date, price_per_share, price_currency))
            transaction_id = cursor.fetchone()['id']
    except Exception as e:
        print(f"[Transaction Error] {stock_ticker}: {str(e)}")
        return jsonify({'error': f'Database error: {str(e)}'}), 500

    return jsonify({
        'success': True,
        'id': transaction_id,
        'account_id': account_id,
        'stock_ticker': stock_ticker,
        'transaction_type': transaction_type,
        'quantity': quantity,
        'transaction_date': transaction_date,
        'price_per_share': price_per_share,
        'price_currency': price_currency
    })


@app.route('/api/investing/transactions/bulk', methods=['POST'])
@login_required
def bulk_add_transactions():
    """Bulk add transactions (for initial setup). Fetches historical prices for each."""
    data = request.get_json()
    if not data or 'transactions' not in data:
        return jsonify({'error': 'Transactions array required'}), 400

    transactions = data['transactions']
    if not isinstance(transactions, list):
        return jsonify({'error': 'Transactions must be an array'}), 400

    processed = []
    errors = []

    for t in transactions:
        stock_ticker = t.get('stock_ticker', '').upper().strip()
        transaction_type = t.get('transaction_type', 'BUY').upper().strip()
        quantity = t.get('quantity', 0)
        transaction_date = t.get('transaction_date')

        if not stock_ticker or quantity <= 0 or not transaction_date:
            continue
        if transaction_type not in ['BUY', 'SELL']:
            transaction_type = 'BUY'

        try:
            adjusted_date = get_previous_weekday(transaction_date)
            price_per_share = fetch_stock_price(stock_ticker, adjusted_date)
            # Convert numpy types to native Python types for PostgreSQL compatibility
            if price_per_share is not None:
                price_per_share = float(price_per_share)
            processed.append({
                'stock_ticker': stock_ticker,
                'transaction_type': transaction_type,
                'quantity': int(quantity),
                'transaction_date': adjusted_date,
                'price_per_share': price_per_share
            })
        except Exception as e:
            errors.append(f'{stock_ticker}: {str(e)}')

    if not processed:
        return jsonify({'error': 'No valid transactions to save', 'details': errors}), 400

    with get_db() as conn:
        # Clear existing transactions
        conn.execute('DELETE FROM portfolio_transactions WHERE user_id = ?', (request.user_id,))

        # Insert new transactions
        for t in processed:
            conn.execute('''
                INSERT INTO portfolio_transactions (user_id, stock_ticker, transaction_type, quantity, transaction_date, price_per_share)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (request.user_id, t['stock_ticker'], t['transaction_type'], t['quantity'], t['transaction_date'], t['price_per_share']))

    return jsonify({
        'success': True,
        'count': len(processed),
        'transactions': processed,
        'errors': errors if errors else None
    })


def _parse_revolut_pdf_with_gemini(pdf_bytes):
    """Parse Revolut PDF using Gemini Vision for high accuracy. Returns (transactions, errors)."""
    import google.generativeai as genai
    from pdf2image import convert_from_bytes
    import json

    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        return None, ['GEMINI_API_KEY not configured']

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-3-flash-preview')

        # Convert PDF pages to images
        images = convert_from_bytes(pdf_bytes, dpi=150)

        prompt = """Extract ALL stock transactions from this Revolut account statement.
Be thorough - check every row carefully, including the LAST row of each table.

Return ONLY a valid JSON array with this exact format:
[{"ticker": "AAPL", "type": "BUY", "quantity": 10, "date": "2024-03-15"}, ...]

Rules:
- Include ONLY stock trades (Buy/Sell market orders), NOT dividends, fees, cash top-ups, or custody fees
- ticker: The stock symbol (e.g., "AAPL", "META", "GOOGL")
- type: "BUY" or "SELL" only
- quantity: Number of shares (integer)
- date: Format YYYY-MM-DD
- If there are no transactions, return an empty array: []

Return ONLY the JSON array, no other text."""

        # Send all pages to Gemini
        response = model.generate_content([prompt] + images)

        # Parse JSON response
        response_text = response.text.strip()
        # Remove markdown code blocks if present
        if response_text.startswith('```'):
            response_text = response_text.split('\n', 1)[1]
            if response_text.endswith('```'):
                response_text = response_text.rsplit('```', 1)[0]
            response_text = response_text.strip()

        transactions_raw = json.loads(response_text)

        # Normalize to our format
        transactions = []
        for tx in transactions_raw:
            transactions.append({
                'stock_ticker': tx['ticker'].upper(),
                'transaction_type': tx['type'].upper(),
                'quantity': int(tx['quantity']),
                'transaction_date': tx['date'],
                'price_per_share': None,  # Will be fetched later
            })

        return transactions, []

    except Exception as e:
        return None, [f'Gemini parsing failed: {str(e)}']


def _parse_revolut_pdf_bytes(pdf_bytes):
    """Helper function to parse Revolut PDF bytes. Returns (transactions, errors).
    Uses Gemini Vision if available, falls back to pdfplumber."""

    # Try Gemini first for better accuracy
    transactions, errors = _parse_revolut_pdf_with_gemini(pdf_bytes)
    if transactions is not None:
        return transactions, errors

    # Fallback to pdfplumber
    print(f"[Revolut Import] Gemini unavailable ({errors}), falling back to pdfplumber")
    import pdfplumber
    import io
    import re

    pdf_file = io.BytesIO(pdf_bytes)
    transactions = []
    errors = []

    with pdfplumber.open(pdf_file) as pdf:
        for page_num, page in enumerate(pdf.pages):
            tables = page.extract_tables()

            for table in tables:
                if not table or len(table) < 2:
                    continue

                # Find header row
                header = None
                header_idx = 0
                for i, row in enumerate(table):
                    row_lower = [str(cell).lower() if cell else '' for cell in row]
                    # Look for Revolut trading statement headers
                    if any('date' in cell for cell in row_lower) and \
                       any('symbol' in cell or 'ticker' in cell or 'instrument' in cell for cell in row_lower):
                        header = row_lower
                        header_idx = i
                        break

                if not header:
                    continue

                # Map column indices
                date_col = next((i for i, h in enumerate(header) if 'date' in h and 'settle' not in h), None)
                ticker_col = next((i for i, h in enumerate(header) if 'symbol' in h or 'ticker' in h), None)
                instrument_col = next((i for i, h in enumerate(header) if 'instrument' in h or 'name' in h), None)
                type_col = next((i for i, h in enumerate(header) if h == 'type' or 'activity' in h), None)
                side_col = next((i for i, h in enumerate(header) if 'side' in h), None)
                qty_col = next((i for i, h in enumerate(header) if 'quantity' in h or 'qty' in h or 'shares' in h), None)
                price_col = next((i for i, h in enumerate(header) if 'price' in h and 'total' not in h), None)

                # Process data rows
                for row in table[header_idx + 1:]:
                    if not row or all(not cell for cell in row):
                        continue

                    try:
                        # Extract date
                        date_str = row[date_col] if date_col is not None and date_col < len(row) else None
                        if not date_str:
                            continue

                        # Parse date (Revolut uses various formats)
                        parsed_date = None
                        date_str = str(date_str).strip()

                        # Try formats with time first (e.g., "17 Nov 2022 19:00:16 GMT")
                        for fmt in ['%d %b %Y %H:%M:%S GMT', '%d %b %Y %H:%M:%S', '%d %B %Y %H:%M:%S GMT', '%d %B %Y %H:%M:%S']:
                            try:
                                parsed_date = datetime.strptime(date_str, fmt).strftime('%Y-%m-%d')
                                break
                            except:
                                pass

                        # Try date-only formats
                        if not parsed_date:
                            for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%m/%d/%Y', '%d %b %Y', '%d %B %Y']:
                                try:
                                    parsed_date = datetime.strptime(date_str, fmt).strftime('%Y-%m-%d')
                                    break
                                except:
                                    pass

                        if not parsed_date:
                            # Try to extract date with regex
                            date_match = re.search(r'(\d{4})-(\d{2})-(\d{2})', date_str)
                            if date_match:
                                parsed_date = date_match.group(0)
                            else:
                                # Try "DD Mon YYYY" pattern from longer string
                                date_match = re.search(r'(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})', date_str)
                                if date_match:
                                    try:
                                        parsed_date = datetime.strptime(f"{date_match.group(1)} {date_match.group(2)} {date_match.group(3)}", '%d %b %Y').strftime('%Y-%m-%d')
                                    except:
                                        pass

                        if not parsed_date:
                            continue

                        # Extract ticker
                        ticker = None
                        if ticker_col is not None and ticker_col < len(row) and row[ticker_col]:
                            ticker_cell = str(row[ticker_col]).strip().upper()
                            # Handle merged columns - extract first word if it looks like a ticker
                            # Ticker should be 1-5 uppercase letters
                            ticker_match = re.match(r'^([A-Z]{1,5})\b', ticker_cell)
                            if ticker_match:
                                ticker = ticker_match.group(1)
                            else:
                                # Also try to find ticker anywhere in the cell
                                ticker_search = re.search(r'\b([A-Z]{1,5})\b', ticker_cell)
                                if ticker_search:
                                    ticker = ticker_search.group(1)

                        if not ticker and instrument_col is not None and instrument_col < len(row) and row[instrument_col]:
                            # Try to extract ticker from instrument name
                            inst = str(row[instrument_col]).strip()
                            # Common pattern: "AAPL - Apple Inc" or "Apple Inc (AAPL)"
                            ticker_match = re.search(r'\b([A-Z]{1,5})\b', inst)
                            if ticker_match:
                                ticker = ticker_match.group(1)

                        if not ticker:
                            continue

                        # Skip non-trade rows (Cash top-up, Custody fee, Dividend, etc.)
                        if type_col is not None and type_col < len(row) and row[type_col]:
                            type_str = str(row[type_col]).strip().upper()
                            if 'TRADE' not in type_str and 'MARKET' not in type_str and 'LIMIT' not in type_str:
                                # Check if it's a non-trade transaction
                                if any(skip in type_str for skip in ['CASH', 'FEE', 'DIVIDEND', 'TRANSFER', 'TOP-UP', 'TOP UP', 'CUSTODY']):
                                    continue

                        # Extract transaction type (Buy/Sell) - prefer Side column
                        tx_type = 'BUY'
                        if side_col is not None and side_col < len(row) and row[side_col]:
                            side_str = str(row[side_col]).strip().upper()
                            if 'SELL' in side_str or 'SOLD' in side_str:
                                tx_type = 'SELL'
                            elif 'BUY' in side_str or 'BOUGHT' in side_str:
                                tx_type = 'BUY'
                        elif type_col is not None and type_col < len(row) and row[type_col]:
                            # Fallback to type column if no side column
                            type_str = str(row[type_col]).strip().upper()
                            if 'SELL' in type_str or 'SOLD' in type_str:
                                tx_type = 'SELL'

                        # Extract quantity
                        qty = None
                        if qty_col is not None and qty_col < len(row) and row[qty_col]:
                            qty_str = str(row[qty_col]).replace(',', '.').strip()
                            qty_match = re.search(r'[\d.]+', qty_str)
                            if qty_match:
                                qty = float(qty_match.group())

                        if not qty or qty <= 0:
                            continue

                        # Extract price (optional - will be fetched if not provided)
                        price = None
                        if price_col is not None and price_col < len(row) and row[price_col]:
                            price_str = str(row[price_col]).replace(',', '.').replace('$', '').replace('€', '').strip()
                            price_match = re.search(r'[\d.]+', price_str)
                            if price_match:
                                price = float(price_match.group())

                        transactions.append({
                            'stock_ticker': ticker,
                            'transaction_type': tx_type,
                            'quantity': int(qty) if qty == int(qty) else qty,
                            'transaction_date': parsed_date,
                            'price_per_share': price,
                        })

                    except Exception as e:
                        errors.append(f"Row parse error: {str(e)}")

    # If table extraction failed, try text-based extraction
    if not transactions:
        pdf_file.seek(0)
        with pdfplumber.open(pdf_file) as pdf:
            full_text = ""
            for page in pdf.pages:
                full_text += page.extract_text() or ""

            # Pattern: date followed by ticker, Trade - Market, quantity, price, Buy/Sell
            # Example: "17 Nov 2022 19:00:16 GMT META Trade - Market 2 US$112.12 Buy US$224.24"
            pattern = r'(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\s+\d{2}:\d{2}:\d{2}\s+GMT\s+([A-Z]{1,5})\s+Trade\s*-\s*Market\s+(\d+(?:\.\d+)?)\s+US\$[\d.]+\s+(Buy|Sell)'

            for match in re.finditer(pattern, full_text):
                try:
                    date_part = match.group(1)  # "17 Nov 2022"
                    ticker = match.group(2)     # "META"
                    qty = float(match.group(3)) # "2"
                    side = match.group(4)       # "Buy" or "Sell"

                    # Parse date
                    parsed_date = datetime.strptime(date_part, '%d %b %Y').strftime('%Y-%m-%d')
                    tx_type = 'BUY' if side.upper() == 'BUY' else 'SELL'

                    transactions.append({
                        'stock_ticker': ticker,
                        'transaction_type': tx_type,
                        'quantity': int(qty) if qty == int(qty) else qty,
                        'transaction_date': parsed_date,
                        'price_per_share': None,
                    })
                except Exception as e:
                    errors.append(f"Text parse error: {str(e)}")

    # Deduplicate transactions (same ticker, date, type, qty)
    seen = set()
    unique_transactions = []
    for tx in transactions:
        key = (tx['stock_ticker'], tx['transaction_date'], tx['transaction_type'], tx['quantity'])
        if key not in seen:
            seen.add(key)
            unique_transactions.append(tx)

    return unique_transactions, errors


def _cleanup_expired_tokens():
    """Remove tokens older than 5 minutes."""
    now = datetime.now()
    expired = [t for t, data in _upload_tokens.items()
               if now - data['created_at'] > timedelta(minutes=5)]
    for t in expired:
        del _upload_tokens[t]


@app.route('/api/investing/import/revolut', methods=['POST'])
@login_required
def parse_revolut_pdf():
    """Parse a Revolut trading statement PDF and return extracted transactions."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'File must be a PDF'}), 400

    try:
        pdf_bytes = file.read()
        transactions, errors = _parse_revolut_pdf_bytes(pdf_bytes)

        return jsonify({
            'success': True,
            'transactions': transactions,
            'count': len(transactions),
            'warnings': errors if errors else None
        })

    except Exception as e:
        return jsonify({'error': f'Failed to parse PDF: {str(e)}'}), 400


def _map_stock_names_to_tickers_with_gemini(stock_names: list[str]) -> dict[str, str]:
    """Use Gemini to map French stock names to tickers."""
    import google.generativeai as genai
    import json

    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        # Fallback: return names as-is
        return {name: name for name in stock_names}

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.0-flash')

        prompt = f"""Map these French stock names to their stock tickers. Return ONLY a JSON object mapping each name to its ticker.

Stock names:
{json.dumps(stock_names, ensure_ascii=False)}

Common mappings:
- "META PLATFORMS CLA" or "META PLATFORMS" → "META"
- "ALPHABET CL.A" or "ALPHABET" → "GOOGL"
- "NVIDIA" → "NVDA"
- "MICROSOFT" → "MSFT"
- "VISA CL.A" or "VISA" → "V"
- "LVMH MOET HENNESSY VUITTON" → "MC.PA"
- "NU HOLDINGS LIMITED" → "NU"

Return JSON like: {{"META PLATFORMS CLA": "META", "NVIDIA": "NVDA"}}
Only return the JSON object, no other text."""

        response = model.generate_content(prompt)
        text = response.text.strip()

        # Extract JSON from response
        if text.startswith('```'):
            text = text.split('```')[1]
            if text.startswith('json'):
                text = text[4:]
            text = text.strip()

        mapping = json.loads(text)
        return mapping

    except Exception as e:
        print(f"[Gemini mapping error] {e}")
        # Fallback: return names as-is
        return {name: name for name in stock_names}


def _parse_credit_mutuel_excel(file_bytes: bytes) -> tuple[list[dict], list[str]]:
    """Parse Crédit Mutuel Excel export and return transactions."""
    import openpyxl
    from io import BytesIO
    from datetime import datetime

    transactions = []
    errors = []

    try:
        wb = openpyxl.load_workbook(BytesIO(file_bytes), data_only=True)
        ws = wb.active

        # Find header row
        header_row = None
        headers = {}
        for row_idx, row in enumerate(ws.iter_rows(min_row=1, max_row=10), start=1):
            row_values = [cell.value for cell in row]
            if 'Exécution' in row_values or 'Opération' in row_values:
                header_row = row_idx
                for col_idx, cell in enumerate(row):
                    if cell.value:
                        headers[cell.value] = col_idx
                break

        if not header_row:
            return [], ['Could not find header row in Excel file']

        # Extract data rows
        raw_transactions = []
        stock_names_set = set()

        for row in ws.iter_rows(min_row=header_row + 1):
            row_values = [cell.value for cell in row]

            # Get operation type
            op_col = headers.get('Opération', headers.get('Operation', -1))
            operation = row_values[op_col] if op_col >= 0 and op_col < len(row_values) else None

            if not operation:
                continue

            # Only process Achat (buy) and Vente (sell)
            operation_lower = str(operation).lower()
            if 'achat' in operation_lower:
                tx_type = 'BUY'
            elif 'vente' in operation_lower:
                tx_type = 'SELL'
            else:
                # Skip dividends and other operations
                continue

            # Get date
            date_col = headers.get('Exécution', headers.get('Execution', -1))
            date_val = row_values[date_col] if date_col >= 0 and date_col < len(row_values) else None

            if isinstance(date_val, datetime):
                date_str = date_val.strftime('%Y-%m-%d')
            elif date_val:
                # Try to parse DD/MM/YYYY format
                try:
                    date_str = datetime.strptime(str(date_val), '%d/%m/%Y').strftime('%Y-%m-%d')
                except:
                    try:
                        date_str = datetime.strptime(str(date_val), '%Y-%m-%d').strftime('%Y-%m-%d')
                    except:
                        errors.append(f"Could not parse date: {date_val}")
                        continue
            else:
                continue

            # Get quantity
            qty_col = headers.get('Quantité / Montant nominal', headers.get('Quantité', -1))
            quantity = row_values[qty_col] if qty_col >= 0 and qty_col < len(row_values) else None

            if quantity is None:
                continue

            try:
                quantity = int(float(str(quantity).replace(',', '.').replace(' ', '')))
            except:
                errors.append(f"Could not parse quantity: {quantity}")
                continue

            # Get stock name
            stock_col = headers.get('Valeur', -1)
            stock_name = row_values[stock_col] if stock_col >= 0 and stock_col < len(row_values) else None

            if not stock_name:
                continue

            stock_name = str(stock_name).strip()

            # Skip OAT (French government bonds) - pattern like "OAT 8,50%92-25042023"
            if re.match(r'^OAT.*%', stock_name, re.IGNORECASE):
                continue

            stock_names_set.add(stock_name)

            # Get net amount (Montant net) to calculate price per share
            montant_col = headers.get('Montant net', headers.get('Montant Net', -1))
            montant_net = row_values[montant_col] if montant_col >= 0 and montant_col < len(row_values) else None

            price_per_share = None
            if montant_net is not None and quantity > 0:
                try:
                    montant_value = float(str(montant_net).replace(',', '.').replace(' ', '').replace('€', ''))
                    # Montant net is negative for buys, positive for sells - take absolute value
                    price_per_share = round(abs(montant_value) / quantity, 4)
                except:
                    pass  # Will be None, backend will fetch from Yahoo

            raw_transactions.append({
                'date': date_str,
                'type': tx_type,
                'quantity': quantity,
                'stock_name': stock_name,
                'price_per_share': price_per_share
            })

        # Map stock names to tickers using Gemini
        if stock_names_set:
            name_to_ticker = _map_stock_names_to_tickers_with_gemini(list(stock_names_set))
        else:
            name_to_ticker = {}

        # Build final transactions
        for raw_tx in raw_transactions:
            ticker = name_to_ticker.get(raw_tx['stock_name'], raw_tx['stock_name'])
            transactions.append({
                'stock_ticker': ticker,
                'transaction_type': raw_tx['type'],
                'quantity': raw_tx['quantity'],
                'transaction_date': raw_tx['date'],
                'price_per_share': raw_tx['price_per_share']  # Calculated from Montant net
            })

        return transactions, errors

    except Exception as e:
        return [], [f'Error parsing Excel: {str(e)}']


@app.route('/api/investing/import/credit-mutuel', methods=['POST'])
@login_required
def parse_credit_mutuel_excel():
    """Parse a Crédit Mutuel Excel export and return extracted transactions."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if not file.filename.lower().endswith('.xlsx'):
        return jsonify({'error': 'File must be an Excel file (.xlsx)'}), 400

    try:
        file_bytes = file.read()
        transactions, errors = _parse_credit_mutuel_excel(file_bytes)

        return jsonify({
            'success': True,
            'transactions': transactions,
            'count': len(transactions),
            'warnings': errors if errors else None
        })

    except Exception as e:
        return jsonify({'error': f'Failed to parse Excel: {str(e)}'}), 400


@app.route('/api/investing/import/create-token', methods=['POST'])
@login_required
def create_upload_token():
    """Create a temporary token for mobile PDF upload."""
    _cleanup_expired_tokens()

    # Get user email for PostHog tracking on mobile
    with get_db() as conn:
        user = conn.execute('SELECT email FROM users WHERE id = ?', (request.user_id,)).fetchone()
        user_email = user['email'] if user else None

    token = secrets.token_urlsafe(32)
    _upload_tokens[token] = {
        'user_id': request.user_id,
        'user_email': user_email,
        'created_at': datetime.now(),
        'transactions': None,
        'status': 'pending'  # pending, uploaded, error
    }

    return jsonify({'token': token})


@app.route('/api/investing/import/token-info/<token>', methods=['GET'])
def get_token_info(token):
    """Get user info for a token (for PostHog identification on mobile upload page)."""
    _cleanup_expired_tokens()

    if token not in _upload_tokens:
        return jsonify({'error': 'Invalid or expired token'}), 400

    token_data = _upload_tokens[token]
    return jsonify({'email': token_data.get('user_email')})


@app.route('/api/investing/import/upload/<token>', methods=['POST'])
def upload_with_token(token):
    """Upload PDF using a token (no auth required - token is the auth)."""
    _cleanup_expired_tokens()

    if token not in _upload_tokens:
        return jsonify({'error': 'Invalid or expired token'}), 400

    token_data = _upload_tokens[token]

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'File must be a PDF'}), 400

    try:
        pdf_bytes = file.read()
        transactions, errors = _parse_revolut_pdf_bytes(pdf_bytes)

        token_data['transactions'] = transactions
        token_data['warnings'] = errors if errors else None
        token_data['status'] = 'uploaded'
        token_data['count'] = len(transactions)

        return jsonify({
            'success': True,
            'count': len(transactions)
        })

    except Exception as e:
        token_data['status'] = 'error'
        token_data['error'] = str(e)
        return jsonify({'error': f'Failed to parse PDF: {str(e)}'}), 400


@app.route('/api/investing/import/status/<token>', methods=['GET'])
@login_required
def check_upload_status(token):
    """Check the status of a mobile upload."""
    _cleanup_expired_tokens()

    if token not in _upload_tokens:
        return jsonify({'error': 'Invalid or expired token'}), 400

    token_data = _upload_tokens[token]

    # Verify the token belongs to this user
    if token_data['user_id'] != request.user_id:
        return jsonify({'error': 'Invalid token'}), 403

    if token_data['status'] == 'pending':
        return jsonify({'status': 'pending'})
    elif token_data['status'] == 'error':
        return jsonify({'status': 'error', 'error': token_data.get('error')})
    else:
        return jsonify({
            'status': 'uploaded',
            'transactions': token_data['transactions'],
            'count': token_data['count'],
            'warnings': token_data.get('warnings')
        })


@app.route('/api/investing/transactions/<int:transaction_id>', methods=['DELETE'])
@login_required
def delete_transaction(transaction_id):
    """Delete a transaction by ID."""
    with get_db() as conn:
        conn.execute(
            'DELETE FROM portfolio_transactions WHERE user_id = ? AND id = ?',
            (request.user_id, transaction_id)
        )
    return jsonify({'success': True, 'id': transaction_id})


@app.route('/api/investing/fx-rates', methods=['POST'])
@login_required
def get_fx_rates():
    """Get historical EUR/USD FX rates for a list of dates."""
    from investing_utils import fetch_eurusd_rate
    data = request.get_json()
    if not data or 'dates' not in data:
        return jsonify({'error': 'dates array required'}), 400

    dates = data['dates']
    rates = {}
    for date_str in dates:
        try:
            rates[date_str] = fetch_eurusd_rate(date_str)
        except Exception:
            rates[date_str] = 1.0  # Fallback
    return jsonify({'rates': rates})


@app.route('/api/investing/holdings', methods=['GET'])
@login_required
def get_holdings():
    """Get computed current holdings from transaction history."""
    with get_db() as conn:
        cursor = conn.execute(
            '''SELECT stock_ticker, transaction_type, quantity, transaction_date, price_per_share
               FROM portfolio_transactions WHERE user_id = ?
               ORDER BY transaction_date ASC, id ASC''',
            (request.user_id,)
        )
        rows = cursor.fetchall()

    # Compute holdings using FIFO for cost basis
    holdings_map = {}  # ticker -> { quantity, lots: [{qty, price, date}] }

    for row in rows:
        ticker = row['stock_ticker']
        qty = row['quantity']
        price = row['price_per_share']
        date = row['transaction_date']
        tx_type = row['transaction_type']

        if ticker not in holdings_map:
            holdings_map[ticker] = {'quantity': 0, 'lots': []}

        if tx_type == 'BUY':
            holdings_map[ticker]['quantity'] += qty
            holdings_map[ticker]['lots'].append({'qty': qty, 'price': price, 'date': date})
        elif tx_type == 'SELL':
            holdings_map[ticker]['quantity'] -= qty
            # FIFO: remove from oldest lots first
            remaining_sell = qty
            while remaining_sell > 0 and holdings_map[ticker]['lots']:
                lot = holdings_map[ticker]['lots'][0]
                if lot['qty'] <= remaining_sell:
                    remaining_sell -= lot['qty']
                    holdings_map[ticker]['lots'].pop(0)
                else:
                    lot['qty'] -= remaining_sell
                    remaining_sell = 0

    # Build response with cost basis
    holdings = []
    for ticker, data in holdings_map.items():
        if data['quantity'] > 0:
            # Calculate weighted average cost basis from remaining lots
            total_cost = sum(lot['qty'] * lot['price'] for lot in data['lots'])
            total_qty = sum(lot['qty'] for lot in data['lots'])
            avg_cost = total_cost / total_qty if total_qty > 0 else 0

            holdings.append({
                'stock_ticker': ticker,
                'quantity': data['quantity'],
                'cost_basis': round(avg_cost, 2)
            })

    return jsonify({'holdings': holdings})


def compute_holdings_from_transactions(user_id, account_ids=None):
    """Helper to compute current holdings from transactions using FIFO.
    Tracks both USD and EUR cost basis (EUR uses historical rates at transaction time).
    Optionally filters by account_ids (list of account IDs).
    """
    from investing_utils import fetch_eurusd_rate

    with get_db() as conn:
        if account_ids and len(account_ids) > 0:
            placeholders = ','.join('?' for _ in account_ids)
            cursor = conn.execute(
                f'''SELECT stock_ticker, transaction_type, quantity, transaction_date, price_per_share
                   FROM portfolio_transactions WHERE user_id = ? AND account_id IN ({placeholders})
                   ORDER BY transaction_date ASC, id ASC''',
                (user_id, *account_ids)
            )
        else:
            cursor = conn.execute(
                '''SELECT stock_ticker, transaction_type, quantity, transaction_date, price_per_share
                   FROM portfolio_transactions WHERE user_id = ?
                   ORDER BY transaction_date ASC, id ASC''',
                (user_id,)
            )
        rows = cursor.fetchall()

    holdings_map = {}

    for row in rows:
        ticker = row['stock_ticker']
        qty = row['quantity']
        price = row['price_per_share']
        date = row['transaction_date']
        tx_type = row['transaction_type']

        if ticker not in holdings_map:
            holdings_map[ticker] = {'quantity': 0, 'lots': []}

        if tx_type == 'BUY':
            # Fetch historical EUR/USD rate for this transaction
            try:
                eurusd_at_tx = fetch_eurusd_rate(date)
            except:
                eurusd_at_tx = 1.0
            cost_usd = qty * price
            cost_eur = cost_usd / eurusd_at_tx

            holdings_map[ticker]['quantity'] += qty
            holdings_map[ticker]['lots'].append({
                'qty': qty,
                'price': price,
                'date': date,
                'cost_eur': cost_eur
            })
        elif tx_type == 'SELL':
            holdings_map[ticker]['quantity'] -= qty
            remaining_sell = qty
            while remaining_sell > 0 and holdings_map[ticker]['lots']:
                lot = holdings_map[ticker]['lots'][0]
                if lot['qty'] <= remaining_sell:
                    remaining_sell -= lot['qty']
                    holdings_map[ticker]['lots'].pop(0)
                else:
                    # Reduce lot proportionally (including EUR cost)
                    sell_fraction = remaining_sell / lot['qty']
                    lot['cost_eur'] *= (1 - sell_fraction)
                    lot['qty'] -= remaining_sell
                    remaining_sell = 0

    holdings = []
    for ticker, data in holdings_map.items():
        if data['quantity'] > 0:
            total_cost_usd = sum(lot['qty'] * lot['price'] for lot in data['lots'])
            total_cost_eur = sum(lot['cost_eur'] for lot in data['lots'])
            total_qty = sum(lot['qty'] for lot in data['lots'])
            avg_cost = total_cost_usd / total_qty if total_qty > 0 else 0

            holdings.append({
                'stock_ticker': ticker,
                'quantity': data['quantity'],
                'cost_basis': round(avg_cost, 2),
                'total_cost': round(total_cost_usd, 2),
                'total_cost_eur': round(total_cost_eur, 2)
            })

    return holdings


def compute_realized_gains(user_id, account_ids=None):
    """Calculate realized gains using FIFO with historical EUR rates.
    Returns both USD and EUR realized gains.
    Optionally filters by account_ids (list of account IDs).
    """
    from investing_utils import fetch_eurusd_rate

    with get_db() as conn:
        if account_ids and len(account_ids) > 0:
            placeholders = ','.join('?' for _ in account_ids)
            cursor = conn.execute(
                f'''SELECT stock_ticker, transaction_type, quantity, transaction_date, price_per_share
                   FROM portfolio_transactions WHERE user_id = ? AND account_id IN ({placeholders})
                   ORDER BY transaction_date ASC, id ASC''',
                (user_id, *account_ids)
            )
        else:
            cursor = conn.execute(
                '''SELECT stock_ticker, transaction_type, quantity, transaction_date, price_per_share
                   FROM portfolio_transactions WHERE user_id = ?
                   ORDER BY transaction_date ASC, id ASC''',
                (user_id,)
            )
        rows = cursor.fetchall()

    # Track inventory per ticker: array of { qty, cost_usd, cost_eur }
    inventory = {}
    total_realized_gain_usd = 0
    total_realized_gain_eur = 0
    total_sold_cost_basis_eur = 0
    sell_count = 0

    for row in rows:
        ticker = row['stock_ticker']
        qty = row['quantity']
        price = row['price_per_share']
        date = row['transaction_date']
        tx_type = row['transaction_type']

        if ticker not in inventory:
            inventory[ticker] = []

        if tx_type == 'BUY':
            # Get historical EUR/USD rate
            try:
                eurusd_at_tx = fetch_eurusd_rate(date)
            except:
                eurusd_at_tx = 1.0
            cost_usd = qty * price
            cost_eur = cost_usd / eurusd_at_tx

            inventory[ticker].append({
                'qty': qty,
                'cost_usd_per_share': price,
                'cost_eur': cost_eur
            })
        else:  # SELL
            # Get EUR/USD rate at sell time
            try:
                eurusd_at_sell = fetch_eurusd_rate(date)
            except:
                eurusd_at_sell = 1.0

            remaining_sell = qty
            sale_price_usd = price
            sale_proceeds_eur = (qty * sale_price_usd) / eurusd_at_sell
            sell_count += 1

            # FIFO: consume oldest lots first
            cost_basis_usd = 0
            cost_basis_eur = 0
            while remaining_sell > 0 and inventory[ticker]:
                lot = inventory[ticker][0]
                sell_from_lot = min(remaining_sell, lot['qty'])

                # Calculate cost basis for this portion
                portion_cost_usd = sell_from_lot * lot['cost_usd_per_share']
                portion_cost_eur = (sell_from_lot / lot['qty']) * lot['cost_eur']

                cost_basis_usd += portion_cost_usd
                cost_basis_eur += portion_cost_eur

                lot['qty'] -= sell_from_lot
                lot['cost_eur'] -= portion_cost_eur
                remaining_sell -= sell_from_lot

                if lot['qty'] <= 0:
                    inventory[ticker].pop(0)

            # Calculate gains
            gain_usd = (qty * sale_price_usd) - cost_basis_usd
            gain_eur = sale_proceeds_eur - cost_basis_eur

            total_realized_gain_usd += gain_usd
            total_realized_gain_eur += gain_eur
            total_sold_cost_basis_eur += cost_basis_eur

    return {
        'total_usd': round(total_realized_gain_usd, 2),
        'total_eur': round(total_realized_gain_eur, 2),
        'sold_cost_basis_eur': round(total_sold_cost_basis_eur, 2),
        'count': sell_count
    }


@app.route('/api/investing/portfolio/composition', methods=['GET'])
@login_required
def get_portfolio_composition():
    """Get portfolio composition with current values, weights, cost basis and gains."""
    # Support both single account_id and comma-separated account_ids
    account_ids_str = request.args.get('account_ids')
    if account_ids_str:
        account_ids = [int(x) for x in account_ids_str.split(',') if x.strip()]
    else:
        account_id = request.args.get('account_id', type=int)
        account_ids = [account_id] if account_id else None

    holdings = compute_holdings_from_transactions(request.user_id, account_ids)

    if not holdings:
        return jsonify({
            'holdings': [],
            'total_value_usd': 0,
            'total_value_eur': 0,
            'total_cost_basis': 0,
            'total_cost_basis_eur': 0,
            'total_gain_usd': 0,
            'total_gain_pct': 0,
            'realized_gains_usd': 0,
            'realized_gains_eur': 0,
            'sold_cost_basis_eur': 0,
            'eurusd_rate': 1.0
        })

    try:
        composition = compute_portfolio_composition(holdings)
        # Add realized gains
        realized = compute_realized_gains(request.user_id, account_ids)
        composition['realized_gains_usd'] = realized['total_usd']
        composition['realized_gains_eur'] = realized['total_eur']
        composition['sold_cost_basis_eur'] = realized['sold_cost_basis_eur']
        return jsonify(composition)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/investing/portfolio/performance', methods=['GET'])
@login_required
def get_portfolio_performance():
    """Get portfolio performance vs benchmark, tracking actual holdings over time."""
    benchmark = request.args.get('benchmark', 'NASDAQ')
    currency = request.args.get('currency', 'EUR')

    # Support both single account_id and comma-separated account_ids
    account_ids_str = request.args.get('account_ids')
    if account_ids_str:
        account_ids = [int(x) for x in account_ids_str.split(',') if x.strip()]
    else:
        account_id = request.args.get('account_id', type=int)
        account_ids = [account_id] if account_id else None

    # Map benchmark name + currency to actual ticker
    benchmark_tickers = {
        'NASDAQ': {'USD': 'QQQ', 'EUR': 'EQQQ.DE'},
        'SP500': {'USD': 'SPY', 'EUR': 'CSPX.L'},
        # Legacy support
        'QQQ': {'USD': 'QQQ', 'EUR': 'EQQQ.DE'},
    }

    if benchmark not in benchmark_tickers:
        return jsonify({'error': f'Invalid benchmark. Use NASDAQ or SP500'}), 400

    if currency not in ['USD', 'EUR']:
        return jsonify({'error': 'Invalid currency. Use USD or EUR'}), 400

    benchmark_ticker = benchmark_tickers[benchmark].get(currency, 'QQQ')

    # Get all transactions (filtered by accounts if specified)
    with get_db() as conn:
        if account_ids and len(account_ids) > 0:
            placeholders = ','.join('?' for _ in account_ids)
            cursor = conn.execute(
                f'''SELECT stock_ticker, transaction_type, quantity, transaction_date, price_per_share
                   FROM portfolio_transactions WHERE user_id = ? AND account_id IN ({placeholders})
                   ORDER BY transaction_date ASC''',
                (request.user_id, *account_ids)
            )
        else:
            cursor = conn.execute(
                '''SELECT stock_ticker, transaction_type, quantity, transaction_date, price_per_share
                   FROM portfolio_transactions WHERE user_id = ?
                   ORDER BY transaction_date ASC''',
                (request.user_id,)
            )
        rows = cursor.fetchall()

    if not rows:
        return jsonify({'error': 'No transactions found', 'data': [], 'summary': None})

    transactions = [dict(row) for row in rows]

    try:
        performance = compute_portfolio_performance_from_transactions(transactions, benchmark_ticker=benchmark_ticker)
        return jsonify(performance)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/investing/watchlist', methods=['GET'])
@login_required
def get_watchlist():
    """Get user's watchlist."""
    with get_db() as conn:
        cursor = conn.execute(
            'SELECT stock_ticker FROM watchlist WHERE user_id = ? ORDER BY created_at ASC',
            (request.user_id,)
        )
        rows = cursor.fetchall()

    symbols = [row['stock_ticker'] for row in rows]
    return jsonify({'symbols': symbols})


@app.route('/api/investing/watchlist', methods=['POST'])
@login_required
def add_to_watchlist():
    """Add symbol to watchlist."""
    data = request.get_json()
    symbol = data.get('symbol') if data else None
    if not symbol:
        return jsonify({'error': 'Symbol required'}), 400

    symbol = symbol.upper().strip()
    with get_db() as conn:
        try:
            conn.execute(
                'INSERT INTO watchlist (user_id, stock_ticker) VALUES (?, ?)',
                (request.user_id, symbol)
            )
        except Exception:
            # Already exists, ignore
            pass

    return jsonify({'success': True, 'symbol': symbol})


@app.route('/api/investing/watchlist/<symbol>', methods=['DELETE'])
@login_required
def remove_from_watchlist(symbol):
    """Remove symbol from watchlist."""
    symbol = symbol.upper().strip()
    with get_db() as conn:
        conn.execute(
            'DELETE FROM watchlist WHERE user_id = ? AND stock_ticker = ?',
            (request.user_id, symbol)
        )
    return jsonify({'success': True, 'symbol': symbol})


@app.route('/api/investing/market-cap', methods=['GET'])
def get_market_cap():
    """Get market cap for one or more tickers."""
    import yfinance as yf
    from investing_utils import EUROPEAN_TICKER_MAP, get_stock_currency

    tickers_param = request.args.get('tickers', '')
    if not tickers_param:
        return jsonify({'error': 'No tickers provided'}), 400

    tickers = [t.strip().upper() for t in tickers_param.split(',') if t.strip()]
    if not tickers:
        return jsonify({'error': 'No valid tickers provided'}), 400

    results = {}
    for ticker in tickers:
        try:
            # Map European tickers to Yahoo Finance format
            yf_ticker = EUROPEAN_TICKER_MAP.get(ticker, ticker)
            stock = yf.Ticker(yf_ticker)
            info = stock.info
            market_cap = info.get('marketCap')
            name = info.get('shortName') or info.get('longName') or ticker
            # Get currency from Yahoo Finance, fallback to exchange-based detection
            currency = info.get('currency') or get_stock_currency(ticker)

            results[ticker] = {
                'ticker': ticker,
                'name': name,
                'market_cap': market_cap,
                'currency': currency,
                'trailing_pe': info.get('trailingPE'),
                'forward_pe': info.get('forwardPE'),
                'dividend_yield': info.get('dividendYield'),
                'beta': info.get('beta'),
                'price_to_book': info.get('priceToBook'),
                'trailing_eps': info.get('trailingEps'),
                'profit_margin': info.get('profitMargins'),
                'return_on_equity': info.get('returnOnEquity'),
                'fifty_two_week_high': info.get('fiftyTwoWeekHigh'),
                'fifty_two_week_low': info.get('fiftyTwoWeekLow'),
                'revenue_growth': info.get('revenueGrowth'),
            }
        except Exception as e:
            results[ticker] = {
                'ticker': ticker,
                'error': str(e)
            }

    return jsonify({'stocks': results})


@app.route('/api/investing/stock-history/<ticker>', methods=['GET'])
def get_stock_history(ticker):
    """Get historical price data for a stock."""
    import yfinance as yf
    from investing_utils import EUROPEAN_TICKER_MAP, get_stock_currency

    ticker = ticker.upper()
    # Map European tickers to Yahoo Finance format
    yf_ticker = EUROPEAN_TICKER_MAP.get(ticker, ticker)
    period = request.args.get('period', '1M')  # Default to 1 month

    # Map period to yfinance parameters
    period_config = {
        '1D': {'period': '1d', 'interval': '5m'},
        '5D': {'period': '5d', 'interval': '15m'},
        '1M': {'period': '1mo', 'interval': '1d'},
        '6M': {'period': '6mo', 'interval': '1d'},
        'YTD': {'period': 'ytd', 'interval': '1d'},
        '1Y': {'period': '1y', 'interval': '1d'},
        '5Y': {'period': '5y', 'interval': '1wk'},
        'MAX': {'period': 'max', 'interval': '1mo'},
    }

    config = period_config.get(period.upper(), period_config['1M'])

    try:
        stock = yf.Ticker(yf_ticker)
        hist = stock.history(period=config['period'], interval=config['interval'])

        if hist.empty:
            return jsonify({'error': 'No data available'}), 404

        # Get previous close and currency for reference
        info = stock.info
        previous_close = info.get('previousClose') or info.get('regularMarketPreviousClose')
        currency = info.get('currency') or get_stock_currency(ticker)

        # Format data for frontend
        data = []
        for timestamp, row in hist.iterrows():
            data.append({
                'timestamp': timestamp.isoformat(),
                'price': round(row['Close'], 2),
            })

        return jsonify({
            'ticker': ticker,
            'period': period.upper(),
            'previous_close': previous_close,
            'currency': currency,
            'data': data,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# =============================================================================
# Investment Accounts API (for fee tracking)
# =============================================================================

# French banks/brokers with their fee structures
BANKS = {
    'CREDIT_AGRICOLE': {
        'name': 'Crédit Agricole',
        'order_fee_pct': 1.30,  # variable selon caisse régionale
        'order_fee_min': 16,
        'custody_fee_pct_year': 0.30,  # + frais par ligne, variable selon caisse
        'custody_fee_pct_year_pea': 0.40,  # plafonné légalement + 5€/ligne
        'fx_fee_info_fr': '0.50% (min 20€)',
        'fx_fee_info_en': '0.50% (min €20)',
    },
    'BNP_PARIBAS': {
        'name': 'BNP Paribas',
        'order_fee_pct': 0.50,
        'order_fee_min': 5,
        'custody_fee_pct_year': 0.40,  # <50k, dégressif pour gros montants
        'custody_fee_pct_year_pea': 0.40,  # plafonné légalement
        'fx_fee_info_fr': '0.50% (min 15-25€)',
        'fx_fee_info_en': '0.50% (min €15-25)',
    },
    'SOCIETE_GENERALE': {
        'name': 'Société Générale',
        'order_fee_pct': 0.50,  # 0.50% ≤2k€, 0.45% 2-8k€, 0.35% >8k€
        'order_fee_min': 6,  # CTO uniquement, PEA pas de minimum
        'custody_fee_pct_year': 0.30,  # + 4.50€/ligne, dégressif selon montant
        'custody_fee_pct_year_pea': 0.40,  # plafonné légalement
        'account_fee_year': 17.50,  # offert si 1 achat/an
        'fx_fee_info_fr': '0.50% (min 16€ USA, 40€ autres)',
        'fx_fee_info_en': '0.50% (min €16 USA, €40 others)',
    },
    'CREDIT_MUTUEL': {
        'name': 'Crédit Mutuel',
        'order_fee_pct': 0.50,
        'order_fee_min': 5,
        'custody_fee_pct_year': 0.25,  # 0.125%/semestre
        'custody_fee_pct_year_pea': 0.40,  # plafonné légalement
        'fx_fee_info_fr': '0.50% (min 30€)',
        'fx_fee_info_en': '0.50% (min €30)',
    },
    'REVOLUT': {
        'name': 'Revolut',
        'order_fee_pct': 0,
        'order_fee_min': 0,  # Free trades (limited), then €1/trade for Standard
        'custody_fee_pct_year': 0,
        'custody_fee_pct_year_pea': None,  # No PEA available
        'fx_fee_info_fr': '0% (taux interbancaire)',
        'fx_fee_info_en': '0% (interbank rate)',
    },
    'FORTUNEO': {
        'name': 'Fortuneo',
        'order_fee_pct': 0.35,  # 0.35% for orders <2k€, then 0.20% for 2-10k€
        'order_fee_min': 1.95,  # Optimum plan
        'custody_fee_pct_year': 0,
        'custody_fee_pct_year_pea': 0,  # No custody fees on PEA
        'fx_fee_info_fr': '0.10%',
        'fx_fee_info_en': '0.10%',
    },
}

# Account types with tax implications
ACCOUNT_TYPES = {
    'CTO': {
        'name': 'CTO',
        'description_en': '30% flat tax on capital gains (PFU)',
        'description_fr': '30% d\'imposition forfaitaire sur les plus-values (PFU)',
        'tax_rate': 30.0
    },
    'PEA': {
        'name': 'PEA',
        'description_en': '17.2% social contributions only (after 5 years)',
        'description_fr': '17.2% de prélèvements sociaux uniquement (après 5 ans)',
        'tax_rate': 17.2
    },
}


@app.route('/api/investing/banks', methods=['GET'])
def get_banks():
    """Get list of available banks with their fee structures."""
    return jsonify({'banks': BANKS})


@app.route('/api/investing/account-types', methods=['GET'])
def get_account_types():
    """Get list of available account types with tax info."""
    return jsonify({'account_types': ACCOUNT_TYPES})


@app.route('/api/investing/accounts', methods=['GET'])
@login_required
def get_accounts():
    """Get user's investment accounts."""
    with get_db() as conn:
        cursor = conn.execute(
            '''SELECT id, name, account_type, bank, created_at
               FROM investment_accounts WHERE user_id = ?
               ORDER BY created_at ASC''',
            (request.user_id,)
        )
        rows = cursor.fetchall()

    accounts = [{
        'id': row['id'],
        'name': row['name'],
        'account_type': row['account_type'],
        'bank': row['bank'],
        'bank_info': BANKS.get(row['bank'], {}),
        'type_info': ACCOUNT_TYPES.get(row['account_type'], {}),
    } for row in rows]
    return jsonify({'accounts': accounts})


@app.route('/api/investing/accounts', methods=['POST'])
@login_required
def create_account():
    """Create a new investment account."""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    name = data.get('name', '').strip()
    account_type = data.get('account_type', '').upper().strip()
    bank = data.get('bank', '').upper().strip()

    if not name:
        return jsonify({'error': 'Account name required'}), 400
    if account_type not in ACCOUNT_TYPES:
        return jsonify({'error': f'Invalid account type. Valid: {list(ACCOUNT_TYPES.keys())}'}), 400
    if bank not in BANKS:
        return jsonify({'error': f'Invalid bank. Valid: {list(BANKS.keys())}'}), 400

    with get_db() as conn:
        cursor = conn.execute('''
            INSERT INTO investment_accounts (user_id, name, account_type, bank)
            VALUES (?, ?, ?, ?)
            RETURNING id
        ''', (request.user_id, name, account_type, bank))
        account_id = cursor.fetchone()['id']

    return jsonify({
        'success': True,
        'id': account_id,
        'name': name,
        'account_type': account_type,
        'bank': bank,
        'bank_info': BANKS[bank],
        'type_info': ACCOUNT_TYPES[account_type],
    })


@app.route('/api/investing/accounts/<int:account_id>', methods=['DELETE'])
@login_required
def delete_account(account_id):
    """Delete an investment account."""
    with get_db() as conn:
        conn.execute(
            'DELETE FROM investment_accounts WHERE user_id = ? AND id = ?',
            (request.user_id, account_id)
        )
    return jsonify({'success': True, 'id': account_id})


@app.route('/api/investing/earnings-watchlist', methods=['GET'])
@login_required
def get_earnings_watchlist():
    """Get user's earnings watchlist."""
    with get_db() as conn:
        cursor = conn.execute(
            'SELECT stock_ticker FROM earnings_watchlist WHERE user_id = ? ORDER BY created_at ASC',
            (request.user_id,)
        )
        rows = cursor.fetchall()

    symbols = [row['stock_ticker'] for row in rows]
    return jsonify({'symbols': symbols})


@app.route('/api/investing/earnings-watchlist', methods=['POST'])
@login_required
def add_to_earnings_watchlist():
    """Add symbol to earnings watchlist."""
    data = request.get_json()
    symbol = data.get('symbol') if data else None
    if not symbol:
        return jsonify({'error': 'Symbol required'}), 400

    symbol = symbol.upper().strip()
    with get_db() as conn:
        try:
            conn.execute(
                'INSERT INTO earnings_watchlist (user_id, stock_ticker) VALUES (?, ?)',
                (request.user_id, symbol)
            )
        except Exception:
            # Already exists, ignore
            pass

    return jsonify({'success': True, 'symbol': symbol})


@app.route('/api/investing/earnings-watchlist/<symbol>', methods=['DELETE'])
@login_required
def remove_from_earnings_watchlist(symbol):
    """Remove symbol from earnings watchlist."""
    symbol = symbol.upper().strip()
    with get_db() as conn:
        conn.execute(
            'DELETE FROM earnings_watchlist WHERE user_id = ? AND stock_ticker = ?',
            (request.user_id, symbol)
        )
    return jsonify({'success': True, 'symbol': symbol})


def fetch_earnings_from_yfinance(ticker):
    """Fetch earnings date from yfinance for a single ticker."""
    import yfinance as yf
    from investing_utils import get_yfinance_ticker

    try:
        # Convert to yfinance ticker (add exchange suffix for European stocks)
        yf_ticker = get_yfinance_ticker(ticker)
        stock = yf.Ticker(yf_ticker)
        calendar = stock.calendar

        next_earnings_date = None
        date_confirmed = False

        if calendar is not None:
            # Handle different yfinance return formats
            if hasattr(calendar, 'to_dict'):
                # DataFrame format
                cal_dict = calendar.to_dict()
                if 'Earnings Date' in cal_dict:
                    dates = cal_dict['Earnings Date']
                    if dates:
                        first_key = list(dates.keys())[0]
                        next_earnings_date = dates[first_key]
                        date_confirmed = len(dates) == 1
            elif isinstance(calendar, dict):
                # Dict format (newer yfinance)
                if 'Earnings Date' in calendar:
                    earnings_dates = calendar['Earnings Date']
                    if isinstance(earnings_dates, list) and len(earnings_dates) > 0:
                        next_earnings_date = earnings_dates[0]
                        date_confirmed = len(earnings_dates) == 1
                    elif earnings_dates:
                        next_earnings_date = earnings_dates
                        date_confirmed = True

        # Convert to date string
        if next_earnings_date is not None:
            if hasattr(next_earnings_date, 'date'):
                next_earnings_date = next_earnings_date.date()
            elif isinstance(next_earnings_date, str):
                next_earnings_date = datetime.strptime(next_earnings_date, '%Y-%m-%d').date()
            return next_earnings_date.strftime('%Y-%m-%d'), date_confirmed

        return None, False

    except Exception as e:
        print(f"Error fetching earnings for {ticker}: {e}")
        return None, False


def get_cached_earnings(ticker):
    """Get cached earnings data if fresh.
    Successful lookups (with date) are cached for 24 hours.
    Failed lookups (null date) are cached for only 1 hour to retry sooner.
    """
    with get_db() as conn:
        cursor = conn.execute(
            '''SELECT next_earnings_date, date_confirmed, updated_at
               FROM earnings_cache WHERE ticker = ?''',
            (ticker,)
        )
        row = cursor.fetchone()

        if not row:
            return None, None, False  # Not in cache

        updated_at = row['updated_at']
        if isinstance(updated_at, str):
            updated_at = datetime.fromisoformat(updated_at)
        age_hours = (datetime.now() - updated_at.replace(tzinfo=None)).total_seconds() / 3600

        # Null results have shorter TTL (1 hour) to retry failed lookups sooner
        max_age = 24 if row['next_earnings_date'] else 1

        if age_hours < max_age:
            # Cache is fresh
            return row['next_earnings_date'], bool(row['date_confirmed']), True

        return None, None, False  # Cache is stale


def save_earnings_cache(ticker, next_earnings_date, date_confirmed):
    """Save earnings data to cache."""
    with get_db() as conn:
        conn.execute(
            '''INSERT INTO earnings_cache (ticker, next_earnings_date, date_confirmed, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(ticker) DO UPDATE SET
                   next_earnings_date = excluded.next_earnings_date,
                   date_confirmed = excluded.date_confirmed,
                   updated_at = excluded.updated_at''',
            (ticker, next_earnings_date, 1 if date_confirmed else 0, datetime.now().isoformat())
        )


@app.route('/api/investing/earnings-calendar', methods=['GET'])
@login_required
def get_earnings_calendar():
    """Get upcoming earnings dates for portfolio holdings and watchlist.
    Uses database cache with lazy refresh (updates if > 24 hours old).
    Optionally filters portfolio by account_id.
    """
    include_portfolio = request.args.get('include_portfolio', 'true').lower() == 'true'
    include_watchlist = request.args.get('include_watchlist', 'true').lower() == 'true'
    account_id = request.args.get('account_id', type=int)

    tickers = set()
    portfolio_tickers = set()
    watchlist_tickers = set()

    # Get portfolio holdings if include_portfolio is true
    if include_portfolio:
        account_ids = [account_id] if account_id else None
        holdings = compute_holdings_from_transactions(request.user_id, account_ids)
        portfolio_tickers = {h['stock_ticker'] for h in holdings if h['quantity'] > 0}
        tickers.update(portfolio_tickers)

    # Get watchlist tickers if include_watchlist is true
    if include_watchlist:
        with get_db() as conn:
            cursor = conn.execute(
                'SELECT stock_ticker FROM watchlist WHERE user_id = ?',
                (request.user_id,)
            )
            watchlist_tickers = {row['stock_ticker'] for row in cursor.fetchall()}
            tickers.update(watchlist_tickers)

    if not tickers:
        return jsonify({'earnings': [], 'watchlist': [], 'message': 'No tickers to track'})

    today = datetime.now().date()
    earnings_data = []

    for ticker in tickers:
        # Try to get from cache first
        cached_date, cached_confirmed, is_fresh = get_cached_earnings(ticker)

        if is_fresh:
            # Use cached data
            next_earnings_date = cached_date
            date_confirmed = cached_confirmed
        else:
            # Fetch fresh data from yfinance
            next_earnings_date, date_confirmed = fetch_earnings_from_yfinance(ticker)
            # Save to cache (even if None, to avoid repeated fetches)
            save_earnings_cache(ticker, next_earnings_date, date_confirmed)

        if next_earnings_date:
            earnings_date = datetime.strptime(next_earnings_date, '%Y-%m-%d').date()
            remaining_days = (earnings_date - today).days

            # Handle past earnings dates
            if remaining_days < 0:
                # Cached date is stale, try to refresh
                next_earnings_date, date_confirmed = fetch_earnings_from_yfinance(ticker)
                save_earnings_cache(ticker, next_earnings_date, date_confirmed)
                if next_earnings_date:
                    earnings_date = datetime.strptime(next_earnings_date, '%Y-%m-%d').date()
                    remaining_days = (earnings_date - today).days
                    if remaining_days < 0:
                        # Still in the past after refresh, show as unavailable
                        earnings_data.append({
                            'ticker': ticker,
                            'next_earnings_date': None,
                            'remaining_days': None,
                            'date_confirmed': False,
                            'source': 'portfolio' if ticker in portfolio_tickers else 'watchlist'
                        })
                        continue
                else:
                    # No future date found, show as unavailable
                    earnings_data.append({
                        'ticker': ticker,
                        'next_earnings_date': None,
                        'remaining_days': None,
                        'date_confirmed': False,
                        'source': 'portfolio' if ticker in portfolio_tickers else 'watchlist'
                    })
                    continue

            earnings_data.append({
                'ticker': ticker,
                'next_earnings_date': next_earnings_date,
                'remaining_days': remaining_days,
                'date_confirmed': date_confirmed,
                'source': 'portfolio' if ticker in portfolio_tickers else 'watchlist'
            })
        else:
            earnings_data.append({
                'ticker': ticker,
                'next_earnings_date': None,
                'remaining_days': None,
                'date_confirmed': False,
                'source': 'portfolio' if ticker in portfolio_tickers else 'watchlist'
            })

    # Sort by remaining days (nulls at the end)
    earnings_data.sort(key=lambda x: (x['remaining_days'] is None, x['remaining_days'] or 9999))

    return jsonify({
        'earnings': earnings_data,
        'watchlist': list(watchlist_tickers)
    })


@app.route('/api/investing/earnings-alerts', methods=['GET'])
@login_required
def get_earnings_alert_preferences():
    """Get current user's earnings alert preferences."""
    with get_db() as conn:
        cursor = conn.execute(
            'SELECT weekly_enabled, days_before_enabled, days_before FROM earnings_alert_preferences WHERE user_id = ?',
            (request.user_id,)
        )
        row = cursor.fetchone()

        if row:
            return jsonify({
                'weekly_enabled': bool(row['weekly_enabled']),
                'days_before_enabled': bool(row['days_before_enabled']),
                'days_before': row['days_before']
            })
        else:
            # Return default values if no preferences set
            return jsonify({
                'weekly_enabled': False,
                'days_before_enabled': False,
                'days_before': 7
            })


@app.route('/api/investing/earnings-alerts', methods=['POST'])
@login_required
def save_earnings_alert_preferences():
    """Save or update earnings alert preferences."""
    data = request.get_json()

    weekly_enabled = data.get('weekly_enabled', False)
    days_before_enabled = data.get('days_before_enabled', False)
    days_before = data.get('days_before', 7)

    if days_before_enabled and (not isinstance(days_before, int) or days_before < 1 or days_before > 30):
        return jsonify({'error': 'days_before must be an integer between 1 and 30'}), 400

    with get_db() as conn:
        conn.execute('''
            INSERT INTO earnings_alert_preferences (user_id, weekly_enabled, days_before_enabled, days_before, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id) DO UPDATE SET
                weekly_enabled = excluded.weekly_enabled,
                days_before_enabled = excluded.days_before_enabled,
                days_before = excluded.days_before,
                updated_at = CURRENT_TIMESTAMP
        ''', (request.user_id, 1 if weekly_enabled else 0, 1 if days_before_enabled else 0, days_before))

    return jsonify({'success': True, 'message': 'Alert preferences saved'})


@app.route('/api/investing/earnings-alerts', methods=['DELETE'])
@login_required
def disable_earnings_alerts():
    """Disable all earnings alerts for the current user."""
    with get_db() as conn:
        conn.execute(
            'UPDATE earnings_alert_preferences SET weekly_enabled = 0, days_before_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
            (request.user_id,)
        )

    return jsonify({'success': True, 'message': 'Alerts disabled'})


@app.route('/api/investing/earnings-alerts/send-now', methods=['POST'])
@login_required
def send_earnings_alert_now():
    """Send an immediate test email with upcoming earnings."""
    from email_utils import send_earnings_alert_email
    import yfinance as yf
    from datetime import datetime

    # Get user info and alert preferences
    with get_db() as conn:
        cursor = conn.execute('SELECT email, name FROM users WHERE id = ?', (request.user_id,))
        user = cursor.fetchone()

        cursor = conn.execute('SELECT weekly_enabled, days_before_enabled, days_before FROM earnings_alert_preferences WHERE user_id = ?', (request.user_id,))
        prefs = cursor.fetchone()

    if not user:
        return jsonify({'error': 'User not found'}), 404

    email = user['email']
    name = user['name'] or 'Investor'

    # Build schedule info from preferences
    schedule_info = None
    if prefs:
        schedule_info = {
            'weekly_enabled': bool(prefs['weekly_enabled']),
            'days_before_enabled': bool(prefs['days_before_enabled']),
            'days_before': prefs['days_before']
        }

    # Get tickers from earnings_watchlist (bell-activated stocks only)
    portfolio_tickers = set()
    watchlist_tickers = set()
    alert_tickers = set()
    with get_db() as conn:
        # Get all bell-activated tickers
        cursor = conn.execute('SELECT stock_ticker FROM earnings_watchlist WHERE user_id = ?', (request.user_id,))
        for row in cursor.fetchall():
            alert_tickers.add(row['stock_ticker'])

        # Get portfolio tickers (for source info)
        cursor = conn.execute('SELECT DISTINCT stock_ticker FROM portfolio_transactions WHERE user_id = ?', (request.user_id,))
        for row in cursor.fetchall():
            portfolio_tickers.add(row['stock_ticker'])

        # Get watchlist tickers (for source info)
        cursor = conn.execute('SELECT stock_ticker FROM watchlist WHERE user_id = ?', (request.user_id,))
        for row in cursor.fetchall():
            watchlist_tickers.add(row['stock_ticker'])

    if not alert_tickers:
        return jsonify({'error': 'No stocks with alerts enabled. Click the bell icon next to stocks to enable alerts.'}), 400

    # Get earnings data
    today = datetime.now().date()
    earnings_data = []

    for ticker in alert_tickers:
        with get_db() as conn:
            cursor = conn.execute('SELECT next_earnings_date, date_confirmed FROM earnings_cache WHERE ticker = ?', (ticker,))
            row = cursor.fetchone()

            if row and row['next_earnings_date']:
                try:
                    earnings_date = datetime.strptime(row['next_earnings_date'], '%Y-%m-%d').date()
                    remaining_days = (earnings_date - today).days

                    if remaining_days >= 0:
                        # Get company name
                        try:
                            stock = yf.Ticker(ticker)
                            info = stock.info
                            company_name = info.get('longName') or info.get('shortName') or ticker
                        except Exception:
                            company_name = ticker

                        # Determine source
                        if ticker in portfolio_tickers:
                            source = 'portfolio'
                        elif ticker in watchlist_tickers:
                            source = 'watchlist'
                        else:
                            source = 'none'

                        earnings_data.append({
                            'ticker': ticker,
                            'company_name': company_name,
                            'next_earnings_date': row['next_earnings_date'],
                            'remaining_days': remaining_days,
                            'date_confirmed': bool(row['date_confirmed']),
                            'source': source
                        })
                except ValueError:
                    continue

    if not earnings_data:
        return jsonify({'error': 'No upcoming earnings found'}), 400

    # Sort by remaining days
    earnings_data.sort(key=lambda x: x['remaining_days'])

    # Send email with schedule info
    success = send_earnings_alert_email(email, name, earnings_data, 'test', schedule_info)

    if success:
        return jsonify({'success': True, 'message': f'Email sent to {email}'})
    else:
        return jsonify({'error': 'Failed to send email. Check SMTP configuration.'}), 500


@app.route('/api/investing/news-feed', methods=['GET'])
def get_news_feed():
    """Get YouTube news feed videos, optionally filtered by ticker and company name."""
    ticker = request.args.get('ticker')
    company_name = request.args.get('company_name')
    limit = request.args.get('limit', 50, type=int)
    force_refresh = request.args.get('force_refresh', 'false').lower() == 'true'

    api_key = os.environ.get('YOUTUBE_API_KEY')

    try:
        result = get_news_feed_videos(get_db, api_key, ticker=ticker, company_name=company_name, limit=limit, force_refresh=force_refresh)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/investing/graph-download', methods=['POST'])
@login_required
def record_graph_download():
    """Record a graph download event."""
    data = request.get_json()
    graph_type = data.get('graph_type')

    if not graph_type:
        return jsonify({'error': 'graph_type is required'}), 400

    with get_db() as conn:
        conn.execute(
            'INSERT INTO graph_downloads (user_id, graph_type) VALUES (?, ?)',
            (request.user_id, graph_type)
        )
        conn.commit()

    return jsonify({'success': True})


@app.route('/api/investing/stock-view', methods=['POST'])
@login_required
def record_stock_view():
    """Record a stock view event (view count and time spent)."""
    data = request.get_json()
    ticker = data.get('ticker')
    time_spent = data.get('time_spent_seconds', 0)

    if not ticker:
        return jsonify({'error': 'ticker is required'}), 400

    from datetime import date
    today = date.today().isoformat()

    with get_db() as conn:
        # Upsert: increment view count and add time spent
        conn.execute('''
            INSERT INTO stock_views (user_id, stock_ticker, view_date, view_count, time_spent_seconds)
            VALUES (?, ?, ?, 1, ?)
            ON CONFLICT(user_id, stock_ticker, view_date) DO UPDATE SET
                view_count = stock_views.view_count + 1,
                time_spent_seconds = stock_views.time_spent_seconds + excluded.time_spent_seconds,
                last_viewed_at = CURRENT_TIMESTAMP
        ''', (request.user_id, ticker, today, time_spent))
        conn.commit()

    return jsonify({'success': True})


@app.route('/api/admin/users/<int:user_id>/stock-views', methods=['GET'])
@admin_required
def get_user_stock_views(user_id):
    """Get stock view statistics for a specific user (admin only)."""
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT stock_ticker,
                   SUM(view_count) as total_views,
                   SUM(time_spent_seconds) as total_time_seconds
            FROM stock_views
            WHERE user_id = ?
            GROUP BY stock_ticker
            ORDER BY total_views DESC
        ''', (user_id,))
        views = [dict(row) for row in cursor.fetchall()]

    return jsonify({'views': views})


@app.route('/api/admin/stock-views', methods=['GET'])
@admin_required
def get_stock_views_stats():
    """Get aggregated stock view statistics (admin only)."""
    # Hidden accounts
    hidden_emails = ['rose.louis.mail@gmail.com', 'u6965441974@gmail.com', 'fake.test@example.com']
    placeholders = ','.join(['?' for _ in hidden_emails])

    with get_db() as conn:
        # Get aggregated stats by stock (all users except hidden)
        cursor = conn.execute(f'''
            SELECT sv.stock_ticker,
                   COUNT(DISTINCT sv.user_id) as unique_users,
                   SUM(sv.view_count) as total_views,
                   SUM(sv.time_spent_seconds) as total_time_seconds
            FROM stock_views sv
            JOIN users u ON sv.user_id = u.id
            WHERE u.email NOT IN ({placeholders})
            GROUP BY sv.stock_ticker
            ORDER BY total_views DESC
        ''', tuple(hidden_emails))
        by_stock = [dict(row) for row in cursor.fetchall()]

        # Get stats by user
        cursor = conn.execute(f'''
            SELECT u.id, u.name, u.email,
                   COUNT(DISTINCT sv.stock_ticker) as stocks_viewed,
                   SUM(sv.view_count) as total_views,
                   SUM(sv.time_spent_seconds) as total_time_seconds
            FROM stock_views sv
            JOIN users u ON sv.user_id = u.id
            WHERE u.email NOT IN ({placeholders})
            GROUP BY u.id
            ORDER BY total_views DESC
        ''', tuple(hidden_emails))
        by_user = [dict(row) for row in cursor.fetchall()]

    return jsonify({
        'by_stock': by_stock,
        'by_user': by_user
    })


@app.route('/api/admin/stock-views/<ticker>', methods=['GET'])
@admin_required
def get_stock_views_detail(ticker):
    """Get detailed view statistics for a specific stock (admin only)."""
    # Hidden accounts
    hidden_emails = ['rose.louis.mail@gmail.com', 'u6965441974@gmail.com', 'fake.test@example.com']
    placeholders = ','.join(['?' for _ in hidden_emails])

    with get_db() as conn:
        # Get all views for this stock by user
        cursor = conn.execute(f'''
            SELECT u.id, u.name, u.picture,
                   sv.view_date,
                   sv.view_count,
                   sv.time_spent_seconds,
                   sv.last_viewed_at
            FROM stock_views sv
            JOIN users u ON sv.user_id = u.id
            WHERE sv.stock_ticker = ?
              AND u.email NOT IN ({placeholders})
            ORDER BY sv.view_date DESC
        ''', (ticker, *hidden_emails))
        views = [dict(row) for row in cursor.fetchall()]

        # Get totals
        cursor = conn.execute(f'''
            SELECT COUNT(DISTINCT sv.user_id) as unique_users,
                   SUM(sv.view_count) as total_views,
                   SUM(sv.time_spent_seconds) as total_time_seconds
            FROM stock_views sv
            JOIN users u ON sv.user_id = u.id
            WHERE sv.stock_ticker = ?
              AND u.email NOT IN ({placeholders})
        ''', (ticker, *hidden_emails))
        totals = dict(cursor.fetchone())

    return jsonify({
        'ticker': ticker,
        'views': views,
        'totals': totals
    })


@app.route('/api/admin/time-spent', methods=['GET'])
@admin_required
def get_time_spent_stats():
    """Get daily time spent stats for all users (admin only)."""
    # Hidden accounts
    hidden_emails = ['rose.louis.mail@gmail.com', 'u6965441974@gmail.com', 'fake.test@example.com']

    with get_db() as conn:
        cursor = conn.execute('''
            SELECT a.activity_date, SUM(a.minutes) as total_minutes
            FROM user_activity a
            JOIN users u ON a.user_id = u.id
            WHERE u.email NOT IN (?, ?, ?)
            GROUP BY a.activity_date
            ORDER BY a.activity_date ASC
        ''', tuple(hidden_emails))
        daily_stats = [dict(row) for row in cursor.fetchall()]

    return jsonify({'daily_stats': daily_stats})


@app.route('/api/admin/time-spent/<period>', methods=['GET'])
@admin_required
def get_time_spent_details(period):
    """Get users' time spent for a specific date, week, or month (admin only).

    Period formats:
    - Date: YYYY-MM-DD
    - Week: YYYY-WXX
    - Month: YYYY-MM
    """
    hidden_emails = ['rose.louis.mail@gmail.com', 'u6965441974@gmail.com', 'fake.test@example.com']
    placeholder = '%s' if USE_POSTGRES else '?'
    placeholders = ','.join([placeholder for _ in hidden_emails])

    with get_db() as conn:
        if '-W' in period:
            # Week format: YYYY-WXX
            year, week = period.split('-W')
            if USE_POSTGRES:
                cursor = conn.execute(f'''
                    SELECT u.id, u.name, u.picture, SUM(a.minutes) as minutes
                    FROM user_activity a
                    JOIN users u ON a.user_id = u.id
                    WHERE u.email NOT IN ({placeholders})
                      AND EXTRACT(YEAR FROM a.activity_date::date) = %s
                      AND EXTRACT(WEEK FROM a.activity_date::date) = %s
                    GROUP BY u.id, u.name, u.picture
                    ORDER BY minutes DESC
                ''', (*hidden_emails, int(year), int(week)))
            else:
                cursor = conn.execute(f'''
                    SELECT u.id, u.name, u.picture, SUM(a.minutes) as minutes
                    FROM user_activity a
                    JOIN users u ON a.user_id = u.id
                    WHERE u.email NOT IN ({placeholders})
                      AND strftime('%Y', a.activity_date) = ?
                      AND CAST(strftime('%W', a.activity_date) AS INTEGER) + 1 = ?
                    GROUP BY u.id
                    ORDER BY minutes DESC
                ''', (*hidden_emails, year, int(week)))
        elif len(period) == 7:
            # Month format: YYYY-MM
            if USE_POSTGRES:
                cursor = conn.execute(f'''
                    SELECT u.id, u.name, u.picture, SUM(a.minutes) as minutes
                    FROM user_activity a
                    JOIN users u ON a.user_id = u.id
                    WHERE u.email NOT IN ({placeholders})
                      AND to_char(a.activity_date::date, 'YYYY-MM') = %s
                    GROUP BY u.id, u.name, u.picture
                    ORDER BY minutes DESC
                ''', (*hidden_emails, period))
            else:
                cursor = conn.execute(f'''
                    SELECT u.id, u.name, u.picture, SUM(a.minutes) as minutes
                    FROM user_activity a
                    JOIN users u ON a.user_id = u.id
                    WHERE u.email NOT IN ({placeholders})
                      AND strftime('%Y-%m', a.activity_date) = ?
                    GROUP BY u.id
                    ORDER BY minutes DESC
                ''', (*hidden_emails, period))
        else:
            # Date format: YYYY-MM-DD
            if USE_POSTGRES:
                cursor = conn.execute(f'''
                    SELECT u.id, u.name, u.picture, a.minutes
                    FROM user_activity a
                    JOIN users u ON a.user_id = u.id
                    WHERE u.email NOT IN ({placeholders})
                      AND a.activity_date = %s
                    ORDER BY a.minutes DESC
                ''', (*hidden_emails, period))
            else:
                cursor = conn.execute(f'''
                    SELECT u.id, u.name, u.picture, a.minutes
                    FROM user_activity a
                    JOIN users u ON a.user_id = u.id
                    WHERE u.email NOT IN ({placeholders})
                      AND a.activity_date = ?
                    ORDER BY a.minutes DESC
                ''', (*hidden_emails, period))

        users = [dict(row) for row in cursor.fetchall()]

    return jsonify({'users': users, 'period': period})


@app.route('/api/admin/page-breakdown', methods=['GET'])
@admin_required
def get_page_breakdown():
    """Get aggregated time spent by page/section (admin only)."""
    hidden_emails = ['rose.louis.mail@gmail.com', 'u6965441974@gmail.com', 'fake.test@example.com']
    placeholders = ','.join(['?' for _ in hidden_emails])

    with get_db() as conn:
        cursor = conn.execute(f'''
            SELECT p.page, SUM(p.minutes) as total_minutes
            FROM page_activity p
            JOIN users u ON p.user_id = u.id
            WHERE u.email NOT IN ({placeholders})
            GROUP BY p.page
            ORDER BY total_minutes DESC
        ''', tuple(hidden_emails))

        breakdown = [dict(row) for row in cursor.fetchall()]
        total = sum(item['total_minutes'] for item in breakdown)

    return jsonify({
        'breakdown': breakdown,
        'total_minutes': total
    })


@app.route('/api/admin/clear-video-cache', methods=['POST'])
@admin_required
def clear_video_cache():
    """Clear YouTube video cache to force refresh with descriptions (admin only)."""
    with get_db() as conn:
        conn.execute('DELETE FROM youtube_videos_cache')
    return jsonify({'success': True, 'message': 'Video cache cleared. Videos will be re-fetched with descriptions.'})


@app.route('/api/admin/backfill-demo-portfolios', methods=['POST'])
@admin_required
def backfill_demo_portfolios():
    """Add demo portfolios to users (admin only). Use force=true to add to ALL users."""
    from auth import create_demo_portfolio

    data = request.get_json() or {}
    force = data.get('force', False)

    with get_db() as conn:
        if force:
            # Add to ALL users
            cursor = conn.execute('SELECT id, email FROM users')
        else:
            # Find users without any transactions
            cursor = conn.execute('''
                SELECT u.id, u.email
                FROM users u
                LEFT JOIN portfolio_transactions pt ON u.id = pt.user_id
                GROUP BY u.id
                HAVING COUNT(pt.id) = 0
            ''')
        users = cursor.fetchall()

        backfilled_count = 0
        for user in users:
            if create_demo_portfolio(user['id'], force=force):
                backfilled_count += 1

    return jsonify({
        'success': True,
        'message': f'Demo portfolios created for {backfilled_count} users',
        'users_backfilled': backfilled_count,
        'force': force
    })


@app.route('/api/reward/eligibility', methods=['GET'])
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


@app.route('/api/reward/claim', methods=['POST'])
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


@app.route('/api/feedback', methods=['POST'])
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


if __name__ == '__main__':
    app.run(debug=True, port=5001)