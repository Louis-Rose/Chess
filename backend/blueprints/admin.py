"""Admin routes blueprint — analytics, user management, and maintenance endpoints."""

import logging
import os

from flask import Blueprint, jsonify, request, send_file

from auth import admin_required
from database import get_db

logger = logging.getLogger(__name__)

admin_bp = Blueprint('admin', __name__)


def _serialize_datetimes(d, fields=('created_at', 'updated_at'), utc_fields=('last_active',)):
    """Convert datetime objects to ISO strings for JSON serialization."""
    for f in fields:
        if d.get(f) and hasattr(d[f], 'isoformat'):
            d[f] = d[f].isoformat()
    for f in utc_fields:
        if d.get(f) and hasattr(d[f], 'isoformat'):
            d[f] = d[f].isoformat() + 'Z'
    return d


def _query_time_spent_details(period, extra_clause, extra_params, select_cols, group_by):
    """Shared logic for period-based time spent queries (date/week/month)."""
    with get_db() as conn:
        if '-W' in period:
            year, week = period.split('-W')
            date_filter = "EXTRACT(YEAR FROM a.activity_date::date) = %s AND EXTRACT(WEEK FROM a.activity_date::date) = %s"
            date_params = (int(year), int(week))
        elif len(period) == 7:
            date_filter = "to_char(a.activity_date::date, 'YYYY-MM') = %s"
            date_params = (period,)
        else:
            date_filter = "a.activity_date = ?"
            date_params = (period,)

        cursor = conn.execute(f'''
            SELECT {select_cols}, SUM(a.seconds) as seconds
            FROM user_activity a
            JOIN users u ON a.user_id = u.id
            WHERE {date_filter} {extra_clause}
            GROUP BY {group_by}
            ORDER BY seconds DESC
        ''', (*date_params, *extra_params))

        users = [dict(row) for row in cursor.fetchall()]
    return jsonify({'users': users, 'period': period})


def _query_page_breakdown(where_clause, params):
    """Shared logic for page breakdown queries."""
    with get_db() as conn:
        cursor = conn.execute(f'''
            SELECT p.page, SUM(p.seconds) as total_seconds
            FROM page_activity p
            JOIN users u ON p.user_id = u.id
            WHERE {where_clause}
            GROUP BY p.page
            ORDER BY total_seconds DESC
        ''', params)
        breakdown = [dict(row) for row in cursor.fetchall()]
        total = sum(item['total_seconds'] for item in breakdown)
    return jsonify({'breakdown': breakdown, 'total_seconds': total})


