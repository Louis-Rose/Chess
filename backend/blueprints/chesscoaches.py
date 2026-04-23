import base64
import concurrent.futures
import hashlib
import json as json_module
import math
import os
import queue
import re
import secrets
import logging
import threading
import time as time_module
import uuid
from datetime import datetime

import requests as http_requests
from flask import Blueprint, jsonify, request, Response
from auth import login_required, admin_required, get_current_user
from database import get_db

# Sentinel for signaling thread completion in SSE queues
_THREAD_DONE = object()

logger = logging.getLogger(__name__)

coaches_bp = Blueprint('coaches', __name__)


def _revolut_link(username: str, amount: float, currency: str) -> str:
    return f"https://revolut.me/{username}/{amount:.2f}{currency}"

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'scoresheet_uploads')

MIME_TO_EXT = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic'}


def _init_gemini_clients(feature_name):
    """Validate Gemini API keys and return (client_paid, client_free). Raises if paid key missing."""
    from google import genai
    paid_key = os.environ.get('GEMINI_PAID_API_KEY')
    free_key = os.environ.get('GEMINI_FREE_API_KEY')
    if not paid_key:
        logger.error(f"[{feature_name}] GEMINI_PAID_API_KEY not configured")
        raise ValueError("GEMINI_PAID_API_KEY not configured")
    return genai.Client(api_key=paid_key), genai.Client(api_key=free_key) if free_key else None


def _extract_usage_tokens(response):
    """Extract input/output/thinking token counts from a Gemini response."""
    usage = getattr(response, 'usage_metadata', None)
    return (
        getattr(usage, 'prompt_token_count', 0) or 0,
        getattr(usage, 'candidates_token_count', 0) or 0,
        getattr(usage, 'thoughts_token_count', 0) or 0,
    )


def _sse_response(result_queue, threads, total_threads, initial_data, feature_name):
    """Create an SSE streaming Response from a result queue and threads."""
    def generate():
        yield f"data: {json_module.dumps(initial_data)}\n\n"
        threads_done = 0
        while threads_done < total_threads:
            try:
                item = result_queue.get(timeout=300)
                if item is _THREAD_DONE:
                    threads_done += 1
                    continue
                yield f"data: {json_module.dumps(item)}\n\n"
            except queue.Empty:
                break
        yield "data: {\"type\": \"done\"}\n\n"
        logger.info(f"[{feature_name}] All models done.")
        for t in threads:
            t.join(timeout=1)

    return Response(generate(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
    })


def _get_user_surname(user_id):
    """Get the user's surname (last word of name) for upload filenames."""
    try:
        with get_db() as conn:
            row = conn.execute('SELECT name FROM users WHERE id = ?', (user_id,)).fetchone()
            if row and row['name']:
                parts = row['name'].strip().split()
                return parts[-1] if len(parts) > 1 else parts[0]
    except Exception:
        pass
    return str(user_id)


def _next_upload_number(user_dir, feature, surname):
    """Find the next available number for {feature}_{surname}_{N}_{timestamp} naming."""
    prefix = f"{feature}_{surname}_"
    max_n = 0
    if os.path.isdir(user_dir):
        for fname in os.listdir(user_dir):
            m = re.match(rf'^{re.escape(prefix)}(\d+)(?:_[^.]+)?\.\w+$', fname)
            if m:
                max_n = max(max_n, int(m.group(1)))
    return max_n + 1


def migrate_upload_filenames():
    """Retroactively add {YYYY-MM-DD_HHhMM} suffix to upload filenames missing it, using file mtime."""
    if not os.path.isdir(UPLOAD_DIR):
        return
    old_pattern = re.compile(r'^(.+?)_(\d+)(\.\w+)$')
    renamed = 0
    for user_dir_name in os.listdir(UPLOAD_DIR):
        user_dir = os.path.join(UPLOAD_DIR, user_dir_name)
        if not os.path.isdir(user_dir):
            continue
        for fname in os.listdir(user_dir):
            m = old_pattern.match(fname)
            if not m:
                continue
            base, n, ext = m.group(1), m.group(2), m.group(3)
            old_path = os.path.join(user_dir, fname)
            ts = datetime.fromtimestamp(os.path.getmtime(old_path)).strftime('%Y-%m-%d_%Hh%M')
            new_name = f"{base}_{n}_{ts}{ext}"
            new_path = os.path.join(user_dir, new_name)
            if os.path.exists(new_path):
                continue
            os.rename(old_path, new_path)
            renamed += 1
    if renamed:
        logger.info(f"[Upload migration] Renamed {renamed} files to include timestamp")


def _save_upload(user_id, image_bytes, mime_type, feature):
    """Persist an uploaded image to disk under data/scoresheet_uploads/<user_id>/. Skips duplicates by content hash."""
    try:
        user_dir = os.path.join(UPLOAD_DIR, str(user_id))
        os.makedirs(user_dir, exist_ok=True)
        # Check for duplicate content
        digest = hashlib.md5(image_bytes).hexdigest()[:16]
        for existing in os.listdir(user_dir):
            existing_path = os.path.join(user_dir, existing)
            if os.path.isfile(existing_path) and os.path.getsize(existing_path) == len(image_bytes):
                with open(existing_path, 'rb') as f:
                    if hashlib.md5(f.read()).hexdigest()[:16] == digest:
                        logger.info(f"[Upload] Duplicate skipped (matches {existing})")
                        return
        ext = MIME_TO_EXT.get(mime_type, '.jpg')
        surname = _get_user_surname(user_id)
        n = _next_upload_number(user_dir, feature, surname)
        ts = datetime.now().strftime('%Y-%m-%d_%Hh%M')
        filename = f"{feature}_{surname}_{n}_{ts}{ext}"
        path = os.path.join(user_dir, filename)
        with open(path, 'wb') as f:
            f.write(image_bytes)
        logger.info(f"[Upload] Saved {len(image_bytes)} bytes to {path}")
    except Exception as e:
        logger.error(f"[Upload] Failed to save image: {e}")


