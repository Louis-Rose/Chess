# backend/blueprints/chess.py
import os
import logging
from datetime import datetime
from flask import Blueprint, jsonify, request, Response
import requests as http_requests

import utils
from database import get_db, get_all_cached_stats, save_all_cached_stats, USE_POSTGRES

logger = logging.getLogger(__name__)

chess_bp = Blueprint('chess', __name__)


# ============= CHESS STATS ROUTES =============

@chess_bp.route('/api/stats', methods=['GET'])
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

        # 3. Fetch History (daily) - filtered by time class
        history = utils.fetch_games_played_per_day(username, time_class=time_class, archives=archives)

        # 4. Fetch Elo history - filtered by time class
        elo_history, total_games = utils.fetch_elo_per_day(username, time_class=time_class, archives=archives)

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
                "joined": player_data.get("joined"),
                "rapid_rating": (player_data.get("chess_rapid") or {}).get("last", {}).get("rating"),
                "blitz_rating": (player_data.get("chess_blitz") or {}).get("last", {}).get("rating"),
                "bullet_rating": (player_data.get("chess_bullet") or {}).get("last", {}).get("rating"),
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

@chess_bp.route('/api/chess-username-check', methods=['GET'])
def chess_username_check():
    """Lightweight: check if a Chess.com username exists and return basic info."""
    username = request.args.get('username', '').strip()
    if not username:
        return jsonify({"exists": False}), 200
    try:
        headers = {'User-Agent': 'MyPythonScript/1.0 (contact@example.com)'}
        r = http_requests.get(f"https://api.chess.com/pub/player/{username}", headers=headers, timeout=5)
        if r.status_code == 200:
            data = r.json()
            return jsonify({
                "exists": True,
                "username": data.get("username", username),
                "avatar": data.get("avatar"),
            }), 200
        return jsonify({"exists": False}), 200
    except Exception:
        return jsonify({"exists": False}), 200


@chess_bp.route('/api/player-info', methods=['GET'])
def get_player_info():
    """Lightweight endpoint that returns only Chess.com player profile + ratings."""
    username = request.args.get('username')
    if not username:
        return jsonify({"error": "Username required"}), 400
    try:
        player_data = utils.fetch_player_data_and_stats(username)
        return jsonify({
            'player': {
                'name': player_data.get('name', username),
                'username': player_data.get('username', username),
                'avatar': player_data.get('avatar'),
                'followers': player_data.get('followers', 0),
                'joined': player_data.get('joined'),
                'rapid_rating': (player_data.get('chess_rapid') or {}).get('last', {}).get('rating'),
                'blitz_rating': (player_data.get('chess_blitz') or {}).get('last', {}).get('rating'),
                'bullet_rating': (player_data.get('chess_bullet') or {}).get('last', {}).get('rating'),
            }
        })
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@chess_bp.route('/api/stats-stream', methods=['GET'])
def get_chess_stats_stream():
    """SSE endpoint that streams progress while fetching stats. Uses caching for performance.

    Optimization: Fetches ALL time classes (rapid, blitz) in a single pass through archives.
    This makes switching between time classes instant after the first fetch.

    Accepts optional client_last_archive query param for client-side incremental caching.
    When the server cache is stale but the client provides cached stats via last_archive,
    the server will only fetch archives newer than that checkpoint.
    """
    import json as json_module

    username = request.args.get('username')
    time_class = request.args.get('time_class', 'rapid')
    client_last_archive = request.args.get('client_last_archive')
    user_tz = request.args.get('tz', 'Europe/Paris')

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
                'joined': player_data.get('joined'),
                'rapid_rating': (player_data.get('chess_rapid') or {}).get('last', {}).get('rating'),
                'blitz_rating': (player_data.get('chess_blitz') or {}).get('last', {}).get('rating'),
                'bullet_rating': (player_data.get('chess_bullet') or {}).get('last', {}).get('rating'),
            }
            yield f"data: {json_module.dumps({'type': 'player', 'player': player_info})}\n\n"

            # Check cache for ALL time classes
            all_cached = get_all_cached_stats(username)

            # Migrate old weekly-format cache to daily format
            def _is_old_format(stats):
                h = stats.get('history', [])
                return h and 'year' in h[0] and 'date' not in h[0]

            if all_cached and any(_is_old_format(s) for (s, _, _) in all_cached.values()):
                # Old format detected, force full re-fetch
                all_cached = {}

            # Force re-fetch if cache is missing fields or has old fixed-5 streak format
            if all_cached and any(
                'daily_volume_stats' not in s or 'streak_stats' not in s
                or max((x.get('streak_length', 0) for x in s.get('streak_stats', [{'streak_length': 0}])), default=0) <= 5
                for (s, _, _) in all_cached.values()
            ):
                all_cached = {}

            # Check if requested time class has fresh cache
            if time_class in all_cached:
                cached_stats, cached_last_archive, is_fresh = all_cached[time_class]
                if is_fresh:
                    # Return cached data immediately (include last_archive for client caching)
                    cached_with_archive = {**cached_stats, 'last_archive': cached_last_archive}
                    yield f"data: {json_module.dumps({'type': 'start', 'total_archives': 0, 'incremental': False, 'cached': True})}\n\n"
                    yield f"data: {json_module.dumps({'type': 'complete', 'data': cached_with_archive})}\n\n"
                    return

            # Need to fetch - use incremental update from server or client cache
            cached_stats_map = None
            last_archive = None

            # First try: server cache (if all fresh)
            all_fresh = all_cached and all(is_fresh for (_, _, is_fresh) in all_cached.values())
            if all_fresh:
                cached_stats_map = {}
                for tc, (stats, archive, _) in all_cached.items():
                    cached_stats_map[tc] = stats
                    if archive:
                        last_archive = archive
            # Fallback: server cache is stale but exists — use it with client_last_archive
            elif all_cached and client_last_archive:
                cached_stats_map = {}
                for tc, (stats, archive, _) in all_cached.items():
                    cached_stats_map[tc] = stats
                last_archive = client_last_archive

            # Fetch stats for ALL time classes
            all_time_classes_data = None
            final_stats = None
            for chunk in utils.fetch_all_time_classes_streaming(username, time_class, cached_stats_map, last_archive, user_tz=user_tz):
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

