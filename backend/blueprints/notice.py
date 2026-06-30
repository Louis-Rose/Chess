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

# Shared prompt pieces, composed into the batch prompt so the label list and
# placement rules are defined once.
_CATEGORY_LABELS = (
    "Categories, use EXACTLY these labels:\n"
    "- Sommaire\n"
    "- Outils nécessaires\n"
    "- Matériel fourni\n"
    "- Assemblage - Etape N  (N is ONE assembly step number, ALWAYS a single number, "
    'NEVER a range: never "Etape 4-5", always a separate "Etape 4" and "Etape 5")\n'
    "- Sécurité\n"
    "- Liens\n"
    "- Produit fini (monté)  (the finished, fully assembled product)\n"
)
_CATEGORY_GUIDANCE = (
    "Printed text (section titles, step numbers, French labels) is part of the "
    "original manual and authoritative; rely on it. The manual is NOT wordless and "
    "nothing was added afterwards. EVERY printed section/step title starts a new "
    "section: whenever a title appears you MUST open a segment just above it, even "
    "a small step title sitting at the very BOTTOM of the page with nothing beneath "
    "it (its content is on the next page). Example: a page showing step 16 with "
    '"ÉTAPE 17" printed near the bottom has TWO segments, Etape 16 (start 0) then '
    "Etape 17. Each individually numbered assembly diagram is its OWN step. A "
    'printed header may group several steps under one range (e.g. "ÉTAPE 4-5"): '
    "IGNORE the range and emit one step per number (Etape 4, then Etape 5), each as "
    "its own segment. When several steps appear on one page, cut the page into one "
    "segment per step.\n"
    "Once an assembly step is in progress, it CONTINUES until a NEW printed "
    "step/section title appears. A page with no new title (only diagrams, or "
    "wall-anchoring / 'secure-it' safety info) stays in the current step; it does "
    "NOT become a separate Sécurité section. Use Sécurité only for a standalone "
    'safety section that is not inside a step. Example: "ÉTAPE 22" announced, then a '
    "secure-it safety page, then the A/B/C wall-fixing diagrams = all one continuous "
    "Etape 22, with no Sécurité in the middle.\n"
)
_BOUNDARY_PLACEMENT = (
    "A section/step title belongs to the section it introduces, so set a segment's "
    "start IMMEDIATELY ABOVE that title (in the blank gap between the previous "
    "content and the new title), never on the title or below it. The new title must "
    'fall just below that start. Write an assembly step exactly like "Assemblage - '
    'Etape 3".'
)


def _batch_prompt(page_numbers, prev_category):
    """Prompt for classifying a block of consecutive pages in one call. The model
    sees the pages in order and is told the category in effect just before the
    block, so assembly step numbers stay consistent across block seams. Each page
    is returned as an ordered top-to-bottom list of segments so a page holding
    several steps is cut into one segment per step."""
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
        'Each object is {"segments": [...]}: an ordered TOP-to-BOTTOM list of the '
        'sections on that page. Each segment is {"category": <label>, "start": '
        "<number from 0 to 1 = where this segment begins, measured from the top of "
        "the page>}. The FIRST segment's start is 0. A page that is a single section "
        'has exactly one segment with start 0.\n'
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


