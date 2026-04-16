"""Admin routes blueprint — analytics, user management, and maintenance endpoints."""

import logging
import os
import re
import subprocess
import time

import requests as http_requests
from flask import Blueprint, jsonify, request, send_file

from auth import admin_required
from database import get_db

logger = logging.getLogger(__name__)

admin_bp = Blueprint('admin', __name__)

COACHES_LAUNCH_DATE = '2026-03-23'

# ── Gemini pricing per 1M tokens (USD) ──
GEMINI_PRICING = {
    'gemini-3-flash-preview':         {'input': 0.50, 'output': 3.00},
    'gemini-3.1-pro-preview':         {'input': 2.00, 'output': 12.00},
    'gemini-3.1-flash-lite-preview':  {'input': 0.25, 'output': 1.50},
    'gemini-2.0-flash':               {'input': 0.10, 'output': 0.40},
}

def _serialize_datetimes(d, fields=('created_at', 'updated_at'), utc_fields=('last_active',)):
    """Convert datetime objects to ISO strings for JSON serialization."""
    for f in fields:
        if d.get(f) and hasattr(d[f], 'isoformat'):
            d[f] = d[f].isoformat()
    for f in utc_fields:
        if d.get(f) and hasattr(d[f], 'isoformat'):
            d[f] = d[f].isoformat() + 'Z'
    return d


