"""Notice.ai backend: answer a user's question about the page they're viewing.

The frontend renders the current PDF page to a PNG and posts it here with the
question. We forward both to Gemini (vision) and return the answer. The Gemini
client/retry/usage-logging plumbing is reused from the chesscoaches blueprint so
this feature shares the same paid/free key fallback and admin usage tracking.
"""

import base64
import logging
import time

from flask import Blueprint, jsonify, request

from auth import login_required
from blueprints.chesscoaches import (
    _init_gemini_clients,
    _gemini_generate,
    _extract_usage_tokens,
    _log_api_usage,
)

logger = logging.getLogger(__name__)

notice_bp = Blueprint('notice', __name__)

# Multimodal flash model — fast and cheap, reads text and diagrams on a page.
NOTICE_MODEL = 'gemini-3-flash-preview'
# Safety cap on the decoded page image (a rendered page is well under this).
MAX_IMAGE_BYTES = 10 * 1024 * 1024

_PROMPT = (
    "You are helping someone read a document. The attached image is the page "
    "they are currently looking at. Answer their question using only what is "
    "visible on this page. Be concise. If the answer is not on this page, say "
    "so plainly.\n\nQuestion: {question}"
)


@notice_bp.route('/api/notice/ask', methods=['POST'])
@login_required
def ask():
    data = request.get_json(silent=True) or {}
    question = (data.get('question') or '').strip()
    image_b64 = data.get('image') or ''

    if not question:
        return jsonify({'error': 'A question is required.'}), 400
    if not image_b64:
        return jsonify({'error': 'No page image was provided.'}), 400

    # Accept either a data URL ("data:image/png;base64,...") or bare base64.
    if image_b64.startswith('data:') and ',' in image_b64:
        image_b64 = image_b64.split(',', 1)[1]
    try:
        image_bytes = base64.b64decode(image_b64, validate=True)
    except Exception:
        return jsonify({'error': 'The page image could not be read.'}), 400
    if not image_bytes:
        return jsonify({'error': 'The page image was empty.'}), 400
    if len(image_bytes) > MAX_IMAGE_BYTES:
        return jsonify({'error': 'The page image is too large.'}), 413

    try:
        client_paid, client_free = _init_gemini_clients('notice')
    except ValueError:
        return jsonify({'error': 'The assistant is not configured on the server.'}), 503

    from google.genai import types

    contents = [
        types.Part.from_bytes(data=image_bytes, mime_type='image/png'),
        _PROMPT.format(question=question),
    ]

    user_id = getattr(request, 'user_id', None)
    start = time.time()
    try:
        response, billing_tier, retry_info = _gemini_generate(
            client_free, client_paid, NOTICE_MODEL, contents,
        )
    except Exception as e:
        elapsed = round(time.time() - start)
        logger.exception('[notice] Gemini call failed')
        _log_api_usage('notice', NOTICE_MODEL, 0, 0, elapsed, error=str(e), user_id=user_id)
        return jsonify({'error': 'The assistant request failed. Please try again.'}), 502

    elapsed = round(time.time() - start)
    answer = (getattr(response, 'text', None) or '').strip()
    in_tok, out_tok, think_tok = _extract_usage_tokens(response)
    retry_info = retry_info or {}
    _log_api_usage(
        'notice', NOTICE_MODEL, in_tok, out_tok, elapsed,
        thinking_tokens=think_tok, billing_tier=billing_tier, user_id=user_id,
        retry_free_error=retry_info.get('free_error'),
        retry_free_elapsed=retry_info.get('free_elapsed'),
    )

    if not answer:
        return jsonify({'error': 'The assistant did not return an answer.'}), 502
    return jsonify({'answer': answer})