@chess_bp.route('/api/fatigue-analysis', methods=['GET'])
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


@chess_bp.route('/api/chess-insight', methods=['POST'])
def get_chess_insight():
    """Generate a short Gemini summary of chess stat data (daily volume, streaks, etc.)."""
    import google.generativeai as genai

    body = request.get_json(silent=True) or {}
    stat_type = body.get('type')
    rows = body.get('rows')

    if not stat_type or not rows:
        return jsonify({"error": "type and rows required"}), 400

    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        return jsonify({"error": "GEMINI_API_KEY not configured"}), 500

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.0-flash')

        if stat_type == 'daily_volume':
            data_str = "\n".join(f"- {r['games_per_day']} games/day → {r['win_rate']:.1f}% win rate" for r in rows)
            prompt = f"""You are a chess coach. Here is a player's win rate by number of games played per day:

{data_str}

Output the analysis in BOTH English and French with EXACTLY the same numbers and conclusions.
Each line must start with "EN: " or "FR: ".

Format:
EN: You should play between X and Y games per day (X.y% win rate).
EN: You should avoid playing less than X games per day (X.y% win rate).
EN: You should avoid playing more than Y games per day (X.y% win rate).
FR: Vous devriez jouer entre X et Y parties par jour (X.y% de taux de victoire).
FR: Vous devriez éviter de jouer moins de X parties par jour (X.y% de taux de victoire).
FR: Vous devriez éviter de jouer plus de Y parties par jour (X.y% de taux de victoire).

Rules:
1) The recommended range is the consecutive span of games_per_day values with the highest average win rate (must be above 50%).
2) The win rate shown in the first sentence is the average for that optimal range.
3) If the win rate for playing fewer than X games is above 50%, remove BOTH the EN and FR "avoid playing less" lines.
4) If the win rate for playing more than Y games is above 50%, remove BOTH the EN and FR "avoid playing more" lines.
No intro, no filler. Output ONLY the prefixed lines."""
        else:
            return jsonify({"error": f"Unknown stat type: {stat_type}"}), 400

        response = model.generate_content(prompt)
        text = response.text.strip()
        en_lines = [line[4:].strip() for line in text.split('\n') if line.startswith('EN: ')]
        fr_lines = [line[4:].strip() for line in text.split('\n') if line.startswith('FR: ')]
        return jsonify({
            "summary_en": '\n'.join(en_lines),
            "summary_fr": '\n'.join(fr_lines),
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ============= WIN PREDICTION & YOUTUBE =============

@chess_bp.route('/api/win-prediction-stream', methods=['GET'])
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

@chess_bp.route('/api/youtube-videos', methods=['GET'])
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


# ============= CHESS USER MANAGEMENT ROUTES =============

@chess_bp.route('/api/chess/heartbeat', methods=['POST'])
def chess_heartbeat():
    """Record a heartbeat for chess-only visitors (no auth required)."""
    data = request.get_json() or {}
    chess_username = (data.get('chess_username') or '').strip()
    if not chess_username:
        return jsonify({'error': 'chess_username required'}), 400

    username_lower = chess_username.lower()

    # Don't track admin's own usage
    if username_lower == 'akyrosu':
        return jsonify({'success': True})
    google_id = f'chess:{username_lower}'
    email = f'{username_lower}@chess.local'
    today = datetime.now().strftime('%Y-%m-%d')

    page = data.get('page', 'chess_other')
    language = data.get('language')
    device_type = data.get('device_type')

    # Normalize chess page names
    valid_chess_pages = ('chess_home', 'chess_elo', 'chess_today', 'chess_daily_volume',
                         'chess_game_number', 'chess_streak', 'chess_admin')
    if page not in valid_chess_pages:
        page = 'chess_other'

    with get_db() as conn:
        # Upsert synthetic user
        conn.execute('''
            INSERT INTO users (google_id, email, name)
            VALUES (?, ?, ?)
            ON CONFLICT(google_id) DO UPDATE SET name = excluded.name
        ''', (google_id, email, chess_username))

        cursor = conn.execute('SELECT id, last_session_ping FROM users WHERE google_id = ?', (google_id,))
        row = cursor.fetchone()
        user_id = row['id']
        last_ping = row['last_session_ping']

        # Upsert chess_username in user_preferences
        conn.execute('''
            INSERT INTO user_preferences (user_id, chess_username)
            VALUES (?, ?)
            ON CONFLICT(user_id) DO UPDATE SET chess_username = excluded.chess_username
        ''', (user_id, chess_username))

        # Session detection (same 30min gap logic)
        is_new_session = True
        if last_ping:
            try:
                last_ping_time = datetime.fromisoformat(last_ping.replace('Z', '+00:00')) if isinstance(last_ping, str) else last_ping
                minutes_since_last = (datetime.utcnow() - last_ping_time.replace(tzinfo=None)).total_seconds() / 60
                is_new_session = minutes_since_last > 30
            except:
                is_new_session = True

        if is_new_session:
            conn.execute('''
                UPDATE users SET session_count = COALESCE(session_count, 0) + 1, last_session_ping = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (user_id,))
        else:
            conn.execute('''
                UPDATE users SET last_session_ping = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (user_id,))

        # Daily activity
        conn.execute('''
            INSERT INTO user_activity (user_id, activity_date, seconds, last_ping)
            VALUES (?, ?, 15, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, activity_date) DO UPDATE SET
                seconds = user_activity.seconds + 15,
                last_ping = CURRENT_TIMESTAMP
        ''', (user_id, today))

        # Page activity
        conn.execute('''
            INSERT INTO page_activity (user_id, page, seconds)
            VALUES (?, ?, 15)
            ON CONFLICT(user_id, page) DO UPDATE SET
                seconds = page_activity.seconds + 15
        ''', (user_id, page))

        # Language
        if language:
            conn.execute('''
                INSERT INTO language_usage (user_id, language, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id) DO UPDATE SET
                    language = excluded.language,
                    updated_at = CURRENT_TIMESTAMP
            ''', (user_id, language))

        # Device
        if device_type in ('mobile', 'desktop'):
            conn.execute('''
                INSERT INTO device_usage (user_id, device_type, seconds, updated_at)
                VALUES (?, ?, 15, CURRENT_TIMESTAMP)
                ON CONFLICT(user_id, device_type) DO UPDATE SET
                    seconds = device_usage.seconds + 15,
                    updated_at = CURRENT_TIMESTAMP
            ''', (user_id, device_type))

    return jsonify({'success': True})


@chess_bp.route('/api/chess/goal', methods=['GET'])
def get_chess_goal():
    """Fetch saved elo goal for a chess username + time class."""
    username = (request.args.get('username') or '').strip().lower()
    time_class = request.args.get('time_class', 'rapid')
    if not username:
        return jsonify({'error': 'username required'}), 400

    with get_db() as conn:
        cursor = conn.execute(
            'SELECT elo_goal, elo_goal_start_elo, elo_goal_start_date, elo_goal_months FROM chess_goals WHERE username = ? AND time_class = ?',
            (username, time_class)
        )
        row = cursor.fetchone()

    if not row:
        return jsonify({'goal': None})

    return jsonify({'goal': {
        'elo_goal': row['elo_goal'],
        'elo_goal_start_elo': row['elo_goal_start_elo'],
        'elo_goal_start_date': row['elo_goal_start_date'],
        'elo_goal_months': row['elo_goal_months'],
    }})


@chess_bp.route('/api/chess/goal', methods=['POST'])
def save_chess_goal():
    """Save or update elo goal for a chess username + time class."""
    data = request.get_json() or {}
    username = (data.get('username') or '').strip().lower()
    time_class = data.get('time_class', 'rapid')
    if not username:
        return jsonify({'error': 'username required'}), 400

    elo_goal = data.get('elo_goal')
    elo_goal_start_elo = data.get('elo_goal_start_elo')
    elo_goal_start_date = data.get('elo_goal_start_date')
    elo_goal_months = data.get('elo_goal_months', 3)

    if not all([elo_goal, elo_goal_start_elo, elo_goal_start_date]):
        return jsonify({'error': 'elo_goal, elo_goal_start_elo, elo_goal_start_date required'}), 400

    with get_db() as conn:
        conn.execute('''
            INSERT INTO chess_goals (username, time_class, elo_goal, elo_goal_start_elo, elo_goal_start_date, elo_goal_months, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(username, time_class) DO UPDATE SET
                elo_goal = excluded.elo_goal,
                elo_goal_start_elo = excluded.elo_goal_start_elo,
                elo_goal_start_date = excluded.elo_goal_start_date,
                elo_goal_months = excluded.elo_goal_months,
                updated_at = CURRENT_TIMESTAMP
        ''', (username, time_class, elo_goal, elo_goal_start_elo, elo_goal_start_date, elo_goal_months))

    return jsonify({'success': True})


# ---- FIDE Rating ----
_fide_cache = {}  # {fide_id: (data, timestamp)}
FIDE_CACHE_TTL = 86400  # 24 hours


def _fetch_fide_data(fide_id):
    """Fetch FIDE player info + monthly delta (cached 24h). Returns data dict or None."""
    import time as _time
    now = _time.time()
    if fide_id in _fide_cache:
        cached_data, cached_at = _fide_cache[fide_id]
        if now - cached_at < FIDE_CACHE_TTL:
            return cached_data

    try:
        resp = http_requests.get(
            f'https://fide-api.vercel.app/player_info/?fide_id={fide_id}',
            timeout=10
        )
        resp.raise_for_status()
        raw = resp.json()
        data = {
            'name': raw.get('name'),
            'federation': raw.get('federation'),
            'fide_title': raw.get('fide_title'),
            'classical_rating': raw.get('classical_rating'),
            'rapid_rating': raw.get('rapid_rating'),
            'blitz_rating': raw.get('blitz_rating'),
            'classical_delta': None,
            'rapid_delta': None,
            'blitz_delta': None,
        }

        # Fetch history for monthly deltas
        try:
            hist_resp = http_requests.get(
                f'https://fide-api.vercel.app/player_history/?fide_id={fide_id}',
                timeout=10
            )
            hist_resp.raise_for_status()
            history = hist_resp.json()
            if isinstance(history, list) and len(history) >= 2:
                curr, prev = history[0], history[1]
                for tc in ('classical', 'rapid', 'blitz'):
                    curr_r = curr.get(f'{tc}_rating') or 0
                    prev_r = prev.get(f'{tc}_rating') or 0
                    if curr_r > 0 and prev_r > 0:
                        data[f'{tc}_delta'] = curr_r - prev_r
                    elif curr_r > 0 and prev_r == 0:
                        data[f'{tc}_delta'] = 'new'
                    elif curr_r == 0 and prev_r > 0:
                        data[f'{tc}_delta'] = -prev_r
                    # else both 0 → stays None
            elif isinstance(history, list) and len(history) == 1:
                # Only one month of history → newly rated
                curr = history[0]
                for tc in ('classical', 'rapid', 'blitz'):
                    if (curr.get(f'{tc}_rating') or 0) > 0:
                        data[f'{tc}_delta'] = 'new'
        except Exception:
            pass  # deltas are best-effort

        _fide_cache[fide_id] = (data, now)
        return data
    except Exception:
        return None


@chess_bp.route('/api/chess/fide-rating', methods=['GET'])
def get_fide_rating():
    """Fetch FIDE ratings for a player by FIDE ID (cached 24h)."""
    fide_id = (request.args.get('fide_id') or '').strip()
    if not fide_id:
        return jsonify({'error': 'fide_id required'}), 400

    data = _fetch_fide_data(fide_id)
    if data:
        return jsonify(data)
    return jsonify({'error': 'Failed to fetch FIDE data'}), 502


@chess_bp.route('/api/chess/fide-id', methods=['GET'])
def get_fide_id():
    """Fetch saved FIDE ID for a chess username."""
    username = (request.args.get('username') or '').strip().lower()
    if not username:
        return jsonify({'fide_id': None})

    with get_db() as conn:
        cursor = conn.execute(
            'SELECT fide_id FROM chess_user_prefs WHERE username = ?',
            (username,)
        )
        row = cursor.fetchone()

    return jsonify({'fide_id': row['fide_id'] if row else None})


@chess_bp.route('/api/chess/fide-id', methods=['POST'])
def save_fide_id():
    """Save FIDE ID for a chess username."""
    data = request.get_json() or {}
    username = (data.get('username') or '').strip().lower()
    fide_id = (data.get('fide_id') or '').strip()
    if not username:
        return jsonify({'error': 'username required'}), 400

    with get_db() as conn:
        conn.execute('''
            INSERT INTO chess_user_prefs (username, fide_id, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(username) DO UPDATE SET
                fide_id = excluded.fide_id,
                updated_at = CURRENT_TIMESTAMP
        ''', (username, fide_id or None))

    return jsonify({'success': True})


@chess_bp.route('/api/chess/leaderboard-name', methods=['GET'])
def get_leaderboard_name():
    """Fetch saved leaderboard name for a chess username."""
    username = (request.args.get('username') or '').strip().lower()
    if not username:
        return jsonify({'name': None})

    with get_db() as conn:
        cursor = conn.execute(
            'SELECT leaderboard_name FROM chess_user_prefs WHERE username = ?',
            (username,)
        )
        row = cursor.fetchone()

    return jsonify({'name': row['leaderboard_name'] if row else None})


@chess_bp.route('/api/chess/leaderboard-name', methods=['POST'])
def save_leaderboard_name():
    """Save leaderboard name for a chess username."""
    data = request.get_json() or {}
    username = (data.get('username') or '').strip().lower()
    name = (data.get('name') or '').strip()
    if not username:
        return jsonify({'error': 'username required'}), 400

    with get_db() as conn:
        conn.execute('''
            INSERT INTO chess_user_prefs (username, leaderboard_name, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(username) DO UPDATE SET
                leaderboard_name = excluded.leaderboard_name,
                updated_at = CURRENT_TIMESTAMP
        ''', (username, name or None))

    return jsonify({'success': True})


@chess_bp.route('/api/chess/fide-friends', methods=['GET'])
def get_fide_friends():
    """List FIDE friends for a chess username with their rating data."""
    username = (request.args.get('username') or '').strip().lower()
    if not username:
        return jsonify({'friends': []})

    with get_db() as conn:
        cursor = conn.execute(
            'SELECT fide_id FROM chess_fide_friends WHERE username = ?',
            (username,)
        )
        rows = cursor.fetchall()

    friends = []
    for row in rows:
        fid = row['fide_id']
        data = _fetch_fide_data(fid)
        if data:
            friends.append({'fide_id': fid, **data})
        else:
            friends.append({'fide_id': fid, 'name': None, 'federation': None, 'fide_title': None,
                           'classical_rating': None, 'rapid_rating': None, 'blitz_rating': None,
                           'classical_delta': None, 'rapid_delta': None, 'blitz_delta': None})

    return jsonify({'friends': friends})


@chess_bp.route('/api/chess/fide-friends', methods=['POST'])
def add_fide_friend():
    """Add a FIDE friend."""
    data = request.get_json() or {}
    username = (data.get('username') or '').strip().lower()
    fide_id = (data.get('fide_id') or '').strip()
    if not username or not fide_id:
        return jsonify({'error': 'username and fide_id required'}), 400

    # Validate the FIDE ID by fetching data
    fide_data = _fetch_fide_data(fide_id)
    if not fide_data or not fide_data.get('name'):
        return jsonify({'error': 'Invalid FIDE ID'}), 400

    with get_db() as conn:
        if USE_POSTGRES:
            conn.execute(
                'INSERT INTO chess_fide_friends (username, fide_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
                (username, fide_id)
            )
        else:
            conn.execute(
                'INSERT OR IGNORE INTO chess_fide_friends (username, fide_id) VALUES (?, ?)',
                (username, fide_id)
            )

    return jsonify({'success': True})


@chess_bp.route('/api/chess/fide-friends', methods=['DELETE'])
def remove_fide_friend():
    """Remove a FIDE friend."""
    data = request.get_json() or {}
    username = (data.get('username') or '').strip().lower()
    fide_id = (data.get('fide_id') or '').strip()
    if not username or not fide_id:
        return jsonify({'error': 'username and fide_id required'}), 400

    with get_db() as conn:
        conn.execute(
            'DELETE FROM chess_fide_friends WHERE username = ? AND fide_id = ?',
            (username, fide_id)
        )

    return jsonify({'success': True})


@chess_bp.route('/api/chess/onboarding', methods=['GET'])
def get_chess_onboarding():
    """Check if a chess username has completed onboarding."""
    username = (request.args.get('username') or '').strip().lower()
    if not username:
        return jsonify({'onboarding_done': False, 'preferred_time_class': None})

    with get_db() as conn:
        cursor = conn.execute(
            'SELECT onboarding_done, preferred_time_class FROM chess_user_prefs WHERE username = ?',
            (username,)
        )
        row = cursor.fetchone()

    return jsonify({
        'onboarding_done': bool(row and row['onboarding_done']),
        'preferred_time_class': row['preferred_time_class'] if row else None,
    })


@chess_bp.route('/api/chess/onboarding', methods=['POST'])
def save_chess_onboarding():
    """Save onboarding status and preferences for a chess username."""
    data = request.get_json() or {}
    username = (data.get('username') or '').strip().lower()
    if not username:
        return jsonify({'error': 'username required'}), 400

    preferred_time_class = data.get('preferred_time_class')

    with get_db() as conn:
        if preferred_time_class:
            conn.execute('''
                INSERT INTO chess_user_prefs (username, onboarding_done, preferred_time_class, updated_at)
                VALUES (?, 1, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(username) DO UPDATE SET
                    onboarding_done = 1,
                    preferred_time_class = excluded.preferred_time_class,
                    updated_at = CURRENT_TIMESTAMP
            ''', (username, preferred_time_class))
        else:
            conn.execute('''
                INSERT INTO chess_user_prefs (username, onboarding_done, updated_at)
                VALUES (?, 1, CURRENT_TIMESTAMP)
                ON CONFLICT(username) DO UPDATE SET
                    onboarding_done = 1,
                    updated_at = CURRENT_TIMESTAMP
            ''', (username,))

    return jsonify({'success': True})


@chess_bp.route('/api/chess/clear-cache', methods=['DELETE'])
def chess_clear_cache():
    """Clear server-side cache for a chess username (admin/dev only)."""
    username = (request.args.get('username') or '').strip().lower()
    if not username or username != 'akyrosu':
        return jsonify({'error': 'not allowed'}), 403

    with get_db() as conn:
        conn.execute('DELETE FROM player_stats_cache WHERE username = ?', (username,))
        conn.execute('DELETE FROM monthly_archive_cache WHERE username = ?', (username,))
        conn.execute('DELETE FROM chess_user_prefs WHERE username = ?', (username,))
        conn.execute('DELETE FROM chess_goals WHERE username = ?', (username,))

    return jsonify({'success': True})
