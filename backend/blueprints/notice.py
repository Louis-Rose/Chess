"""Notice.ai backend: answer questions and categorize the page being viewed.

The frontend renders the current PDF page to a PNG and posts it here. We forward
it to Gemini (vision) for two things: a free-form answer (/ask) and a one-label
page category (/categorize). /costs reports the running Gemini spend per model
for this feature. The Gemini client/retry/usage-logging plumbing is reused from
the chesscoaches blueprint so this shares the same paid/free key fallback and
admin usage tracking.
"""

import base64
import logging
import re
import time

from flask import Blueprint, jsonify, request

from auth import login_required
from database import get_db
from blueprints.chesscoaches import (
    _init_gemini_clients,
    _gemini_generate,
    _extract_usage_tokens,
    _log_api_usage,
)

logger = logging.getLogger(__name__)

notice_bp = Blueprint('notice', __name__)

# Models the user may pick from the dropdown. Kept in sync with the frontend
# list (apps/notice/models.ts) and the admin GEMINI_PRICING table so usage cost
# is tracked. Validated server-side so a client can't request an arbitrary model.
ALLOWED_MODELS = {
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
}
# Safety cap on the decoded page image (a rendered page is well under this).
MAX_IMAGE_BYTES = 10 * 1024 * 1024


# Fixed set of page categories for an assembly manual. Assembly steps carry their
# printed step number ("Assemblage - Etape N", N from 1 to 100).
_FIXED_CATEGORIES = ['Sommaire', 'Outils nécessaires', 'Matériel fourni', 'Sécurité', 'Liens']
_STEP_RE = re.compile(r'^Assemblage - Etape ([1-9]\d?|100)$')

_CATEGORIZE_PROMPT = (
    "You are classifying ONE page of a furniture assembly manual. Look at the "
    "attached page image and choose the single category it best matches, from "
    "exactly this list:\n"
    "- Sommaire\n"
    "- Outils nécessaires\n"
    "- Matériel fourni\n"
    "- Assemblage - Etape N  (replace N with the assembly step number printed on the page)\n"
    "- Sécurité\n"
    "- Liens\n"
    "Reply with ONLY the category label, nothing else. For an assembly step, "
    'write it exactly like "Assemblage - Etape 3".'
)


def _decode_image(image_b64):
    """Validate + decode a posted page image. Returns (bytes, None) or
    (None, (response, status)) so callers can `return err` directly."""
    if not image_b64:
        return None, (jsonify({'error': 'No page image was provided.'}), 400)
    # Accept either a data URL ("data:image/png;base64,...") or bare base64.
    if image_b64.startswith('data:') and ',' in image_b64:
        image_b64 = image_b64.split(',', 1)[1]
    try:
        image_bytes = base64.b64decode(image_b64, validate=True)
    except Exception:
        return None, (jsonify({'error': 'The page image could not be read.'}), 400)
    if not image_bytes:
        return None, (jsonify({'error': 'The page image was empty.'}), 400)
    if len(image_bytes) > MAX_IMAGE_BYTES:
        return None, (jsonify({'error': 'The page image is too large.'}), 413)
    return image_bytes, None


def _split_thoughts(response):
    """Split a response into (answer_text, thought_summary). Thought parts carry
    part.thought == True; everything else is the answer. Falls back to
    response.text for the answer if the parts aren't structured as expected."""
    answer, thoughts = [], []
    try:
        for part in response.candidates[0].content.parts:
            text = getattr(part, 'text', None)
            if not text:
                continue
            (thoughts if getattr(part, 'thought', False) else answer).append(text)
    except Exception:
        return (getattr(response, 'text', '') or '').strip(), ''
    ans = '\n'.join(answer).strip() or (getattr(response, 'text', '') or '').strip()
    return ans, '\n'.join(thoughts).strip()


def _gemini_on_image(model, image_bytes, text_prompt, user_id, phase=None, want_thoughts=False):
    """Run one Gemini vision call on a page image, log usage, return
    (answer, thoughts). `phase` tags the usage row ('ask' / 'categorize') so
    timing can be split; `want_thoughts` asks thinking models for their reasoning.
    May raise ValueError (not configured) or other exceptions (call failed)."""
    client_paid, client_free = _init_gemini_clients('notice')
    from google.genai import types

    contents = [
        types.Part.from_bytes(data=image_bytes, mime_type='image/png'),
        text_prompt,
    ]
    config = None
    if want_thoughts:
        config = types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(include_thoughts=True),
        )
    start = time.time()
    try:
        response, billing_tier, retry_info = _gemini_generate(
            client_free, client_paid, model, contents, config=config,
        )
    except Exception as e:
        _log_api_usage('notice', model, 0, 0, round(time.time() - start),
                       error=str(e), user_id=user_id, phase=phase)
        raise

    elapsed = round(time.time() - start)
    answer, thoughts = _split_thoughts(response)
    in_tok, out_tok, think_tok = _extract_usage_tokens(response)
    retry_info = retry_info or {}
    _log_api_usage(
        'notice', model, in_tok, out_tok, elapsed,
        thinking_tokens=think_tok, billing_tier=billing_tier, user_id=user_id,
        retry_free_error=retry_info.get('free_error'),
        retry_free_elapsed=retry_info.get('free_elapsed'), phase=phase,
    )
    return answer, thoughts