def _gemini_on_images(model, images, text_prompt, user_id, phase=None, want_thoughts=False, pages=None):
    """Run one Gemini vision call on one or more page images, log usage, return
    (answer, thoughts). Each image is labelled in order so the model can map its
    output back to a page. `phase` tags the usage row ('ask' / 'categorize') so
    timing can be split; `want_thoughts` asks thinking models for their reasoning;
    `pages` (the page numbers in the block) is shown in the log line.
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
    # Describe the block: page span + image count + payload size in MB (the size
    # that matters for nginx's body limit). Just count + size if no pages given.
    size_mb = sum(len(img) for img in images) / (1024 * 1024)
    if pages:
        span = f"{pages[0]}-{pages[-1]}" if len(pages) > 1 else f"{pages[0]}"
        block = f"pages {span} ({len(images)} img, {size_mb:.1f} MB)"
    else:
        block = f"{len(images)} img, {size_mb:.1f} MB"
    # One line per call so the logs show which key (free/paid) actually served it.
    logger.info(
        "[notice] %s | %s KEY | %s | %s | %ds | tokens in=%d out=%d think=%d%s",
        model, billing_tier.upper(), phase or '-', block, elapsed, in_tok, out_tok, think_tok,
        ' | free key fell back' if retry_info.get('free_error') else '',
    )
    _log_api_usage(
        'notice', model, in_tok, out_tok, elapsed,
        thinking_tokens=think_tok, billing_tier=billing_tier, user_id=user_id,
        retry_free_error=retry_info.get('free_error'),
        retry_free_elapsed=retry_info.get('free_elapsed'), phase=phase,
    )
    return answer, thoughts


def _normalize_step(text):
    """Snap a label to one of the known categories. A single-number assembly step
    or a fixed category passes; anything else (notably a range like "Etape 4-5")
    is rejected with None so it can't slip through."""
    t = (text or '').strip().strip('."')
    t = t.replace('Étape', 'Etape').replace('étape', 'Etape')
    if t in _FIXED_CATEGORIES or _STEP_RE.match(t):
        return t
    return None


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
    # Defensive cap against an abusive client; the app sends BATCH_SIZE (5) per call.
    if len(images_b64) > 50:
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
            pages=page_numbers,
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
        {'segments': segments, 'reasoning': thoughts or '', 'raw': raw}
        for segments, raw in parsed
    ]
    return jsonify({'results': results})


def _parse_categorize_batch(answer, expected):
    """Parse the model's JSON array into a list of (segments, raw) tuples, one per
    page. `segments` is an ordered top-to-bottom list of {category, start} (the
    first start forced to 0, the rest strictly increasing within (0, 1)). Returns
    None — the whole block fails — if the reply isn't a JSON array of exactly
    `expected` objects, or any segment carries an invalid/range category."""
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
        raw = json.dumps(obj, ensure_ascii=False)

        seg_src = obj.get('segments')
        if not isinstance(seg_src, list) or not seg_src:
            # Tolerate a flat single-section object {"category": ...}.
            if obj.get('category'):
                seg_src = [{'category': obj.get('category'), 'start': 0}]
            else:
                return None

        segments = []
        for j, s in enumerate(seg_src):
            if not isinstance(s, dict):
                return None
            cat = _normalize_step(str(s.get('category') or ''))
            if not cat:
                return None
            try:
                start = float(s.get('start')) if s.get('start') is not None else 0.0
            except (TypeError, ValueError):
                start = 0.0
            if j == 0:
                start = 0.0
            elif not (0 < start < 1):
                return None
            segments.append({'category': cat, 'start': start})

        # Starts must strictly increase top to bottom.
        for a, b in zip(segments, segments[1:]):
            if b['start'] <= a['start']:
                return None
        # Collapse a boundary between two identical categories (meaningless).
        merged = [segments[0]]
        for s in segments[1:]:
            if s['category'] != merged[-1]['category']:
                merged.append(s)
        out.append((merged, raw))
    return out


_PARTS_PROMPT = (
    "This image is the 'supplied parts / hardware' (Matériel fourni) section of a "
    "furniture assembly manual. List EVERY distinct part/fitting drawn (screws, "
    "cams, dowels, plates, etc.). For each part return one JSON object:\n"
    "- box_2d: the bounding box of that part's DRAWING ONLY (not its number/label), "
    "as [ymin, xmin, ymax, xmax] normalized to 0-1000.\n"
    "- qty: the quantity printed next to it (the number in 'Nx', 'x N' or 'N x'), as "
    "an integer. If NO number is printed (e.g. an overview thumbnail of all parts), "
    "use null. Do NOT assume 1.\n"
    "- ref: the printed reference/article number if any (e.g. \"100345\", \"151706\"), "
    "else null.\n"
    "- bag: the bag/sachet label if the parts are grouped in labelled bags, else null.\n"
    "Reply with ONLY a JSON array, no prose, no code fence, one object per part: "
    '{"box_2d": [ymin, xmin, ymax, xmax], "qty": <int>, "ref": <string|null>, '
    '"bag": <string|null>}.'
)