def _log_api_usage(feature, model_id, input_tokens, output_tokens, elapsed, error=None, request_id=None, thinking_tokens=0, billing_tier='paid', user_id=None, retry_free_error=None, retry_free_elapsed=None, phase=None):
    """Log a Gemini API call to the api_usage table. Retries on DB lock."""
    for attempt in range(3):
        try:
            with get_db() as conn:
                conn.execute(
                    """INSERT INTO api_usage (user_id, request_id, feature, model_id, input_tokens, output_tokens, thinking_tokens, billing_tier, elapsed_seconds, error, retry_free_error, retry_free_elapsed, phase)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (user_id, request_id, feature, model_id, input_tokens, output_tokens, thinking_tokens, billing_tier, elapsed, error, retry_free_error, retry_free_elapsed, phase),
                )
            return
        except Exception as e:
            if attempt < 2:
                time_module.sleep(0.5)
            else:
                logger.error(f"[API Usage] Failed to log after 3 attempts: {e}")


# Models with no free tier — always use paid key
_PAID_ONLY_MODELS = {'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite-preview'}


def _gemini_generate(client_free, client_paid, model_id, contents, config=None, on_retry=None):
    """Try free API key first, fall back to paid on any error. Returns (response, billing_tier, retry_info).
    retry_info is None if no retry, or a dict with error/elapsed details if free key failed."""
    kwargs = {'model': model_id, 'contents': contents}
    if config:
        kwargs['config'] = config

    # Models with no free tier go straight to paid
    if model_id in _PAID_ONLY_MODELS or client_free is None:
        return client_paid.models.generate_content(**kwargs), 'paid', None

    # Try free key first, fall back to paid on any failure
    free_start = time_module.time()
    try:
        return client_free.models.generate_content(**kwargs), 'free', None
    except Exception as e:
        free_elapsed = round(time_module.time() - free_start)
        error_type = type(e).__name__
        logger.info(f"[Gemini] Free key failed for {model_id} ({error_type}) after {free_elapsed}s, falling back to paid key")
        retry_info = {'free_error': f'{error_type}: {e}', 'free_elapsed': free_elapsed}
        if on_retry:
            on_retry(retry_info)
        return client_paid.models.generate_content(**kwargs), 'paid', retry_info


def _gemini_stream_paid(client_paid, model_id, contents, *, timeout_seconds, label, on_progress=None, retries=2):
    """Streaming variant for paid-only models. Retries on timeout/error.
    Calls on_progress(accumulated_text) after each chunk so callers can emit
    incremental progress. Returns (full_text, usage_tuple).

    On final failure, the raised exception has `.partial_text` with whatever
    the model had streamed before the timeout (empty string if nothing)."""
    last_exc = None
    last_partial = ''
    for attempt in range(1, retries + 1):
        state = {'text': '', 'usage': (0, 0, 0), 'error': None}
        done = threading.Event()

        def worker():
            try:
                stream = client_paid.models.generate_content_stream(model=model_id, contents=contents)
                last_chunk = None
                for chunk in stream:
                    piece = getattr(chunk, 'text', None)
                    if piece:
                        state['text'] += piece
                        if on_progress is not None:
                            try:
                                on_progress(state['text'])
                            except Exception:
                                pass
                    last_chunk = chunk
                if last_chunk is not None:
                    state['usage'] = _extract_usage_tokens(last_chunk)
            except Exception as e:
                state['error'] = e
            finally:
                done.set()

        t = threading.Thread(target=worker, daemon=True)
        t.start()
        if done.wait(timeout=timeout_seconds):
            if state['error'] is None:
                return state['text'], state['usage']
            last_exc = state['error']
            last_partial = state['text']
            logger.warning(f"[{label}] attempt {attempt}/{retries} failed: {last_exc} (partial {len(last_partial)} chars)")
        else:
            last_partial = state['text']
            last_exc = TimeoutError(f"timeout after {timeout_seconds}s")
            logger.warning(f"[{label}] timeout (attempt {attempt}/{retries}) — {len(last_partial)} chars streamed so far")
    exc = last_exc if last_exc is not None else RuntimeError(f"[{label}] no response")
    try:
        exc.partial_text = last_partial  # type: ignore[attr-defined]
    except Exception:
        pass
    raise exc


def _gemini_call_with_retry(client_free, client_paid, model_id, contents, *, timeout_seconds, label):
    """Run _gemini_generate with a hard timeout; retry once on timeout/error.

    Gemini's SDK has no built-in request timeout; without this wrapper a stalled
    call blocks the worker forever. Returns (response, billing_tier, attempt_number);
    raises the last exception if both attempts fail. The stuck worker thread on
    timeout is abandoned (pool.shutdown(wait=False)) rather than awaited."""
    last_exc = None
    for attempt in (1, 2):
        pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        future = pool.submit(_gemini_generate, client_free, client_paid, model_id, contents)
        try:
            resp, tier, _ = future.result(timeout=timeout_seconds)
            return resp, tier, attempt
        except concurrent.futures.TimeoutError:
            last_exc = TimeoutError(f"timeout after {timeout_seconds}s")
            logger.warning(f"[{label}] timeout (attempt {attempt}/2)")
        except Exception as e:
            last_exc = e
            logger.warning(f"[{label}] attempt {attempt}/2 failed: {e}")
        finally:
            pool.shutdown(wait=False)
    raise last_exc if last_exc is not None else RuntimeError(f"[{label}] no response")


DIAGRAM_MODELS = [
    {"id": "gemini-3.1-pro-preview", "name": "gemini-3.1-pro"},
]

_avg_cache: dict = {}
_AVG_CACHE_TTL = 120  # seconds


def _get_model_avg_elapsed(feature):
    """Global average elapsed seconds per model for a feature (rounded up),
    cached for 2 minutes. Everyone sees the same estimate so first-time
    users aren't left without one."""
    global _avg_cache
    now = time_module.time()
    cached = _avg_cache.get(feature)
    if cached is not None and (now - cached[0]) <= _AVG_CACHE_TTL:
        return cached[1]
    try:
        with get_db() as conn:
            rows = conn.execute(
                """SELECT model_id, AVG(elapsed_seconds) as avg_elapsed
                   FROM api_usage
                   WHERE feature = ? AND error IS NULL AND elapsed_seconds > 0
                   GROUP BY model_id""",
                (feature,)
            ).fetchall()
            result = {r['model_id']: int(math.ceil(r['avg_elapsed'])) for r in rows}
            _avg_cache[feature] = (now, result)
            return result
    except Exception:
        return {}

def _enrich_models_with_avg(feature):
    """Return model list with avg_elapsed field added for the given feature."""
    avgs = _get_model_avg_elapsed(feature)
    models = DIAGRAM_MODELS if feature == 'diagram' else []
    return [{**m, "avg_elapsed": avgs.get(m["id"])} for m in models]


DIAGRAM_LOCATE_PROMPT = """Find every chess diagram in the image. The image ALWAYS contains at least one diagram.

For each diagram, return:
- A tight bounding box around the 8x8 board that INCLUDES any rank labels (1-8) and file labels (a-h) printed on its edge, when present. Do NOT include the player names, captions, diagram number, turn-to-move arrow, or any other surrounding text — just the board grid (plus its edge labels if any).
- The surrounding metadata read directly from text/markings near the board.

Return ONLY a JSON array. No markdown, no commentary, no code fences.

Each array element MUST have these fields:
- "box_2d": [ymin, xmin, ymax, xmax] — the tight bounding box in your standard 0-1000 normalized coordinate system, with ymin < ymax and xmin < xmax. This is Gemini's native bounding-box format. Do NOT invent a different scale or use pixels.
- "white_player": the white player's name as printed near the diagram, or "" if not visible. Transliterate to Latin alphabet. Just the name, no ratings or dates.
- "black_player": the black player's name as printed near the diagram, or "" if not visible.
- "diagram_number": the integer number printed on or next to the diagram (often inside a circle), or null if none. This is a label identifying the diagram in a book/article — NOT a move number or piece count.
- "active_color": "w" or "b" — whose turn it is, inferred from arrows, "White to move"/"Black to move" captions, or surrounding context. Default to "w" if unclear.
- "has_labels": true if rank labels (1-8) AND file labels (a-h) are printed directly on this board's edge, false if the 8x8 grid is shown without printed coordinates.
- "orientation": "white_bottom" or "black_bottom" — which side's pieces appear on the bottom half of the board as drawn. Always return this field, even when has_labels is true (we use it as a cross-check). Inference rule: on a standard chess board, a1 is a DARK square. Look at the bottom-left square of the 8x8 grid — if it is DARKER than its diagonal neighbor, the board is "white_bottom"; if LIGHTER, it is "black_bottom". Cross-check with the pieces (the king/queen row should be on rank 1 for the side that is on the bottom). If corner color and piece layout disagree, trust the pieces.

Order diagrams top-to-bottom, then left-to-right (by the midpoint of box_2d).

Example output:
[{"box_2d": [120, 80, 620, 480], "white_player": "Kasparov", "black_player": "Karpov", "diagram_number": 18, "active_color": "b", "has_labels": true, "orientation": "white_bottom"}]"""


def _build_read_prompt(has_labels, orientation):
    """Phase-2 prompt. Branches the anchoring instruction on whether the cropped
    board has printed rank/file labels: when labels are present we tell the model
    to use them; otherwise we hand it the corner→square mapping derived from the
    board's orientation."""
    if has_labels:
        anchor_lines = (
            "- The image includes printed rank labels (1-8) along one side and file labels (a-h) along one side. "
            "Use them as your anchor: for each square, trace straight down to read the file and straight across to read the rank."
        )
    elif orientation == 'black_bottom':
        anchor_lines = (
            "- The image does NOT have printed rank/file labels. Black is on the BOTTOM of this view.\n"
            "- Corner mapping: top-left of the board = h1, top-right = a1, bottom-left = h8, bottom-right = a8. Use these corners to anchor every square."
        )
    else:
        anchor_lines = (
            "- The image does NOT have printed rank/file labels. White is on the BOTTOM of this view.\n"
            "- Corner mapping: top-left of the board = a8, top-right = h8, bottom-left = a1, bottom-right = h1. Use these corners to anchor every square."
        )
    return f"""You are analyzing a tightly-cropped image of a SINGLE chess board. There is no other content to read — just the 8x8 grid.

Return ONLY a JSON object (NOT an array). No markdown, no commentary, no code fences.

The object MUST have exactly TWO top-level fields:

1. "grid_box": an object {{"x", "y", "width", "height"}} giving the tight bounding rectangle around the 8x8 playing grid itself (NOT including any printed label strip), in 0-100 percentages relative to the image we sent you. x/y are the top-left corner, width/height are the box dimensions. The 8x8 cells are evenly spaced inside this box, so width and height should be roughly equal. Typical values: x and y between 0 and 20, width and height between 70 and 100.

2. "squares": an object mapping EVERY one of the 64 square names to a one-character symbol. Keys are "a1" through "h8". Values are:
  - White pieces: "K" "Q" "R" "B" "N" "P"
  - Black pieces: "k" "q" "r" "b" "n" "p"
  - Empty square: "."
  You MUST include all 64 keys — every square from a1 to h8 — even empty ones. Any missing square is a failure.

Procedure (follow exactly):
{anchor_lines}
- Visit each square one at a time, in a deterministic order (a8, b8, c8, …, h8, then a7, b7, …, h7, down to a1, …, h1).
- For each square, look AT that specific square in the image and write the symbol for what you see: a piece symbol if a piece is centered on that square, or "." if the square is empty.
- Do not guess based on neighbors. Do not skip squares.
- When you are done, the object must contain exactly 64 entries.

Example output (showing a few entries — the real output must have all 64):
{{"grid_box": {{"x": 6.5, "y": 4.0, "width": 88.0, "height": 88.0}}, "squares": {{"a8":"r","b8":"n","c8":"b","d8":"q","e8":"k","f8":"b","g8":"n","h8":"r","a7":"p","b7":"p","c7":"p","d7":"p","e7":"p","f7":"p","g7":"p","h7":"p","a6":".","b6":".","c6":".","d6":".","e6":".","f6":".","g6":".","h6":".","a5":".","b5":".","c5":".","d5":".","e5":".","f5":".","g5":".","h5":".","a4":".","b4":".","c4":".","d4":".","e4":"P","f4":".","g4":".","h4":".","a3":".","b3":".","c3":".","d3":".","e3":".","f3":".","g3":".","h3":".","a2":"P","b2":"P","c2":"P","d2":"P","e2":".","f2":"P","g2":"P","h2":"P","a1":"R","b1":"N","c1":"B","d1":"Q","e1":"K","f1":"B","g1":"N","h1":"R"}}}}"""


_VALID_SQUARE_CHARS = set('KQRBNPkqrbnp.')
_ALL_SQUARE_NAMES = [f"{f}{r}" for r in '12345678' for f in 'abcdefgh']


def _squares_to_grid(squares):
    """Convert a {square_name: symbol} dict to the 8x8 grid format used by _grid_to_fen.
    Raises ValueError if any of the 64 squares is missing or has an invalid symbol."""
    if not isinstance(squares, dict):
        raise ValueError(f"squares must be a dict, got {type(squares).__name__}")
    missing = [sq for sq in _ALL_SQUARE_NAMES if sq not in squares]
    if missing:
        raise ValueError(f"squares missing {len(missing)} entries: {missing[:5]}...")
    grid = []
    for r in range(8):  # r=0 → rank 8, r=7 → rank 1
        rank_num = 8 - r
        row = ''
        for file_char in 'abcdefgh':
            sym = squares.get(f'{file_char}{rank_num}')
            if not isinstance(sym, str) or len(sym) != 1 or sym not in _VALID_SQUARE_CHARS:
                raise ValueError(f"square {file_char}{rank_num} has invalid value: {sym!r}")
            row += sym
        grid.append(row)
    return grid


def _grid_to_fen(board, active_color):
    """Convert an 8x8 grid (array of 8 strings of 8 chars each) to a FEN string.
    Raises ValueError if the grid is malformed."""
    if not isinstance(board, list) or len(board) != 8:
        raise ValueError(f"board must be 8 rows, got {len(board) if isinstance(board, list) else type(board)}")
    ranks = []
    for i, row in enumerate(board):
        if not isinstance(row, str) or len(row) != 8:
            raise ValueError(f"rank {8 - i} must be 8 chars, got {row!r}")
        if any(c not in _VALID_SQUARE_CHARS for c in row):
            raise ValueError(f"rank {8 - i} has invalid chars: {row!r}")
        compressed = ''
        empty = 0
        for c in row:
            if c == '.':
                empty += 1
            else:
                if empty:
                    compressed += str(empty)
                    empty = 0
                compressed += c
        if empty:
            compressed += str(empty)
        ranks.append(compressed)
    placement = '/'.join(ranks)
    color = 'w' if str(active_color).lower().startswith('w') else 'b'
    # Castling rights: the reader only sees a static position, so we assume a right
    # is still available iff the involved king and rook are on their home squares.
    # (Corner case of "moved and came back" is ignored.)
    # Rows are indexed 0 = rank 8 ... 7 = rank 1. Columns 0=a ... 7=h.
    castling = ''
    if board[7][4] == 'K':
        if board[7][7] == 'R':
            castling += 'K'
        if board[7][0] == 'R':
            castling += 'Q'
    if board[0][4] == 'k':
        if board[0][7] == 'r':
            castling += 'k'
        if board[0][0] == 'r':
            castling += 'q'
    castling = castling or '-'
    return f"{placement} {color} {castling} - 0 1"


def _parse_and_validate_read(raw_text):
    """Parse the single-region reader response and validate that 'squares' is
    present with all 64 entries plus a sane 'grid_box'. Raises
    ValueError / JSONDecodeError on malformed JSON or invalid structure.
    Used by the structural retry wrapper."""
    raw = _strip_code_fences(raw_text)
    parsed = json_module.loads(raw)
    if isinstance(parsed, list):
        parsed = parsed[0] if parsed else {}
    squares = parsed.get('squares')
    if not isinstance(squares, dict):
        raise ValueError("missing 'squares' object")
    _squares_to_grid(squares)  # raises ValueError if any of the 64 is missing/invalid
    grid_box = _validate_grid_box(parsed.get('grid_box'))
    parsed['grid_box'] = grid_box
    return parsed, squares


def _validate_grid_box(raw):
    """Normalize the Phase 2 grid_box into {x, y, width, height} floats in
    [0, 100]. Raises ValueError when the box is malformed. Returns None if
    raw is None (tolerate missing grid_box on the first rollout rather than
    failing the whole pipeline)."""
    if raw is None:
        return None
    if not isinstance(raw, dict) or not all(k in raw for k in ('x', 'y', 'width', 'height')):
        raise ValueError("grid_box must be an object with x, y, width, height")
    try:
        x = float(raw['x']); y = float(raw['y'])
        w = float(raw['width']); h = float(raw['height'])
    except (TypeError, ValueError):
        raise ValueError("grid_box fields must be numeric")
    if w <= 0 or h <= 0:
        raise ValueError("grid_box width/height must be positive")
    # Clamp to [0, 100]; tolerate mild overshoot by clipping rather than rejecting.
    left = max(0.0, min(100.0, x))
    top = max(0.0, min(100.0, y))
    right = max(0.0, min(100.0, x + w))
    bottom = max(0.0, min(100.0, y + h))
    if right - left <= 0 or bottom - top <= 0:
        raise ValueError("grid_box collapsed after clamping")
    return {'x': left, 'y': top, 'width': right - left, 'height': bottom - top}


def _gemini_read_single_with_validation(client_free, client_paid, model_id, contents, *, timeout_seconds, label, max_structural_retries=2):
    """Call the single-region reader and retry if the JSON is structurally
    invalid (missing/incomplete squares). Uses streaming so that on timeout
    we can surface the partial output (attached to the raised exception as
    `.partial_text`) rather than losing everything the model had generated.

    Returns (raw_text, usage, tier, attempt, parsed, squares). Raises the last
    parse exception if all attempts produced invalid JSON."""
    last_exc = None
    last_raw = ''
    last_usage = (0, 0, 0)
    for attempt in range(1, max_structural_retries + 1):
        raw_text, usage = _gemini_stream_paid(
            client_paid, model_id, contents,
            timeout_seconds=timeout_seconds, label=label, retries=1,
        )
        last_raw, last_usage = raw_text, usage
        try:
            parsed, squares = _parse_and_validate_read(raw_text)
            if attempt > 1:
                logger.info(f"[{label}] recovered on structural retry {attempt}/{max_structural_retries}")
            return raw_text, usage, 'paid', attempt, parsed, squares
        except (ValueError, json_module.JSONDecodeError) as ve:
            last_exc = ve
            logger.warning(f"[{label}] invalid JSON structure (attempt {attempt}/{max_structural_retries}): {ve}")
    err = last_exc if last_exc is not None else RuntimeError(f"[{label}] no valid response")
    err.last_raw = last_raw  # type: ignore[attr-defined]
    err.last_usage = last_usage  # type: ignore[attr-defined]
    err.last_tier = 'paid'  # type: ignore[attr-defined]
    raise err


def _strip_code_fences(raw):
    """Remove markdown code fences from LLM output."""
    raw = raw.strip()
    if raw.startswith('```'):
        raw = raw.split('\n', 1)[1] if '\n' in raw else raw[3:]
        if raw.endswith('```'):
            raw = raw[:-3]
        raw = raw.strip()
    if raw.startswith('json\n'):
        raw = raw[5:].strip()
    return raw


_FILES = 'abcdefgh'


def _build_cell_rects(grid_box, orientation):
    """Given the 0-100 grid_box and the board orientation, return a dict mapping
    each of the 64 square names (a1..h8) to its {x, y, width, height} rect in
    the same 0-100 percent space as grid_box. Cells are produced by even 8x8
    slicing of grid_box; orientation decides which image-space (col, row)
    corresponds to each square."""
    if not grid_box:
        return None
    cell_w = grid_box['width'] / 8.0
    cell_h = grid_box['height'] / 8.0
    gx = grid_box['x']
    gy = grid_box['y']
    rects = {}
    for file_idx, file_ch in enumerate(_FILES):
        for rank in range(1, 9):
            if orientation == 'black_bottom':
                col = 7 - file_idx        # a at the right, h at the left
                row = rank - 1            # rank 1 at the top
            else:
                col = file_idx            # a at the left, h at the right
                row = 8 - rank            # rank 1 at the bottom
            rects[f"{file_ch}{rank}"] = {
                'x': gx + col * cell_w,
                'y': gy + row * cell_h,
                'width': cell_w,
                'height': cell_h,
            }
    return rects


def _compute_cell_histograms(image_bytes, cell_rects):
    """Per-cell grayscale histograms. Returns {square_name: list[int] of length
    256}, or None if inputs are unusable. Uses the same L-mode luma as the
    whole-grid histogram so bins are directly comparable."""
    if not cell_rects:
        return None
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(image_bytes)).convert('L')
        w, h = img.size
        out = {}
        for name, rect in cell_rects.items():
            left = int(rect['x'] / 100.0 * w)
            top = int(rect['y'] / 100.0 * h)
            right = int((rect['x'] + rect['width']) / 100.0 * w)
            bottom = int((rect['y'] + rect['height']) / 100.0 * h)
            if right <= left or bottom <= top:
                out[name] = [0] * 256
                continue
            bins = img.crop((left, top, right, bottom)).histogram()[:256]
            if len(bins) < 256:
                bins = bins + [0] * (256 - len(bins))
            out[name] = bins
        return out
    except Exception as e:
        logger.warning(f"[Diagram] per-cell histograms failed: {e}")
        return None


