"""Admin routes blueprint — analytics, user management, and maintenance endpoints."""

import logging

from flask import Blueprint, jsonify, request

from auth import admin_required
from database import get_db, USE_POSTGRES

logger = logging.getLogger(__name__)

admin_bp = Blueprint('admin', __name__)


# ── Gemini pricing per 1M tokens (USD) ──
GEMINI_PRICING = {
    'gemini-3-flash-preview':         {'input': 0.10, 'output': 0.40},
    'gemini-3.1-pro-preview':         {'input': 1.25, 'output': 10.00},
    'gemini-3.1-flash-lite-preview':  {'input': 0.02, 'output': 0.10},
    'gemini-2.0-flash':               {'input': 0.10, 'output': 0.40},
}

EXCLUDED_CHESS_TESTERS = ('akyrosu', 'pingu-dav', 'remi75014', 'pengumasc', 'augustincbs', 'lau_tiny')


# ──────────────────────────────────────────────────────────────────────
#  Settings / preference stats
# ──────────────────────────────────────────────────────────────────────

@admin_bp.route('/api/admin/theme-stats', methods=['GET'])
@admin_required
def get_theme_stats():
    """Get theme usage statistics (admin only). Excludes admin users."""
    with get_db() as conn:
        # Get counts by resolved theme (actual display) - exclude admins
        cursor = conn.execute('''
            SELECT t.resolved_theme, COUNT(*) as count
            FROM theme_usage t
            INNER JOIN users u ON t.user_id = u.id
            WHERE u.is_admin = 0 AND u.google_id NOT LIKE 'chess:%'
            GROUP BY t.resolved_theme
        ''')
        by_resolved = {row['resolved_theme']: row['count'] for row in cursor.fetchall()}

        # Get counts by theme setting (includes 'system') - exclude admins
        cursor = conn.execute('''
            SELECT t.theme, COUNT(*) as count
            FROM theme_usage t
            INNER JOIN users u ON t.user_id = u.id
            WHERE u.is_admin = 0 AND u.google_id NOT LIKE 'chess:%'
            GROUP BY t.theme
        ''')
        by_setting = {row['theme']: row['count'] for row in cursor.fetchall()}

        # Get total users with theme data - exclude admins
        cursor = conn.execute('''
            SELECT COUNT(*) as total
            FROM theme_usage t
            INNER JOIN users u ON t.user_id = u.id
            WHERE u.is_admin = 0 AND u.google_id NOT LIKE 'chess:%'
        ''')
        total = cursor.fetchone()['total']

    return jsonify({
        'total': total,
        'by_resolved': by_resolved,
        'by_setting': by_setting
    })


@admin_bp.route('/api/admin/language-stats', methods=['GET'])
@admin_required
def get_language_stats():
    """Get language usage statistics (admin only). Excludes admin users."""
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT l.language, COUNT(*) as count
            FROM language_usage l
            INNER JOIN users u ON l.user_id = u.id
            WHERE u.is_admin = 0 AND u.google_id NOT LIKE 'chess:%'
            GROUP BY l.language
        ''')
        by_language = {row['language']: row['count'] for row in cursor.fetchall()}

        cursor = conn.execute('''
            SELECT COUNT(*) as total
            FROM language_usage l
            INNER JOIN users u ON l.user_id = u.id
            WHERE u.is_admin = 0 AND u.google_id NOT LIKE 'chess:%'
        ''')
        total = cursor.fetchone()['total']

    return jsonify({
        'total': total,
        'by_language': by_language
    })


@admin_bp.route('/api/admin/device-stats', methods=['GET'])
@admin_required
def get_device_stats():
    """Get device type usage statistics (admin only). Excludes admin users."""
    with get_db() as conn:
        # Get total seconds per device type - exclude admins
        cursor = conn.execute('''
            SELECT d.device_type, SUM(d.seconds) as total_seconds
            FROM device_usage d
            INNER JOIN users u ON d.user_id = u.id
            WHERE u.is_admin = 0 AND u.google_id NOT LIKE 'chess:%'
            GROUP BY d.device_type
        ''')
        by_device = {row['device_type']: row['total_seconds'] for row in cursor.fetchall()}

        # Get total users with device data - exclude admins
        cursor = conn.execute('''
            SELECT COUNT(DISTINCT d.user_id) as total
            FROM device_usage d
            INNER JOIN users u ON d.user_id = u.id
            WHERE u.is_admin = 0 AND u.google_id NOT LIKE 'chess:%'
        ''')
        total = cursor.fetchone()['total']

        # Calculate total seconds for percentage
        total_seconds = sum(by_device.values())

    return jsonify({
        'total': total,
        'total_seconds': total_seconds,
        'by_device': by_device
    })


@admin_bp.route('/api/admin/users-by-theme/<theme>', methods=['GET'])
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
            WHERE t.resolved_theme = ? AND u.is_admin = 0 AND u.google_id NOT LIKE ?
            ORDER BY u.name
        ''', (theme, 'chess:%'))
        users = [{'id': row['id'], 'name': row['name'], 'picture': row['picture']} for row in cursor.fetchall()]

    return jsonify({'users': users})


