"""Notice.ai backend: answer questions and categorize the page being viewed.

The frontend renders the current PDF page to a PNG and posts it here. We forward
it to Gemini (vision) for two things: a free-form answer (/ask) and a one-label
page category (/categorize). /costs reports the running Gemini spend per model
for this feature. The Gemini client/retry/usage-logging plumbing is reused from
the chesscoaches blueprint so this shares the same paid/free key fallback and
admin usage tracking.
"""

import base64
import concurrent.futures
import json
import logging
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

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
# Approximate free-tier daily request limits (RPD) per model, for the Pricing
# tab's "free calls used today" bar. Google doesn't expose these via API and
# changes them periodically, so they're hardcoded estimates — edit when they move.
FREE_DAILY_LIMITS = {
    'gemini-3.5-flash': 250,
    'gemini-3.1-flash-lite': 1000,
}
# Safety cap on the decoded page image (a rendered page is well under this).
MAX_IMAGE_BYTES = 10 * 1024 * 1024


# Fixed set of page categories for an assembly manual. Assembly steps carry their
# printed step number ("Assemblage - Etape N", N from 1 to 100).
_FIXED_CATEGORIES = [
    'Sommaire', 'Outils nécessaires', 'Matériel fourni', 'Sécurité', 'Liens',
    'Produit fini (monté)', 'Contact service client', "Conseils d'entretien",
    'Tri & environnement',
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
    "- Contact service client  (customer-service / after-sales contact: address, "
    "phone, email, warranty or spare-parts request)\n"
    "- Conseils d'entretien  (care / maintenance advice: cleaning instructions, "
    "product upkeep)\n"
    "- Tri & environnement  (waste sorting / recycling / environmental disposal "
    "info, packaging recycling symbols)\n"
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


def _guess_mime(data):
    """Best-effort image mime from magic bytes, for web images of unknown type.
    Defaults to JPEG (the common web case) so Gemini still gets a sane type."""
    if data[:3] == b'\xff\xd8\xff':
        return 'image/jpeg'
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    if data[:6] in (b'GIF87a', b'GIF89a'):
        return 'image/gif'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    return 'image/jpeg'


def _fetch_image(url, timeout=8):
    """Download a candidate web image for classification. Returns (bytes, mime)
    or (None, None) on any failure (bad host, timeout, too large, not data)."""
    if not isinstance(url, str) or not url.startswith(('http://', 'https://')):
        return None, None
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read(MAX_IMAGE_BYTES + 1)
    except Exception:
        return None, None
    if not data or len(data) > MAX_IMAGE_BYTES:
        return None, None
    return data, _guess_mime(data)


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


def _gemini_on_images(model, images, text_prompt, user_id, phase=None, want_thoughts=False,
                      pages=None, labels=None, mimes=None):
    """Run one Gemini vision call on one or more page images, log usage, return
    (answer, thoughts). Each image is labelled in order so the model can map its
    output back to a page. `phase` tags the usage row ('ask' / 'categorize') so
    timing can be split; `want_thoughts` asks thinking models for their reasoning;
    `pages` (the page numbers in the block) is shown in the log line. `labels`
    overrides the default "Page image N of M" caption per image; `mimes` overrides
    the default image/png mime per image (for non-PNG web images).
    May raise ValueError (not configured) or other exceptions (call failed)."""
    client_paid, client_free = _init_gemini_clients('notice')
    from google.genai import types

    contents = []
    for i, image_bytes in enumerate(images):
        if labels is not None:
            contents.append(labels[i])
        elif len(images) > 1:
            contents.append(f"Page image {i + 1} of {len(images)}:")
        mime = mimes[i] if mimes is not None else 'image/png'
        contents.append(types.Part.from_bytes(data=image_bytes, mime_type=mime))
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
        answer, thoughts = _gemini_on_images(
            model, [image_bytes], _PARTS_PROMPT, user_id, phase='parts',
            pages=[page] if page else None, want_thoughts=True,
        )
    except ValueError:
        return jsonify({'error': 'The assistant is not configured on the server.'}), 503
    except Exception:
        logger.exception('[notice] parts failed')
        return jsonify({'error': 'Parts extraction failed.'}), 502

    items = _parse_parts(answer)
    if items is None:
        return jsonify({'error': 'The parts list could not be read.'}), 502
    return jsonify({'parts': items, 'reasoning': thoughts or ''})


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


_INFO_KEYS = ('brand', 'time', 'people', 'maxWeight')

_BRAND_PROMPT = (
    "These are ALL the pages of a furniture assembly manual, given in order. Look "
    "across EVERY page (the info may appear on the cover, a safety page, a technical "
    "page, etc., not only the first). Reply with ONLY a JSON object (no markdown "
    "fences, no prose) with these four string keys:\n"
    '  "brand": the brand or manufacturer name (e.g. "IKEA"), or "" if you cannot tell.\n'
    '  "time": the estimated assembly time ONLY if it is explicitly shown '
    '(as text or a clock icon with a value, e.g. "30 min", "1 h 30"), else "".\n'
    '  "people": the recommended number of people ONLY if it is explicitly shown '
    '(as text or a person icon with a number, e.g. "2"), else "".\n'
    '  "maxWeight": the maximum supported weight / load capacity ONLY if it is '
    'explicitly shown (as text or an icon with a value, e.g. "20 kg", "max 50kg"), '
    'else "". Keep the unit.\n'
    'Never guess a value; leave a key "" unless a page clearly states it. '
    'Reply with the JSON object only.'
)


def _parse_info(answer):
    """Parse the model's reply into {brand, time, people, maxWeight}. Missing or
    unrecognized values become empty strings; never raises."""
    empty = {k: '' for k in _INFO_KEYS}
    txt = (answer or '').strip()
    try:
        obj = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
    except (ValueError, json.JSONDecodeError):
        return dict(empty)
    if not isinstance(obj, dict):
        return dict(empty)

    def clean(v):
        s = str(v).strip().strip('."') if v is not None else ''
        return '' if s.lower() in ('unknown', 'n/a', 'none', 'null', '-') else s

    return {k: clean(obj.get(k)) for k in _INFO_KEYS}


@notice_bp.route('/api/notice/brand', methods=['POST'])
@login_required
def brand():
    """Extract the manual's general info from ALL its pages: the brand (used to
    qualify the parts image search, e.g. 'IKEA 147968'), plus the estimated
    assembly time, recommended number of people and maximum supported weight when
    a page states them. The client posts all page images ('images', in order);
    a single 'image' is still accepted for back-compatibility."""
    data = request.get_json(silent=True) or {}
    model = (data.get('model') or 'gemini-3.5-flash').strip()
    if model not in ALLOWED_MODELS:
        model = 'gemini-3.5-flash'

    images_b64 = data.get('images')
    if not isinstance(images_b64, list):
        images_b64 = [data.get('image') or '']
    # Defensive cap against an abusive client.
    if not images_b64 or len(images_b64) > 60:
        return jsonify({'error': 'No page images were provided.'}), 400
    images = []
    for b64 in images_b64:
        img, err = _decode_image(b64)
        if err:
            return err
        images.append(img)

    user_id = getattr(request, 'user_id', None)
    try:
        answer, thoughts = _gemini_on_images(
            model, images, _BRAND_PROMPT, user_id, phase='brand', want_thoughts=True,
        )
    except ValueError:
        return jsonify({'error': 'The assistant is not configured on the server.'}), 503
    except Exception:
        logger.exception('[notice] brand failed')
        return jsonify({'error': 'Brand detection failed.'}), 502

    info = _parse_info(answer)
    info['reasoning'] = thoughts or ''
    info['raw'] = (answer or '').strip()
    return jsonify(info)


# Sites to exclude from the part-image search up front, via Google `-site:`
# operators. Excluding a site still returns the full `num` results — Google
# backfills from the rest — and never costs extra credits. Override with the env
# var SERPER_EXCLUDE_SITES (comma-separated; set it empty to disable exclusion).
_DEFAULT_EXCLUDE_SITES = ('printables.com',)


def _exclude_sites():
    """The domains to exclude from the image search (env override or default)."""
    raw = os.getenv('SERPER_EXCLUDE_SITES')
    sites = raw.split(',') if raw is not None else _DEFAULT_EXCLUDE_SITES
    return [s.strip() for s in sites if s.strip()]


@notice_bp.route('/api/notice/part-images', methods=['GET'])
@login_required
def part_images():
    """Search the web for real photos of a part by its reference, qualified by the
    brand (Serper.dev Google Images proxy). Returns a few candidates for the user
    to pick from; quality varies, so we never auto-select.

    Note: Google's own Custom Search JSON API is closed to new GCP projects (403
    "does not have the access"), so we proxy Google Images through Serper instead."""
    ref = (request.args.get('ref') or '').strip()
    brand_q = (request.args.get('brand') or '').strip()
    if not ref:
        return jsonify({'error': 'No reference provided.'}), 400

    api_key = os.getenv('SERPER_API_KEY')
    if not api_key:
        return jsonify({'error': 'Image search is not configured on the server.'}), 503

    query = f'{brand_q} {ref}'.strip()
    # Send Google `-site:` exclusions with the request, but keep the displayed
    # query clean (just brand + ref).
    q = query + ''.join(f' -site:{d}' for d in _exclude_sites())
    body = json.dumps({'q': q, 'num': 9}).encode('utf-8')
    req = urllib.request.Request(
        'https://google.serper.dev/images', data=body, method='POST',
        headers={'X-API-KEY': api_key, 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            payload = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        # Surface the provider's actual reason (e.g. a 403 "API blocked") to the UI.
        try:
            msg = json.loads(e.read().decode('utf-8')).get('message', '')
        except Exception:
            msg = ''
        logger.warning('[notice] part-images %s: %s', e.code, msg or '(no detail)')
        return jsonify({'error': f'Image search failed ({e.code}): {msg or "blocked"}'}), 502
    except Exception:
        logger.exception('[notice] part-images search failed')
        return jsonify({'error': 'Image search failed.'}), 502

    # Record the credits this call spent, for the Pricing tab's quota bar (Serper
    # has no balance API). Best-effort: a logging failure must not fail the search.
    try:
        spent = int(payload.get('credits') or 0)
        if spent > 0:
            with get_db() as conn:
                conn.execute('INSERT INTO serper_usage (credits) VALUES (?)', (spent,))
    except Exception:
        logger.warning('[notice] failed to record serper credits', exc_info=True)

    images = []
    for it in payload.get('images') or []:
        # The source site as a bare hostname (no path), for a small caption under
        # each candidate. Prefer Serper's `domain`, else parse the page link.
        source = (it.get('domain') or '').strip()
        if not source:
            source = urllib.parse.urlparse(it.get('link') or '').hostname or ''
        if source.startswith('www.'):
            source = source[4:]
        images.append({
            'url': it.get('imageUrl'),
            'thumbnail': it.get('thumbnailUrl') or it.get('imageUrl'),
            'title': it.get('title'),
            'context': it.get('link'),
            'source': source,
        })
    return jsonify({'images': images, 'query': query})


_FILTER_PROMPT = (
    "If a reference line drawing of the target furniture/hardware part is provided, "
    "it is the FIRST image; the rest are CANDIDATE web photos (otherwise every image "
    "is a candidate). For EACH candidate, in order, decide whether to KEEP or "
    "DISCARD it.\n"
    "KEEP a candidate ONLY if it is a clean real photograph of the SAME part as the "
    "reference (matching type and shape) — or, when no reference is given, a clean "
    "real photograph of a single clearly-shown part. The part may appear as one item "
    "or a few identical copies, fully visible.\n"
    "DISCARD a candidate if it is any of: a part that does NOT match the reference (a "
    "different kind of screw / fitting / object); an assortment box, organizer tray, "
    "compartment case, kit or bag holding several DIFFERENT parts; a line drawing, "
    "diagram or illustration; a logo, icon or plain text; product packaging with no "
    "clear view of the part; an unrelated object; a cluttered pile or heap of "
    "overlapping parts; a watermark; OR any added text, caption, banner or "
    "promotional graphic on or around the photo (e.g. a seller banner like 'FOR IKEA "
    "FURNITURE' or 'GENUINE SPARE PARTS / READY TO POST').\n"
    "Return ONLY a JSON array with one object per candidate, in the given order: "
    '[{"keep": true}, {"keep": false}, ...]. No prose, no code fences.'
)


def _parse_filter(answer, n):
    """Parse the model's JSON array of {keep: bool} into a list of n booleans.
    Anything unparseable defaults to keep=False (only keep what the model
    explicitly confirmed as a real photo of the part)."""
    text = (answer or '').strip()
    if text.startswith('```'):
        text = text.strip('`')
        text = text.split('\n', 1)[1] if '\n' in text else text
    arr = None
    try:
        arr = json.loads(text)
    except Exception:
        m = re.search(r'\[.*\]', text, re.S)
        if m:
            try:
                arr = json.loads(m.group(0))
            except Exception:
                arr = None
    arr = arr if isinstance(arr, list) else []
    keep = []
    for i in range(n):
        item = arr[i] if i < len(arr) else None
        keep.append(bool(item.get('keep', False)) if isinstance(item, dict) else False)
    return keep


@notice_bp.route('/api/notice/filter-images', methods=['POST'])
@login_required
def filter_images():
    """Classify candidate web images with Gemini Flash-Lite: KEEP real photos of
    the actual part, DISCARD drawings/diagrams/logos/packaging/unrelated/watermarked
    images. Returns a `keep` boolean per candidate in the order received. Images we
    can't download, and any model/parse failure, default to keep=False (discarded):
    only confirmed real photos are kept; the user reviews and can toggle each one."""
    data = request.get_json(silent=True) or {}
    ref = (data.get('ref') or '').strip()
    brand = (data.get('brand') or '').strip()
    thumbs = data.get('thumbnails') or []
    if not isinstance(thumbs, list) or not thumbs:
        return jsonify({'keep': []})
    thumbs = thumbs[:12]  # safety cap on fan-out
    keep = [False] * len(thumbs)

    # Download candidates in parallel; failures stay keep=False (discarded).
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(9, len(thumbs))) as ex:
        fetched = list(ex.map(_fetch_image, thumbs))
    imgs, mimes, idx_map = [], [], []
    for i, (b, mime) in enumerate(fetched):
        if b:
            imgs.append(b)
            mimes.append(mime)
            idx_map.append(i)
    if not imgs:
        return jsonify({'keep': keep})

    # Lead with the part's reference drawing when the client sends it.
    labels, content_imgs, content_mimes = [], [], []
    ref_bytes, _ = _decode_image(data.get('refImage') or '')
    if ref_bytes:
        labels.append(f"Reference line drawing of part {ref or '(unknown)'} (brand: {brand or 'unknown'}):")
        content_imgs.append(ref_bytes)
        content_mimes.append('image/png')
    for n in range(len(imgs)):
        labels.append(f"Candidate {n + 1}:")
    content_imgs.extend(imgs)
    content_mimes.extend(mimes)

    user_id = getattr(request, 'user_id', None)
    try:
        answer, _ = _gemini_on_images(
            'gemini-3.1-flash-lite', content_imgs, _FILTER_PROMPT, user_id,
            phase='filter', labels=labels, mimes=content_mimes,
        )
    except Exception:
        logger.exception('[notice] filter-images failed')
        return jsonify({'keep': keep})

    verdicts = _parse_filter(answer, len(imgs))
    for pos, cand_idx in enumerate(idx_map):
        keep[cand_idx] = verdicts[pos]
    return jsonify({'keep': keep})


@notice_bp.route('/api/notice/serper-quota', methods=['GET'])
@login_required
def serper_quota():
    """Serper image-search credit usage for the Pricing tab's quota bar. Serper
    exposes no balance API, so we sum the credits our own calls reported and
    compare to the plan size. `used` adds a baseline for credits spent before
    tracking began (3 already consumed; override with SERPER_CREDITS_USED). The
    plan size is SERPER_PLAN_CREDITS (defaults to the 2,500 free tier)."""
    try:
        total = int(os.getenv('SERPER_PLAN_CREDITS') or 2500)
        base = int(os.getenv('SERPER_CREDITS_USED') or 3)
    except ValueError:
        total, base = 2500, 3
    with get_db() as conn:
        row = conn.execute('SELECT COALESCE(SUM(credits), 0) AS s FROM serper_usage').fetchone()
    used = base + int(row['s'] or 0)
    return jsonify({'used': used, 'total': total})


@notice_bp.route('/api/notice/free-quota', methods=['GET'])
@login_required
def free_quota():
    """Free-tier Gemini calls used today, per model, for the Pricing tab. Gemini
    tries the free key first and falls back to paid, so a free-tier row is a call
    the free key served. The day resets at midnight Pacific (where Google's free
    quota resets); created_at is stored UTC-naive, so we shift it to PT to bucket.
    The daily limits are approximate estimates (FREE_DAILY_LIMITS)."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT model_id, COUNT(*) AS n
               FROM api_usage
               WHERE feature = 'notice' AND COALESCE(billing_tier,'paid') = 'free'
                 AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Los_Angeles')::date
                     = (now() AT TIME ZONE 'America/Los_Angeles')::date
               GROUP BY model_id""",
        ).fetchall()
    used = {dict(r)['model_id']: int(dict(r)['n'] or 0) for r in rows}
    out = {
        m: {'used': used.get(m, 0), 'limit': FREE_DAILY_LIMITS.get(m, 0)}
        for m in ALLOWED_MODELS
    }
    return jsonify(out)


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
    """Per-model Gemini spend (paid calls), average time and call count for the
    Notice.ai feature, broken down by phase so the frontend can show one table
    per assembly step: 'categorize' (Étape 1), 'parts' (Étape 2), 'brand'
    (Étape 3, the brand that drives the real-image search)."""
    from blueprints.admin import GEMINI_PRICING

    with get_db() as conn:
        rows = conn.execute(
            """SELECT phase, model_id,
                   SUM(CASE WHEN COALESCE(billing_tier,'paid')='paid' THEN input_tokens ELSE 0 END) AS paid_input,
                   SUM(CASE WHEN COALESCE(billing_tier,'paid')='paid' THEN output_tokens ELSE 0 END) AS paid_output,
                   SUM(CASE WHEN COALESCE(billing_tier,'paid')='paid' THEN COALESCE(thinking_tokens,0) ELSE 0 END) AS paid_thinking,
                   SUM(input_tokens) AS tok_input,
                   SUM(output_tokens) AS tok_output,
                   SUM(COALESCE(thinking_tokens,0)) AS tok_thinking,
                   COUNT(*) AS n_calls,
                   AVG(CASE WHEN error IS NULL THEN elapsed_seconds END) AS avg_seconds
               FROM api_usage
               WHERE feature = 'notice'
               GROUP BY phase, model_id""",
        ).fetchall()

    # One bucket per phase: { costs, times, calls, tokens } keyed by model id.
    phases = {}
    for row in rows:
        r = dict(row)
        bucket = phases.setdefault(
            r['phase'] or '-', {'costs': {}, 'times': {}, 'calls': {}, 'tokens': {}}
        )
        pricing = GEMINI_PRICING.get(r['model_id'], {'input': 0, 'output': 0})
        billed_output = (r['paid_output'] or 0) + (r['paid_thinking'] or 0)
        bucket['costs'][r['model_id']] = (
            (r['paid_input'] or 0) * pricing['input'] + billed_output * pricing['output']
        ) / 1_000_000
        bucket['tokens'][r['model_id']] = {
            'input': int(r['tok_input'] or 0),
            'output': int(r['tok_output'] or 0),
            'thinking': int(r['tok_thinking'] or 0),
        }
        bucket['calls'][r['model_id']] = int(r['n_calls'] or 0)
        bucket['times'][r['model_id']] = (
            float(r['avg_seconds']) if r['avg_seconds'] is not None else 0.0
        )

    # Per-model list price ($ per million tokens), for the selectable models.
    pricing = {
        m: GEMINI_PRICING.get(m, {'input': 0, 'output': 0}) for m in ALLOWED_MODELS
    }

    return jsonify({'phases': phases, 'pricing': pricing})