def _compute_pixel_histogram(image_bytes, grid_box):
    """Grayscale pixel histogram of the image region inside grid_box (0-100 %).
    Returns {'bins': list[int] of length 256, 'total': int}, or None if inputs
    are unusable. Luma is computed via PIL's standard L conversion (ITU-R 601-2)."""
    if not grid_box:
        return None
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(image_bytes))
        w, h = img.size
        left = int(grid_box['x'] / 100.0 * w)
        top = int(grid_box['y'] / 100.0 * h)
        right = int((grid_box['x'] + grid_box['width']) / 100.0 * w)
        bottom = int((grid_box['y'] + grid_box['height']) / 100.0 * h)
        if right <= left or bottom <= top:
            return None
        gray = img.crop((left, top, right, bottom)).convert('L')
        bins = gray.histogram()[:256]
        # Pad to 256 defensively (L mode should always give 256).
        if len(bins) < 256:
            bins = bins + [0] * (256 - len(bins))
        return {'bins': bins, 'total': sum(bins)}
    except Exception as e:
        logger.warning(f"[Diagram] pixel histogram failed: {e}")
        return None


def _compute_pixel_histogram_skip(image_bytes, grid_box, skip_mask):
    """Grayscale histogram of the grid_box region, ignoring every pixel where
    skip_mask is True. Shape of skip_mask must match the full image (H, W).
    Returns {'bins': list[int] of length 256, 'total': int} or None.
    """
    if not grid_box or skip_mask is None:
        return None
    try:
        import io
        import numpy as np
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes))
        w, h = img.size
        left = int(grid_box['x'] / 100.0 * w)
        top = int(grid_box['y'] / 100.0 * h)
        right = int((grid_box['x'] + grid_box['width']) / 100.0 * w)
        bottom = int((grid_box['y'] + grid_box['height']) / 100.0 * h)
        if right <= left or bottom <= top:
            return None
        gray = np.array(img.crop((left, top, right, bottom)).convert('L'), dtype=np.uint8)
        sub_skip = skip_mask[top:bottom, left:right]
        vals = gray[~sub_skip]
        bins = np.bincount(vals, minlength=256)[:256].astype(int).tolist()
        return {'bins': bins, 'total': int(vals.size)}
    except Exception as e:
        logger.warning(f"[Diagram] masked pixel histogram failed: {e}")
        return None


def _compute_cell_histograms_skip(image_bytes, cell_rects, skip_mask):
    """Per-cell grayscale histogram, ignoring skipped pixels. Empty cells whose
    pixels were all masked come back as [0]*256."""
    if not cell_rects or skip_mask is None:
        return None
    try:
        import io
        import numpy as np
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes)).convert('L')
        w, h = img.size
        arr = np.array(img, dtype=np.uint8)
        out = {}
        for name, rect in cell_rects.items():
            left = int(rect['x'] / 100.0 * w)
            top = int(rect['y'] / 100.0 * h)
            right = int((rect['x'] + rect['width']) / 100.0 * w)
            bottom = int((rect['y'] + rect['height']) / 100.0 * h)
            if right <= left or bottom <= top:
                out[name] = [0] * 256
                continue
            cell = arr[top:bottom, left:right]
            sub_skip = skip_mask[top:bottom, left:right]
            vals = cell[~sub_skip]
            bins = np.bincount(vals, minlength=256)[:256].astype(int).tolist() if vals.size > 0 else [0] * 256
            out[name] = bins
        return out
    except Exception as e:
        logger.warning(f"[Diagram] masked cell histograms failed: {e}")
        return None


def _refine_grid_box(crop_bytes, grid_box):
    """Snap an approximate grid_box onto the real 9 horizontal + 9 vertical grid
    lines of a chess board crop. Exploits two facts: (1) every grid line spans
    the full board width/height because dark↔light alternation forces a color
    jump in every column at every row boundary (and vice-versa); (2) all 9 lines
    are equally spaced. Piece edges are localized and don't produce a full-width
    jump, so they drop out naturally.

    Uses the "fraction of columns/rows with perpendicular gradient > τ" signal
    and fits (top, row_height) and (left, col_width) independently by brute-force
    2D search in a ±5 %-of-box window. Returns a new grid_box (same 0-100 % space)
    or the original on any failure.
    """
    if not grid_box:
        return grid_box
    try:
        import io
        import numpy as np
        from PIL import Image

        img = Image.open(io.BytesIO(crop_bytes)).convert('L')
        W, H = img.size
        arr = np.array(img, dtype=np.int16)  # (H, W)

        # Absolute pixel bounds of the initial guess.
        gx0 = grid_box['x'] / 100.0 * W
        gy0 = grid_box['y'] / 100.0 * H
        gw0 = grid_box['width'] / 100.0 * W
        gh0 = grid_box['height'] / 100.0 * H

        # Perpendicular-only gradients: for horizontal grid lines use vertical diffs
        # (|arr[y] - arr[y-1]|, summed/thresholded across x); for vertical grid lines
        # use horizontal diffs. Threshold of 12 luma levels is a cell-transition jump
        # that piece-interior noise rarely matches.
        dv = np.abs(np.diff(arr, axis=0))  # (H-1, W): jump between row y-1 and y
        dh = np.abs(np.diff(arr, axis=1))  # (H, W-1): jump between col x-1 and x
        JUMP_TAU = 12

        # 1D signal along Y: fraction of columns (within the horizontal span of the
        # box) with a vertical jump >= τ. Indexed such that signal_y[y] is the
        # "strength" of a horizontal grid line at pixel row y.
        x_lo = max(0, int(gx0))
        x_hi = min(W, int(gx0 + gw0))
        if x_hi - x_lo < 8:
            return grid_box
        signal_y = (dv[:, x_lo:x_hi] >= JUMP_TAU).mean(axis=1)  # length H-1
        # Pad to length H so signal_y[y] corresponds to the row boundary "above y".
        signal_y = np.concatenate([[0.0], signal_y])

        y_lo = max(0, int(gy0))
        y_hi = min(H, int(gy0 + gh0))
        if y_hi - y_lo < 8:
            return grid_box
        signal_x = (dh[y_lo:y_hi, :] >= JUMP_TAU).mean(axis=0)  # length W-1
        signal_x = np.concatenate([[0.0], signal_x])

        def _best_fit(signal, start0, step0, axis_len):
            """Find (start, step) maximizing sum of signal at start + k*step for
            k=0..8. Search ±5 % of board size around the initial guess for start,
            ±3 % for step. Returns (best_start, best_step)."""
            slack_start = max(3, int(round(step0 * 8 * 0.05)))
            slack_step = max(1, int(round(step0 * 0.03)))
            best_score = -1.0
            best_start = start0
            best_step = step0
            for start in range(int(round(start0)) - slack_start, int(round(start0)) + slack_start + 1):
                for step in range(int(round(step0)) - slack_step, int(round(step0)) + slack_step + 1):
                    if step <= 0:
                        continue
                    last = start + 8 * step
                    if start < 0 or last >= axis_len:
                        continue
                    # Robustness: sample a ±1 px window around each predicted line
                    # and take the max. Handles sub-pixel drift without widening
                    # the search grid.
                    score = 0.0
                    for k in range(9):
                        y = start + k * step
                        score += max(signal[y - 1] if y > 0 else 0.0,
                                     signal[y],
                                     signal[y + 1] if y + 1 < axis_len else 0.0)
                    if score > best_score:
                        best_score = score
                        best_start = start
                        best_step = step
            return best_start, best_step

        top_px, row_h = _best_fit(signal_y, gy0, gh0 / 8.0, len(signal_y))
        left_px, col_w = _best_fit(signal_x, gx0, gw0 / 8.0, len(signal_x))

        new_box = {
            'x': max(0.0, left_px / W * 100.0),
            'y': max(0.0, top_px / H * 100.0),
            'width': min(100.0, (col_w * 8) / W * 100.0),
            'height': min(100.0, (row_h * 8) / H * 100.0),
        }
        # Clamp so x+width <= 100 and y+height <= 100.
        if new_box['x'] + new_box['width'] > 100.0:
            new_box['width'] = 100.0 - new_box['x']
        if new_box['y'] + new_box['height'] > 100.0:
            new_box['height'] = 100.0 - new_box['y']
        return new_box
    except Exception as e:
        logger.warning(f"[Diagram] grid_box refinement failed: {e}")
        return grid_box