@admin_bp.route('/api/admin/users-by-language/<lang>', methods=['GET'])
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
            WHERE l.language = ? AND u.is_admin = 0 AND u.google_id NOT LIKE ?
            ORDER BY u.name
        ''', (lang, 'chess:%'))
        users = [{'id': row['id'], 'name': row['name'], 'picture': row['picture']} for row in cursor.fetchall()]

    return jsonify({'users': users})


@admin_bp.route('/api/admin/users-by-device/<device>', methods=['GET'])
@admin_required
def get_users_by_device(device):
    """Get list of users with a specific device type (admin only). Excludes admin users."""
    if device not in ('mobile', 'desktop'):
        return jsonify({'error': 'Invalid device type'}), 400

    with get_db() as conn:
        cursor = conn.execute('''
            SELECT u.id, u.name, u.picture, d.seconds
            FROM users u
            INNER JOIN device_usage d ON u.id = d.user_id
            WHERE d.device_type = ? AND u.is_admin = 0 AND u.google_id NOT LIKE ?
            ORDER BY d.seconds DESC
        ''', (device, 'chess:%'))
        users = [{'id': row['id'], 'name': row['name'], 'picture': row['picture'], 'seconds': row['seconds']} for row in cursor.fetchall()]

    return jsonify({'users': users})


@admin_bp.route('/api/admin/settings-crosstab', methods=['GET'])
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
                COALESCE(SUM(u.total_seconds), 0) as total_seconds
            FROM theme_usage t
            INNER JOIN language_usage l ON t.user_id = l.user_id
            INNER JOIN users usr ON t.user_id = usr.id
            LEFT JOIN (
                SELECT user_id, SUM(seconds) as total_seconds
                FROM user_activity
                GROUP BY user_id
            ) u ON t.user_id = u.user_id
            WHERE usr.google_id NOT LIKE 'chess:%'
            GROUP BY t.resolved_theme, l.language
        ''')

        results = cursor.fetchall()

        # Build crosstab data
        crosstab = {}
        total_seconds = 0
        total_users = 0

        for row in results:
            theme = row['resolved_theme']
            lang = row['language']
            secs = row['total_seconds']
            users = row['user_count']

            key = f"{theme}_{lang}"
            crosstab[key] = {
                'users': users,
                'seconds': secs
            }
            total_seconds += secs
            total_users += users

    return jsonify({
        'crosstab': crosstab,
        'total_seconds': total_seconds,
        'total_users': total_users
    })


# ──────────────────────────────────────────────────────────────────────
#  User listing
# ──────────────────────────────────────────────────────────────────────

@admin_bp.route('/api/admin/users', methods=['GET'])
@admin_required
def list_users():
    """List all registered users (admin only)."""
    # Hidden accounts (still functional, just not displayed)
    hidden_emails = []  # No hidden accounts

    with get_db() as conn:
        cursor = conn.execute('''
            SELECT u.id, u.email, u.name, u.picture, u.is_admin, u.created_at, u.updated_at, u.sign_in_count, u.session_count,
                   COALESCE(SUM(a.seconds), 0) as total_seconds,
                   MAX(a.last_ping) as last_active,
                   (SELECT COUNT(*) FROM graph_downloads g WHERE g.user_id = u.id) as graph_downloads,
                   (SELECT COUNT(*) FROM investment_accounts ia WHERE ia.user_id = u.id) as account_count,
                   (SELECT COUNT(DISTINCT stock_ticker) FROM portfolio_transactions pt WHERE pt.user_id = u.id) as portfolio_companies,
                   (SELECT COUNT(DISTINCT stock_ticker) FROM watchlist w WHERE w.user_id = u.id) as watchlist_companies
            FROM users u
            LEFT JOIN user_activity a ON u.id = a.user_id
            WHERE u.google_id NOT LIKE 'chess:%'
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
                user['last_active'] = user['last_active'].isoformat() + 'Z'
            users.append(user)

    return jsonify({'users': users, 'total': len(users)})


@admin_bp.route('/api/admin/coach-users', methods=['GET'])
@admin_required
def list_coach_users():
    """List users who registered via the coaches app (admin only)."""
    # Only count activity from when the coaches app launched
    COACHES_LAUNCH_DATE = '2026-03-23'
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT u.id, u.email, u.name, u.picture, u.is_admin,
                   CASE WHEN u.created_at < ? THEN ? ELSE u.created_at END as created_at,
                   u.updated_at, u.sign_in_count,
                   COALESCE(SUM(a.seconds), 0) as total_seconds,
                   MAX(a.last_ping) as last_active,
                   COUNT(a.id) as session_count
            FROM users u
            LEFT JOIN user_activity a ON u.id = a.user_id AND a.activity_date >= ?
            WHERE u.registered_app = 'coaches'
            GROUP BY u.id
            ORDER BY u.created_at DESC
        ''', (COACHES_LAUNCH_DATE, COACHES_LAUNCH_DATE, COACHES_LAUNCH_DATE))
        users = []
        for row in cursor.fetchall():
            user = dict(row)
            if user.get('created_at') and hasattr(user['created_at'], 'isoformat'):
                user['created_at'] = user['created_at'].isoformat()
            if user.get('updated_at') and hasattr(user['updated_at'], 'isoformat'):
                user['updated_at'] = user['updated_at'].isoformat()
            if user.get('last_active') and hasattr(user['last_active'], 'isoformat'):
                user['last_active'] = user['last_active'].isoformat() + 'Z'
            users.append(user)

    return jsonify({'users': users, 'total': len(users)})


