"""Clothing backend: an agent that hunts for an item across configured stores.

The user types what they're looking for (e.g. "a light linen summer shirt under
80 euros") and a list of source sites (Octobre by default). We hand the request
to Gemini with Google Search grounding so it can browse those stores' live pages
and return concrete products with links. The Gemini client/retry/usage-logging
plumbing is reused from the chesscoaches blueprint so this shares the same
paid/free key fallback and admin usage tracking.
"""

import json
import logging
import re
import time

from flask import Blueprint, jsonify, request

from auth import login_required
from blueprints.chesscoaches import (
    _init_gemini_clients,
    _gemini_generate,
    _extract_usage_tokens,
    _log_api_usage,
    _strip_code_fences,
)

logger = logging.getLogger(__name__)

clothing_bp = Blueprint('clothing', __name__)

# Grounded search works on the flash tier; keep one model, no client choice.
MODEL = 'gemini-3-flash-preview'
# Defensive caps so a client can't send an abusive prompt / source list.
MAX_PROMPT_CHARS = 500
MAX_SOURCES = 12
MAX_ITEMS = 8

_PROMPT = (
    "You are a personal shopping assistant. The user is looking for:\n"
    "\"{query}\"\n\n"
    "Search the web and look ONLY inside these store websites (use site: filters "
    "for each domain): {sources}.\n"
    "Find specific products that are currently listed for sale and genuinely "
    "match the request. For each product give its exact name, its price (with "
    "currency, or null if you cannot find it), a direct URL to the product page, "
    "and one short sentence on why it fits.\n"
    "Return at most {max_items} products, best matches first.\n\n"
    "Respond with ONLY a JSON object, no prose around it, shaped exactly like:\n"
    '{{"summary": "<one short sentence overview>", "items": [{{"name": "...", '
    '"price": "...", "url": "https://...", "note": "..."}}]}}\n'
    "If nothing matches, return an empty items array and say so in summary."
)


def _clean_domain(raw):
    """Normalize a user-supplied source to a bare domain (strip scheme/path)."""
    s = (raw or '').strip().lower()
    s = re.sub(r'^https?://', '', s)
    s = s.split('/', 1)[0]
    return s.strip()


@clothing_bp.route('/api/clothing/search', methods=['POST'])
@login_required
def search():
    data = request.get_json(silent=True) or {}
    query = (data.get('prompt') or '').strip()
    raw_sources = data.get('sources') or []

    if not query:
        return jsonify({'error': 'Tell the agent what to look for.'}), 400
    if len(query) > MAX_PROMPT_CHARS:
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

    try:
        client_paid, client_free = _init_gemini_clients('clothing')
    except ValueError:
        return jsonify({'error': 'The agent is not configured on the server.'}), 503

    from google.genai import types

    prompt = _PROMPT.format(
        query=query, sources=', '.join(sources), max_items=MAX_ITEMS,
    )
    config = types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())],
    )

    user_id = getattr(request, 'user_id', None)
    start = time.time()
    try:
        response, billing_tier, retry_info = _gemini_generate(
            client_free, client_paid, MODEL, prompt, config=config,
        )
    except Exception as e:
        elapsed = round(time.time() - start)
        logger.exception('[clothing] Gemini call failed')
        _log_api_usage('clothing', MODEL, 0, 0, elapsed, error=str(e), user_id=user_id)
        return jsonify({'error': 'The agent request failed. Please try again.'}), 502

    elapsed = round(time.time() - start)
    text = (getattr(response, 'text', None) or '').strip()
    in_tok, out_tok, think_tok = _extract_usage_tokens(response)
    retry_info = retry_info or {}
    _log_api_usage(
        'clothing', MODEL, in_tok, out_tok, elapsed,
        thinking_tokens=think_tok, billing_tier=billing_tier, user_id=user_id,
        retry_free_error=retry_info.get('free_error'),
        retry_free_elapsed=retry_info.get('free_elapsed'),
    )

    if not text:
        return jsonify({'error': 'The agent did not return anything.'}), 502

    summary, items = _parse_result(text)
    return jsonify({'summary': summary, 'items': items, 'sources': sources})


def _parse_result(text):
    """Pull the {summary, items} JSON out of the model's reply, defensively."""
    cleaned = _strip_code_fences(text)
    try:
        obj = json.loads(cleaned)
    except Exception:
        # Last resort: grab the first {...} block.
        m = re.search(r'\{.*\}', cleaned, re.DOTALL)
        try:
            obj = json.loads(m.group(0)) if m else {}
        except Exception:
            return text[:500], []

    if not isinstance(obj, dict):
        return text[:500], []

    summary = str(obj.get('summary') or '').strip()
    items = []
    for it in (obj.get('items') or [])[:MAX_ITEMS]:
        if not isinstance(it, dict):
            continue
        url = str(it.get('url') or '').strip()
        name = str(it.get('name') or '').strip()
        if not name:
            continue
        items.append({
            'name': name,
            'price': str(it.get('price') or '').strip() or None,
            'url': url if url.startswith('http') else None,
            'note': str(it.get('note') or '').strip(),
        })
    return summary, items