def _mask_board_background(crop_bytes, cell_rects, squares):
    """Mask pixels that look like an "empty cell of this parity" pattern, replacing
    them with white. Uses per-pixel template subtraction (not a single color): a
    pixel is masked iff there exists an offset (dy, dx) within ±K pixels such
    that the cell pixel's LAB matches the template pixel at that shifted location
    within tolerance. This generalizes flat-color backgrounds (where the template
    is uniform) to patterned ones (hatching, textures) and tolerates a few pixels
    of phase drift between cells. Returns (png_bytes, skip_mask) where skip_mask
    is bool (H, W); returns None on calibration failure.

    Parity convention: a1 is dark. For any square `<file><rank>`, is_dark iff
    (file_idx + rank_idx) is even.
    """
    if not cell_rects or not squares:
        return None
    try:
        import io
        import numpy as np
        from PIL import Image

        img = Image.open(io.BytesIO(crop_bytes)).convert('RGB')
        W, H = img.size
        rgb = np.array(img, dtype=np.uint8)
        lab = np.array(img.convert('LAB'), dtype=np.int16)
        skip_mask = np.zeros((H, W), dtype=bool)

        def _is_dark(sq):
            return (ord(sq[0]) - ord('a') + int(sq[1]) - 1) % 2 == 0

        def _cell_box(rect):
            left = int(rect['x'] / 100.0 * W)
            top = int(rect['y'] / 100.0 * H)
            right = int((rect['x'] + rect['width']) / 100.0 * W)
            bottom = int((rect['y'] + rect['height']) / 100.0 * H)
            return left, top, right, bottom

        # Canonical cell size — the template is defined at this resolution so
        # empty cells from across the board can stack for per-pixel median.
        widths, heights = [], []
        for rect in cell_rects.values():
            l, t, r, b = _cell_box(rect)
            widths.append(r - l)
            heights.append(b - t)
        if not widths:
            return None
        cw_ref = int(np.median(widths))
        ch_ref = int(np.median(heights))
        if cw_ref <= 4 or ch_ref <= 4:
            return None

        # Collect empty cells by parity at canonical size. Skip edge cells that
        # can't provide a full (ch_ref, cw_ref) slab — they'd need padding that
        # would bias the template.
        empty_light_stack = []
        empty_dark_stack = []
        for sq, rect in cell_rects.items():
            if squares.get(sq, '.') != '.':
                continue
            l, t, _r, _b = _cell_box(rect)
            cell = lab[t:t + ch_ref, l:l + cw_ref, :]
            if cell.shape[0] != ch_ref or cell.shape[1] != cw_ref:
                continue
            (empty_dark_stack if _is_dark(sq) else empty_light_stack).append(cell)

        if not empty_light_stack and not empty_dark_stack:
            return None
        light_template = np.median(np.stack(empty_light_stack), axis=0) if empty_light_stack else None
        dark_template = np.median(np.stack(empty_dark_stack), axis=0) if empty_dark_stack else None
        if light_template is None:
            light_template = dark_template
        if dark_template is None:
            dark_template = light_template

        # Tolerance: 95th percentile of per-pixel residual between each empty cell
        # and its template, with a 15-unit buffer and a 15-unit floor. Pixels that
        # differ from the template by more than this are assumed to be piece ink.
        def _tol(stack, template):
            if not stack:
                return 25.0
            arr = np.stack(stack).astype(np.float32) - template.astype(np.float32)
            dists = np.sqrt(np.sum(arr * arr, axis=-1))
            return max(15.0, float(np.percentile(dists, 95)) + 15.0)

        tol_light = _tol(empty_light_stack, light_template)
        tol_dark = _tol(empty_dark_stack, dark_template)

        K = 2  # neighborhood half-width tolerating per-cell phase drift
        light_template_i = light_template.astype(np.int32)
        dark_template_i = dark_template.astype(np.int32)

        out = rgb.copy()
        for sq, rect in cell_rects.items():
            left, top, right, bottom = _cell_box(rect)
            ch_c = bottom - top
            cw_c = right - left
            if ch_c <= 0 or cw_c <= 0:
                continue
            template = dark_template_i if _is_dark(sq) else light_template_i
            tol = tol_dark if _is_dark(sq) else tol_light

            # Resize the template to this cell's exact pixel size (nearest neighbor —
            # sub-pixel accuracy isn't worth the cost for the ±1 px size variations
            # we see from rounding).
            if template.shape[0] != ch_c or template.shape[1] != cw_c:
                ys_idx = np.linspace(0, template.shape[0] - 1, ch_c).round().astype(int)
                xs_idx = np.linspace(0, template.shape[1] - 1, cw_c).round().astype(int)
                tt = template[ys_idx[:, None], xs_idx[None, :]]
            else:
                tt = template

            # Pad by K on each side so template[y+dy, x+dx] is always in-bounds.
            tt_padded = np.pad(tt, ((K, K), (K, K), (0, 0)), mode='edge')

            cell_lab = lab[top:bottom, left:right, :].astype(np.int32)

            # Minimum squared LAB distance over all (dy, dx) in [-K, K]². Brute
            # force but vectorized per shift — (2K+1)² = 25 iterations × one
            # per-pixel diff each. Plenty fast for 64 cells.
            min_dist2 = None
            for dy in range(-K, K + 1):
                for dx in range(-K, K + 1):
                    shifted = tt_padded[K + dy:K + dy + ch_c, K + dx:K + dx + cw_c, :]
                    diff = cell_lab - shifted
                    d2 = np.sum(diff * diff, axis=-1)
                    min_dist2 = d2 if min_dist2 is None else np.minimum(min_dist2, d2)

            mask = min_dist2 <= (tol * tol)
            out[top:bottom, left:right][mask] = 255
            skip_mask[top:bottom, left:right] |= mask

        # Also whiteout a ±3 px band around every grid line. Pieces never span a
        # cell boundary, so this is safe and catches seam residuals (AA edges,
        # corner intersection pixels, thin line-colored strips) that the
        # color-distance mask above can't classify.
        xs, ys = set(), set()
        for rect in cell_rects.values():
            left, top, right, bottom = _cell_box(rect)
            xs.add(left); xs.add(right)
            ys.add(top); ys.add(bottom)
        BAND = 3
        for y in ys:
            y0, y1 = max(0, y - BAND), min(H, y + BAND + 1)
            out[y0:y1, :] = 255
            skip_mask[y0:y1, :] = True
        for x in xs:
            x0, x1 = max(0, x - BAND), min(W, x + BAND + 1)
            out[:, x0:x1] = 255
            skip_mask[:, x0:x1] = True

        buf = io.BytesIO()
        Image.fromarray(out, 'RGB').save(buf, format='PNG')
        return buf.getvalue(), skip_mask
    except Exception as e:
        logger.warning(f"[Diagram] background masking failed: {e}")
        return None


def _crop_image_region(image_bytes, mime_type, region):
    """Crop a region from an image. Region has x, y, width, height as percentages."""
    from PIL import Image
    import io
    img = Image.open(io.BytesIO(image_bytes))
    w, h = img.size
    left = int(region['x'] / 100 * w)
    top = int(region['y'] / 100 * h)
    right = int((region['x'] + region['width']) / 100 * w)
    bottom = int((region['y'] + region['height']) / 100 * h)
    cropped = img.crop((left, top, right, bottom))
    buf = io.BytesIO()
    fmt = 'PNG' if 'png' in mime_type else 'JPEG'
    cropped.save(buf, format=fmt)
    return buf.getvalue()


@coaches_bp.route('/api/coaches/reread-region', methods=['POST'])
@admin_required
def reread_region():
    """Re-run the phase-2 reader on a single crop. Admin-only — used to retry
    bad reads on a diagram without re-running the full pipeline. Body:
    { crop_data_url: 'data:image/...;base64,...', active_color: 'w'|'b' }."""
    from google.genai import types

    data = request.get_json() or {}
    crop_data_url = data.get('crop_data_url') or ''
    active_color = data.get('active_color', 'w')
    has_labels = bool(data.get('has_labels', True))
    orient_raw = str(data.get('orientation', 'white_bottom')).lower()
    orientation = 'black_bottom' if 'black' in orient_raw else 'white_bottom'
    if not crop_data_url.startswith('data:'):
        return jsonify({'error': 'crop_data_url required'}), 400
    try:
        header, b64 = crop_data_url.split(',', 1)
        crop_mime = header.split(';')[0].removeprefix('data:') or 'image/png'
        crop_bytes = base64.b64decode(b64)
    except Exception:
        return jsonify({'error': 'invalid crop_data_url'}), 400

    try:
        client_paid, client_free = _init_gemini_clients('Diagram reread')
    except ValueError as e:
        return jsonify({'error': str(e)}), 500

    uid = get_current_user()
    req_id = uuid.uuid4().hex[:12]
    model_id = DIAGRAM_MODELS[0]['id']
    contents = [
        types.Part.from_bytes(data=crop_bytes, mime_type=crop_mime),
        _build_read_prompt(has_labels, orientation),
    ]

    call_start = time_module.time()
    try:
        raw_text, usage, tier, _attempt, parsed, squares = _gemini_read_single_with_validation(
            client_free, client_paid, model_id, contents,
            timeout_seconds=90, label='Diagram reread',
        )
    except (ValueError, json_module.JSONDecodeError) as ve:
        elapsed = round(time_module.time() - call_start)
        last_raw = getattr(ve, 'last_raw', '')
        last_usage = getattr(ve, 'last_usage', (0, 0, 0))
        last_tier = getattr(ve, 'last_tier', 'paid')
        in_tok, out_tok, think_tok = last_usage
        _log_api_usage('diagram', model_id, in_tok, out_tok, elapsed, error=f"invalid JSON: {ve}",
                       request_id=req_id, thinking_tokens=think_tok,
                       billing_tier=last_tier, user_id=uid, phase='read')
        logger.warning(f"[Diagram reread] invalid grid after retries: {ve}")
        return jsonify({'error': f'Invalid grid: {ve}', 'raw': last_raw}), 502
    except Exception as e:
        elapsed = round(time_module.time() - call_start)
        partial = getattr(e, 'partial_text', '') or ''
        logger.error(f"[Diagram reread] failed after retry: {e} (partial {len(partial)} chars)")
        _log_api_usage('diagram', model_id, 0, 0, elapsed, error=str(e),
                       request_id=req_id, user_id=uid, billing_tier='paid', phase='read')
        return jsonify({'error': f'Read failed: {e}', 'raw': partial}), 502

    elapsed = round(time_module.time() - call_start)

    in_tok, out_tok, think_tok = usage
    _log_api_usage('diagram', model_id, in_tok, out_tok, elapsed,
                   request_id=req_id, thinking_tokens=think_tok,
                   billing_tier=tier, user_id=uid, phase='read')

    grid = _squares_to_grid(squares)
    fen = _grid_to_fen(grid, active_color)

    grid_box = parsed.get('grid_box') if isinstance(parsed, dict) else None
    cell_rects = _build_cell_rects(grid_box, orientation)
    pixel_histogram = _compute_pixel_histogram(crop_bytes, grid_box)
    cell_histograms = _compute_cell_histograms(crop_bytes, cell_rects)
    return jsonify({
        'fen': fen,
        'raw': raw_text,
        'elapsed': elapsed,
        'grid_box': grid_box,
        'cell_rects': cell_rects,
        'pixel_histogram': pixel_histogram,
        'cell_histograms': cell_histograms,
    })