@admin_bp.route('/api/admin/coach-time-spent', methods=['GET'])
@admin_required
def get_coach_time_spent():
    """Get daily time spent stats for coaches app users only (from launch date)."""
    COACHES_LAUNCH_DATE = '2026-03-23'
    exclude_user_id = request.args.get('exclude_user_id', type=int)
    with get_db() as conn:
        if exclude_user_id:
            cursor = conn.execute('''
                SELECT a.activity_date, SUM(a.seconds) as total_seconds
                FROM user_activity a
                JOIN users u ON a.user_id = u.id
                WHERE u.registered_app = 'coaches' AND a.activity_date >= ? AND u.id != ?
                GROUP BY a.activity_date
                ORDER BY a.activity_date ASC
            ''', (COACHES_LAUNCH_DATE, exclude_user_id))
        else:
            cursor = conn.execute('''
                SELECT a.activity_date, SUM(a.seconds) as total_seconds
                FROM user_activity a
                JOIN users u ON a.user_id = u.id
                WHERE u.registered_app = 'coaches' AND a.activity_date >= ?
                GROUP BY a.activity_date
                ORDER BY a.activity_date ASC
            ''', (COACHES_LAUNCH_DATE,))
        daily_stats = [dict(row) for row in cursor.fetchall()]

    return jsonify({'daily_stats': daily_stats})


# ──────────────────────────────────────────────────────────────────────
#  API usage / Gemini costs
# ──────────────────────────────────────────────────────────────────────

@admin_bp.route('/api/admin/api-usage', methods=['GET'])
@admin_required
def get_api_usage():
    """Get Gemini API usage history with cost breakdown."""
    with get_db() as conn:
        # Per-call history (most recent first, cap at 200)
        cursor = conn.execute('''
            SELECT id, feature, model_id, input_tokens, output_tokens,
                   elapsed_seconds, error, created_at
            FROM api_usage
            ORDER BY created_at DESC
            LIMIT 200
        ''')
        rows = [dict(r) for r in cursor.fetchall()]

        # Per-model aggregates
        cursor = conn.execute('''
            SELECT model_id,
                   COUNT(*) as call_count,
                   SUM(input_tokens) as total_input,
                   SUM(output_tokens) as total_output,
                   SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) as error_count,
                   AVG(elapsed_seconds) as avg_elapsed
            FROM api_usage
            GROUP BY model_id
            ORDER BY call_count DESC
        ''')
        by_model = []
        for r in cursor.fetchall():
            row = dict(r)
            pricing = GEMINI_PRICING.get(row['model_id'], {'input': 0, 'output': 0})
            row['cost_usd'] = round(
                (row['total_input'] or 0) * pricing['input'] / 1_000_000
                + (row['total_output'] or 0) * pricing['output'] / 1_000_000,
                6,
            )
            row['avg_elapsed'] = round(row['avg_elapsed'] or 0, 1)
            by_model.append(row)

        # Per-feature aggregates
        cursor = conn.execute('''
            SELECT feature, COUNT(*) as call_count,
                   SUM(input_tokens) as total_input,
                   SUM(output_tokens) as total_output
            FROM api_usage
            GROUP BY feature
        ''')
        by_feature = [dict(r) for r in cursor.fetchall()]

    # Compute total cost
    total_cost = sum(m['cost_usd'] for m in by_model)

    return jsonify({
        'history': rows,
        'by_model': by_model,
        'by_feature': by_feature,
        'total_cost_usd': round(total_cost, 6),
        'pricing': GEMINI_PRICING,
    })


# ──────────────────────────────────────────────────────────────────────
#  Chess user analytics
# ──────────────────────────────────────────────────────────────────────

@admin_bp.route('/api/admin/chess-users', methods=['GET'])
@admin_required
def get_chess_users():
    """Get chess user statistics (admin only)."""
    placeholders = ','.join(['?' for _ in EXCLUDED_CHESS_TESTERS])

    with get_db() as conn:
        cursor = conn.execute(f'''
            SELECT LOWER(u.name) as chess_username,
                   COALESCE(SUM(a.seconds), 0) as total_seconds,
                   MAX(a.last_ping) as last_active,
                   u.session_count,
                   u.created_at
            FROM users u
            LEFT JOIN user_activity a ON u.id = a.user_id
            WHERE u.google_id LIKE ?
              AND LOWER(u.name) NOT IN ({placeholders})
            GROUP BY u.id, u.name, u.session_count, u.created_at
            ORDER BY total_seconds DESC
        ''', ('chess:%', *EXCLUDED_CHESS_TESTERS))
        users = []
        for row in cursor.fetchall():
            user = dict(row)
            if user.get('last_active') and hasattr(user['last_active'], 'isoformat'):
                user['last_active'] = user['last_active'].isoformat() + 'Z'
            if user.get('created_at') and hasattr(user['created_at'], 'isoformat'):
                user['created_at'] = user['created_at'].isoformat()
            users.append(user)

    return jsonify({'users': users})


