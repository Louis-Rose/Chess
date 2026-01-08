# backend/app.py
import os
import hashlib
from datetime import datetime
from flask import Flask, jsonify, request, Response, make_response
from flask_cors import CORS
from dotenv import load_dotenv
import utils
from database import get_db, init_db, get_all_cached_stats, save_all_cached_stats
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
            'is_admin': bool(user.get('is_admin')),
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
    with get_db() as conn:
        conn.execute('''
            INSERT INTO user_activity (user_id, activity_date, minutes, last_ping)
            VALUES (?, ?, 1, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, activity_date) DO UPDATE SET
                minutes = minutes + 1,
                last_ping = CURRENT_TIMESTAMP
        ''', (request.user_id, today))
    return jsonify({'success': True})


# ============= ADMIN ROUTES =============

@app.route('/api/admin/users', methods=['GET'])
@admin_required
def list_users():
    """List all registered users (admin only)."""
    # Hidden accounts (still functional, just not displayed)
    hidden_emails = ['rose.louis.mail@gmail.com', 'u6965441974@gmail.com']

    with get_db() as conn:
        cursor = conn.execute('''
            SELECT u.id, u.email, u.name, u.picture, u.is_admin, u.created_at, u.updated_at,
                   COALESCE(SUM(a.minutes), 0) as total_minutes,
                   MAX(a.last_ping) as last_active,
                   (SELECT COUNT(*) FROM graph_downloads g WHERE g.user_id = u.id) as graph_downloads
            FROM users u
            LEFT JOIN user_activity a ON u.id = a.user_id
            GROUP BY u.id
            ORDER BY u.created_at DESC
        ''')
        users = [dict(row) for row in cursor.fetchall() if row['email'] not in hidden_emails]

        # Add portfolio value for each user
        for user in users:
            cursor = conn.execute('''
                SELECT SUM(quantity) as total_qty, stock_ticker
                FROM portfolio_transactions
                WHERE user_id = ? AND transaction_type = 'BUY'
                GROUP BY stock_ticker
            ''', (user['id'],))
            has_portfolio = cursor.fetchone() is not None
            user['has_portfolio'] = has_portfolio

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

    return jsonify({'user': dict(user)})


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
    """Get a user's portfolio composition (admin only)."""
    holdings = compute_holdings_from_transactions(user_id)

    if not holdings:
        return jsonify({
            'holdings': [],
            'total_value_usd': 0,
            'total_value_eur': 0,
        })

    try:
        composition = compute_portfolio_composition(holdings)
        return jsonify(composition)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


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
    fetch_stock_price, get_previous_weekday, set_db_getter, get_news_feed_videos
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
                      pt.transaction_date, pt.price_per_share, pt.account_id,
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

    # Fetch historical price at transaction date
    try:
        price_per_share = fetch_stock_price(stock_ticker, transaction_date)
    except Exception as e:
        return jsonify({'error': f'Could not fetch price for {stock_ticker} on {transaction_date}: {str(e)}'}), 400

    with get_db() as conn:
        cursor = conn.execute('''
            INSERT INTO portfolio_transactions (user_id, account_id, stock_ticker, transaction_type, quantity, transaction_date, price_per_share)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', (request.user_id, account_id, stock_ticker, transaction_type, quantity, transaction_date, price_per_share))
        transaction_id = cursor.lastrowid

    return jsonify({
        'success': True,
        'id': transaction_id,
        'account_id': account_id,
        'stock_ticker': stock_ticker,
        'transaction_type': transaction_type,
        'quantity': quantity,
        'transaction_date': transaction_date,
        'price_per_share': price_per_share
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


def compute_holdings_from_transactions(user_id, account_id=None):
    """Helper to compute current holdings from transactions using FIFO.
    Tracks both USD and EUR cost basis (EUR uses historical rates at transaction time).
    Optionally filters by account_id.
    """
    from investing_utils import fetch_eurusd_rate

    with get_db() as conn:
        if account_id:
            cursor = conn.execute(
                '''SELECT stock_ticker, transaction_type, quantity, transaction_date, price_per_share
                   FROM portfolio_transactions WHERE user_id = ? AND account_id = ?
                   ORDER BY transaction_date ASC, id ASC''',
                (user_id, account_id)
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


def compute_realized_gains(user_id, account_id=None):
    """Calculate realized gains using FIFO with historical EUR rates.
    Returns both USD and EUR realized gains.
    Optionally filters by account_id.
    """
    from investing_utils import fetch_eurusd_rate

    with get_db() as conn:
        if account_id:
            cursor = conn.execute(
                '''SELECT stock_ticker, transaction_type, quantity, transaction_date, price_per_share
                   FROM portfolio_transactions WHERE user_id = ? AND account_id = ?
                   ORDER BY transaction_date ASC, id ASC''',
                (user_id, account_id)
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
    account_id = request.args.get('account_id', type=int)
    holdings = compute_holdings_from_transactions(request.user_id, account_id)

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
        realized = compute_realized_gains(request.user_id, account_id)
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
    account_id = request.args.get('account_id', type=int)

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

    # Get all transactions (filtered by account if specified)
    with get_db() as conn:
        if account_id:
            cursor = conn.execute(
                '''SELECT stock_ticker, transaction_type, quantity, transaction_date, price_per_share
                   FROM portfolio_transactions WHERE user_id = ? AND account_id = ?
                   ORDER BY transaction_date ASC''',
                (request.user_id, account_id)
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

    tickers_param = request.args.get('tickers', '')
    if not tickers_param:
        return jsonify({'error': 'No tickers provided'}), 400

    tickers = [t.strip().upper() for t in tickers_param.split(',') if t.strip()]
    if not tickers:
        return jsonify({'error': 'No valid tickers provided'}), 400

    results = {}
    for ticker in tickers:
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            market_cap = info.get('marketCap')
            name = info.get('shortName') or info.get('longName') or ticker

            results[ticker] = {
                'ticker': ticker,
                'name': name,
                'market_cap': market_cap,
                'trailing_pe': info.get('trailingPE'),
                'forward_pe': info.get('forwardPE'),
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

    ticker = ticker.upper()
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
        stock = yf.Ticker(ticker)
        hist = stock.history(period=config['period'], interval=config['interval'])

        if hist.empty:
            return jsonify({'error': 'No data available'}), 404

        # Get previous close for reference line
        info = stock.info
        previous_close = info.get('previousClose') or info.get('regularMarketPreviousClose')

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
        ''', (request.user_id, name, account_type, bank))
        account_id = cursor.lastrowid

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

        updated_at = datetime.fromisoformat(row['updated_at'])
        age_hours = (datetime.now() - updated_at).total_seconds() / 3600

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
        holdings = compute_holdings_from_transactions(request.user_id, account_id)
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
    """Get YouTube news feed videos, optionally filtered by ticker."""
    ticker = request.args.get('ticker')
    limit = request.args.get('limit', 50, type=int)

    api_key = os.environ.get('YOUTUBE_API_KEY')

    try:
        result = get_news_feed_videos(get_db, api_key, ticker=ticker, limit=limit)
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
                view_count = view_count + 1,
                time_spent_seconds = time_spent_seconds + excluded.time_spent_seconds,
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