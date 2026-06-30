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
_FIXED_CATEGORIES = [
    'Sommaire', 'Outils nécessaires', 'Matériel fourni', 'Sécurité', 'Liens',
    'Produit fini (monté)',
]
_STEP_RE = re.compile(r'^Assemblage - Etape ([1-9]\d?|100)$')

# Shared prompt pieces, composed into the single-page and batch prompts so the
# label list and boundary rules are defined once.
_CATEGORY_LABELS = (
    "Categories, use EXACTLY these labels:\n"
    "- Sommaire\n"
    "- Outils nécessaires\n"
    "- Matériel fourni\n"
    "- Assemblage - Etape N  (replace N with the assembly step number printed on the page)\n"
    "- Sécurité\n"
    "- Liens\n"
    "- Produit fini (monté)  (the finished, fully assembled product)\n"
)
_CATEGORY_GUIDANCE = (
    "Printed text (section titles, step numbers, French labels) is part of the "
    "original manual and authoritative; rely on it. The manual is NOT wordless and "
    "nothing was added afterwards. A page is usually one section, but a NEW section "
    "begins where its title appears, even if that title sits at the very bottom "
    "with no content beneath it (its content starts on the next page).\n"
)
_BOUNDARY_PLACEMENT = (
    "A section title/heading belongs to the section it introduces, so place the "
    "boundary IMMEDIATELY ABOVE that title (in the blank gap between the previous "
    "content and the new section's title), never on the title or below it. The "
    "new section's title must fall below the boundary line.\n"
    'For an assembly step write it exactly like "Assemblage - Etape 3".'
)