@admin_bp.route('/api/admin/chess-time-spent', methods=['GET'])
@admin_required
def get_chess_time_spent_stats():
    """Get daily time spent stats for chess users only (admin only)."""
    placeholders = ','.join(['?' for _ in EXCLUDED_CHESS_TESTERS])

    with get_db() as conn:
        cursor = conn.execute(f'''
            SELECT a.activity_date, SUM(a.seconds) as total_seconds
            FROM user_activity a
            JOIN users u ON a.user_id = u.id
            WHERE u.google_id LIKE ?
              AND LOWER(u.name) NOT IN ({placeholders})
            GROUP BY a.activity_date
            ORDER BY a.activity_date ASC
        ''', ('chess:%', *EXCLUDED_CHESS_TESTERS))
        daily_stats = [dict(row) for row in cursor.fetchall()]

    return jsonify({'daily_stats': daily_stats})


@admin_bp.route('/api/admin/chess-time-spent/<period>', methods=['GET'])
@admin_required
def get_chess_time_spent_details(period):
    """Get chess users' time spent for a specific period (admin only)."""
    tester_placeholders = ','.join(['?' for _ in EXCLUDED_CHESS_TESTERS])
    chess_filter = f"AND u.google_id LIKE ? AND LOWER(u.name) NOT IN ({tester_placeholders})"

    with get_db() as conn:
        if '-W' in period:
            year, week = period.split('-W')
            if USE_POSTGRES:
                cursor = conn.execute(f'''
                    SELECT LOWER(u.name) as name, SUM(a.seconds) as seconds
                    FROM user_activity a
                    JOIN users u ON a.user_id = u.id
                    WHERE EXTRACT(YEAR FROM a.activity_date::date) = %s
                      AND EXTRACT(WEEK FROM a.activity_date::date) = %s
                      {chess_filter}
                    GROUP BY LOWER(u.name)
                    ORDER BY seconds DESC
                ''', (int(year), int(week), 'chess:%', *EXCLUDED_CHESS_TESTERS))
            else:
                cursor = conn.execute(f'''
                    SELECT LOWER(u.name) as name, SUM(a.seconds) as seconds
                    FROM user_activity a
                    JOIN users u ON a.user_id = u.id
                    WHERE strftime('%Y', a.activity_date) = ?
                      AND CAST(strftime('%W', a.activity_date) AS INTEGER) + 1 = ?
                      {chess_filter}
                    GROUP BY LOWER(u.name)
                    ORDER BY seconds DESC
                ''', (year, int(week), 'chess:%', *EXCLUDED_CHESS_TESTERS))
        elif len(period) == 7:
            if USE_POSTGRES:
                cursor = conn.execute(f'''
                    SELECT LOWER(u.name) as name, SUM(a.seconds) as seconds
                    FROM user_activity a
                    JOIN users u ON a.user_id = u.id
                    WHERE to_char(a.activity_date::date, 'YYYY-MM') = %s
                      {chess_filter}
                    GROUP BY LOWER(u.name)
                    ORDER BY seconds DESC
                ''', (period, 'chess:%', *EXCLUDED_CHESS_TESTERS))
            else:
                cursor = conn.execute(f'''
                    SELECT LOWER(u.name) as name, SUM(a.seconds) as seconds
                    FROM user_activity a
                    JOIN users u ON a.user_id = u.id
                    WHERE strftime('%Y-%m', a.activity_date) = ?
                      {chess_filter}
                    GROUP BY LOWER(u.name)
                    ORDER BY seconds DESC
                ''', (period, 'chess:%', *EXCLUDED_CHESS_TESTERS))
        else:
            if USE_POSTGRES:
                cursor = conn.execute(f'''
                    SELECT LOWER(u.name) as name, SUM(a.seconds) as seconds
                    FROM user_activity a
                    JOIN users u ON a.user_id = u.id
                    WHERE a.activity_date = %s
                      {chess_filter}
                    GROUP BY LOWER(u.name)
                    ORDER BY seconds DESC
                ''', (period, 'chess:%', *EXCLUDED_CHESS_TESTERS))
            else:
                cursor = conn.execute(f'''
                    SELECT LOWER(u.name) as name, SUM(a.seconds) as seconds
                    FROM user_activity a
                    JOIN users u ON a.user_id = u.id
                    WHERE a.activity_date = ?
                      {chess_filter}
                    GROUP BY LOWER(u.name)
                    ORDER BY seconds DESC
                ''', (period, 'chess:%', *EXCLUDED_CHESS_TESTERS))

        users = [dict(row) for row in cursor.fetchall()]

    return jsonify({'users': users, 'period': period})