@coaches_bp.route('/api/coaches/read-diagram', methods=['POST'])
def read_diagram():
    """Analyze chess diagrams: first locate regions, then read each one independently."""
    from google.genai import types

    logger.info("[Diagram] Request received")

    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    image_file = request.files['image']
    if not image_file.filename:
        return jsonify({"error": "Empty filename"}), 400

    try:
        client_paid, client_free = _init_gemini_clients('Diagram')
    except ValueError as e:
        return jsonify({"error": str(e)}), 500

    image_bytes = image_file.read()
    mime_type = image_file.content_type or 'image/jpeg'
    logger.info(f"[Diagram] Image: {len(image_bytes)} bytes, {mime_type}")

    req_id = uuid.uuid4().hex[:12]
    uid = get_current_user()
    _save_upload(uid, image_bytes, mime_type, 'diagram')

    is_admin = False
    if uid is not None:
        try:
            with get_db() as conn:
                row = conn.execute('SELECT is_admin FROM users WHERE id = ?', (uid,)).fetchone()
                is_admin = bool(row and row['is_admin'])
        except Exception:
            is_admin = False

    model_info = DIAGRAM_MODELS[0]
    model_id = model_info["id"]
    model_name = model_info["name"]

    result_queue = queue.Queue()

    def run_pipeline():
        total_start = time_module.time()

        # ── Phase 1: Locate diagram regions ──
        logger.info(f"[Diagram] Phase 1: locating regions with {model_id}")
        phase1_start = time_module.time()
        # Stream progress so the UI can show "N diagrams detected so far..." while
        # the locate call is still running. Count complete "box_2d" entries in the
        # accumulated text as a cheap partial-parse.
        progress_state = {'last': 0}

        def _locate_progress(accumulated):
            n = accumulated.count('"box_2d"')
            if n > progress_state['last']:
                progress_state['last'] = n
                result_queue.put({"type": "locate_progress", "count": n})

        try:
            raw_text, usage = _gemini_stream_paid(
                client_paid, model_id,
                [types.Part.from_bytes(data=image_bytes, mime_type=mime_type), DIAGRAM_LOCATE_PROMPT],
                timeout_seconds=90, label='Diagram Phase 1', on_progress=_locate_progress,
            )
            tier = 'paid'
            phase1_elapsed = round(time_module.time() - phase1_start)
            in_tok, out_tok, think_tok = usage
            _log_api_usage('diagram', model_id, in_tok, out_tok, phase1_elapsed,
                           request_id=req_id, thinking_tokens=think_tok,
                           billing_tier=tier, user_id=uid, phase='locate')
            if is_admin:
                result_queue.put({"type": "debug", "phase": "locate", "raw": raw_text})
            raw = _strip_code_fences(raw_text)
            raw_items = json_module.loads(raw)
            if not isinstance(raw_items, list):
                raw_items = [raw_items]
            # Validate and normalize each diagram entry into {box, white_player, black_player, diagram_number, active_color}.
            # Box is the tight LLM crop (8x8 grid + edge labels) clamped to [0, 100].
            valid_diagrams = []
            for r in raw_items:
                if not isinstance(r, dict):
                    continue
                # Extract box. Preferred: {"box_2d": [ymin, xmin, ymax, xmax]} in Gemini's native 0-1000.
                # Legacy fallbacks: {"board_box": {x,y,width,height}} or flat {x,y,width,height} in 0-100.
                box = None
                box_2d = r.get('box_2d')
                if isinstance(box_2d, (list, tuple)) and len(box_2d) == 4:
                    try:
                        ymin, xmin, ymax, xmax = [float(v) for v in box_2d]
                        if xmax > xmin and ymax > ymin and 0 <= xmin and 0 <= ymin and xmax <= 1000 and ymax <= 1000:
                            box = {
                                'x': xmin / 10.0,
                                'y': ymin / 10.0,
                                'width': (xmax - xmin) / 10.0,
                                'height': (ymax - ymin) / 10.0,
                            }
                    except (TypeError, ValueError):
                        pass
                if box is None:
                    board_box = r.get('board_box')
                    if isinstance(board_box, dict) and all(k in board_box for k in ('x', 'y', 'width', 'height')):
                        box = board_box
                if box is None and all(k in r for k in ('x', 'y', 'width', 'height')):
                    box = {k: r[k] for k in ('x', 'y', 'width', 'height')}
                if box is None:
                    logger.warning(f"[Diagram] Phase 1 entry dropped (no valid box): {r}")
                    continue
                # Clamp the LLM's raw tight box to [0, 100].
                bx = float(box['x'])
                by = float(box['y'])
                bw = float(box['width'])
                bh = float(box['height'])
                left = max(0.0, bx)
                top = max(0.0, by)
                right = min(100.0, bx + bw)
                bottom = min(100.0, by + bh)
                clamped_box = {'x': left, 'y': top, 'width': max(0.0, right - left), 'height': max(0.0, bottom - top)}

                # Extract metadata
                white = str(r.get('white_player', '') or '').strip()
                black = str(r.get('black_player', '') or '').strip()
                raw_num = r.get('diagram_number')
                try:
                    diagram_number = int(raw_num) if raw_num not in (None, '') else None
                except (TypeError, ValueError):
                    diagram_number = None
                active_color = 'w' if str(r.get('active_color', 'w')).lower().startswith('w') else 'b'
                has_labels = bool(r.get('has_labels', True))
                orient_raw = str(r.get('orientation', 'white_bottom')).lower()
                orientation = 'black_bottom' if 'black' in orient_raw else 'white_bottom'
                valid_diagrams.append({
                    'box': clamped_box,
                    'white_player': white,
                    'black_player': black,
                    'diagram_number': diagram_number,
                    'active_color': active_color,
                    'has_labels': has_labels,
                    'orientation': orientation,
                })
            # Sort: top-to-bottom, then left-to-right (using box midpoint)
            valid_diagrams.sort(key=lambda d: (d['box']['y'] + d['box']['height'] / 2, d['box']['x'] + d['box']['width'] / 2))

            diagrams_meta = valid_diagrams
            logger.info(f"[Diagram] Phase 1 done: {len(diagrams_meta)} diagram(s) found ({in_tok}+{out_tok}+{think_tok}t tokens) [{tier}]")
        except Exception as e:
            elapsed = round(time_module.time() - total_start)
            logger.error(f"[Diagram] Phase 1 failed: {e}")
            result_queue.put({"type": "result", "model_id": model_id, "name": model_name, "error": f"Region detection failed: {e}", "elapsed": elapsed})
            _log_api_usage('diagram', model_id, 0, 0, elapsed, error=str(e),
                           request_id=req_id, user_id=uid, billing_tier='paid', phase='locate')
            return

        if not diagrams_meta:
            elapsed = round(time_module.time() - total_start)
            logger.info("[Diagram] No regions found")
            result_queue.put({"type": "result", "model_id": model_id, "name": model_name, "diagrams": [], "elapsed": elapsed})
            return

        # Pre-compute each region's crop bytes so phase 2 doesn't re-crop, and
        # the frontend can show the cropped image + metadata while phase 2 runs.
        for m in diagrams_meta:
            m['_crop_bytes'] = _crop_image_region(image_bytes, mime_type, m['box'])
            m['_crop_mime'] = 'image/png' if 'png' in mime_type else 'image/jpeg'
            m['crop_data_url'] = f"data:{m['_crop_mime']};base64,{base64.b64encode(m['_crop_bytes']).decode('ascii')}"

        regions_payload = [
            {
                **m['box'],
                'crop_data_url': m['crop_data_url'],
                'white_player': m['white_player'],
                'black_player': m['black_player'],
                'diagram_number': m['diagram_number'],
                'active_color': m['active_color'],
                'has_labels': m['has_labels'],
                'orientation': m['orientation'],
            }
            for m in diagrams_meta
        ]
        result_queue.put({"type": "regions", "count": len(regions_payload), "regions": regions_payload})

        # ── Phase 2: Read each region in parallel (independent API calls) ──
        diagrams_by_idx = {}

        def read_region(idx, meta):
            logger.info(f"[Diagram] Phase 2: reading region {idx + 1}/{len(diagrams_meta)} "
                        f"(has_labels={meta['has_labels']}, orientation={meta['orientation']})")
            call_start = time_module.time()
            contents = [
                types.Part.from_bytes(data=meta['_crop_bytes'], mime_type=meta['_crop_mime']),
                _build_read_prompt(meta['has_labels'], meta['orientation']),
            ]

            try:
                raw_text, usage, tier, succeeded_on_attempt, parsed, squares = _gemini_read_single_with_validation(
                    client_free, client_paid, model_id, contents,
                    timeout_seconds=90, label=f'Diagram Region {idx + 1}',
                )
            except (ValueError, json_module.JSONDecodeError) as ve:
                call_elapsed = round(time_module.time() - call_start)
                last_raw = getattr(ve, 'last_raw', '')
                last_usage = getattr(ve, 'last_usage', (0, 0, 0))
                last_tier = getattr(ve, 'last_tier', 'paid')
                in_tok, out_tok, think_tok = last_usage
                _log_api_usage('diagram', model_id, in_tok, out_tok, call_elapsed, error=f"invalid JSON: {ve}",
                               request_id=req_id, thinking_tokens=think_tok,
                               billing_tier=last_tier, user_id=uid, phase='read')
                logger.warning(f"[Diagram] Region {idx + 1}: invalid JSON after retries ({ve})")
                if is_admin and last_raw:
                    result_queue.put({"type": "debug", "phase": "read", "index": idx, "raw": last_raw, "attempt": None})
                return
            except Exception as e:
                call_elapsed = round(time_module.time() - call_start)
                partial = getattr(e, 'partial_text', '') or ''
                logger.error(f"[Diagram] Region {idx + 1} failed after retry: {e} (partial {len(partial)} chars)")
                _log_api_usage('diagram', model_id, 0, 0, call_elapsed, error=str(e),
                               request_id=req_id, user_id=uid, billing_tier='paid', phase='read')
                # Surface the partial stream to admins so we can tune the timeout.
                if is_admin and partial:
                    result_queue.put({"type": "debug", "phase": "read", "index": idx, "raw": partial, "attempt": None, "timed_out": True, "timeout_seconds": 90, "partial_chars": len(partial)})
                return

            in_tok, out_tok, think_tok = usage
            call_elapsed = round(time_module.time() - call_start)
            _log_api_usage('diagram', model_id, in_tok, out_tok, call_elapsed,
                           request_id=req_id, thinking_tokens=think_tok,
                           billing_tier=tier, user_id=uid, phase='read')
            if is_admin:
                result_queue.put({"type": "debug", "phase": "read", "index": idx, "raw": raw_text, "attempt": succeeded_on_attempt})

            grid = _squares_to_grid(squares)
            fen = _grid_to_fen(grid, meta['active_color'])

            if fen:
                grid_box_out = parsed.get('grid_box') if isinstance(parsed, dict) else None
                grid_box_out = _refine_grid_box(meta['_crop_bytes'], grid_box_out)
                cell_rects_out = _build_cell_rects(grid_box_out, meta['orientation'])
                diagram = {
                    "fen": fen,
                    "white_player": meta['white_player'],
                    "black_player": meta['black_player'],
                    "region": {**meta['box'], 'has_labels': meta['has_labels'], 'orientation': meta['orientation']},
                    "diagram_number": meta['diagram_number'],
                    "crop_data_url": meta['crop_data_url'],
                    "grid_box": grid_box_out,
                    "cell_rects": cell_rects_out,
                    "pixel_histogram": _compute_pixel_histogram(meta['_crop_bytes'], grid_box_out),
                    "cell_histograms": _compute_cell_histograms(meta['_crop_bytes'], cell_rects_out),
                }
                if is_admin:
                    mask_result = _mask_board_background(meta['_crop_bytes'], cell_rects_out, squares)
                    if mask_result:
                        masked_bytes, skip_mask = mask_result
                        diagram["masked_crop_data_url"] = (
                            f"data:image/png;base64,{base64.b64encode(masked_bytes).decode('ascii')}"
                        )
                        # Histograms over the masked image exclude skipped pixels
                        # entirely — the replacement color never enters the bins,
                        # so the chart and any downstream audit reflect only
                        # surviving signal (piece pixels).
                        diagram["masked_pixel_histogram"] = _compute_pixel_histogram_skip(meta['_crop_bytes'], grid_box_out, skip_mask)
                        diagram["masked_cell_histograms"] = _compute_cell_histograms_skip(meta['_crop_bytes'], cell_rects_out, skip_mask)
                diagrams_by_idx[idx] = diagram
                result_queue.put({"type": "diagram", "index": idx, "diagram": diagram})
                logger.info(f"[Diagram] Region {idx + 1}: {fen[:60]} ({in_tok}+{out_tok}+{think_tok}t tokens) [{tier}]")
            else:
                logger.warning(f"[Diagram] Region {idx + 1}: no FEN extracted")

        region_threads = []
        for idx, meta in enumerate(diagrams_meta):
            rt = threading.Thread(target=read_region, args=(idx, meta))
            rt.start()
            region_threads.append(rt)

        for rt in region_threads:
            rt.join()

        # Build ordered diagrams list
        diagrams = [diagrams_by_idx[i] for i in sorted(diagrams_by_idx.keys())]

        elapsed = round(time_module.time() - total_start)
        logger.info(f"[Diagram] All done: {len(diagrams)} diagram(s) in {elapsed}s")
        result_queue.put({"type": "result", "model_id": model_id, "name": model_name, "diagrams": diagrams, "elapsed": elapsed})

    def run_pipeline_wrapped():
        try:
            run_pipeline()
        finally:
            result_queue.put(_THREAD_DONE)

    t = threading.Thread(target=run_pipeline_wrapped)
    t.start()

    return _sse_response(result_queue, [t], 1,
                         {'type': 'models', 'models': _enrich_models_with_avg('diagram')}, 'Diagram')