# ── Gemini pricing per 1M tokens (USD) ──
GEMINI_PRICING = {
    'gemini-3-flash-preview':         {'input': 0.50, 'output': 3.00},
    'gemini-3.1-pro-preview':         {'input': 2.00, 'output': 12.00},
    'gemini-3.1-flash-lite-preview':  {'input': 0.25, 'output': 1.50},
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
                   (SELECT COUNT(*) FROM graph_downloads g WHERE g.user_id = u.id) as graph_downloads
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
            user = _serialize_datetimes(dict(row))
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
                   COUNT(a.id) as session_count,
                   up.coaches_chess_username,
                   up.lichess_username
            FROM users u
            LEFT JOIN user_activity a ON u.id = a.user_id AND a.activity_date >= ?
            LEFT JOIN user_preferences up ON u.id = up.user_id
            WHERE u.registered_app = 'coaches'
            GROUP BY u.id, up.coaches_chess_username, up.lichess_username
            ORDER BY u.created_at DESC
        ''', (COACHES_LAUNCH_DATE, COACHES_LAUNCH_DATE, COACHES_LAUNCH_DATE))
        users = []
        for row in cursor.fetchall():
            user = _serialize_datetimes(dict(row))
            users.append(user)

        # Compute per-user API cost (only paid calls)
        cursor = conn.execute('''
            SELECT user_id, model_id,
                   SUM(CASE WHEN COALESCE(billing_tier, 'paid') = 'paid' THEN input_tokens ELSE 0 END) as paid_input,
                   SUM(CASE WHEN COALESCE(billing_tier, 'paid') = 'paid' THEN output_tokens ELSE 0 END) as paid_output,
                   SUM(CASE WHEN COALESCE(billing_tier, 'paid') = 'paid' THEN COALESCE(thinking_tokens, 0) ELSE 0 END) as paid_thinking
            FROM api_usage
            WHERE user_id IS NOT NULL
            GROUP BY user_id, model_id
        ''')
        user_costs: dict = {}
        for row in cursor.fetchall():
            r = dict(row)
            pricing = GEMINI_PRICING.get(r['model_id'], {'input': 0, 'output': 0})
            billed_output = (r['paid_output'] or 0) + (r['paid_thinking'] or 0)
            cost = ((r['paid_input'] or 0) * pricing['input'] + billed_output * pricing['output']) / 1_000_000
            user_costs[r['user_id']] = user_costs.get(r['user_id'], 0) + cost
        for user in users:
            user['cost_usd'] = round(user_costs.get(user['id'], 0), 6)

    return jsonify({'users': users, 'total': len(users)})


@admin_bp.route('/api/admin/coach-time-spent', methods=['GET'])
@admin_required
def get_coach_time_spent():
    """Get daily time spent stats for coaches app users only (from launch date)."""
    COACHES_LAUNCH_DATE = '2026-03-23'
    user_ids_raw = request.args.get('user_ids', '')
    user_ids = [int(x) for x in user_ids_raw.split(',') if x.strip().isdigit()] if user_ids_raw else []
    pages_raw = request.args.get('pages', '')
    pages = [p.strip() for p in pages_raw.split(',') if p.strip()] if pages_raw else []

    with get_db() as conn:
        if pages:
            # Query from page_daily_activity when filtering by pages
            conditions = ['u.registered_app = ?', 'a.activity_date >= ?']
            params: list = ['coaches', COACHES_LAUNCH_DATE]
            page_ph = ','.join(['?' for _ in pages])
            conditions.append(f'a.page IN ({page_ph})')
            params.extend(pages)
            if user_ids:
                user_ph = ','.join(['?' for _ in user_ids])
                conditions.append(f'u.id IN ({user_ph})')
                params.extend(user_ids)
            cursor = conn.execute(f'''
                SELECT a.activity_date, SUM(a.seconds) as total_seconds
                FROM page_daily_activity a
                JOIN users u ON a.user_id = u.id
                WHERE {' AND '.join(conditions)}
                GROUP BY a.activity_date
                ORDER BY a.activity_date ASC
            ''', params)
        elif user_ids:
            placeholders = ','.join(['?' for _ in user_ids])
            cursor = conn.execute(f'''
                SELECT a.activity_date, SUM(a.seconds) as total_seconds
                FROM user_activity a
                JOIN users u ON a.user_id = u.id
                WHERE u.registered_app = 'coaches' AND a.activity_date >= ? AND u.id IN ({placeholders})
                GROUP BY a.activity_date
                ORDER BY a.activity_date ASC
            ''', (COACHES_LAUNCH_DATE, *user_ids))
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
    user_ids_raw = request.args.get('user_ids', '')
    user_ids = [int(x) for x in user_ids_raw.split(',') if x.strip().isdigit()] if user_ids_raw else []
    if user_ids:
        placeholders = ','.join(['?' for _ in user_ids])
        user_filter = f' AND user_id IN ({placeholders})'
        user_params = tuple(user_ids)
    else:
        user_filter = ''
        user_params = ()
    with get_db() as conn:
        # Per-call history (most recent first, cap at 200)
        cursor = conn.execute(f'''
            SELECT id, feature, model_id, input_tokens, output_tokens,
                   COALESCE(thinking_tokens, 0) as thinking_tokens,
                   COALESCE(billing_tier, 'paid') as billing_tier,
                   elapsed_seconds, error, created_at,
                   retry_free_error, retry_free_elapsed
            FROM api_usage
            WHERE 1=1 {user_filter}
            ORDER BY created_at DESC
            LIMIT 200
        ''', user_params)
        rows = [dict(r) for r in cursor.fetchall()]

        # Per-model aggregates (only paid calls contribute to cost)
        cursor = conn.execute(f'''
            SELECT model_id,
                   COUNT(*) as call_count,
                   SUM(CASE WHEN COALESCE(billing_tier, 'paid') = 'paid' THEN 1 ELSE 0 END) as paid_count,
                   SUM(CASE WHEN COALESCE(billing_tier, 'paid') = 'free' THEN 1 ELSE 0 END) as free_count,
                   SUM(input_tokens) as total_input,
                   SUM(output_tokens) as total_output,
                   SUM(COALESCE(thinking_tokens, 0)) as total_thinking,
                   SUM(CASE WHEN COALESCE(billing_tier, 'paid') = 'paid' THEN input_tokens ELSE 0 END) as paid_input,
                   SUM(CASE WHEN COALESCE(billing_tier, 'paid') = 'paid' THEN output_tokens ELSE 0 END) as paid_output,
                   SUM(CASE WHEN COALESCE(billing_tier, 'paid') = 'paid' THEN COALESCE(thinking_tokens, 0) ELSE 0 END) as paid_thinking,
                   SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) as error_count,
                   AVG(elapsed_seconds) as avg_elapsed
            FROM api_usage
            WHERE 1=1 {user_filter}
            GROUP BY model_id
        ''', user_params)
        by_model = []
        for r in cursor.fetchall():
            row = dict(r)
            pricing = GEMINI_PRICING.get(row['model_id'], {'input': 0, 'output': 0})
            billed_output = (row['paid_output'] or 0) + (row['paid_thinking'] or 0)
            row['cost_usd'] = round(
                (row['paid_input'] or 0) * pricing['input'] / 1_000_000
                + billed_output * pricing['output'] / 1_000_000,
                6,
            )
            row['avg_elapsed'] = round(row['avg_elapsed'] or 0, 1)
            by_model.append(row)
        by_model.sort(key=lambda m: m['cost_usd'], reverse=True)

        # Per-feature aggregates (only paid calls contribute to cost)
        cursor = conn.execute(f'''
            SELECT feature, model_id, COUNT(*) as call_count,
                   COUNT(DISTINCT request_id) as invocation_count,
                   SUM(input_tokens) as total_input,
                   SUM(output_tokens) as total_output,
                   SUM(COALESCE(thinking_tokens, 0)) as total_thinking,
                   SUM(CASE WHEN COALESCE(billing_tier, 'paid') = 'paid' THEN input_tokens ELSE 0 END) as paid_input,
                   SUM(CASE WHEN COALESCE(billing_tier, 'paid') = 'paid' THEN output_tokens ELSE 0 END) as paid_output,
                   SUM(CASE WHEN COALESCE(billing_tier, 'paid') = 'paid' THEN COALESCE(thinking_tokens, 0) ELSE 0 END) as paid_thinking
            FROM api_usage
            WHERE 1=1 {user_filter}
            GROUP BY feature, model_id
        ''', user_params)
        feature_agg = {}
        for r in cursor.fetchall():
            row = dict(r)
            f = row['feature']
            pricing = GEMINI_PRICING.get(row['model_id'], {'input': 0, 'output': 0})
            billed_output = (row['paid_output'] or 0) + (row['paid_thinking'] or 0)
            cost = ((row['paid_input'] or 0) * pricing['input'] + billed_output * pricing['output']) / 1_000_000
            if f not in feature_agg:
                feature_agg[f] = {'feature': f, 'call_count': 0, 'invocation_count': 0, 'total_input': 0, 'total_output': 0, 'total_thinking': 0, 'cost_usd': 0}
            feature_agg[f]['call_count'] += row['call_count']
            feature_agg[f]['invocation_count'] = max(feature_agg[f]['invocation_count'], row['invocation_count'])
            feature_agg[f]['total_input'] += row['total_input'] or 0
            feature_agg[f]['total_output'] += row['total_output'] or 0
            feature_agg[f]['total_thinking'] += row['total_thinking'] or 0
            feature_agg[f]['cost_usd'] += cost
        by_feature = [{'cost_usd': round(v['cost_usd'], 6), **v} for v in feature_agg.values()]

        # Per-invocation history (grouped by request_id)
        cursor = conn.execute(f'''
            SELECT a.request_id, a.feature,
                   COUNT(*) as model_count,
                   SUM(a.input_tokens) as total_input,
                   SUM(a.output_tokens) as total_output,
                   SUM(COALESCE(a.thinking_tokens, 0)) as total_thinking,
                   MAX(a.elapsed_seconds) as elapsed_seconds,
                   SUM(CASE WHEN a.error IS NOT NULL THEN 1 ELSE 0 END) as error_count,
                   SUM(CASE WHEN COALESCE(a.billing_tier, 'paid') = 'free' THEN 1 ELSE 0 END) as free_count,
                   MIN(a.created_at) as created_at,
                   a.user_id,
                   u.name as user_name, u.picture as user_picture
            FROM api_usage a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE a.request_id IS NOT NULL {user_filter.replace('user_id', 'a.user_id')}
            GROUP BY a.request_id, a.feature, a.user_id, u.name, u.picture
            ORDER BY MIN(a.created_at) DESC
            LIMIT 100
        ''', user_params)
        invocations = []
        for r in cursor.fetchall():
            row = dict(r)
            cursor2 = conn.execute('''
                SELECT model_id,
                       SUM(input_tokens) as input_tokens,
                       SUM(output_tokens) as output_tokens,
                       SUM(COALESCE(thinking_tokens, 0)) as thinking_tokens,
                       COALESCE(billing_tier, 'paid') as billing_tier,
                       MAX(elapsed_seconds) as elapsed_seconds,
                       MAX(error) as error,
                       MAX(retry_free_error) as retry_free_error,
                       MAX(retry_free_elapsed) as retry_free_elapsed
                FROM api_usage WHERE request_id = ?
                GROUP BY model_id, billing_tier
            ''', (row['request_id'],))
            cost = 0
            models = []
            for m in cursor2.fetchall():
                md = dict(m)
                if md['billing_tier'] == 'free':
                    md['cost_usd'] = 0
                else:
                    p = GEMINI_PRICING.get(md['model_id'], {'input': 0, 'output': 0})
                    billed_out = (md['output_tokens'] or 0) + (md['thinking_tokens'] or 0)
                    md['cost_usd'] = round(((md['input_tokens'] or 0) * p['input'] + billed_out * p['output']) / 1_000_000, 6)
                cost += md['cost_usd']
                models.append(md)
            models.sort(key=lambda m: m['cost_usd'], reverse=True)
            row['cost_usd'] = round(cost, 6)
            row['models'] = models
            invocations.append(row)

    # Compute total cost
    total_cost = sum(m['cost_usd'] for m in by_model)

    # Daily successful invocation counts (grouped by feature and date)
    with get_db() as conn:
        cursor = conn.execute(f'''
            SELECT feature,
                   MIN(created_at) as invocation_date,
                   COUNT(*) as total_count,
                   SUM(CASE WHEN error IS NULL THEN 1 ELSE 0 END) as success_count
            FROM api_usage
            WHERE request_id IS NOT NULL {user_filter}
            GROUP BY feature, request_id
        ''', user_params)
        daily_agg: dict = {}
        for r in cursor.fetchall():
            row = dict(r)
            # Only count invocations where at least one model succeeded
            if (row['success_count'] or 0) == 0:
                continue
            inv_date = str(row['invocation_date'])[:10]
            key = (row['feature'], inv_date)
            daily_agg[key] = daily_agg.get(key, 0) + 1
        daily_invocations = [
            {'feature': f, 'date': d, 'count': c}
            for (f, d), c in sorted(daily_agg.items())
        ]

    return jsonify({
        'history': rows,
        'by_model': by_model,
        'by_feature': by_feature,
        'invocations': invocations,
        'daily_invocations': daily_invocations,
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
            user = _serialize_datetimes(dict(row))
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
    return _query_time_spent_details(period,
        extra_clause=f"AND u.google_id LIKE ? AND LOWER(u.name) NOT IN ({tester_placeholders})",
        extra_params=('chess:%', *EXCLUDED_CHESS_TESTERS),
        select_cols="LOWER(u.name) as name",
        group_by="LOWER(u.name)",
    )


@admin_bp.route('/api/admin/chess-page-breakdown', methods=['GET'])
@admin_required
def get_chess_page_breakdown():
    """Get aggregated time spent by page/section for chess users only (admin only)."""
    placeholders = ','.join(['?' for _ in EXCLUDED_CHESS_TESTERS])
    return _query_page_breakdown(
        f"u.google_id LIKE ? AND LOWER(u.name) NOT IN ({placeholders})",
        ('chess:%', *EXCLUDED_CHESS_TESTERS),
    )


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

    user_dict = _serialize_datetimes(dict(user))
    return jsonify({'user': user_dict})


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



# ──────────────────────────────────────────────────────────────────────
#  Legacy endpoints (kept as stubs to avoid 404s during transition)
# ──────────────────────────────────────────────────────────────────────



# ──────────────────────────────────────────────────────────────────────
#  Investing user analytics (time spent, page breakdown)
# ──────────────────────────────────────────────────────────────────────

@admin_bp.route('/api/admin/time-spent', methods=['GET'])
@admin_required
def get_time_spent_stats():
    """Get daily time spent stats for all users (admin only)."""
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT a.activity_date, SUM(a.seconds) as total_seconds
            FROM user_activity a
            JOIN users u ON a.user_id = u.id
            WHERE u.is_admin = 0 AND u.google_id NOT LIKE ?
            GROUP BY a.activity_date
            ORDER BY a.activity_date ASC
        ''', ('chess:%',))
        daily_stats = [dict(row) for row in cursor.fetchall()]

    return jsonify({'daily_stats': daily_stats})