@admin_bp.route('/api/admin/chess-page-breakdown', methods=['GET'])
@admin_required
def get_chess_page_breakdown():
    """Get aggregated time spent by page/section for chess users only (admin only)."""
    placeholders = ','.join(['?' for _ in EXCLUDED_CHESS_TESTERS])

    with get_db() as conn:
        cursor = conn.execute(f'''
            SELECT p.page, SUM(p.seconds) as total_seconds
            FROM page_activity p
            JOIN users u ON p.user_id = u.id
            WHERE u.google_id LIKE ?
              AND LOWER(u.name) NOT IN ({placeholders})
            GROUP BY p.page
            ORDER BY total_seconds DESC
        ''', ('chess:%', *EXCLUDED_CHESS_TESTERS))

        breakdown = [dict(row) for row in cursor.fetchall()]
        total = sum(item['total_seconds'] for item in breakdown)

    return jsonify({
        'breakdown': breakdown,
        'total_seconds': total
    })


# ──────────────────────────────────────────────────────────────────────
#  Per-user detail routes
# ──────────────────────────────────────────────────────────────────────

@admin_bp.route('/api/admin/users/<int:user_id>/activity', methods=['GET'])
@admin_required
def get_user_activity(user_id):
    """Get daily activity breakdown for a user (admin only)."""
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT activity_date, seconds
            FROM user_activity
            WHERE user_id = ?
            ORDER BY activity_date DESC
        ''', (user_id,))
        activity = [dict(row) for row in cursor.fetchall()]

    return jsonify({'activity': activity})


@admin_bp.route('/api/admin/users/<int:user_id>/accounts', methods=['GET'])
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


@admin_bp.route('/api/admin/users/<int:user_id>', methods=['GET'])
@admin_required
def get_user_detail(user_id):
    """Get detailed info for a specific user (admin only)."""
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT u.id, u.email, u.name, u.picture, u.is_admin, u.created_at, u.updated_at,
                   COALESCE(SUM(a.seconds), 0) as total_seconds,
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
        user_dict['last_active'] = user_dict['last_active'].isoformat() + 'Z'

    return jsonify({'user': user_dict})


@admin_bp.route('/api/admin/users/<int:user_id>/watchlist', methods=['GET'])
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


@admin_bp.route('/api/admin/users/<int:user_id>/portfolio', methods=['GET'])
@admin_required
def get_user_portfolio(user_id):
    """Get a user's portfolio composition grouped by account (admin only)."""
    # Local imports to avoid circular dependencies
    from blueprints.investing import compute_holdings_from_transactions
    from investing_utils import compute_portfolio_composition

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
        holdings = compute_holdings_from_transactions(user_id, [account['id']])
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


@admin_bp.route('/api/admin/users/<int:user_id>/graph-downloads', methods=['GET'])
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


@admin_bp.route('/api/admin/users/<int:user_id>/stock-views', methods=['GET'])
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


# ──────────────────────────────────────────────────────────────────────
#  Video sync status
# ──────────────────────────────────────────────────────────────────────

@admin_bp.route('/api/admin/sync-status', methods=['GET'])
@admin_required
def get_sync_status():
    """Get current and recent sync run status (admin only)."""
    with get_db() as conn:
        # Mark stale runs (running but no heartbeat in 2+ minutes)
        if USE_POSTGRES:
            conn.execute('''
                UPDATE video_sync_runs
                SET status = 'stale', ended_at = CURRENT_TIMESTAMP,
                    error_message = 'No heartbeat received (sync script likely crashed)'
                WHERE status = 'running'
                AND updated_at < CURRENT_TIMESTAMP - INTERVAL '2 minutes'
            ''')
        else:
            conn.execute('''
                UPDATE video_sync_runs
                SET status = 'stale', ended_at = CURRENT_TIMESTAMP,
                    error_message = 'No heartbeat received (sync script likely crashed)'
                WHERE status = 'running'
                AND updated_at < datetime('now', '-2 minutes')
            ''')

        # Get current/most recent runs
        cursor = conn.execute('''
            SELECT * FROM video_sync_runs
            ORDER BY started_at DESC
            LIMIT 5
        ''')
        runs = [dict(row) for row in cursor.fetchall()]

    return jsonify({'runs': runs})


@admin_bp.route('/api/admin/sync-run/<int:run_id>', methods=['DELETE'])
@admin_required
def delete_sync_run(run_id):
    """Delete or stop a sync run (admin only)."""
    with get_db() as conn:
        # Check if it's running - if so, mark as interrupted instead of deleting
        if USE_POSTGRES:
            cursor = conn.execute('SELECT status FROM video_sync_runs WHERE id = %s', (run_id,))
        else:
            cursor = conn.execute('SELECT status FROM video_sync_runs WHERE id = ?', (run_id,))
        row = cursor.fetchone()

        if not row:
            return jsonify({'error': 'Run not found'}), 404

        if row['status'] == 'running':
            # Mark as interrupted (the script will check this and stop)
            if USE_POSTGRES:
                conn.execute('''
                    UPDATE video_sync_runs
                    SET status = 'interrupted', ended_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                ''', (run_id,))
            else:
                conn.execute('''
                    UPDATE video_sync_runs
                    SET status = 'interrupted', ended_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ''', (run_id,))
            return jsonify({'success': True, 'action': 'interrupted'})
        else:
            # Delete the record
            if USE_POSTGRES:
                conn.execute('DELETE FROM video_sync_runs WHERE id = %s', (run_id,))
            else:
                conn.execute('DELETE FROM video_sync_runs WHERE id = ?', (run_id,))
            return jsonify({'success': True, 'action': 'deleted'})


# ──────────────────────────────────────────────────────────────────────
#  Stock views & company stats
# ──────────────────────────────────────────────────────────────────────

@admin_bp.route('/api/admin/stock-views', methods=['GET'])
@admin_required
def get_stock_views_stats():
    """Get aggregated stock view statistics (admin only)."""
    excluded_email = 'rose.louis.mail@gmail.com'

    with get_db() as conn:
        # Get aggregated stats by stock (exclude admin)
        cursor = conn.execute('''
            SELECT sv.stock_ticker,
                   COUNT(DISTINCT sv.user_id) as unique_users,
                   SUM(sv.view_count) as total_views,
                   SUM(sv.time_spent_seconds) as total_time_seconds
            FROM stock_views sv
            JOIN users u ON sv.user_id = u.id
            WHERE u.email != ?
            GROUP BY sv.stock_ticker
            ORDER BY total_views DESC
        ''', (excluded_email,))
        by_stock = [dict(row) for row in cursor.fetchall()]

        # Get stats by user (exclude admin)
        cursor = conn.execute('''
            SELECT u.id, u.name, u.email,
                   COUNT(DISTINCT sv.stock_ticker) as stocks_viewed,
                   SUM(sv.view_count) as total_views,
                   SUM(sv.time_spent_seconds) as total_time_seconds
            FROM stock_views sv
            JOIN users u ON sv.user_id = u.id
            WHERE u.email != ?
            GROUP BY u.id
            ORDER BY total_views DESC
        ''', (excluded_email,))
        by_user = [dict(row) for row in cursor.fetchall()]

    return jsonify({
        'by_stock': by_stock,
        'by_user': by_user
    })


@admin_bp.route('/api/admin/company-stats', methods=['GET'])
@admin_required
def get_company_stats():
    """Get company popularity stats - how many portfolios/watchlists each ticker appears in."""
    with get_db() as conn:
        # Get portfolio counts by ticker
        cursor = conn.execute('''
            SELECT pt.stock_ticker as ticker, COUNT(DISTINCT pt.user_id) as portfolio_count
            FROM portfolio_transactions pt
            GROUP BY pt.stock_ticker
        ''')
        portfolio_counts = {row['ticker']: row['portfolio_count'] for row in cursor.fetchall()}

        # Get watchlist counts by ticker
        cursor = conn.execute('''
            SELECT w.stock_ticker as ticker, COUNT(DISTINCT w.user_id) as watchlist_count
            FROM watchlist w
            GROUP BY w.stock_ticker
        ''')
        watchlist_counts = {row['ticker']: row['watchlist_count'] for row in cursor.fetchall()}

        # Combine all tickers
        all_tickers = set(portfolio_counts.keys()) | set(watchlist_counts.keys())
        companies = []
        for ticker in all_tickers:
            p_count = portfolio_counts.get(ticker, 0)
            w_count = watchlist_counts.get(ticker, 0)
            companies.append({
                'ticker': ticker,
                'portfolio_count': p_count,
                'watchlist_count': w_count,
                'total': p_count + w_count
            })

        # Sort by total (portfolio + watchlist) descending
        companies.sort(key=lambda x: x['total'], reverse=True)

    return jsonify({'companies': companies})


@admin_bp.route('/api/admin/company-stats/<ticker>', methods=['GET'])
@admin_required
def get_company_users(ticker):
    """Get users who have this ticker in their portfolio or watchlist."""
    with get_db() as conn:
        # Get users with this ticker in portfolio
        cursor = conn.execute('''
            SELECT DISTINCT u.id, u.name, u.picture
            FROM users u
            JOIN portfolio_transactions pt ON u.id = pt.user_id
            WHERE pt.stock_ticker = ?
            ORDER BY u.name
        ''', (ticker,))
        portfolio_users = [dict(row) for row in cursor.fetchall()]

        # Get users with this ticker in watchlist
        cursor = conn.execute('''
            SELECT DISTINCT u.id, u.name, u.picture
            FROM users u
            JOIN watchlist w ON u.id = w.user_id
            WHERE w.stock_ticker = ?
            ORDER BY u.name
        ''', (ticker,))
        watchlist_users = [dict(row) for row in cursor.fetchall()]

    return jsonify({
        'ticker': ticker,
        'portfolio_users': portfolio_users,
        'watchlist_users': watchlist_users
    })


@admin_bp.route('/api/admin/stock-views/<ticker>', methods=['GET'])
@admin_required
def get_stock_views_detail(ticker):
    """Get detailed view statistics for a specific stock (admin only)."""
    with get_db() as conn:
        # Get all views for this stock by user
        cursor = conn.execute('''
            SELECT u.id, u.name, u.picture,
                   sv.view_date,
                   sv.view_count,
                   sv.time_spent_seconds,
                   sv.last_viewed_at
            FROM stock_views sv
            JOIN users u ON sv.user_id = u.id
            WHERE sv.stock_ticker = ?
            ORDER BY sv.view_date DESC
        ''', (ticker,))
        views = [dict(row) for row in cursor.fetchall()]

        # Get totals
        cursor = conn.execute('''
            SELECT COUNT(DISTINCT sv.user_id) as unique_users,
                   SUM(sv.view_count) as total_views,
                   SUM(sv.time_spent_seconds) as total_time_seconds
            FROM stock_views sv
            WHERE sv.stock_ticker = ?
        ''', (ticker,))
        totals = dict(cursor.fetchone())

    return jsonify({
        'ticker': ticker,
        'views': views,
        'totals': totals
    })


# ──────────────────────────────────────────────────────────────────────
#  Investing user analytics (time spent, page breakdown)
# ──────────────────────────────────────────────────────────────────────

@admin_bp.route('/api/admin/time-spent', methods=['GET'])
@admin_required
def get_time_spent_stats():
    """Get daily time spent stats for all users (admin only)."""
    excluded_email = 'rose.louis.mail@gmail.com'

    with get_db() as conn:
        cursor = conn.execute('''
            SELECT a.activity_date, SUM(a.seconds) as total_seconds
            FROM user_activity a
            JOIN users u ON a.user_id = u.id
            WHERE u.email != ? AND u.google_id NOT LIKE ?
            GROUP BY a.activity_date
            ORDER BY a.activity_date ASC
        ''', (excluded_email, 'chess:%'))
        daily_stats = [dict(row) for row in cursor.fetchall()]

    return jsonify({'daily_stats': daily_stats})


@admin_bp.route('/api/admin/time-spent/<period>', methods=['GET'])
@admin_required
def get_time_spent_details(period):
    """Get users' time spent for a specific date, week, or month (admin only).

    Period formats:
    - Date: YYYY-MM-DD
    - Week: YYYY-WXX
    - Month: YYYY-MM
    """
    excluded_email = 'rose.louis.mail@gmail.com'

    with get_db() as conn:
        if '-W' in period:
            # Week format: YYYY-WXX
            year, week = period.split('-W')
            if USE_POSTGRES:
                cursor = conn.execute('''
                    SELECT u.id, u.name, u.picture, SUM(a.seconds) as seconds
                    FROM user_activity a
                    JOIN users u ON a.user_id = u.id
                    WHERE EXTRACT(YEAR FROM a.activity_date::date) = %s
                      AND EXTRACT(WEEK FROM a.activity_date::date) = %s
                      AND u.email != %s AND u.google_id NOT LIKE 'chess:%%'
                    GROUP BY u.id, u.name, u.picture
                    ORDER BY seconds DESC
                ''', (int(year), int(week), excluded_email))
            else:
                cursor = conn.execute('''
                    SELECT u.id, u.name, u.picture, SUM(a.seconds) as seconds
                    FROM user_activity a
                    JOIN users u ON a.user_id = u.id
                    WHERE strftime('%Y', a.activity_date) = ?
                      AND CAST(strftime('%W', a.activity_date) AS INTEGER) + 1 = ?
                      AND u.email != ? AND u.google_id NOT LIKE ?
                    GROUP BY u.id
                    ORDER BY seconds DESC
                ''', (year, int(week), excluded_email, 'chess:%'))
        elif len(period) == 7:
            # Month format: YYYY-MM
            if USE_POSTGRES:
                cursor = conn.execute('''
                    SELECT u.id, u.name, u.picture, SUM(a.seconds) as seconds
                    FROM user_activity a
                    JOIN users u ON a.user_id = u.id
                    WHERE to_char(a.activity_date::date, 'YYYY-MM') = %s
                      AND u.email != %s AND u.google_id NOT LIKE 'chess:%%'
                    GROUP BY u.id, u.name, u.picture
                    ORDER BY seconds DESC
                ''', (period, excluded_email))
            else:
                cursor = conn.execute('''
                    SELECT u.id, u.name, u.picture, SUM(a.seconds) as seconds
                    FROM user_activity a
                    JOIN users u ON a.user_id = u.id
                    WHERE strftime('%Y-%m', a.activity_date) = ?
                      AND u.email != ? AND u.google_id NOT LIKE ?
                    GROUP BY u.id
                    ORDER BY seconds DESC
                ''', (period, excluded_email, 'chess:%'))
        else:
            # Date format: YYYY-MM-DD
            if USE_POSTGRES:
                cursor = conn.execute('''
                    SELECT u.id, u.name, u.picture, a.seconds
                    FROM user_activity a
                    JOIN users u ON a.user_id = u.id
                    WHERE a.activity_date = %s
                      AND u.email != %s AND u.google_id NOT LIKE 'chess:%%'
                    ORDER BY a.seconds DESC
                ''', (period, excluded_email))
            else:
                cursor = conn.execute('''
                    SELECT u.id, u.name, u.picture, a.seconds
                    FROM user_activity a
                    JOIN users u ON a.user_id = u.id
                    WHERE a.activity_date = ?
                      AND u.email != ? AND u.google_id NOT LIKE ?
                    ORDER BY a.seconds DESC
                ''', (period, excluded_email, 'chess:%'))

        users = [dict(row) for row in cursor.fetchall()]

    return jsonify({'users': users, 'period': period})


@admin_bp.route('/api/admin/page-breakdown', methods=['GET'])
@admin_required
def get_page_breakdown():
    """Get aggregated time spent by page/section (admin only)."""
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT p.page, SUM(p.seconds) as total_seconds
            FROM page_activity p
            JOIN users u ON p.user_id = u.id
            WHERE u.google_id NOT LIKE 'chess:%' AND u.email != 'rose.louis.mail@gmail.com'
            GROUP BY p.page
            ORDER BY total_seconds DESC
        ''')

        breakdown = [dict(row) for row in cursor.fetchall()]
        total = sum(item['total_seconds'] for item in breakdown)

    return jsonify({
        'breakdown': breakdown,
        'total_seconds': total
    })