def _batch_prompt(page_numbers, prev_category):
    """Prompt for classifying a block of consecutive pages in one call. The model
    sees the pages in order and is told the category in effect just before the
    block, so assembly step numbers stay consistent across block seams."""
    n = len(page_numbers)
    listing = ", ".join(str(p) for p in page_numbers)
    ctx = (
        f'The page just before this block was classified "{prev_category}", so '
        "continue the assembly-step numbering from there.\n"
        if prev_category else
        "This block is the start of the document.\n"
    )
    return (
        f"You are classifying {n} CONSECUTIVE pages of a furniture assembly manual, "
        f"given IN ORDER. The images are, respectively, pages {listing} (the 1st "
        "image is the 1st page listed, and so on).\n"
        + _CATEGORY_LABELS + _CATEGORY_GUIDANCE +
        "Assembly step numbers run in NON-DECREASING order through the manual and "
        "are usually consecutive (Etape 4, then 5, then 6...). Use the page order to "
        "stay consistent: never go backwards, and never skip or repeat a step number "
        "unless the printed text clearly says so.\n"
        + ctx +
        f"Reply with ONLY a JSON array of EXACTLY {n} objects, in the same page "
        "order, no prose, no code fence. The i-th object classifies the i-th page. "
        'Each object: {"category": <page, or its TOP part if a new section begins '
        'partway down>, "boundary": <number strictly between 0 and 1 from the top '
        'where the new section begins, or null>, "category_below": <category below '
        'the boundary, or null>}.\n'
        + _BOUNDARY_PLACEMENT
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


def _gemini_on_images(model, images, text_prompt, user_id, phase=None, want_thoughts=False):
    """Run one Gemini vision call on one or more page images, log usage, return
    (answer, thoughts). Each image is labelled in order so the model can map its
    output back to a page. `phase` tags the usage row ('ask' / 'categorize') so
    timing can be split; `want_thoughts` asks thinking models for their reasoning.
    May raise ValueError (not configured) or other exceptions (call failed)."""
    client_paid, client_free = _init_gemini_clients('notice')
    from google.genai import types

    contents = []
    for i, image_bytes in enumerate(images):
        if len(images) > 1:
            contents.append(f"Page image {i + 1} of {len(images)}:")
        contents.append(types.Part.from_bytes(data=image_bytes, mime_type='image/png'))
    contents.append(text_prompt)

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
    # One line per call so the logs show which key (free/paid) actually served it.
    logger.info(
        "[notice] %s | %s KEY | %s | %d img | %ds | tokens in=%d out=%d think=%d%s",
        model, billing_tier.upper(), phase or '-', len(images), elapsed, in_tok, out_tok, think_tok,
        ' | free key fell back' if retry_info.get('free_error') else '',
    )
    _log_api_usage(
        'notice', model, in_tok, out_tok, elapsed,
        thinking_tokens=think_tok, billing_tier=billing_tier, user_id=user_id,
        retry_free_error=retry_info.get('free_error'),
        retry_free_elapsed=retry_info.get('free_elapsed'), phase=phase,
    )
    return answer, thoughts


def _normalize_category(text):
    """Snap the model's reply to one of the known labels (best-effort)."""
    t = (text or '').strip().strip('."')
    if t in _FIXED_CATEGORIES or _STEP_RE.match(t):
        return t
    return t or None


@notice_bp.route('/api/notice/categorize-batch', methods=['POST'])
@login_required
def categorize_batch():
    """Classify a block of consecutive pages in one call. The client posts the
    page images (in order), their page numbers, and the category in effect just
    before the block, so the model keeps assembly step numbers consistent across
    block seams. Returns one result per page, in order. No partial result: if the
    reply can't be read as exactly one object per page, the whole block fails."""
    data = request.get_json(silent=True) or {}
    model = (data.get('model') or '').strip()
    if model not in ALLOWED_MODELS:
        return jsonify({'error': 'Unknown model.'}), 400

    images_b64 = data.get('images')
    page_numbers = data.get('pages')
    if not isinstance(images_b64, list) or not images_b64:
        return jsonify({'error': 'No page images were provided.'}), 400
    if not isinstance(page_numbers, list) or len(page_numbers) != len(images_b64):
        return jsonify({'error': 'Pages and images do not line up.'}), 400
    if len(images_b64) > 25:
        return jsonify({'error': 'Too many pages in one block.'}), 400

    images = []
    for b64 in images_b64:
        img, err = _decode_image(b64)
        if err:
            return err
        images.append(img)

    prev_category = (data.get('prevCategory') or '').strip() or None
    user_id = getattr(request, 'user_id', None)
    prompt = _batch_prompt(page_numbers, prev_category)
    try:
        answer, thoughts = _gemini_on_images(
            model, images, prompt, user_id, phase='categorize', want_thoughts=True,
        )
    except ValueError:
        return jsonify({'error': 'The assistant is not configured on the server.'}), 503
    except Exception:
        logger.exception('[notice] categorize-batch failed')
        return jsonify({'error': 'Classification failed.'}), 502

    parsed = _parse_categorize_batch(answer, len(images))
    if parsed is None:
        return jsonify({'error': 'The classification could not be read.'}), 502

    # One thought stream covers the whole block, so it is shared across its pages.
    results = [
        {
            'category': cat,
            'reasoning': thoughts or '',
            'raw': raw,
            'boundary': boundary,
            'categoryBelow': below,
        }
        for cat, boundary, below, raw in parsed
    ]
    return jsonify({'results': results})


def _parse_categorize_batch(answer, expected):
    """Parse the model's JSON array into a list of (category, boundary,
    category_below, raw) tuples, one per page. Returns None (the whole block
    fails) if the reply isn't a JSON array of exactly `expected` valid objects."""
    import json

    txt = (answer or '').strip()
    try:
        arr = json.loads(txt[txt.index('['):txt.rindex(']') + 1])
    except (ValueError, json.JSONDecodeError):
        return None
    if not isinstance(arr, list) or len(arr) != expected:
        return None

    out = []
    for obj in arr:
        if not isinstance(obj, dict):
            return None
        category = _normalize_category(str(obj.get('category') or ''))
        if not category:
            return None
        below_raw = obj.get('category_below')
        below = _normalize_category(str(below_raw)) if below_raw else None
        try:
            boundary = float(obj.get('boundary')) if obj.get('boundary') is not None else None
        except (TypeError, ValueError):
            boundary = None
        if boundary is None or not (0 < boundary < 1) or not below or below == category:
            boundary, below = None, None
        out.append((category, boundary, below, json.dumps(obj, ensure_ascii=False)))
    return out


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
                   SUM(CASE WHEN COALESCE(billing_tier,'paid')='paid' THEN COALESCE(thinking_tokens,0) ELSE 0 END) AS paid_thinking,
                   SUM(input_tokens) AS tok_input,
                   SUM(output_tokens) AS tok_output,
                   SUM(COALESCE(thinking_tokens,0)) AS tok_thinking
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
    tokens = {}
    for row in rows:
        r = dict(row)
        pricing = GEMINI_PRICING.get(r['model_id'], {'input': 0, 'output': 0})
        billed_output = (r['paid_output'] or 0) + (r['paid_thinking'] or 0)
        out[r['model_id']] = (
            (r['paid_input'] or 0) * pricing['input'] + billed_output * pricing['output']
        ) / 1_000_000
        tokens[r['model_id']] = {
            'input': int(r['tok_input'] or 0),
            'output': int(r['tok_output'] or 0),
            'thinking': int(r['tok_thinking'] or 0),
        }

    times = {}
    for row in time_rows:
        r = dict(row)
        times[r['model_id']] = float(r['avg_seconds']) if r['avg_seconds'] is not None else 0.0

    calls = {}
    for row in call_rows:
        r = dict(row)
        calls[r['model_id']] = int(r['n'] or 0)

    # Per-model list price ($ per million tokens), for the selectable models.
    pricing = {
        m: GEMINI_PRICING.get(m, {'input': 0, 'output': 0}) for m in ALLOWED_MODELS
    }

    return jsonify(
        {'costs': out, 'times': times, 'calls': calls, 'tokens': tokens, 'pricing': pricing}
    )