# ── Coach Students Management ──

@coaches_bp.route('/api/coaches/students', methods=['GET'])
@login_required
def get_coach_students():
    """List all students for the authenticated coach."""
    with get_db() as conn:
        rows = conn.execute(
            'SELECT * FROM coach_students WHERE coach_user_id = ? ORDER BY student_name ASC',
            (request.user_id,)
        ).fetchall()
    return jsonify({'students': [dict(r) for r in rows]})


@coaches_bp.route('/api/coaches/students', methods=['POST'])
@login_required
def add_coach_student():
    """Add a new student."""
    data = request.get_json()
    name = (data.get('student_name') or '').strip()
    if not name:
        return jsonify({'error': 'student_name required'}), 400
    email = (data.get('email') or '').strip()
    if not email:
        return jsonify({'error': 'email required'}), 400

    recurring_day = data.get('recurring_day')
    recurring_time = (data.get('recurring_time') or '').strip() or None

    with get_db() as conn:
        cursor = conn.execute(
            '''INSERT INTO coach_students
               (coach_user_id, student_name, city, timezone, currency, source, chesscom_username, lichess_username, fide_arena_username, fide_arena_profile_url, recurring_day, recurring_time, email, phone_number)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id''',
            (request.user_id, name,
             (data.get('city') or '').strip() or None,
             data.get('timezone', 'UTC'),
             (data.get('currency') or '').strip() or None,
             (data.get('source') or '').strip() or None,
             (data.get('chesscom_username') or '').strip() or None,
             (data.get('lichess_username') or '').strip() or None,
             (data.get('fide_arena_username') or '').strip() or None,
             (data.get('fide_arena_profile_url') or '').strip() or None,
             recurring_day, recurring_time,
             email,
             (data.get('phone_number') or '').strip() or None)
        )
        student_id = cursor.fetchone()['id']

    return jsonify({'id': student_id, 'message': 'Student added'}), 201


@coaches_bp.route('/api/coaches/students/<int:student_id>', methods=['PUT'])
@login_required
def update_coach_student(student_id):
    """Update a student's details."""
    data = request.get_json()

    allowed = ['student_name', 'city', 'timezone', 'currency', 'source', 'chesscom_username', 'lichess_username', 'fide_arena_username', 'fide_arena_profile_url', 'recurring_day', 'recurring_time', 'email', 'phone_number']
    sets = []
    vals = []
    for field in allowed:
        if field in data:
            val = data[field]
            if isinstance(val, str):
                val = val.strip() or None
            sets.append(f'{field} = ?')
            vals.append(val)

    if not sets:
        return jsonify({'error': 'No fields to update'}), 400

    sets.append('updated_at = CURRENT_TIMESTAMP')
    vals.extend([request.user_id, student_id])

    with get_db() as conn:
        conn.execute(
            f'UPDATE coach_students SET {", ".join(sets)} WHERE coach_user_id = ? AND id = ?',
            tuple(vals)
        )
    return jsonify({'message': 'Student updated'})


@coaches_bp.route('/api/coaches/students/<int:student_id>', methods=['DELETE'])
@login_required
def delete_coach_student(student_id):
    """Delete a student (and cascade lessons)."""
    with get_db() as conn:
        conn.execute(
            'DELETE FROM coach_students WHERE id = ? AND coach_user_id = ?',
            (student_id, request.user_id)
        )
    return jsonify({'message': 'Student deleted'})


@coaches_bp.route('/api/coaches/students/<int:student_id>/lessons', methods=['GET'])
@login_required
def get_student_detail(student_id):
    """Get a specific student's details + lessons."""
    with get_db() as conn:
        student = conn.execute(
            'SELECT * FROM coach_students WHERE id = ? AND coach_user_id = ?',
            (student_id, request.user_id)
        ).fetchone()
        if not student:
            return jsonify({'error': 'Student not found'}), 404

        lessons = conn.execute('''
            SELECT id, scheduled_at, duration_minutes, status, paid, notes, meet_link, pack_id, created_at
            FROM coach_lessons WHERE student_id = ? AND deleted_at IS NULL
            ORDER BY scheduled_at DESC
        ''', (student_id,)).fetchall()

    return jsonify({
        'student': dict(student),
        'lessons': [dict(l) for l in lessons],
    })


@coaches_bp.route('/api/coaches/students/<int:student_id>/lessons', methods=['POST'])
@login_required
def create_lesson(student_id):
    """Create a lesson for a student, optionally with Google Meet link."""
    data = request.get_json()
    scheduled_at = data.get('scheduled_at')
    duration = data.get('duration_minutes', 60)
    notes = (data.get('notes') or '').strip() or None
    create_meet = data.get('create_meet', False)

    if not scheduled_at:
        return jsonify({'error': 'scheduled_at is required'}), 400

    meet_link = None
    with get_db() as conn:
        # Verify ownership
        student = conn.execute(
            'SELECT id, student_name FROM coach_students WHERE id = ? AND coach_user_id = ?',
            (student_id, request.user_id)
        ).fetchone()
        if not student:
            return jsonify({'error': 'Student not found'}), 404

        # Create Meet link if requested
        if create_meet:
            user = conn.execute(
                'SELECT google_calendar_refresh_token FROM users WHERE id = ?',
                (request.user_id,)
            ).fetchone()
            if user and user['google_calendar_refresh_token']:
                from google_calendar import create_meet_event
                summary = f"Chess lesson — {student['student_name']}"
                meet_link = create_meet_event(
                    user['google_calendar_refresh_token'],
                    summary, scheduled_at, duration,
                )

        cursor = conn.execute('''
            INSERT INTO coach_lessons (student_id, scheduled_at, duration_minutes, notes, meet_link)
            VALUES (?, ?, ?, ?, ?) RETURNING id
        ''', (student_id, scheduled_at, duration, notes, meet_link))
        lesson_id = cursor.fetchone()['id']

    return jsonify({'id': lesson_id, 'meet_link': meet_link}), 201


@coaches_bp.route('/api/coaches/lessons/<int:lesson_id>', methods=['PUT'])
@login_required
def update_lesson(lesson_id):
    """Update a lesson (status, notes, scheduled_at)."""
    data = request.get_json()
    with get_db() as conn:
        # Verify ownership via student
        lesson = conn.execute('''
            SELECT cl.id, cs.coach_user_id FROM coach_lessons cl
            JOIN coach_students cs ON cl.student_id = cs.id
            WHERE cl.id = ? AND cl.deleted_at IS NULL
        ''', (lesson_id,)).fetchone()
        if not lesson or lesson['coach_user_id'] != request.user_id:
            return jsonify({'error': 'Lesson not found'}), 404

        VALID_STATUSES = {'scheduled', 'done', 'cancelled', 'tbd'}
        if 'status' in data and data['status'] not in VALID_STATUSES:
            return jsonify({'error': f'Invalid status. Must be one of: {", ".join(VALID_STATUSES)}'}), 400

        allowed = ['scheduled_at', 'duration_minutes', 'status', 'paid', 'notes']
        sets = []
        vals = []
        for field in allowed:
            if field in data:
                val = data[field]
                if isinstance(val, str) and field == 'notes':
                    val = val.strip() or None
                elif field == 'paid':
                    val = 1 if val else 0
                sets.append(f'{field} = ?')
                vals.append(val)

        if not sets:
            return jsonify({'error': 'No fields to update'}), 400

        vals.append(lesson_id)
        conn.execute(f'UPDATE coach_lessons SET {", ".join(sets)} WHERE id = ?', tuple(vals))

    return jsonify({'success': True})


@coaches_bp.route('/api/coaches/lessons/<int:lesson_id>', methods=['DELETE'])
@login_required
def delete_lesson(lesson_id):
    """Soft-delete a lesson so it can be restored via ⌘Z / the restore endpoint.
    Keeps the row (and any external link, e.g. Google Meet event id) intact."""
    with get_db() as conn:
        lesson = conn.execute('''
            SELECT cl.id, cs.coach_user_id FROM coach_lessons cl
            JOIN coach_students cs ON cl.student_id = cs.id
            WHERE cl.id = ?
        ''', (lesson_id,)).fetchone()
        if not lesson or lesson['coach_user_id'] != request.user_id:
            return jsonify({'error': 'Lesson not found'}), 404
        conn.execute(
            'UPDATE coach_lessons SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
            (lesson_id,),
        )
    return jsonify({'success': True})


@coaches_bp.route('/api/coaches/lessons/<int:lesson_id>/restore', methods=['POST'])
@login_required
def restore_lesson(lesson_id):
    """Undo a soft-delete. Keeps the original id (and meet_link)."""
    with get_db() as conn:
        lesson = conn.execute('''
            SELECT cl.id, cs.coach_user_id FROM coach_lessons cl
            JOIN coach_students cs ON cl.student_id = cs.id
            WHERE cl.id = ?
        ''', (lesson_id,)).fetchone()
        if not lesson or lesson['coach_user_id'] != request.user_id:
            return jsonify({'error': 'Lesson not found'}), 404
        conn.execute('UPDATE coach_lessons SET deleted_at = NULL WHERE id = ?', (lesson_id,))
    return jsonify({'success': True})