# ──────────────────────────────────────────────────────────────────────
#  Maintenance / data management
# ──────────────────────────────────────────────────────────────────────

@admin_bp.route('/api/admin/clear-video-cache', methods=['POST'])
@admin_required
def clear_video_cache():
    """Clear YouTube video cache, channel fetch log, and company selections (admin only)."""
    with get_db() as conn:
        conn.execute('DELETE FROM youtube_videos_cache')
        conn.execute('DELETE FROM youtube_channel_fetch_log')
        conn.execute('DELETE FROM company_video_selections')
    return jsonify({'success': True, 'message': 'Video cache, fetch log, and company selections cleared.'})


@admin_bp.route('/api/admin/backfill-demo-portfolios', methods=['POST'])
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


@admin_bp.route('/api/admin/remove-demo-portfolios', methods=['POST'])
@admin_required
def remove_demo_portfolios():
    """Remove demo portfolios from all users (admin only)."""
    with get_db() as conn:
        # First, delete all transactions linked to demo portfolio accounts
        cursor = conn.execute('''
            DELETE FROM portfolio_transactions
            WHERE account_id IN (
                SELECT id FROM investment_accounts WHERE name = 'Demo Portfolio'
            )
        ''')
        transactions_deleted = cursor.rowcount

        # Then delete the demo portfolio accounts
        cursor = conn.execute('''
            DELETE FROM investment_accounts WHERE name = 'Demo Portfolio'
        ''')
        accounts_deleted = cursor.rowcount

    return jsonify({
        'success': True,
        'message': f'Removed {accounts_deleted} demo portfolios ({transactions_deleted} transactions)',
        'accounts_deleted': accounts_deleted,
        'transactions_deleted': transactions_deleted
    })


