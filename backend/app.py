# backend/app.py
import os
import hashlib
from datetime import datetime
from flask import Flask, jsonify, request, Response, make_response
from flask_cors import CORS
from dotenv import load_dotenv
import utils
from database import get_db, init_db
from auth import (
    verify_google_token, get_or_create_user, create_access_token,
    create_refresh_token, set_auth_cookies, clear_auth_cookies,
    get_current_user, login_required
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

        # 2. Fetch History (weekly) - filtered by time class
        history = utils.fetch_games_played_per_week(username, time_class=time_class)

        # 3. Fetch Elo history - filtered by time class
        elo_history, total_games = utils.fetch_elo_per_week(username, time_class=time_class)

        # 4. Fetch Openings (This can be slow, might want to split endpoints later)
        archives = utils.fetch_player_games_archives(username)
        raw_openings = utils.fetch_all_openings(username, archives)
        processed_openings = utils.process_openings_for_json(raw_openings)

        # 5. Fetch win rate by game number per day
        game_number_stats = utils.fetch_win_rate_by_game_number(username, time_class=time_class)

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
    """SSE endpoint that streams progress while fetching stats."""
    username = request.args.get('username')
    time_class = request.args.get('time_class', 'rapid')

    if not username:
        return jsonify({"error": "Username required"}), 400

    if time_class not in ['rapid', 'blitz', 'bullet']:
        return jsonify({"error": "Invalid time_class"}), 400

    def generate():
        try:
            # First, fetch player data (fast)
            player_data = utils.fetch_player_data_and_stats(username)
            import json
            yield f"data: {json.dumps({'type': 'player', 'player': {'name': player_data.get('name', username), 'username': player_data.get('username', username), 'avatar': player_data.get('avatar'), 'followers': player_data.get('followers', 0), 'joined': player_data.get('joined')}})}\n\n"

            # Then stream the stats with progress
            for chunk in utils.fetch_stats_streaming(username, time_class):
                yield chunk

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

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
            'preferences': {
                'chess_username': user['chess_username'],
                'preferred_time_class': user['preferred_time_class']
            }
        }
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

        expires_at = datetime.fromisoformat(row['expires_at'])
        if expires_at < datetime.utcnow():
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


if __name__ == '__main__':
    app.run(debug=True, port=5001)