@admin_bp.route('/api/admin/time-spent/<period>', methods=['GET'])
@admin_required
def get_time_spent_details(period):
    """Get users' time spent for a specific date, week, or month (admin only)."""
    return _query_time_spent_details(period,
        extra_clause="AND u.is_admin = 0 AND u.google_id NOT LIKE ?",
        extra_params=('chess:%',),
        select_cols="u.id, u.name, u.picture",
        group_by="u.id, u.name, u.picture",
    )


@admin_bp.route('/api/admin/page-breakdown', methods=['GET'])
@admin_required
def get_page_breakdown():
    """Get aggregated time spent by page/section (admin only)."""
    return _query_page_breakdown(
        "u.google_id NOT LIKE ? AND u.is_admin = 0",
        ('chess:%',),
    )


# ──────────────────────────────────────────────────────────────────────
#  Maintenance / data management
# ──────────────────────────────────────────────────────────────────────

@admin_bp.route('/api/admin/coach-students', methods=['GET'])
@admin_required
def get_coach_students():
    """Get all students grouped by coach user (admin only)."""
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT cs.coach_user_id, cs.student_name, cs.created_at,
                   u.name as coach_name, u.picture as coach_picture
            FROM coach_students cs
            JOIN users u ON cs.coach_user_id = u.id
            ORDER BY cs.coach_user_id, cs.created_at ASC
        ''')
        rows = [dict(row) for row in cursor.fetchall()]

    # Group by coach
    by_coach: dict = {}
    for row in rows:
        cid = row['coach_user_id']
        if cid not in by_coach:
            by_coach[cid] = {
                'coach_user_id': cid,
                'coach_name': row['coach_name'],
                'coach_picture': row['coach_picture'],
                'students': [],
            }
        by_coach[cid]['students'].append({
            'name': row['student_name'],
            'created_at': row['created_at'],
        })

    return jsonify({'coaches': list(by_coach.values())})


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
        conn.execute('DELETE FROM user_preferences WHERE user_id = ?', (user_id,))
        conn.execute('DELETE FROM graph_downloads WHERE user_id = ?', (user_id,))
        conn.execute('DELETE FROM users WHERE id = ?', (user_id,))

    return jsonify({
        'success': True,
        'message': f'Deleted user {email} (id={user_id})'
    })


UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'scoresheet_uploads')


@admin_bp.route('/api/admin/user-uploads/<int:user_id>', methods=['GET'])
@admin_required
def list_user_uploads(user_id):
    """List all uploaded images for a given user."""
    user_dir = os.path.join(UPLOAD_DIR, str(user_id))
    if not os.path.isdir(user_dir):
        return jsonify({'uploads': []})
    files = []
    for fname in sorted(os.listdir(user_dir)):
        fpath = os.path.join(user_dir, fname)
        if os.path.isfile(fpath):
            stat = os.stat(fpath)
            files.append({
                'filename': fname,
                'size': stat.st_size,
                'created_at': stat.st_mtime,
            })
    return jsonify({'uploads': files})


@admin_bp.route('/api/admin/user-uploads/<int:user_id>/<filename>', methods=['GET'])
@admin_required
def serve_user_upload(user_id, filename):
    """Serve a specific uploaded image for download."""
    # Prevent path traversal
    safe_name = os.path.basename(filename)
    fpath = os.path.join(UPLOAD_DIR, str(user_id), safe_name)
    if not os.path.isfile(fpath):
        return jsonify({'error': 'File not found'}), 404
    return send_file(fpath, as_attachment=True, download_name=safe_name)


@admin_bp.route('/api/admin/user-uploads/<int:user_id>/<filename>', methods=['DELETE'])
@admin_required
def delete_user_upload(user_id, filename):
    """Delete a specific uploaded image."""
    safe_name = os.path.basename(filename)
    fpath = os.path.join(UPLOAD_DIR, str(user_id), safe_name)
    if not os.path.isfile(fpath):
        return jsonify({'error': 'File not found'}), 404
    os.remove(fpath)
    return jsonify({'success': True})


@admin_bp.route('/api/admin/rename-uploads', methods=['POST'])
@admin_required
def rename_uploads():
    """Retroactively rename all uploads to {feature}_{surname}_{N} format."""
    if not os.path.isdir(UPLOAD_DIR):
        return jsonify({'renamed': 0})

    KNOWN_FEATURES = ['scoresheet_azure', 'scoresheet', 'reread', 'diagram']

    total = 0
    for user_id_str in os.listdir(UPLOAD_DIR):
        user_dir = os.path.join(UPLOAD_DIR, user_id_str)
        if not os.path.isdir(user_dir) or not user_id_str.isdigit():
            continue
        user_id = int(user_id_str)
        # Get surname
        with get_db() as conn:
            row = conn.execute('SELECT name FROM users WHERE id = ?', (user_id,)).fetchone()
        if row and row['name']:
            parts = row['name'].strip().split()
            surname = parts[-1] if len(parts) > 1 else parts[0]
        else:
            surname = user_id_str

        # Group files by feature, sorted by creation time
        files_by_feature = {}
        for fname in os.listdir(user_dir):
            fpath = os.path.join(user_dir, fname)
            if not os.path.isfile(fpath):
                continue
            parts_f = fname.rsplit('.', 1)
            ext = '.' + parts_f[1] if len(parts_f) > 1 else ''
            base = parts_f[0]

            feature = None
            for known in KNOWN_FEATURES:
                if base.startswith(known + '_'):
                    feature = known
                    break
            if not feature:
                feature = base.split('_')[0]

            files_by_feature.setdefault(feature, []).append((fname, os.stat(fpath).st_mtime, ext))

        # Rename each group
        for feature, file_list in files_by_feature.items():
            file_list.sort(key=lambda x: x[1])  # oldest first
            for i, (old_name, _, ext) in enumerate(file_list, 1):
                new_name = f"{feature}_{surname}_{i}{ext}"
                if old_name != new_name:
                    old_path = os.path.join(user_dir, old_name)
                    new_path = os.path.join(user_dir, new_name)
                    os.rename(old_path, new_path)
                    total += 1
                    logger.info(f"[Upload rename] {old_name} -> {new_name}")

    return jsonify({'renamed': total})