@admin_bp.route('/api/admin/delete-user', methods=['POST'])
@admin_required
def delete_user():
    """Delete a user and all their data by email (admin only)."""
    data = request.get_json() or {}
    email = data.get('email')

    if not email:
        return jsonify({'error': 'Email required'}), 400

    with get_db() as conn:
        # Get user ID
        cursor = conn.execute('SELECT id FROM users WHERE email = ?', (email,))
        row = cursor.fetchone()
        if not row:
            return jsonify({'error': f'User {email} not found'}), 404

        user_id = row['id']

        # Delete all related data
        conn.execute('DELETE FROM user_activity WHERE user_id = ?', (user_id,))
        conn.execute('DELETE FROM page_activity WHERE user_id = ?', (user_id,))
        conn.execute('DELETE FROM stock_views WHERE user_id = ?', (user_id,))
        conn.execute('DELETE FROM portfolio_transactions WHERE user_id = ?', (user_id,))
        conn.execute('DELETE FROM watchlist WHERE user_id = ?', (user_id,))
        conn.execute('DELETE FROM investment_accounts WHERE user_id = ?', (user_id,))
        conn.execute('DELETE FROM user_preferences WHERE user_id = ?', (user_id,))
        conn.execute('DELETE FROM graph_downloads WHERE user_id = ?', (user_id,))
        conn.execute('DELETE FROM users WHERE id = ?', (user_id,))

    return jsonify({
        'success': True,
        'message': f'Deleted user {email} (id={user_id})'
    })


@admin_bp.route('/api/admin/cleanup-orphaned-transactions', methods=['POST'])
@admin_required
def cleanup_orphaned_transactions():
    """Delete portfolio transactions whose investment account no longer exists."""
    with get_db() as conn:
        # Find orphaned transactions (account_id not in investment_accounts)
        cursor = conn.execute('''
            SELECT pt.id, pt.user_id, pt.account_id, pt.stock_ticker, u.name as user_name
            FROM portfolio_transactions pt
            LEFT JOIN investment_accounts ia ON pt.account_id = ia.id
            LEFT JOIN users u ON pt.user_id = u.id
            WHERE ia.id IS NULL
        ''')
        orphaned = [dict(row) for row in cursor.fetchall()]

        if orphaned:
            # Delete orphaned transactions
            cursor = conn.execute('''
                DELETE FROM portfolio_transactions
                WHERE account_id NOT IN (SELECT id FROM investment_accounts)
                   OR account_id IS NULL
            ''')
            deleted_count = cursor.rowcount
        else:
            deleted_count = 0

    return jsonify({
        'success': True,
        'orphaned_found': len(orphaned),
        'deleted': deleted_count,
        'details': orphaned[:20]  # Show first 20 for reference
    })