@coaches_bp.route('/api/coaches/schedule', methods=['GET'])
@login_required
def get_coach_schedule():
    """Get all lessons for the coach within a date range (default: current week)."""
    from datetime import datetime, timedelta
    start = request.args.get('start')
    end = request.args.get('end')
    if not start or not end:
        today = datetime.now()
        monday = today - timedelta(days=today.weekday())
        start = monday.strftime('%Y-%m-%d')
        end = (monday + timedelta(days=7)).strftime('%Y-%m-%d')

    with get_db() as conn:
        lessons = conn.execute('''
            SELECT cl.id, cl.scheduled_at, cl.duration_minutes, cl.status, cl.paid, cl.notes, cl.meet_link,
                   cs.id AS student_id, cs.student_name, cs.timezone AS student_timezone
            FROM coach_lessons cl
            JOIN coach_students cs ON cl.student_id = cs.id
            WHERE cs.coach_user_id = ?
              AND cl.deleted_at IS NULL
              AND cl.scheduled_at >= ?
              AND cl.scheduled_at < ?
            ORDER BY cl.scheduled_at
        ''', (request.user_id, start, end)).fetchall()

    # Flask 3 serializes datetimes as RFC 822 ("Mon, 20 Apr 2026 10:30:00 GMT")
    # which (a) frontend can't slice for a YYYY-MM-DD key, and (b) implies UTC
    # for a naive column. Emit ISO 8601 with no TZ suffix so JS parses as local.
    result = []
    for l in lessons:
        d = dict(l)
        if d.get('scheduled_at') is not None:
            d['scheduled_at'] = d['scheduled_at'].isoformat()
        result.append(d)
    return jsonify({'lessons': result})


@coaches_bp.route('/api/coaches/lessons/unpaid', methods=['GET'])
@login_required
def get_unpaid_lessons():
    """Lessons that were done but haven't been marked paid yet.
    Drives the "Unpaid" list on the Payments panel."""
    with get_db() as conn:
        rows = conn.execute('''
            SELECT cl.id, cl.scheduled_at, cl.duration_minutes,
                   cs.id AS student_id, cs.student_name, cs.currency AS student_currency,
                   cs.linked_user_id
            FROM coach_lessons cl
            JOIN coach_students cs ON cl.student_id = cs.id
            WHERE cs.coach_user_id = ?
              AND cl.deleted_at IS NULL
              AND cl.status = 'done'
              AND COALESCE(cl.paid, 0) = 0
            ORDER BY cl.scheduled_at DESC
        ''', (request.user_id,)).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        if d.get('scheduled_at') is not None:
            d['scheduled_at'] = d['scheduled_at'].isoformat()
        result.append(d)
    return jsonify({'lessons': result})


@coaches_bp.route('/api/coaches/students/<int:student_id>/invite', methods=['POST'])
@login_required
def create_student_invite(student_id):
    """Generate an invite link for a student to create their account."""
    with get_db() as conn:
        # Verify ownership
        student = conn.execute(
            'SELECT id, student_name, linked_user_id FROM coach_students WHERE id = ? AND coach_user_id = ?',
            (student_id, request.user_id)
        ).fetchone()
        if not student:
            return jsonify({'error': 'Student not found'}), 404
        if student['linked_user_id']:
            return jsonify({'error': 'Student already has an account'}), 400

        # Check for existing pending invite
        existing = conn.execute(
            'SELECT token FROM student_invites WHERE student_id = ? AND accepted_at IS NULL',
            (student_id,)
        ).fetchone()
        if existing:
            return jsonify({'token': existing['token']})

        # Generate new invite
        token = secrets.token_urlsafe(32)
        conn.execute(
            'INSERT INTO student_invites (coach_user_id, student_id, token) VALUES (?, ?, ?)',
            (request.user_id, student_id, token)
        )

    return jsonify({'token': token}), 201


@coaches_bp.route('/api/coaches/students/<int:student_id>/invite/send-email', methods=['POST'])
@login_required
def send_student_invite_email_endpoint(student_id):
    """Create or reuse an invite for this student, and email it to them with
    the coach's edited message."""
    data = request.get_json() or {}
    note = (data.get('message') or '').strip()

    with get_db() as conn:
        student = conn.execute(
            'SELECT id, student_name, email, linked_user_id FROM coach_students WHERE id = ? AND coach_user_id = ?',
            (student_id, request.user_id),
        ).fetchone()
        if not student:
            return jsonify({'error': 'Student not found'}), 404
        if student['linked_user_id']:
            return jsonify({'error': 'Student already has an account'}), 400
        if not student['email']:
            return jsonify({'error': 'Student has no email on file'}), 400

        existing = conn.execute(
            'SELECT token FROM student_invites WHERE student_id = ? AND accepted_at IS NULL',
            (student_id,),
        ).fetchone()
        if existing:
            token = existing['token']
        else:
            token = secrets.token_urlsafe(32)
            conn.execute(
                'INSERT INTO student_invites (coach_user_id, student_id, token) VALUES (?, ?, ?)',
                (request.user_id, student_id, token),
            )

        coach = conn.execute(
            'SELECT name FROM users WHERE id = ?', (request.user_id,)
        ).fetchone()
        coach_name = (coach and coach['name']) or 'Your coach'

    import re as _re

    def _slugify(name: str) -> str:
        first = (name or '').strip().lower().split(' ')[0]
        s = _re.sub(r'[^a-z0-9]+', '-', first).strip('-')[:24]
        return s or 'user'

    invite_url = (
        f"{request.host_url.rstrip('/')}/invite/"
        f"from-{_slugify(coach_name)}-to-{_slugify(student['student_name'] or '')}/{token}"
    )

    import threading
    from email_utils import send_student_invite_email
    threading.Thread(
        target=send_student_invite_email,
        kwargs={
            'coach_name': coach_name,
            'student_email': student['email'],
            'student_name': student['student_name'] or '',
            'note': note,
            'invite_url': invite_url,
        },
        daemon=True,
    ).start()

    return jsonify({'token': token, 'sent': True})


# ── Invoices ──

@coaches_bp.route('/api/coaches/invoices', methods=['POST'])
@login_required
def create_invoice():
    """Create an invoice and send it as a chat message to the student."""
    ALLOWED_CURRENCIES = {'EUR', 'USD', 'GBP', 'CHF'}
    data = request.get_json()
    student_id = data.get('student_id')
    amount = data.get('amount')
    currency = (data.get('currency') or '').upper()
    description = (data.get('description') or '').strip()

    if not student_id or not amount or currency not in ALLOWED_CURRENCIES:
        return jsonify({'error': 'student_id, amount, and a valid currency are required'}), 400
    if amount <= 0:
        return jsonify({'error': 'Amount must be positive'}), 400

    with get_db() as conn:
        # Verify coach owns this student and student has a linked account
        student = conn.execute(
            'SELECT id, linked_user_id, student_name FROM coach_students WHERE id = ? AND coach_user_id = ?',
            (student_id, request.user_id)
        ).fetchone()
        if not student:
            return jsonify({'error': 'Student not found'}), 404
        if not student['linked_user_id']:
            return jsonify({'error': 'Student has no account — invite them first'}), 400

        # Create the invoice
        cursor = conn.execute(
            '''INSERT INTO invoices (coach_user_id, student_id, amount, currency, description)
               VALUES (?, ?, ?, ?, ?) RETURNING id''',
            (request.user_id, student_id, amount, currency, description or None)
        )
        invoice_id = cursor.fetchone()['id']

        # Send as a chat message
        msg_content = f"Invoice: {currency} {amount:.2f}" + (f" — {description}" if description else "")
        cursor = conn.execute(
            '''INSERT INTO messages (sender_id, receiver_id, content, invoice_id)
               VALUES (?, ?, ?, ?) RETURNING id, created_at''',
            (request.user_id, student['linked_user_id'], msg_content, invoice_id)
        )
        msg = cursor.fetchone()

        # Link message back to invoice
        conn.execute('UPDATE invoices SET message_id = ? WHERE id = ?', (msg['id'], invoice_id))

        # Build revolut link if coach has a revolut username
        revolut_link = None
        coach_profile = conn.execute(
            'SELECT revolut_username FROM coach_profiles WHERE user_id = ?',
            (request.user_id,)
        ).fetchone()
        if coach_profile and coach_profile['revolut_username']:
            revolut_link = _revolut_link(coach_profile['revolut_username'], amount, currency)

    return jsonify({
        'invoice_id': invoice_id,
        'revolut_link': revolut_link,
        'message': {
            'id': msg['id'],
            'sender_id': request.user_id,
            'content': msg_content,
            'invoice_id': invoice_id,
            'created_at': msg['created_at'].isoformat(),
        }
    }), 201


@coaches_bp.route('/api/invoices/<int:invoice_id>', methods=['GET'])
@login_required
def get_invoice(invoice_id):
    """Get invoice details (accessible by coach or linked student)."""
    with get_db() as conn:
        invoice = conn.execute('''
            SELECT i.*, cs.student_name, cs.linked_user_id,
                   cp.revolut_username, cp.currency AS coach_currency
            FROM invoices i
            JOIN coach_students cs ON i.student_id = cs.id
            LEFT JOIN coach_profiles cp ON i.coach_user_id = cp.user_id
            WHERE i.id = ?
        ''', (invoice_id,)).fetchone()

        if not invoice:
            return jsonify({'error': 'Invoice not found'}), 404
        # Only coach or linked student can view
        if request.user_id != invoice['coach_user_id'] and request.user_id != invoice['linked_user_id']:
            return jsonify({'error': 'Not authorized'}), 403

    revolut_link = None
    if invoice['revolut_username']:
        revolut_link = _revolut_link(invoice['revolut_username'], invoice['amount'], invoice['currency'])

    return jsonify({
        'id': invoice['id'],
        'amount': invoice['amount'],
        'currency': invoice['currency'],
        'description': invoice['description'],
        'status': invoice['status'],
        'revolut_link': revolut_link,
        'student_name': invoice['student_name'],
        'created_at': invoice['created_at'].isoformat() if invoice['created_at'] else None,
        'paid_at': invoice['paid_at'].isoformat() if invoice['paid_at'] else None,
    })


@coaches_bp.route('/api/invoices/<int:invoice_id>/mark-paid', methods=['PUT'])
@login_required
def mark_invoice_paid(invoice_id):
    """Coach marks an invoice as paid."""
    with get_db() as conn:
        invoice = conn.execute(
            'SELECT id, coach_user_id FROM invoices WHERE id = ?', (invoice_id,)
        ).fetchone()
        if not invoice:
            return jsonify({'error': 'Invoice not found'}), 404
        if invoice['coach_user_id'] != request.user_id:
            return jsonify({'error': 'Not authorized'}), 403

        conn.execute(
            "UPDATE invoices SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ?",
            (invoice_id,)
        )

    return jsonify({'success': True})


# ── Coach Packs Management ──

@coaches_bp.route('/api/coaches/packs', methods=['GET'])
@login_required
def get_coach_packs():
    """List all packs for the coach, with consumed lesson count per pack.
    Optional query param ?student_id=X to filter by student."""
    student_filter = request.args.get('student_id', type=int)
    with get_db() as conn:
        query = '''
            SELECT p.id, p.student_id, p.total_lessons, p.lessons_done, p.lessons_paid,
                   p.price, p.currency, p.source, p.note,
                   p.status, p.created_at,
                   s.student_name, s.currency AS student_currency,
                   COUNT(CASE WHEN l.status = 'completed' THEN 1 END) AS consumed
            FROM coach_packs p
            JOIN coach_students s ON p.student_id = s.id
            LEFT JOIN coach_lessons l ON l.pack_id = p.id AND l.deleted_at IS NULL
            WHERE s.coach_user_id = ?
        '''
        params = [request.user_id]
        if student_filter:
            query += ' AND p.student_id = ?'
            params.append(student_filter)
        query += ' GROUP BY p.id, p.student_id, p.total_lessons, p.lessons_done, p.lessons_paid, p.price, p.currency, p.source, p.note, p.status, p.created_at, s.student_name, s.currency ORDER BY s.student_name ASC, p.created_at DESC'
        rows = conn.execute(query, tuple(params)).fetchall()
    return jsonify({'packs': [dict(r) for r in rows]})