@notice_bp.route('/api/notice/parts', methods=['POST'])
@login_required
def parts():
    """Extract the supplied-parts list from one Matériel fourni page (or the
    cropped material section). Returns one entry per part with its quantity,
    optional reference/bag, and a bounding box (normalized 0..1, x0/y0/x1/y1) of
    its drawing, so the client can crop the piece image."""
    data = request.get_json(silent=True) or {}
    model = (data.get('model') or '').strip()
    if model not in ALLOWED_MODELS:
        return jsonify({'error': 'Unknown model.'}), 400

    image_bytes, err = _decode_image(data.get('image') or '')
    if err:
        return err
    try:
        page = int(data.get('page')) if data.get('page') is not None else None
    except (TypeError, ValueError):
        page = None

    user_id = getattr(request, 'user_id', None)
    try:
        answer, _ = _gemini_on_images(
            model, [image_bytes], _PARTS_PROMPT, user_id, phase='parts',
            pages=[page] if page else None,
        )
    except ValueError:
        return jsonify({'error': 'The assistant is not configured on the server.'}), 503
    except Exception:
        logger.exception('[notice] parts failed')
        return jsonify({'error': 'Parts extraction failed.'}), 502

    items = _parse_parts(answer)
    if items is None:
        return jsonify({'error': 'The parts list could not be read.'}), 502
    return jsonify({'parts': items})


def _parts_qty(v):
    """Coerce a quantity to a positive int, tolerating '8', 8, '8x', 'x8'. Returns
    None when no number is present (e.g. an overview thumbnail), so the client can
    tell a real list entry from an overview duplicate."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return max(1, int(v))
    m = re.search(r'\d+', str(v))
    return max(1, int(m.group())) if m else None


def _parse_parts(answer):
    """Parse the model's JSON array into a list of
    {bbox:[x0,y0,x1,y1], qty, ref, bag}. box_2d ([ymin,xmin,ymax,xmax], 0-1000) is
    converted to a normalized x0/y0/x1/y1 (0..1). Returns None only if the reply
    isn't a JSON array; individual malformed entries are skipped."""
    import json

    txt = (answer or '').strip()
    try:
        arr = json.loads(txt[txt.index('['):txt.rindex(']') + 1])
    except (ValueError, json.JSONDecodeError):
        return None
    if not isinstance(arr, list):
        return None

    out = []
    for obj in arr:
        if not isinstance(obj, dict):
            continue
        box = obj.get('box_2d')
        if not (isinstance(box, list) and len(box) == 4):
            continue
        try:
            ymin, xmin, ymax, xmax = (float(v) for v in box)
        except (TypeError, ValueError):
            continue
        x0 = min(xmin, xmax) / 1000
        y0 = min(ymin, ymax) / 1000
        x1 = max(xmin, xmax) / 1000
        y1 = max(ymin, ymax) / 1000
        x0, y0 = max(0.0, x0), max(0.0, y0)
        x1, y1 = min(1.0, x1), min(1.0, y1)
        if x1 <= x0 or y1 <= y0:
            continue
        ref = obj.get('ref')
        ref = str(ref).strip() if ref else None
        bag = obj.get('bag')
        bag = str(bag).strip() if bag else None
        out.append({
            'bbox': [round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4)],
            'qty': _parts_qty(obj.get('qty')),
            'ref': ref or None,
            'bag': bag or None,
        })
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
