"""Clothing backend: a job queue for the personal shopping agent.

Bot-protected stores (Octobre is behind DataDome) refuse server-side requests,
so the actual browsing can't happen on the VM. Instead the web app enqueues a
search here and a worker running on the owner's own machine — residential IP,
real Chrome — claims the job, browses the sources and posts the result back.

Flow:
  browser  POST /api/clothing/search        -> enqueue, returns {job_id}
  browser  GET  /api/clothing/jobs/<id>      -> poll status/result
  worker   GET  /api/clothing/worker/next    -> claim oldest pending job
  worker   POST /api/clothing/worker/<id>/result -> deliver items / error

The two worker endpoints are guarded by a shared secret (CLOTHING_WORKER_SECRET)
rather than a login session, since the worker is a headless script, not a user.
"""

import hmac
import json
import logging
import os
import re

from flask import Blueprint, jsonify, request

from auth import login_required
from database import get_db

logger = logging.getLogger(__name__)

clothing_bp = Blueprint('clothing', __name__)

MAX_PROMPT_CHARS = 500
MAX_SOURCES = 12
# A pending job with no worker is failed after this long so the UI can say the
# agent is offline instead of spinning forever.
PENDING_TIMEOUT_SECONDS = 150
# A claimed job whose worker died is returned to the pool after this long.
RUNNING_TIMEOUT_SECONDS = 180


def _clean_domain(raw):
    """Normalize a user-supplied source to a bare domain (strip scheme/path)."""
    s = (raw or '').strip().lower()
    s = re.sub(r'^https?://', '', s)
    s = s.split('/', 1)[0]
    return s.strip()


def _worker_authorized():
    secret = os.environ.get('CLOTHING_WORKER_SECRET')
    if not secret:
        return False
    sent = request.headers.get('X-Worker-Secret', '')
    return hmac.compare_digest(sent, secret)


# ---------------------------------------------------------------------------
# Browser-facing endpoints
# ---------------------------------------------------------------------------

@clothing_bp.route('/api/clothing/search', methods=['POST'])
@login_required
def enqueue():
    data = request.get_json(silent=True) or {}
    prompt = (data.get('prompt') or '').strip()
    raw_sources = data.get('sources') or []

    if not prompt:
        return jsonify({'error': 'Tell the agent what to look for.'}), 400
    if len(prompt) > MAX_PROMPT_CHARS:
        return jsonify({'error': 'That request is too long.'}), 400
    if not isinstance(raw_sources, list):
        return jsonify({'error': 'Sources must be a list of sites.'}), 400

    sources = []
    for s in raw_sources[:MAX_SOURCES]:
        d = _clean_domain(s)
        if d and d not in sources:
            sources.append(d)
    if not sources:
        return jsonify({'error': 'Add at least one source site.'}), 400

    user_id = getattr(request, 'user_id', None)
    with get_db() as conn:
        row = conn.execute(
            """INSERT INTO clothing_jobs (user_id, prompt, sources)
               VALUES (?, ?, ?) RETURNING id""",
            (user_id, prompt, json.dumps(sources)),
        ).fetchone()
    return jsonify({'job_id': row['id']})


@clothing_bp.route('/api/clothing/jobs/<int:job_id>', methods=['GET'])
@login_required
def poll(job_id):
    user_id = getattr(request, 'user_id', None)
    with get_db() as conn:
        # Lazily fail a job that has sat pending with no worker to claim it.
        conn.execute(
            """UPDATE clothing_jobs
                  SET status = 'error', error = 'offline', finished_at = CURRENT_TIMESTAMP
                WHERE id = ? AND status = 'pending'
                  AND created_at < CURRENT_TIMESTAMP - (? * INTERVAL '1 second')""",
            (job_id, PENDING_TIMEOUT_SECONDS),
        )
        row = conn.execute(
            "SELECT user_id, status, result, error FROM clothing_jobs WHERE id = ?",
            (job_id,),
        ).fetchone()

    if not row or (row['user_id'] is not None and row['user_id'] != user_id):
        return jsonify({'error': 'Job not found.'}), 404

    out = {'status': row['status']}
    if row['status'] == 'done':
        try:
            out['result'] = json.loads(row['result']) if row['result'] else {}
        except Exception:
            out['result'] = {}
    elif row['status'] == 'error':
        out['error'] = (
            'Your shopping agent looks offline. Start the worker on your machine and try again.'
            if row['error'] == 'offline'
            else (row['error'] or 'The search failed.')
        )
    return jsonify(out)


# ---------------------------------------------------------------------------
# Worker-facing endpoints (shared-secret auth)
# ---------------------------------------------------------------------------

@clothing_bp.route('/api/clothing/worker/next', methods=['GET'])
def worker_next():
    if not _worker_authorized():
        return jsonify({'error': 'unauthorized'}), 401

    with get_db() as conn:
        # Claim the oldest job that's pending, or running but abandoned. SKIP
        # LOCKED lets several workers poll without grabbing the same row.
        row = conn.execute(
            """UPDATE clothing_jobs
                  SET status = 'running', claimed_at = CURRENT_TIMESTAMP
                WHERE id = (
                    SELECT id FROM clothing_jobs
                     WHERE status = 'pending'
                        OR (status = 'running'
                            AND claimed_at < CURRENT_TIMESTAMP - (? * INTERVAL '1 second'))
                     ORDER BY created_at
                     LIMIT 1
                     FOR UPDATE SKIP LOCKED
                )
               RETURNING id, prompt, sources""",
            (RUNNING_TIMEOUT_SECONDS,),
        ).fetchone()

    if not row:
        return jsonify({'job': None})
    try:
        sources = json.loads(row['sources'])
    except Exception:
        sources = []
    return jsonify({'job': {'id': row['id'], 'prompt': row['prompt'], 'sources': sources}})


@clothing_bp.route('/api/clothing/worker/<int:job_id>/result', methods=['POST'])
def worker_result(job_id):
    if not _worker_authorized():
        return jsonify({'error': 'unauthorized'}), 401

    data = request.get_json(silent=True) or {}
    err = (data.get('error') or '').strip()

    if err:
        with get_db() as conn:
            conn.execute(
                """UPDATE clothing_jobs
                      SET status = 'error', error = ?, finished_at = CURRENT_TIMESTAMP
                    WHERE id = ?""",
                (err[:500], job_id),
            )
        return jsonify({'ok': True})

    summary = str(data.get('summary') or '').strip()
    items = []
    for it in (data.get('items') or [])[:40]:
        if not isinstance(it, dict):
            continue
        name = str(it.get('name') or '').strip()
        if not name:
            continue
        url = str(it.get('url') or '').strip()
        img = str(it.get('image') or '').strip()
        items.append({
            'name': name[:200],
            'price': (str(it.get('price') or '').strip() or None),
            'url': url if url.startswith('http') else None,
            'image': img if img.startswith('http') else None,
            'source': str(it.get('source') or '').strip()[:100] or None,
        })

    result = json.dumps({'summary': summary, 'items': items})
    with get_db() as conn:
        conn.execute(
            """UPDATE clothing_jobs
                  SET status = 'done', result = ?, error = NULL, finished_at = CURRENT_TIMESTAMP
                WHERE id = ?""",
            (result, job_id),
        )
    return jsonify({'ok': True})