@coaches_bp.route('/api/coaches/students/<int:student_id>/packs', methods=['POST'])
@login_required
def create_coach_pack(student_id):
    """Create a new pack for a student."""
    data = request.get_json()
    total = data.get('total_lessons')
    if not total or not isinstance(total, int) or total < 1:
        return jsonify({'error': 'total_lessons must be a positive integer'}), 400

    with get_db() as conn:
        # Verify ownership
        owner = conn.execute(
            'SELECT id FROM coach_students WHERE id = ? AND coach_user_id = ?',
            (student_id, request.user_id)
        ).fetchone()
        if not owner:
            return jsonify({'error': 'Student not found'}), 404

        cursor = conn.execute(
            '''INSERT INTO coach_packs (student_id, total_lessons, lessons_done, lessons_paid, price, currency, source, note)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id''',
            (student_id, total,
             data.get('lessons_done', 0),
             data.get('lessons_paid', 0),
             data.get('price'),
             (data.get('currency') or '').strip() or None,
             (data.get('source') or '').strip() or None,
             (data.get('note') or '').strip() or None)
        )
        pack_id = cursor.fetchone()['id']

    return jsonify({'id': pack_id, 'message': 'Pack created'}), 201


@coaches_bp.route('/api/coaches/packs/<int:pack_id>', methods=['PUT'])
@login_required
def update_coach_pack(pack_id):
    """Update a pack's details."""
    data = request.get_json()
    allowed = ['total_lessons', 'lessons_done', 'lessons_paid', 'price', 'currency', 'source', 'note', 'status']
    sets = []
    vals = []
    for field in allowed:
        if field in data:
            val = data[field]
            if isinstance(val, str):
                val = val.strip() or None
            sets.append(f'{field} = ?')
            vals.append(val)

    if not sets:
        return jsonify({'error': 'No fields to update'}), 400

    vals.append(pack_id)
    vals.append(request.user_id)

    with get_db() as conn:
        conn.execute(
            f'''UPDATE coach_packs SET {", ".join(sets)}
                WHERE id = ? AND student_id IN (SELECT id FROM coach_students WHERE coach_user_id = ?)''',
            tuple(vals)
        )
    return jsonify({'message': 'Pack updated'})


@coaches_bp.route('/api/coaches/packs/<int:pack_id>', methods=['DELETE'])
@login_required
def delete_coach_pack(pack_id):
    """Delete a pack. Linked lessons get pack_id set to NULL via ON DELETE SET NULL."""
    with get_db() as conn:
        conn.execute(
            '''DELETE FROM coach_packs
               WHERE id = ? AND student_id IN (SELECT id FROM coach_students WHERE coach_user_id = ?)''',
            (pack_id, request.user_id)
        )
    return jsonify({'message': 'Pack deleted'})


@coaches_bp.route('/api/coaches/lichess/studies', methods=['GET'])
@login_required
def get_lichess_studies():
    """Fetch a Lichess user's studies via the Lichess API."""
    username = request.args.get('username', '').strip()
    if not username:
        return jsonify({'error': 'Lichess username required'}), 400
    # Use per-user token, fall back to global token
    user_id = request.user_id
    token = None
    with get_db() as conn:
        row = conn.execute('SELECT lichess_token FROM coach_profiles WHERE user_id = ?', (user_id,)).fetchone()
        if row and row['lichess_token']:
            token = row['lichess_token']
    if not token:
        token = os.environ.get('LICHESS_TOKEN', '')
    headers = {'Accept': 'application/x-ndjson'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    try:
        resp = http_requests.get(
            f'https://lichess.org/api/study/by/{username}',
            headers=headers, timeout=10, stream=True
        )
        if resp.status_code == 404:
            return jsonify({'studies': []})
        resp.raise_for_status()
        studies = []
        for line in resp.iter_lines():
            if line:
                obj = json_module.loads(line)
                studies.append({'id': obj['id'], 'name': obj['name']})
        return jsonify({'studies': studies})
    except http_requests.RequestException as e:
        logger.error(f'Lichess API error: {e}')
        return jsonify({'error': 'Failed to fetch Lichess studies'}), 502


@coaches_bp.route('/api/coaches/lichess/studies/<study_id>/import-pgn', methods=['POST'])
@login_required
def import_pgn_to_lichess_study(study_id):
    """Import a PGN as a new chapter in a Lichess study."""
    data = request.get_json()
    if not data or not data.get('pgn'):
        return jsonify({'error': 'PGN required'}), 400
    # Use per-user token, fall back to global token
    user_id = request.user_id
    token = None
    with get_db() as conn:
        row = conn.execute('SELECT lichess_token FROM coach_profiles WHERE user_id = ?', (user_id,)).fetchone()
        if row and row['lichess_token']:
            token = row['lichess_token']
    if not token:
        token = os.environ.get('LICHESS_TOKEN', '')
    if not token:
        return jsonify({'error': 'Lichess token not configured'}), 500
    headers = {'Authorization': f'Bearer {token}'}
    form_data = {'pgn': data['pgn']}
    if data.get('name'):
        form_data['name'] = data['name']
    try:
        resp = http_requests.post(
            f'https://lichess.org/api/study/{study_id}/import-pgn',
            headers=headers, data=form_data, timeout=15
        )
        if resp.status_code == 403:
            return jsonify({'error': 'No permission to add chapter to this study'}), 403
        resp.raise_for_status()
        return jsonify(resp.json())
    except http_requests.RequestException as e:
        logger.error(f'Lichess import-pgn error: {e}')
        return jsonify({'error': 'Failed to import PGN to Lichess study'}), 502


# ── Lichess Token ──

@coaches_bp.route('/api/coaches/lichess/token', methods=['GET'])
@login_required
def get_lichess_token():
    """Check if the user has a Lichess token saved."""
    user_id = request.user_id
    with get_db() as conn:
        row = conn.execute('SELECT lichess_token FROM coach_profiles WHERE user_id = ?', (user_id,)).fetchone()
    has_token = bool(row and row['lichess_token'])
    return jsonify({'has_token': has_token})


@coaches_bp.route('/api/coaches/lichess/token', methods=['PUT'])
@login_required
def save_lichess_token():
    """Save a Lichess personal access token for the user."""
    user_id = request.user_id
    data = request.get_json()
    token = (data.get('token') or '').strip()
    if not token:
        return jsonify({'error': 'Token required'}), 400
    # Validate token against Lichess
    try:
        resp = http_requests.get('https://lichess.org/api/account',
                                 headers={'Authorization': f'Bearer {token}'}, timeout=10)
        if resp.status_code == 401:
            return jsonify({'error': 'Invalid token'}), 400
        resp.raise_for_status()
        lichess_user = resp.json().get('username', '')
    except http_requests.RequestException:
        return jsonify({'error': 'Could not verify token with Lichess'}), 502
    with get_db() as conn:
        conn.execute('''
            INSERT INTO coach_profiles (user_id, lichess_token, lichess_username, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id) DO UPDATE SET
                lichess_token = EXCLUDED.lichess_token,
                lichess_username = EXCLUDED.lichess_username,
                updated_at = CURRENT_TIMESTAMP
        ''', (user_id, token, lichess_user))
    return jsonify({'success': True, 'username': lichess_user})


@coaches_bp.route('/api/coaches/lichess/token', methods=['DELETE'])
@login_required
def delete_lichess_token():
    """Remove the user's Lichess token."""
    user_id = request.user_id
    with get_db() as conn:
        conn.execute('UPDATE coach_profiles SET lichess_token = NULL WHERE user_id = ?', (user_id,))
    return jsonify({'success': True})


# ── Onboarding ──

@coaches_bp.route('/api/coaches/onboarding', methods=['GET'])
@login_required
def get_onboarding_status():
    """Check what onboarding steps the coach has completed."""
    with get_db() as conn:
        profile = conn.execute(
            'SELECT display_name, city, currency FROM coach_profiles WHERE user_id = ?',
            (request.user_id,)
        ).fetchone()
        has_profile = bool(profile and profile['display_name'] and profile['city'] and profile['currency'])

        student = conn.execute(
            'SELECT id FROM coach_students WHERE coach_user_id = ? LIMIT 1',
            (request.user_id,)
        ).fetchone()
        has_students = bool(student)

        lesson = conn.execute('''
            SELECT cl.id FROM coach_lessons cl
            JOIN coach_students cs ON cl.student_id = cs.id
            WHERE cs.coach_user_id = ? AND cl.deleted_at IS NULL LIMIT 1
        ''', (request.user_id,)).fetchone()
        has_lessons = bool(lesson)

    return jsonify({
        'has_profile': has_profile,
        'has_students': has_students,
        'has_lessons': has_lessons,
    })


# ── Coach Profile ──

@coaches_bp.route('/api/coaches/profile', methods=['GET'])
@login_required
def get_profile():
    """Get the current coach's profile and bundle offers."""
    user_id = request.user_id
    with get_db() as conn:
        cursor = conn.execute('SELECT * FROM coach_profiles WHERE user_id = ?', (user_id,))
        profile = cursor.fetchone()

        cursor = conn.execute(
            'SELECT id, lessons, price FROM coach_bundle_offers WHERE user_id = ? ORDER BY lessons ASC',
            (user_id,)
        )
        bundles = [dict(row) for row in cursor.fetchall()]

        # Get user name/picture/email for pre-fill (same connection)
        cursor = conn.execute('SELECT name, picture, email FROM users WHERE id = ?', (user_id,))
        user = cursor.fetchone()

    result = dict(profile) if profile else {}
    result['bundles'] = bundles
    result['google_name'] = user['name'] if user else None
    result['picture'] = user['picture'] if user else None
    result['google_email'] = user['email'] if user else None
    return jsonify(result)


@coaches_bp.route('/api/coaches/profile', methods=['PUT'])
@login_required
def update_profile():
    """Update the coach's profile and bundle offers."""
    user_id = request.user_id
    data = request.get_json()

    display_name = (data.get('display_name') or '').strip() or None
    city = (data.get('city') or '').strip() or None
    timezone = (data.get('timezone') or '').strip() or None
    currency = (data.get('currency') or '').strip() or None
    lesson_rate = data.get('lesson_rate')
    lesson_duration = data.get('lesson_duration') or 60
    chesscom_username = (data.get('chesscom_username') or '').strip() or None
    lichess_username = (data.get('lichess_username') or '').strip() or None
    revolut_username = (data.get('revolut_username') or '').strip() or None
    email = (data.get('email') or '').strip() or None
    phone_number = (data.get('phone_number') or '').strip() or None
    bundles = data.get('bundles', [])

    with get_db() as conn:
        # Upsert profile
        conn.execute('''
            INSERT INTO coach_profiles (user_id, display_name, city, timezone, currency, lesson_rate, lesson_duration, chesscom_username, lichess_username, revolut_username, email, phone_number, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id) DO UPDATE SET
                display_name = EXCLUDED.display_name,
                city = EXCLUDED.city,
                timezone = EXCLUDED.timezone,
                currency = EXCLUDED.currency,
                lesson_rate = EXCLUDED.lesson_rate,
                lesson_duration = EXCLUDED.lesson_duration,
                chesscom_username = EXCLUDED.chesscom_username,
                lichess_username = EXCLUDED.lichess_username,
                revolut_username = EXCLUDED.revolut_username,
                email = EXCLUDED.email,
                phone_number = EXCLUDED.phone_number,
                updated_at = CURRENT_TIMESTAMP
        ''', (user_id, display_name, city, timezone, currency, lesson_rate, lesson_duration, chesscom_username, lichess_username, revolut_username, email, phone_number))

        # Replace bundle offers
        conn.execute('DELETE FROM coach_bundle_offers WHERE user_id = ?', (user_id,))
        for b in bundles:
            lessons = b.get('lessons')
            price = b.get('price')
            if lessons and price is not None:
                conn.execute(
                    'INSERT INTO coach_bundle_offers (user_id, lessons, price) VALUES (?, ?, ?)',
                    (user_id, int(lessons), float(price))
                )

    return jsonify({'success': True})