@notice_bp.route('/api/notice/categorize', methods=['POST'])
@login_required
def categorize():
    data = request.get_json(silent=True) or {}
    model = (data.get('model') or '').strip()
    if model not in ALLOWED_MODELS:
        return jsonify({'error': 'Unknown model.'}), 400

    image_bytes, err = _decode_image(data.get('image') or '')
    if err:
        return err

    user_id = getattr(request, 'user_id', None)
    try:
        answer, _ = _gemini_on_image(
            model, image_bytes, _CATEGORIZE_PROMPT, user_id, phase='categorize',
        )
    except ValueError:
        return jsonify({'error': 'The assistant is not configured on the server.'}), 503
    except Exception:
        logger.exception('[notice] categorize failed')
        return jsonify({'error': 'Classification failed.'}), 502

    category = _normalize_category(answer)
    if not category:
        return jsonify({'error': 'No category returned.'}), 502
    return jsonify({'category': category})


def _normalize_category(text):
    """Snap the model's reply to one of the known labels (best-effort)."""
    t = (text or '').strip().strip('."')
    if t in _FIXED_CATEGORIES or _STEP_RE.match(t):
        return t
    return t or None


@notice_bp.route('/api/notice/notes', methods=['GET'])
@login_required
def notes():
    """The MVP key points shown on the app's first tab, ordered by position.
    Stored in the DB so the copy can be edited without a frontend rebuild.
    `?lang=en` returns the English copy (body_en), falling back to the base
    French body where a translation is missing."""
    lang = (request.args.get('lang') or '').strip().lower()
    with get_db() as conn:
        rows = conn.execute(
            'SELECT body, body_en FROM notice_notes ORDER BY position, id'
        ).fetchall()
    out = []
    for row in rows:
        r = dict(row)
        out.append(r['body_en'] if lang.startswith('en') and r.get('body_en') else r['body'])
    return jsonify({'notes': out})


@notice_bp.route('/api/notice/costs', methods=['GET'])
@login_required
def costs():
    """Per-model Gemini spend (paid calls) and average categorize time for the
    Notice.ai feature."""
    from blueprints.admin import GEMINI_PRICING

    with get_db() as conn:
        rows = conn.execute(
            """SELECT model_id,
                   SUM(CASE WHEN COALESCE(billing_tier,'paid')='paid' THEN input_tokens ELSE 0 END) AS paid_input,
                   SUM(CASE WHEN COALESCE(billing_tier,'paid')='paid' THEN output_tokens ELSE 0 END) AS paid_output,
                   SUM(CASE WHEN COALESCE(billing_tier,'paid')='paid' THEN COALESCE(thinking_tokens,0) ELSE 0 END) AS paid_thinking
               FROM api_usage
               WHERE feature = 'notice'
               GROUP BY model_id""",
        ).fetchall()
        # Average wall-clock of successful page-category requests, per model.
        time_rows = conn.execute(
            """SELECT model_id, AVG(elapsed_seconds) AS avg_seconds
               FROM api_usage
               WHERE feature = 'notice' AND phase = 'categorize' AND error IS NULL
               GROUP BY model_id""",
        ).fetchall()
        # Total page-category requests issued per model (successes + failures).
        call_rows = conn.execute(
            """SELECT model_id, COUNT(*) AS n
               FROM api_usage
               WHERE feature = 'notice' AND phase = 'categorize'
               GROUP BY model_id""",
        ).fetchall()

    out = {}
    for row in rows:
        r = dict(row)
        pricing = GEMINI_PRICING.get(r['model_id'], {'input': 0, 'output': 0})
        billed_output = (r['paid_output'] or 0) + (r['paid_thinking'] or 0)
        out[r['model_id']] = (
            (r['paid_input'] or 0) * pricing['input'] + billed_output * pricing['output']
        ) / 1_000_000

    times = {}
    for row in time_rows:
        r = dict(row)
        times[r['model_id']] = float(r['avg_seconds']) if r['avg_seconds'] is not None else 0.0

    calls = {}
    for row in call_rows:
        r = dict(row)
        calls[r['model_id']] = int(r['n'] or 0)

    return jsonify({'costs': out, 'times': times, 'calls': calls})