@admin_bp.route('/api/admin/coach-users', methods=['GET'])
@admin_required
def list_coach_users():
    """List users who registered via the coaches app (admin only)."""
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
                SELECT a.activity_date, a.user_id, u.name, u.picture, SUM(a.seconds) as seconds
                FROM page_daily_activity a
                JOIN users u ON a.user_id = u.id
                WHERE {' AND '.join(conditions)}
                GROUP BY a.activity_date, a.user_id, u.name, u.picture
                ORDER BY a.activity_date ASC, seconds DESC
            ''', params)
        elif user_ids:
            placeholders = ','.join(['?' for _ in user_ids])
            cursor = conn.execute(f'''
                SELECT a.activity_date, a.user_id, u.name, u.picture, SUM(a.seconds) as seconds
                FROM user_activity a
                JOIN users u ON a.user_id = u.id
                WHERE u.registered_app = 'coaches' AND a.activity_date >= ? AND u.id IN ({placeholders})
                GROUP BY a.activity_date, a.user_id, u.name, u.picture
                ORDER BY a.activity_date ASC, seconds DESC
            ''', (COACHES_LAUNCH_DATE, *user_ids))
        else:
            cursor = conn.execute('''
                SELECT a.activity_date, a.user_id, u.name, u.picture, SUM(a.seconds) as seconds
                FROM user_activity a
                JOIN users u ON a.user_id = u.id
                WHERE u.registered_app = 'coaches' AND a.activity_date >= ?
                GROUP BY a.activity_date, a.user_id, u.name, u.picture
                ORDER BY a.activity_date ASC, seconds DESC
            ''', (COACHES_LAUNCH_DATE,))

        # Aggregate per-day with per-user breakdown
        by_date: dict = {}
        for row in cursor.fetchall():
            r = dict(row)
            d = r['activity_date']
            if d not in by_date:
                by_date[d] = {'activity_date': d, 'total_seconds': 0, 'by_user': []}
            by_date[d]['total_seconds'] += r['seconds'] or 0
            by_date[d]['by_user'].append({
                'user_id': r['user_id'],
                'name': r['name'],
                'picture': r['picture'],
                'seconds': r['seconds'] or 0,
            })
        daily_stats = sorted(by_date.values(), key=lambda d: d['activity_date'])

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
            LIMIT 300
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

    # Daily successful invocation counts (grouped by feature and date),
    # plus a per-user breakdown so the admin chart can expand a day into
    # a user list without being capped by the 300-row `invocations` list.
    with get_db() as conn:
        cursor = conn.execute(f'''
            SELECT a.feature, a.user_id, u.name as user_name, u.picture as user_picture,
                   MIN(a.created_at) as invocation_date,
                   SUM(CASE WHEN a.error IS NULL THEN 1 ELSE 0 END) as success_count
            FROM api_usage a
            LEFT JOIN users u ON a.user_id = u.id
            WHERE a.request_id IS NOT NULL {user_filter.replace('user_id', 'a.user_id')}
            GROUP BY a.feature, a.request_id, a.user_id, u.name, u.picture
        ''', user_params)
        daily_agg: dict = {}
        daily_user_agg: dict = {}
        for r in cursor.fetchall():
            row = dict(r)
            # Only count invocations where at least one model succeeded
            if (row['success_count'] or 0) == 0:
                continue
            inv_date = str(row['invocation_date'])[:10]
            key = (row['feature'], inv_date)
            daily_agg[key] = daily_agg.get(key, 0) + 1
            if row['user_id'] is None:
                continue
            uk = (row['feature'], inv_date, row['user_id'])
            if uk not in daily_user_agg:
                daily_user_agg[uk] = {
                    'feature': row['feature'],
                    'date': inv_date,
                    'user_id': row['user_id'],
                    'user_name': row['user_name'],
                    'user_picture': row['user_picture'],
                    'count': 0,
                }
            daily_user_agg[uk]['count'] += 1
        daily_invocations = [
            {'feature': f, 'date': d, 'count': c}
            for (f, d), c in sorted(daily_agg.items())
        ]
        daily_invocations_by_user = sorted(
            daily_user_agg.values(),
            key=lambda r: (r['date'], r['feature'], -r['count']),
        )

    return jsonify({
        'history': rows,
        'by_model': by_model,
        'by_feature': by_feature,
        'invocations': invocations,
        'daily_invocations': daily_invocations,
        'daily_invocations_by_user': daily_invocations_by_user,
        'total_cost_usd': round(total_cost, 6),
        'pricing': GEMINI_PRICING,
    })


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
        created = row['created_at']
        by_coach[cid]['students'].append({
            'name': row['student_name'],
            'created_at': created.isoformat() if hasattr(created, 'isoformat') else created,
        })

    return jsonify({'coaches': list(by_coach.values())})


@admin_bp.route('/api/admin/codelines', methods=['GET'])
@admin_required
def get_codelines():
    """Count lines of code in the codebase, broken down by language (admin only)."""
    base = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    result = subprocess.run(
        ['find', base, '-type', 'f',
         '(', '-name', '*.py', '-o', '-name', '*.ts', '-o', '-name', '*.tsx',
         '-o', '-name', '*.js', '-o', '-name', '*.jsx', '-o', '-name', '*.css', '-o', '-name', '*.html', ')',
         '!', '-path', '*/node_modules/*', '!', '-path', '*/dist/*',
         '!', '-path', '*/.venv/*', '!', '-path', '*/__pycache__/*', '!', '-path', '*/venv/*'],
        capture_output=True, text=True, timeout=10
    )
    by_lang: dict[str, int] = {}
    for path in result.stdout.strip().split('\n'):
        if not path:
            continue
        ext = os.path.splitext(path)[1].lstrip('.').lower()
        if not ext:
            continue
        try:
            with open(path) as f:
                count = sum(1 for _ in f)
        except Exception:
            continue
        by_lang[ext] = by_lang.get(ext, 0) + count
    total = sum(by_lang.values())
    return jsonify({'lines': total, 'by_lang': by_lang})


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

        # All child tables have ON DELETE CASCADE
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
        if not os.path.isfile(fpath):
            continue
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


TYPEFORM_WAITLIST_ID = 'XOhJMuis'


@admin_bp.route('/api/admin/waitlist', methods=['GET'])
@admin_required
def list_waitlist():
    """Fetch waitlist responses from Typeform Responses API."""
    token = os.environ.get('TYPEFORM_TOKEN')
    if not token:
        return jsonify({'error': 'TYPEFORM_TOKEN not configured'}), 500
    headers = {'Authorization': f'Bearer {token}'}
    try:
        form_resp = http_requests.get(
            f'https://api.typeform.com/forms/{TYPEFORM_WAITLIST_ID}',
            headers=headers,
            timeout=10,
        )
        form_resp.raise_for_status()
        resp = http_requests.get(
            f'https://api.typeform.com/forms/{TYPEFORM_WAITLIST_ID}/responses',
            headers=headers,
            params={'page_size': 1000},
            timeout=10,
        )
        resp.raise_for_status()
    except http_requests.RequestException as e:
        logger.exception('Typeform API call failed')
        return jsonify({'error': f'Typeform API error: {e}'}), 502

    # Build field id -> question title map from the form definition
    field_titles: dict = {}
    def _collect_fields(fields):
        for f in fields or []:
            fid = f.get('id')
            if fid:
                field_titles[fid] = f.get('title') or f.get('ref') or fid
            # Recurse into group subfields
            props = f.get('properties') or {}
            if props.get('fields'):
                _collect_fields(props['fields'])
    _collect_fields(form_resp.json().get('fields'))

    data = resp.json()
    items = data.get('items', [])
    responses = []
    for item in items:
        answers = []
        for a in item.get('answers') or []:
            field = a.get('field') or {}
            fid = field.get('id')
            title = field_titles.get(fid) or field.get('title') or field.get('ref') or fid or ''
            atype = a.get('type')
            raw = a.get(atype) if atype else None
            # Normalize common answer shapes to a human-readable value
            if atype == 'choice' and isinstance(raw, dict):
                value = raw.get('label') or raw.get('other')
            elif atype == 'choices' and isinstance(raw, dict):
                value = raw.get('labels') or raw.get('other')
            elif isinstance(raw, dict):
                value = raw.get('label') or raw.get('labels') or raw
            else:
                value = raw
            answers.append({'question': title, 'type': atype, 'value': value})
        responses.append({
            'response_id': item.get('response_id'),
            'submitted_at': item.get('submitted_at'),
            'answers': answers,
        })

    return jsonify({'responses': responses, 'total': data.get('total_items', len(responses))})


# ── Notion: "Features wanted" aggregation from CRM ──
NOTION_API_VERSION = '2022-06-28'
NOTION_CACHE_TTL_SECONDS = 600  # 10 minutes
_notion_cache: dict = {'ts': 0.0, 'payload': None}


@admin_bp.route('/api/admin/feature-requests', methods=['GET'])
@admin_required
def feature_requests():
    """Aggregate 'Features wanted' multi-select tags from the Notion CRM, filtered to interviewed rows."""
    token = os.environ.get('NOTION_TOKEN')
    database_id = os.environ.get('NOTION_DATABASE_ID')
    if not token or not database_id:
        return jsonify({'error': 'NOTION_TOKEN and NOTION_DATABASE_ID must be configured'}), 500

    now = time.time()
    cached = _notion_cache.get('payload')
    if cached and now - _notion_cache['ts'] < NOTION_CACHE_TTL_SECONDS:
        return jsonify(cached)

    headers = {
        'Authorization': f'Bearer {token}',
        'Notion-Version': NOTION_API_VERSION,
        'Content-Type': 'application/json',
    }
    body = {
        'filter': {'property': 'Interviewed', 'checkbox': {'equals': True}},
        'page_size': 100,
    }

    def _page_title(page: dict) -> str:
        """Find the title property on a Notion page and return its plain text."""
        for prop in (page.get('properties') or {}).values():
            if prop.get('type') == 'title':
                parts = prop.get('title') or []
                return ''.join(p.get('plain_text') or '' for p in parts).strip()
        return ''

    tag_people: dict = {}  # tag -> list[str]
    interviewed_count = 0
    start_cursor = None
    try:
        while True:
            if start_cursor:
                body['start_cursor'] = start_cursor
            resp = http_requests.post(
                f'https://api.notion.com/v1/databases/{database_id}/query',
                headers=headers,
                json=body,
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            for page in data.get('results') or []:
                interviewed_count += 1
                title = _page_title(page) or '—'
                prop = (page.get('properties') or {}).get('Features wanted') or {}
                for tag in prop.get('multi_select') or []:
                    name = tag.get('name')
                    if name:
                        tag_people.setdefault(name, []).append(title)
            if not data.get('has_more'):
                break
            start_cursor = data.get('next_cursor')
    except http_requests.RequestException as e:
        logger.exception('Notion API call failed')
        return jsonify({'error': f'Notion API error: {e}'}), 502

    def _person_sort_key(title: str):
        # Sort by the leading "#N" number in the CRM title so people list is ordered #1, #2, #3...
        m = re.match(r'^#(\d+)', title)
        n = int(m.group(1)) if m else float('inf')
        return (n, title.lower())

    items = sorted(
        [{'tag': k, 'count': len(v), 'people': sorted(v, key=_person_sort_key)} for k, v in tag_people.items()],
        key=lambda d: (-d['count'], d['tag']),
    )
    payload = {'items': items, 'interviewed_count': interviewed_count}
    _notion_cache['ts'] = now
    _notion_cache['payload'] = payload
    return jsonify(payload)

