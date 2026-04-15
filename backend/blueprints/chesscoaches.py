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

import chess
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

GROUND_TRUTH_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'scoresheets')
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'scoresheet_uploads')

MIME_TO_EXT = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic'}


def _azure_di_poll(result_url, key, max_iterations=60):
    """Poll Azure Document Intelligence for results. Returns result JSON or raises."""
    poll_headers = {'Ocp-Apim-Subscription-Key': key}
    for _ in range(max_iterations):
        time_module.sleep(1)
        result_resp = http_requests.get(result_url, headers=poll_headers, timeout=10)
        result_json = result_resp.json()
        status = result_json.get('status')
        if status == 'succeeded':
            return result_json
        if status == 'failed':
            raise RuntimeError('Azure DI analysis failed')
    raise TimeoutError('Azure DI timed out')


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


def _save_upload(user_id, request_id, image_bytes, mime_type, feature='scoresheet'):
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


@coaches_bp.route('/api/coaches/ground-truth/<name>', methods=['GET'])
def get_ground_truth(name):
    """Load ground truth CSV for a scoresheet."""
    if not name or '/' in name or '..' in name:
        return jsonify({'error': 'Invalid name'}), 400
    csv_path = os.path.join(GROUND_TRUTH_DIR, name, 'moves.csv')
    if not os.path.exists(csv_path):
        return jsonify({'error': 'Not found'}), 404
    with open(csv_path) as f:
        raw = f.read().strip().split('\n')
    meta = {}
    moves = []
    header_seen = False
    for line in raw:
        parts = line.split(',', 2)
        if not header_seen and parts[0] in ('white_player', 'black_player', 'result'):
            meta[parts[0]] = parts[1] if len(parts) > 1 else ''
        elif parts[0] == 'move':
            header_seen = True
        elif header_seen and len(parts) >= 2:
            moves.append({'number': int(parts[0]), 'white': parts[1], 'black': parts[2] if len(parts) > 2 else ''})
    return jsonify({**meta, 'moves': moves})


@coaches_bp.route('/api/coaches/ground-truth', methods=['PUT'])
@admin_required
def save_ground_truth():
    """Save ground truth CSV for a scoresheet."""
    data = request.get_json()
    name = data.get('name', '').strip()
    if not name or '/' in name or '..' in name:
        return jsonify({'error': 'Invalid name'}), 400

    csv_dir = os.path.join(GROUND_TRUTH_DIR, name)
    os.makedirs(csv_dir, exist_ok=True)
    csv_path = os.path.join(csv_dir, 'moves.csv')

    lines = []
    lines.append(f"white_player,{data.get('white_player', '')}")
    lines.append(f"black_player,{data.get('black_player', '')}")
    lines.append(f"result,{data.get('result', '*')}")
    lines.append('move,white,black')
    for move in data.get('moves', []):
        black = move.get('black', '')
        lines.append(f"{move['number']},{move['white']},{black}")

    with open(csv_path, 'w') as f:
        f.write('\n'.join(lines) + '\n')

    logger.info(f"[GroundTruth] Saved {len(data.get('moves', []))} moves to {csv_path}")
    return jsonify({'ok': True})


@coaches_bp.route('/api/coaches/validate-moves', methods=['POST'])
def validate_moves():
    """Re-validate a list of moves with python-chess and return legality flags."""
    data = request.get_json()
    moves = data.get('moves', [])
    _scoresheet_validate_moves(moves)
    return jsonify({"moves": moves})


## --- Scoresheet helpers (shared between read & re-read endpoints) ---

# Piece letter mappings to/from English
_FRENCH_TO_ENGLISH = {'T': 'R', 'F': 'B', 'D': 'Q', 'C': 'N'}
_ENGLISH_TO_FRENCH = {v: k for k, v in _FRENCH_TO_ENGLISH.items()}
_ARMENIAN_TO_ENGLISH = {'Ն': 'R', 'Փ': 'B', 'փ': 'B', 'Թ': 'Q', 'Ձ': 'N', 'ձ': 'N', 'Ա': 'K'}
_ENGLISH_TO_ARMENIAN = {v: k for k, v in _ARMENIAN_TO_ENGLISH.items()}

_NOTATION_TO_ENGLISH = {
    'french': _FRENCH_TO_ENGLISH,
    'armenian': _ARMENIAN_TO_ENGLISH,
}


def _scoresheet_to_english(san, notation):
    """Convert a SAN move from the given notation to English."""
    mapping = _NOTATION_TO_ENGLISH.get(notation)
    if not mapping or not san or len(san) < 2:
        return san
    if san[0] in mapping:
        return mapping[san[0]] + san[1:]
    return san


def _scoresheet_french_to_english(san):
    """Convert French notation (T, F, D, C) to English (R, B, Q, N)."""
    return _scoresheet_to_english(san, 'french')


def _scoresheet_clean_san(san):
    """Clean up common OCR artifacts from a SAN move."""
    # Strip trailing/leading dots, commas, spaces
    san = san.strip(' .,;:')
    # Fix l/I misread as digit 1 at the end of a move (before optional +/#)
    # e.g. Reel -> Re1, Nfl -> Nf1
    san = re.sub(r'([a-h])[lI]([+#]?)$', r'\g<1>1\2', san)
    # Fix O misread as 0 in non-castling contexts (e.g. RcO -> Rc0 is not valid)
    # But don't touch castling patterns (O-O, 0-0, etc.)
    if not re.fullmatch(r'[oO0][-\s]*[oO0]([-\s]*[oO0])?[+#]?', san):
        san = re.sub(r'([a-h])O([+#]?)$', r'\g<1>0\2', san)
    return san


def _scoresheet_normalize_castling(san):
    """Normalize common castling variants to standard O-O / O-O-O."""
    stripped = san.replace('-', '').replace(' ', '')
    if re.fullmatch(r'[oO0]{3}', stripped):
        return 'O-O-O'
    if re.fullmatch(r'[oO0]{2}', stripped):
        return 'O-O'
    return san


def _scoresheet_push_san(board, san):
    """Try to push a SAN move, tolerating castling variants, missing/extra 'x', and OCR artifacts."""
    # Clean OCR artifacts first
    san = _scoresheet_clean_san(san)
    # Normalize castling
    normalized = _scoresheet_normalize_castling(san)
    for attempt in (san, normalized) if normalized != san else (san,):
        try:
            board.push_san(attempt)
            return True
        except (chess.InvalidMoveError, chess.IllegalMoveError, chess.AmbiguousMoveError, ValueError):
            pass
    # Try toggling 'x': add it if missing, remove it if present
    if 'x' in san:
        alt = san.replace('x', '')
    else:
        alt = re.sub(r'([A-Za-z\d])([a-h]\d)', r'\1x\2', san, count=1)
    if alt != san:
        try:
            board.push_san(alt)
            return True
        except (chess.InvalidMoveError, chess.IllegalMoveError, chess.AmbiguousMoveError, ValueError):
            pass
    # Try lowercasing first letter for pawn moves misread as uppercase (C3 -> c3, E4 -> e4)
    if len(san) >= 2 and san[0] in 'ABCDEFGH' and san[1] in '12345678':
        lower = san[0].lower() + san[1:]
        try:
            board.push_san(lower)
            return True
        except (chess.InvalidMoveError, chess.IllegalMoveError, chess.AmbiguousMoveError, ValueError):
            pass
    return False


def _scoresheet_diagnose_illegal(board, san):
    """Diagnose why a SAN move is illegal. Returns a human-readable reason."""
    cleaned = _scoresheet_clean_san(san)
    # Check for ambiguous piece moves (e.g., Nd2 when Nbd2/Nfd2 needed)
    piece_match = re.match(r'^([KQRBN])', cleaned)
    if piece_match:
        piece_letter = piece_match.group(1)
        dest_match = re.search(r'([a-h][1-8])', cleaned)
        if dest_match:
            dest = dest_match.group(1)
            # Find all legal moves by this piece type to this square
            candidates = [board.san(m) for m in board.legal_moves
                         if board.san(m).startswith(piece_letter) and dest in board.san(m)]
            if len(candidates) > 1:
                return f"Could be {' or '.join(candidates)}"
            if len(candidates) == 1:
                return f"Could be {candidates[0]}"
            # No legal moves by this piece to that square
            all_piece_moves = [board.san(m) for m in board.legal_moves if board.san(m).startswith(piece_letter)]
            if all_piece_moves:
                return f"Legal {piece_letter} moves: {', '.join(all_piece_moves)}"
            return f"No legal {piece_letter} moves"
    else:
        # Pawn move
        dest_match = re.search(r'([a-h][1-8])', cleaned)
        if dest_match:
            dest = dest_match.group(1)
            pawn_moves = [board.san(m) for m in board.legal_moves
                         if not board.san(m)[0].isupper() and dest in board.san(m)]
            if pawn_moves:
                return f"Did you mean {' or '.join(pawn_moves)}?"
    return None


def _scoresheet_validate_moves(moves, stop_at_illegal=False, notation=None):
    """Validate moves with python-chess, adding legality flags.
    If stop_at_illegal, truncate after the first illegal move.
    If notation is non-English, translate piece letters before validation."""
    needs_translation = notation in _NOTATION_TO_ENGLISH
    board = chess.Board()
    for i, move in enumerate(moves):
        for color in ("white", "black"):
            san = move.get(color)
            if not san or san == "?":
                move.pop(f"{color}_legal", None)
                continue
            # Translate non-English notation to English for python-chess
            if needs_translation:
                san = _scoresheet_to_english(san, notation)
                move[color] = san
            # Normalize castling and clean OCR artifacts in the output
            cleaned = _scoresheet_clean_san(san)
            normalized = _scoresheet_normalize_castling(cleaned)
            if normalized != san:
                move[color] = normalized
                san = normalized
            # Handle shorthand pawn captures like "ef" → "exf6" (en passant or regular)
            if len(san) == 2 and san[0] in 'abcdefgh' and san[1] in 'abcdefgh' and abs(ord(san[0]) - ord(san[1])) == 1:
                capture_match = None
                for legal_move in board.legal_moves:
                    legal_san = board.san(legal_move)
                    if legal_san[0] == san[0] and 'x' in legal_san and legal_san.split('x')[1][0] == san[1]:
                        capture_match = legal_san
                        break
                if capture_match:
                    san = capture_match
                    move[color] = san
            if _scoresheet_push_san(board, san):
                move[f"{color}_legal"] = True
                move.pop(f"{color}_reason", None)
            else:
                move[f"{color}_legal"] = False
                reason = _scoresheet_diagnose_illegal(board, san)
                if reason:
                    move[f"{color}_reason"] = reason
                # Flip the turn so the next move validates from the right side
                fen_parts = board.fen().split(' ')
                fen_parts[1] = 'b' if fen_parts[1] == 'w' else 'w'
                board.set_fen(' '.join(fen_parts))
                if stop_at_illegal:
                    if color == "white":
                        move.pop("black", None)
                        move.pop("black_legal", None)
                    return moves[:i + 1]
    return moves



def _scoresheet_parse_response(response_text):
    """Parse Gemini response text into a dict, handling markdown fences and malformed JSON."""
    text = response_text.strip()
    if text.startswith('```'):
        text = text.split('\n', 1)[1]
        if text.endswith('```'):
            text = text.rsplit('```', 1)[0]
        text = text.strip()
    warnings = []
    try:
        result = json_module.loads(text)
    except json_module.JSONDecodeError:
        from json_repair import repair_json
        result = json_module.loads(repair_json(text))
        warnings.append("json_repaired")
    if isinstance(result, list):
        result = result[0] if result else {}
        warnings.append("unwrapped_array")
    return result, warnings


def _log_api_usage(feature, model_id, input_tokens, output_tokens, elapsed, error=None, request_id=None, thinking_tokens=0, billing_tier='paid', user_id=None, retry_free_error=None, retry_free_elapsed=None):
    """Log a Gemini API call to the api_usage table. Retries on DB lock."""
    for attempt in range(3):
        try:
            with get_db() as conn:
                conn.execute(
                    """INSERT INTO api_usage (user_id, request_id, feature, model_id, input_tokens, output_tokens, thinking_tokens, billing_tier, elapsed_seconds, error, retry_free_error, retry_free_elapsed)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (user_id, request_id, feature, model_id, input_tokens, output_tokens, thinking_tokens, billing_tier, elapsed, error, retry_free_error, retry_free_elapsed),
                )
            return
        except Exception as e:
            if attempt < 2:
                time_module.sleep(0.5)
            else:
                logger.error(f"[API Usage] Failed to log after 3 attempts: {e}")


# Models with no free tier — always use paid key
_PAID_ONLY_MODELS = {'gemini-3.1-pro-preview'}


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


@coaches_bp.route('/api/coaches/auto-crop', methods=['POST'])
@login_required
def auto_crop():
    """Use Azure Document Intelligence to detect rotation angle and document bounds."""

    image_file = request.files.get('image')
    if not image_file:
        return jsonify({'error': 'No image provided'}), 400
    image_bytes = image_file.read()
    mime_type = image_file.content_type or 'image/jpeg'

    endpoint = os.environ.get('AZURE_DI_ENDPOINT', '').rstrip('/')
    key = os.environ.get('AZURE_DI_KEY')
    if not endpoint or not key:
        return jsonify({'error': 'Azure Document Intelligence not configured'}), 500

    analyze_url = f"{endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-11-30"
    headers = {'Ocp-Apim-Subscription-Key': key, 'Content-Type': mime_type}

    start = time_module.time()
    try:
        resp = http_requests.post(analyze_url, headers=headers, data=image_bytes, timeout=30)
    except Exception as e:
        return jsonify({'error': f'Azure DI request failed: {e}'}), 500

    if resp.status_code != 202:
        return jsonify({'error': f'Azure DI submit failed: {resp.status_code}'}), 500

    result_url = resp.headers.get('Operation-Location')
    if not result_url:
        return jsonify({'error': 'No Operation-Location header'}), 500

    # Poll for results
    try:
        result_json = _azure_di_poll(result_url, key, max_iterations=30)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    elapsed = round(time_module.time() - start)
    analyze_result = result_json.get('analyzeResult', {})
    pages = analyze_result.get('pages', [])

    # Extract rotation from page angle
    rotation = 0
    page_w, page_h = 1, 1
    if pages:
        page = pages[0]
        angle = page.get('angle', 0)
        # Azure returns the detected page angle; negate for CSS correction
        rotation = round(-angle)
        page_w = page.get('width', 1)
        page_h = page.get('height', 1)

    # Compute document bounding box from all word polygons
    min_x, min_y, max_x, max_y = page_w, page_h, 0, 0
    for page in pages:
        for word in page.get('words', []):
            polygon = word.get('polygon', [])
            for i in range(0, len(polygon), 2):
                x, y = polygon[i], polygon[i + 1]
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)

    # Compute angle from table cell polygons (vertical edges)
    tables = analyze_result.get('tables', [])
    table_angle = None
    if tables:
        # Use the largest table
        table = max(tables, key=lambda t: t.get('rowCount', 0) * t.get('columnCount', 0))
        # Collect left edges of cells (top-left to bottom-left of each cell polygon)
        edge_angles = []
        for cell in table.get('cells', []):
            regions = cell.get('boundingRegions', [])
            if not regions:
                continue
            polygon = regions[0].get('polygon', [])
            if len(polygon) < 8:
                continue
            # Polygon: [x0,y0, x1,y1, x2,y2, x3,y3] = top-left, top-right, bottom-right, bottom-left
            # Left edge: top-left (0,1) to bottom-left (6,7)
            dx = polygon[6] - polygon[0]
            dy = polygon[7] - polygon[1]
            if abs(dy) > 10:  # Only use edges with significant vertical span
                angle_rad = math.atan2(dx, dy)  # angle of left edge from vertical
                edge_angles.append(math.degrees(angle_rad))
        if edge_angles:
            # Median angle is more robust than mean against outliers
            edge_angles.sort()
            mid = len(edge_angles) // 2
            table_angle = edge_angles[mid] if len(edge_angles) % 2 == 1 else (edge_angles[mid - 1] + edge_angles[mid]) / 2
            table_angle = round(-table_angle, 1)  # negate so it matches page_angle convention (tilt, not correction)

    # Convert to percentages with small padding
    pad = 0.5  # 0.5% padding
    crop = {
        'x': max(0, min_x / page_w * 100 - pad),
        'y': max(0, min_y / page_h * 100 - pad),
        'width': min(100, (max_x - min_x) / page_w * 100 + pad * 2),
        'height': min(100, (max_y - min_y) / page_h * 100 + pad * 2),
    }

    raw_angle = pages[0].get('angle', 0) if pages else 0
    debug = {
        'prompt': 'Azure Document Intelligence prebuilt-layout',
        'raw_response': f'page_angle={raw_angle}, table_angle={table_angle}, page={page_w}x{page_h}, words={sum(len(p.get("words", [])) for p in pages)}, table_edges={len(edge_angles) if tables else 0}',
        'image_size': f'{page_w}x{page_h}',
        'elapsed': elapsed,
        'tier': 'azure',
    }
    return jsonify({'rotation': rotation, 'crop': crop, 'debug': debug})


SCORESHEET_MODELS = [
    {"id": "gemini-3-flash-preview", "name": "Reader 1"},
    {"id": "gemini-3.1-pro-preview", "name": "Reader 2"},
    {"id": "gemini-3.1-flash-lite-preview", "name": "Reader 3"},
]

DIAGRAM_MODELS = [
    {"id": "gemini-3.1-pro-preview", "name": "gemini-3.1-pro"},
]

_avg_cache: dict = {}
_avg_cache_ts: float = 0
_AVG_CACHE_TTL = 120  # seconds


def _get_model_avg_elapsed(feature, user_id=None):
    """Get average elapsed seconds per model for a given feature (rounded up),
    optionally filtered by user. Results are cached for 2 minutes per
    (user_id, feature) key."""
    global _avg_cache, _avg_cache_ts
    now = time_module.time()
    key = (user_id, feature)
    if key in _avg_cache and (now - _avg_cache_ts) <= _AVG_CACHE_TTL:
        return _avg_cache[key]
    try:
        with get_db() as conn:
            if user_id:
                rows = conn.execute(
                    """SELECT model_id, AVG(elapsed_seconds) as avg_elapsed
                       FROM api_usage
                       WHERE feature = ? AND error IS NULL AND elapsed_seconds > 0 AND user_id = ?
                       GROUP BY model_id""",
                    (feature, user_id)
                ).fetchall()
            else:
                rows = conn.execute(
                    """SELECT model_id, AVG(elapsed_seconds) as avg_elapsed
                       FROM api_usage
                       WHERE feature = ? AND error IS NULL AND elapsed_seconds > 0
                       GROUP BY model_id""",
                    (feature,)
                ).fetchall()
            result = {r['model_id']: int(math.ceil(r['avg_elapsed'])) for r in rows}
            _avg_cache[key] = result
            _avg_cache_ts = now
            return result
    except Exception:
        return {}

def _enrich_models_with_avg(feature, user_id=None):
    """Return model list with avg_elapsed field added for the given feature."""
    avgs = _get_model_avg_elapsed(feature, user_id)
    models = DIAGRAM_MODELS if feature == 'diagram' else SCORESHEET_MODELS
    return [{**m, "avg_elapsed": avgs.get(m["id"])} for m in models]

_NOTATION_PIECES = {
    'english': 'English piece letters (K, Q, R, B, N)',
    'french': 'French piece letters (T, F, D, C, R)',
    'armenian': 'Armenian piece letters (Ձ/ձ, Փ/փ, Թ, Ն, Ա)',
}

def _build_scoresheet_prompt(notation):
    pieces = _NOTATION_PIECES.get(notation, notation)
    return f'This scoresheet uses {notation} notation. Set "notation" to "{notation}" and use {pieces}.\n\n' + _SCORESHEET_READ_PROMPT_BODY

_SCORESHEET_READ_PROMPT_BODY = """Extract ALL moves from the scoresheet and return them as a JSON object with this exact format:
{
  "white_player": "Name in Latin alphabet (transliterate if needed), or empty string if unreadable",
  "black_player": "Name in Latin alphabet (transliterate if needed), or empty string if unreadable",
  "event": "Tournament name or empty string if unreadable",
  "date": "Date or empty string if unreadable",
  "result": "1-0, 0-1, 1/2-1/2, or empty if unreadable",
  "moves": [
    {"number": 1, "white": "e4", "white_confidence": "high", "black": "e5", "black_confidence": "high"},
    {"number": 2, "white": "Nf3", "white_confidence": "high", "white_time": 88, "black": "Nc6", "black_confidence": "medium", "black_time": 85}
  ]
}

Rules:
- Transcribe EXACTLY what is written on the sheet — do not add or remove symbols
- Use the notation the player used. If French, output French piece letters (T, F, D, C). If English, output English piece letters (K, Q, R, B, N). If Armenian, output Armenian piece letters (Ն, Փ, Թ, Ձ, Ա). Pawn moves have no piece letter in any notation.
- Always use correct casing: piece letters must be uppercase (e.g. Cf3, not cf3; Nf3, not nf3). Armenian letters can be uppercase or lowercase. Pawn moves start with a lowercase file letter (a-h, e.g. e4, not E4). Normalize casing even if the player wrote it differently.
- Some players write captures with "x" (e.g. Nxd4 / Cxd4) and some without (e.g. Nd4 / Cd4). Read what is actually written.
- If a move is unreadable, leave the move empty
- If black's last move is missing (white won or game ended), omit the "black" field for that move
- Include ALL moves you can read, even partially
- Be careful with similar-looking pieces in English: K (King), N (Knight), B (Bishop), R (Rook), Q (Queen)
- Be careful with similar-looking pieces in French: R (Roi), C (Cavalier), F (Fou), T (Tour), D (Dame)
- Be careful with Armenian piece letters: Ա (King), Թ (Queen), Ն (Rook), Փ (Bishop), Ձ (Knight)
- Chess moves always end with a rank digit (1-8), optionally followed by + or #. If you see a letter "l" or "I" at the end, it is the digit "1". Do not output moves ending in letters like "Reel" — that should be "Re1".
- Castling: O-O (kingside), O-O-O (queenside) — same in all notations
- For each move, include a confidence level: "high" (clearly readable), "medium" (somewhat ambiguous), or "low" (hard to read/guessing)
- Some players write the remaining minutes on their clock next to their moves (before or after the move). If you see a number that looks like a clock time (typically decreasing over the game), include it as "white_time" or "black_time" (integer, in minutes). Only include time fields if the scoresheet actually has clock times written — do not guess or fabricate them.
Return ONLY the JSON object, no other text."""


@coaches_bp.route('/api/coaches/reread-scoresheet', methods=['POST'])
def reread_scoresheet():
    """Re-read a scoresheet from a given position after user confirms moves."""
    from google import genai
    from google.genai import types

    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    image_file = request.files['image']
    image_bytes = image_file.read()
    mime_type = image_file.content_type or 'image/jpeg'

    confirmed_moves = json_module.loads(request.form.get('confirmed_moves', '[]'))
    model_id = request.form.get('model_id', 'gemini-3-flash-preview')
    req_id = uuid.uuid4().hex[:12]
    uid = get_current_user()
    _save_upload(uid, req_id, image_bytes, mime_type, 'reread')

    try:
        client_paid, client_free = _init_gemini_clients('Reread')
    except ValueError as e:
        return jsonify({"error": str(e)}), 500

    # Replay confirmed moves to get board position
    board = chess.Board()
    for move in confirmed_moves:
        for color in ("white", "black"):
            san = move.get(color)
            if san and san != "?":
                if not _scoresheet_push_san(board, san):
                    return jsonify({"error": f"Invalid confirmed move: {san} at move {move.get('number')}"}), 400

    fen = board.fen()
    legal_sans = sorted(board.san(m) for m in board.legal_moves)

    # Determine resume point
    if confirmed_moves:
        last = confirmed_moves[-1]
        if last.get('black') and last['black'] != '?':
            resume_num = last['number'] + 1
            resume_color = 'white'
        else:
            resume_num = last['number']
            resume_color = 'black'
    else:
        resume_num = 1
        resume_color = 'white'

    confirmed_text = " ".join(
        f"{m['number']}. {m['white']}" + (f" {m['black']}" if m.get('black') else "")
        for m in confirmed_moves
    )

    prompt = f"""You are analyzing a handwritten chess tournament scoresheet image.

{f"The following moves have been confirmed as correct:{chr(10)}{confirmed_text}{chr(10)}" if confirmed_text else ""}The board position after these moves (FEN): {fen}
Legal moves in this position: {', '.join(legal_sans)}

Read ALL remaining moves from the scoresheet starting from move {resume_num} ({'Black' if resume_color == 'black' else 'White'}'s move).

Rules:
- Transcribe EXACTLY what is written on the sheet — do not add or remove symbols
- The scoresheet may use English (K, Q, R, B, N), French (R, D, T, F, C), or Armenian (Ա, Թ, Ն, Փ/փ, Ձ/ձ) notation. Use whichever notation the player used.
- Always use correct casing: piece letters must be uppercase (e.g. Cf3, not cf3; Nf3, not nf3). Armenian letters can be uppercase or lowercase. Pawn moves start with a lowercase file letter (a-h, e.g. e4, not E4). Normalize casing even if the player wrote it differently.
- Some players write captures with "x" (e.g. Nxd4 / Cxd4) and some without. Read what is actually written.
- If a move is unreadable, use "?"
- Be careful with similar-looking pieces in English: K (King), N (Knight), B (Bishop), R (Rook), Q (Queen)
- Be careful with similar-looking pieces in French: R (Roi), C (Cavalier), F (Fou), T (Tour), D (Dame)
- Be careful with Armenian piece letters: Ա (King), Թ (Queen), Ն (Rook), Փ (Bishop), Ձ (Knight)
- Chess moves always end with a rank digit (1-8), optionally followed by + or #. If you see a letter "l" or "I" at the end, it is the digit "1".
- Castling: O-O (kingside), O-O-O (queenside) — same in both notations
- If clock times (remaining minutes) are written next to moves, include them as "white_time" / "black_time" (integer). Only include if actually present on the sheet.

Return ONLY a JSON object:
{{
  "moves": [
    {{"number": {resume_num}, {'"white": "...", "black": "..."' if resume_color == 'white' else '"black": "..."'}}},
    ...
  ]
}}"""

    start = time_module.time()
    try:
        response, tier, _ = _gemini_generate(
            client_free, client_paid, model_id,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                prompt,
            ],
            config={"response_mime_type": "application/json"},
        )
    except Exception as e:
        elapsed = round(time_module.time() - start)
        logger.error(f"[Scoresheet reread] {model_id} failed: {e}")
        _log_api_usage('reread', model_id, 0, 0, elapsed, error=str(e), request_id=req_id, user_id=uid)
        return jsonify({"error": str(e)}), 500

    elapsed = round(time_module.time() - start)
    in_tok, out_tok, think_tok = _extract_usage_tokens(response)
    _log_api_usage('reread', model_id, in_tok, out_tok, elapsed, request_id=req_id, thinking_tokens=think_tok, billing_tier=tier, user_id=uid)
    gemini_result, warnings = _scoresheet_parse_response(response.text)
    new_moves = gemini_result.get("moves", [])

    # Translate non-English notation in new moves to English before merging
    reread_notation = gemini_result.get("notation", "english")
    if reread_notation in _NOTATION_TO_ENGLISH:
        for mv in new_moves:
            for c in ('white', 'black'):
                s = mv.get(c, '')
                if s:
                    mv[c] = _scoresheet_to_english(s, reread_notation)

    # Merge: confirmed + newly read
    merged = [dict(m) for m in confirmed_moves]
    if new_moves and merged:
        last_conf = merged[-1]
        first_new = new_moves[0]
        if (first_new.get('number') == last_conf['number']
                and not last_conf.get('black')
                and resume_color == 'black'):
            merged[-1] = {**last_conf, 'black': first_new.get('black', '')}
            new_moves = new_moves[1:]
    merged.extend(new_moves)

    # Validate with stop at first illegal
    merged = _scoresheet_validate_moves(merged, stop_at_illegal=False)

    logger.info(f"[Scoresheet reread] {model_id}: {len(merged)} moves, {elapsed}s")

    return jsonify({
        "result": {"moves": merged},
        "elapsed": elapsed,
        "warnings": warnings,
    })


@coaches_bp.route('/api/coaches/read-scoresheet-azure', methods=['POST'])
def read_scoresheet_azure():
    """Read scoresheet using Azure Document Intelligence (layout model with table detection)."""

    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    image_file = request.files['image']
    image_bytes = image_file.read()
    mime_type = image_file.content_type or 'image/jpeg'
    _save_upload(get_current_user(), uuid.uuid4().hex[:12], image_bytes, mime_type, 'scoresheet_azure')

    endpoint = os.environ.get('AZURE_DI_ENDPOINT', '').rstrip('/')
    key = os.environ.get('AZURE_DI_KEY')
    if not endpoint or not key:
        return jsonify({"error": "Azure Document Intelligence not configured"}), 500

    # Submit for analysis using prebuilt-layout (detects tables)
    analyze_url = f"{endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-11-30"
    headers = {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': mime_type,
    }

    start = time_module.time()
    try:
        resp = http_requests.post(analyze_url, headers=headers, data=image_bytes, timeout=30)
    except Exception as e:
        return jsonify({"error": f"Azure DI request failed: {e}"}), 500

    if resp.status_code != 202:
        return jsonify({"error": f"Azure DI submit failed: {resp.status_code}"}), 500

    result_url = resp.headers.get('Operation-Location')
    if not result_url:
        return jsonify({"error": "No Operation-Location header in response"}), 500

    # Poll for results
    try:
        result_json = _azure_di_poll(result_url, key)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    elapsed = round(time_module.time() - start)
    analyze_result = result_json.get('analyzeResult', {})
    tables = analyze_result.get('tables', [])
    pages = analyze_result.get('pages', [])

    moves = []
    if tables:
        # Find the largest table (most likely the scoresheet)
        table = max(tables, key=lambda t: t.get('rowCount', 0) * t.get('columnCount', 0))
        col_count = table.get('columnCount', 0)
        max_row = table.get('rowCount', 0)

        # Build grid from cells
        grid = {}
        for cell in table.get('cells', []):
            row = cell['rowIndex']
            col = cell['columnIndex']
            content = cell.get('content', '').strip()
            grid[(row, col)] = content

        def parse_move_columns(g, rows, num_col, white_col, black_col):
            """Extract moves from specific columns of the grid."""
            result = []
            for row in range(rows):
                num_str = g.get((row, num_col), '').strip().replace('.', '')
                try:
                    num = int(num_str)
                except ValueError:
                    continue
                white = g.get((row, white_col), '').strip()
                black = g.get((row, black_col), '').strip()
                move = {'number': num}
                if white:
                    move['white'] = white
                if black:
                    move['black'] = black
                if white or black:
                    result.append(move)
            return result

        if col_count >= 6:
            # Two sets of columns side by side: #, W, B, #, W, B
            left = parse_move_columns(grid, max_row, 0, 1, 2)
            right = parse_move_columns(grid, max_row, 3, 4, 5)
            moves = sorted(left + right, key=lambda m: m['number'])
        elif col_count >= 3:
            moves = parse_move_columns(grid, max_row, 0, 1, 2)

    # Validate moves with legality checks
    moves = _scoresheet_validate_moves(moves)

    # Also return raw text lines for debugging
    raw_lines = []
    for page in pages:
        for line in page.get('lines', []):
            raw_lines.append(line.get('content', ''))

    # Build raw debug info: table grid + all tables metadata
    raw_tables = []
    for t_idx, t in enumerate(tables):
        t_grid = {}
        for cell in t.get('cells', []):
            r, c = cell['rowIndex'], cell['columnIndex']
            t_grid[(r, c)] = cell.get('content', '')
        rows_data = []
        for r in range(t.get('rowCount', 0)):
            row_cells = []
            for c in range(t.get('columnCount', 0)):
                row_cells.append(t_grid.get((r, c), ''))
            rows_data.append(row_cells)
        raw_tables.append({
            'index': t_idx,
            'rowCount': t.get('rowCount', 0),
            'columnCount': t.get('columnCount', 0),
            'rows': rows_data,
        })

    logger.info(f"[Scoresheet Azure DI] {len(moves)} moves, {len(tables)} tables, {col_count if tables else 0} cols, {elapsed}s")

    return jsonify({
        "moves": moves,
        "elapsed": elapsed,
        "tables_found": len(tables),
        "raw_lines": raw_lines,
        "raw_tables": raw_tables,
    })


DIAGRAM_LOCATE_PROMPT = """You are analyzing an image that may contain ONE OR SEVERAL chess diagrams.

For each diagram, return a set of sub-bounding-boxes. The final crop is computed from them later, so just identify where each part sits — you do NOT need to reason about the overall region.

Return ONLY a JSON array of objects. No markdown, no commentary, no code fences.

Each object represents one diagram and MUST have these fields:
- "board": bounding box of the ENTIRE 8x8 playing grid — all 64 squares, from the a-file on the far left through the h-file on the far right, and from rank 1 at the bottom through rank 8 at the top. This includes empty edge squares and any thin black border drawn around the grid. It is NOT just the region where pieces happen to be concentrated.
- "rank_labels": bounding box tightly around the printed rank digits (1-8) on the LEFT side of the board. Null if the diagram has no rank labels.
- "file_labels": bounding box tightly around the printed file letters (a-h) along the BOTTOM of the board. Null if the diagram has no file labels.
- "context": bounding box containing surrounding text — player names above/below, diagram number/caption, "to move" indicator. Null if nothing of the sort is present.

Each bounding box is an object with these fields, all as percentages of the full image (0-100). Measure each value directly from the image you are looking at; do not reuse numbers from any example or template.

CRITICAL rules for each sub-box:
- "board" must span the full 8x8 grid. Its left edge must be at or just outside the leftmost column of squares (the a-file), even if those squares are empty. Its right edge must be at or just outside the rightmost column (the h-file). Its top edge must include rank 8; its bottom edge must include rank 1. If any row or column of squares is cut off, the box is wrong and MUST be expanded.
- "rank_labels" MUST include the full glyph of every rank digit 1-8. Its right edge should just touch the left edge of the board. Its top and bottom edges must extend slightly past the topmost "8" and the bottommost "1" — do not clip them. Null only if no rank digits are printed.
- "file_labels" MUST include the full glyph of every file letter a-h. Its top edge should just touch the bottom edge of the board. Its bottom edge must extend BELOW the letters — not cut through them. Its left and right edges must contain the full "a" and "h" letters. Null only if no file letters are printed.
- "context" should cover player names, caption, and any arrows/indicators. Do not include unrelated page content.

CHECK BEFORE RETURNING:
- For the board box: count the columns of squares inside it. You must be able to see all 8 files and all 8 ranks. If you count fewer than 8 in either direction, expand the box.
- For each non-null label box: every glyph must sit WHOLLY inside the box with visible space around it. If any digit or letter touches or crosses the edge, expand the box.

Ordering: top-to-bottom first, then left-to-right within the same row. Diagram 1 must be the top-left diagram.

Return [] if no diagram is detected.

Output format (field names only — NEVER reuse any coordinate numbers from any other source):
[
  {
    "board": {"x": <number>, "y": <number>, "width": <number>, "height": <number>},
    "rank_labels": {"x": <number>, "y": <number>, "width": <number>, "height": <number>},
    "file_labels": {"x": <number>, "y": <number>, "width": <number>, "height": <number>},
    "context": {"x": <number>, "y": <number>, "width": <number>, "height": <number>}
  }
]"""

DIAGRAM_READ_SINGLE_PROMPT = """You are analyzing a cropped image containing exactly ONE chess diagram with its surrounding context.

Extract the position AND the surrounding context: which side is to move, and the two player names if printed.

Return ONLY a JSON object (NOT an array). No markdown, no commentary, no code fences.

The object MUST have these fields:
- "board": an array of EXACTLY 8 strings, each EXACTLY 8 characters long, representing ranks 8 down to 1
- "active_color": "w" or "b" — whose turn it is
- "white_player": the white player's name as printed near the diagram, or empty string "" if not visible
- "black_player": the black player's name as printed near the diagram, or empty string "" if not visible
- "diagram_number": the integer number printed on or next to the diagram (often inside a circle), or null if no such number is visible. This is a label identifying the diagram in a book/article — NOT a move number or piece count.

Board rules:
- board[0] is rank 8 (top of the board), board[7] is rank 1 (bottom)
- Each string reads file a (left) to file h (right)
- Each character is EXACTLY one square:
  - White pieces: K Q R B N P (uppercase)
  - Black pieces: k q r b n p (lowercase)
  - Empty square: . (period)
- Every string MUST be exactly 8 characters — no digits, no compression, no spaces
- Look at each of the 64 squares one at a time and write the symbol for what you see on that specific square

CRITICAL — use printed coordinates if visible:
- If the diagram has file labels (a-h) printed along the bottom edge and/or rank labels (1-8) printed along the left edge, you MUST use them as anchors. For every piece, identify its exact square by reading off the labeled file and rank — do NOT guess based on visual position relative to neighboring pieces.
- Example: if you see a knight and want to know its file, trace straight down from it to the label row. Whatever letter sits directly under the knight is its file.
- When coordinates are present, an off-by-one file or rank error is unacceptable — the labels are there specifically to prevent it.
- If no coordinates are printed, fall back to counting from the visible board edges.

Active color rules:
- Look for arrows, "White to move" / "Black to move" captions, or infer from context
- Default to "w" if unclear

Player name rules:
- Transliterate to Latin alphabet if necessary
- Return just the name, no ratings or dates
- Use "" (empty string) when a name is not printed

Example output:
{"board": ["rnbqkbnr", "pppppppp", "........", "........", "....P...", "........", "PPPP.PPP", "RNBQKBNR"], "active_color": "b", "white_player": "Kasparov", "black_player": "Karpov", "diagram_number": 18}"""


_VALID_SQUARE_CHARS = set('KQRBNPkqrbnp.')


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
    return f"{placement} {color} KQkq - 0 1"


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
    _save_upload(uid, req_id, image_bytes, mime_type, 'diagram')

    model_info = DIAGRAM_MODELS[0]
    model_id = model_info["id"]
    model_name = model_info["name"]

    result_queue = queue.Queue()

    def run_pipeline():
        total_in, total_out, total_think = 0, 0, 0
        total_start = time_module.time()
        tier_used = 'paid'

        # ── Phase 1: Locate diagram regions ──
        logger.info(f"[Diagram] Phase 1: locating regions with {model_id}")
        try:
            resp_locate, tier, _ = _gemini_generate(
                client_free, client_paid, model_id,
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    DIAGRAM_LOCATE_PROMPT,
                ],
            )
            tier_used = tier
            in_tok, out_tok, think_tok = _extract_usage_tokens(resp_locate)
            total_in += in_tok; total_out += out_tok; total_think += think_tok
            raw = _strip_code_fences(resp_locate.text)
            regions = json_module.loads(raw)
            if not isinstance(regions, list):
                regions = [regions]
            # Validate, union sub-boxes, and clamp regions
            SAFETY_PAD = 2.0  # percentage points added around the unioned box
            valid_regions = []
            for r in regions:
                if not isinstance(r, dict):
                    continue
                # New shape: {"board": {...}, "rank_labels": {...}|null, "file_labels": {...}|null, "context": {...}|null}
                # Accepts legacy "labels" key and legacy flat {x, y, width, height}
                sub_boxes = []
                for key in ('board', 'rank_labels', 'file_labels', 'labels', 'context'):
                    sub = r.get(key)
                    if isinstance(sub, dict) and all(k in sub for k in ('x', 'y', 'width', 'height')):
                        sub_boxes.append(sub)
                if not sub_boxes and all(k in r for k in ('x', 'y', 'width', 'height')):
                    sub_boxes.append(r)
                if not sub_boxes:
                    continue
                # Union all sub-boxes
                left = min(float(b['x']) for b in sub_boxes)
                top = min(float(b['y']) for b in sub_boxes)
                right = max(float(b['x']) + float(b['width']) for b in sub_boxes)
                bottom = max(float(b['y']) + float(b['height']) for b in sub_boxes)
                # Apply safety padding, clamp to [0, 100]
                left = max(0.0, left - SAFETY_PAD)
                top = max(0.0, top - SAFETY_PAD)
                right = min(100.0, right + SAFETY_PAD)
                bottom = min(100.0, bottom + SAFETY_PAD)
                valid_regions.append({
                    'x': left,
                    'y': top,
                    'width': right - left,
                    'height': bottom - top,
                })
            # Sort: top-to-bottom, then left-to-right (using row midpoint)
            valid_regions.sort(key=lambda r: (r['y'] + r['height'] / 2, r['x'] + r['width'] / 2))

            # Resolve overlaps: clip each region so it doesn't extend into later ones
            for i in range(len(valid_regions)):
                ri = valid_regions[i]
                for j in range(i + 1, len(valid_regions)):
                    rj = valid_regions[j]
                    # Check overlap
                    if (ri['x'] < rj['x'] + rj['width'] and ri['x'] + ri['width'] > rj['x'] and
                        ri['y'] < rj['y'] + rj['height'] and ri['y'] + ri['height'] > rj['y']):
                        # Clip: shrink the earlier region's bottom or right edge
                        ri_cx = ri['x'] + ri['width'] / 2
                        rj_cx = rj['x'] + rj['width'] / 2
                        ri_cy = ri['y'] + ri['height'] / 2
                        rj_cy = rj['y'] + rj['height'] / 2
                        # If primarily vertical overlap, clip vertically
                        if abs(rj_cy - ri_cy) >= abs(rj_cx - ri_cx):
                            boundary = (ri['y'] + ri['height'] + rj['y']) / 2
                            ri['height'] = boundary - ri['y']
                            rj['height'] = rj['height'] - (boundary - rj['y'])
                            rj['y'] = boundary
                        else:
                            boundary = (ri['x'] + ri['width'] + rj['x']) / 2
                            ri['width'] = boundary - ri['x']
                            rj['width'] = rj['width'] - (boundary - rj['x'])
                            rj['x'] = boundary

            regions = valid_regions
            logger.info(f"[Diagram] Phase 1 done: {len(regions)} region(s) found ({in_tok}+{out_tok}+{think_tok}t tokens) [{tier}]")
        except Exception as e:
            elapsed = round(time_module.time() - total_start)
            logger.error(f"[Diagram] Phase 1 failed: {e}")
            result_queue.put({"type": "result", "model_id": model_id, "name": model_name, "error": f"Region detection failed: {e}", "elapsed": elapsed})
            _log_api_usage('diagram', model_id, total_in, total_out, elapsed, error=str(e), request_id=req_id, user_id=uid, billing_tier='paid')
            return

        if not regions:
            elapsed = round(time_module.time() - total_start)
            logger.info("[Diagram] No regions found")
            result_queue.put({"type": "result", "model_id": model_id, "name": model_name, "diagrams": [], "elapsed": elapsed})
            _log_api_usage('diagram', model_id, total_in, total_out, elapsed, request_id=req_id, billing_tier=tier_used, user_id=uid)
            return

        # Send region count to frontend
        result_queue.put({"type": "regions", "count": len(regions), "regions": regions})

        # ── Phase 2: Read each region in parallel (independent API calls) ──
        diagrams_by_idx = {}
        tokens_lock = threading.Lock()

        def read_region(idx, region):
            nonlocal total_in, total_out, total_think, tier_used
            logger.info(f"[Diagram] Phase 2: reading region {idx + 1}/{len(regions)}")
            try:
                cropped_bytes = _crop_image_region(image_bytes, mime_type, region)
                crop_mime = 'image/png' if 'png' in mime_type else 'image/jpeg'
                resp_read, tier, _ = _gemini_generate(
                    client_free, client_paid, model_id,
                    contents=[
                        types.Part.from_bytes(data=cropped_bytes, mime_type=crop_mime),
                        DIAGRAM_READ_SINGLE_PROMPT,
                    ],
                )
                in_tok, out_tok, think_tok = _extract_usage_tokens(resp_read)
                with tokens_lock:
                    total_in += in_tok; total_out += out_tok; total_think += think_tok
                    tier_used = tier
                raw = _strip_code_fences(resp_read.text)
                parsed = json_module.loads(raw)
                if isinstance(parsed, list):
                    parsed = parsed[0] if parsed else {}
                white = str(parsed.get("white_player", "") or "").strip()
                black = str(parsed.get("black_player", "") or "").strip()
                raw_num = parsed.get("diagram_number")
                try:
                    diagram_number = int(raw_num) if raw_num not in (None, "") else None
                except (TypeError, ValueError):
                    diagram_number = None
                try:
                    fen = _grid_to_fen(parsed.get("board"), parsed.get("active_color", "w"))
                except ValueError as ve:
                    logger.warning(f"[Diagram] Region {idx + 1}: invalid grid ({ve})")
                    fen = ""
                if fen:
                    diagram = {"fen": fen, "white_player": white, "black_player": black, "region": region, "diagram_number": diagram_number}
                    diagrams_by_idx[idx] = diagram
                    result_queue.put({"type": "diagram", "index": idx, "diagram": diagram})
                    logger.info(f"[Diagram] Region {idx + 1}: {fen[:60]} ({in_tok}+{out_tok}+{think_tok}t tokens) [{tier}]")
                else:
                    logger.warning(f"[Diagram] Region {idx + 1}: no FEN extracted")
            except Exception as e:
                logger.error(f"[Diagram] Region {idx + 1} failed: {e}")

        region_threads = []
        for idx, region in enumerate(regions):
            rt = threading.Thread(target=read_region, args=(idx, region))
            rt.start()
            region_threads.append(rt)

        for rt in region_threads:
            rt.join()

        # Build ordered diagrams list
        diagrams = [diagrams_by_idx[i] for i in sorted(diagrams_by_idx.keys())]

        elapsed = round(time_module.time() - total_start)
        logger.info(f"[Diagram] All done: {len(diagrams)} diagram(s) in {elapsed}s")
        result_queue.put({"type": "result", "model_id": model_id, "name": model_name, "diagrams": diagrams, "elapsed": elapsed})
        _log_api_usage('diagram', model_id, total_in, total_out, elapsed, request_id=req_id, thinking_tokens=total_think, billing_tier=tier_used, user_id=uid)

    def run_pipeline_wrapped():
        try:
            run_pipeline()
        finally:
            result_queue.put(_THREAD_DONE)

    t = threading.Thread(target=run_pipeline_wrapped)
    t.start()

    return _sse_response(result_queue, [t], 1,
                         {'type': 'models', 'models': _enrich_models_with_avg('diagram', uid)}, 'Diagram')


@coaches_bp.route('/api/coaches/read-scoresheet', methods=['POST'])
def read_scoresheet():
    """Analyze a scoresheet image with multiple Gemini models in parallel, streaming results via SSE."""
    from google.genai import types

    logger.info("[Scoresheet] Request received")

    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    image_file = request.files['image']
    if not image_file.filename:
        return jsonify({"error": "Empty filename"}), 400

    try:
        client_paid, client_free = _init_gemini_clients('Scoresheet')
    except ValueError as e:
        return jsonify({"error": str(e)}), 500

    image_bytes = image_file.read()
    mime_type = image_file.content_type or 'image/jpeg'
    user_notation = request.form.get('notation')  # User-selected notation language
    # The frontend uses the filename 'sample_scoresheet.jpeg' (or .jpg after canvas
    # re-encode in processImage) whenever the user processes the bundled demo file.
    # We don't want to store or display those copies in the admin panel.
    is_sample = (image_file.filename or '').lower().startswith('sample_scoresheet')
    logger.info(f"[Scoresheet] Image: {len(image_bytes)} bytes, {mime_type}, notation={user_notation or 'auto'}, sample={is_sample}")


    req_id = uuid.uuid4().hex[:12]
    uid = get_current_user()
    if not is_sample:
        _save_upload(uid, req_id, image_bytes, mime_type, 'scoresheet')

    result_queue = queue.Queue()

    def run_model(model_info):
        model_id = model_info["id"]
        model_name = model_info["name"]
        logger.info(f"[Scoresheet] Starting {model_name} ({model_id})")
        start = time_module.time()
        try:
            def on_retry(retry_info):
                result_queue.put({"type": "retry", "model_id": model_id, "name": model_name,
                                  "free_error": retry_info['free_error'], "free_elapsed": retry_info['free_elapsed']})

            prompt = _build_scoresheet_prompt(user_notation)
            response, tier, retry_info = _gemini_generate(
                client_free, client_paid, model_id,
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    prompt,
                ],
                config={"response_mime_type": "application/json"},
                on_retry=on_retry,
            )
            elapsed = round(time_module.time() - start)
            in_tok, out_tok, think_tok = _extract_usage_tokens(response)
            logger.info(f"[Scoresheet] {model_name} responded in {elapsed}s ({in_tok}+{out_tok}+{think_tok}t tokens) [{tier}]")

            result, warnings = _scoresheet_parse_response(response.text)
            notation = user_notation or result.get("notation") or "english"
            result["notation"] = notation
            result["moves"] = _scoresheet_validate_moves(result.get("moves", []), notation=notation)

            move_count = len(result.get("moves", []))
            logger.info(f"[Scoresheet] {model_name}: {move_count} moves")
            item = {"type": "result", "model_id": model_id, "name": model_name, "result": result, "elapsed": elapsed,
                    "input_tokens": in_tok, "output_tokens": out_tok, "tier": tier}
            if warnings:
                item["warnings"] = warnings
            if retry_info:
                item["retry"] = retry_info
            result_queue.put(item)
            _log_api_usage('scoresheet', model_id, in_tok, out_tok, elapsed, request_id=req_id, thinking_tokens=think_tok, billing_tier=tier, user_id=uid,
                           retry_free_error=retry_info['free_error'] if retry_info else None,
                           retry_free_elapsed=retry_info['free_elapsed'] if retry_info else None)

        except Exception as e:
            elapsed = round(time_module.time() - start)
            logger.error(f"[Scoresheet] {model_name} failed after {elapsed}s: {e}")
            result_queue.put({"type": "result", "model_id": model_id, "name": model_name, "error": str(e), "elapsed": elapsed})
            _log_api_usage('scoresheet', model_id, 0, 0, elapsed, error=str(e), request_id=req_id, user_id=uid, billing_tier='paid')
        finally:
            result_queue.put(_THREAD_DONE)

    # Azure DI thread for precise grid coordinates
    def run_azure_grid():
        """Call Azure Document Intelligence to get precise table cell bounding boxes."""
        endpoint = os.environ.get('AZURE_DI_ENDPOINT', '').rstrip('/')
        di_key = os.environ.get('AZURE_DI_KEY')
        if not endpoint or not di_key:
            logger.info("[Scoresheet] Azure DI not configured, skipping grid detection")
            result_queue.put(_THREAD_DONE)
            return
        try:
            analyze_url = f"{endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-11-30"
            headers = {'Ocp-Apim-Subscription-Key': di_key, 'Content-Type': mime_type}
            resp = http_requests.post(analyze_url, headers=headers, data=image_bytes, timeout=30)
            if resp.status_code != 202:
                logger.warning(f"[Scoresheet] Azure DI submit failed: {resp.status_code}")
                result_queue.put(_THREAD_DONE)
                return
            result_url = resp.headers.get('Operation-Location')
            if not result_url:
                result_queue.put(_THREAD_DONE)
                return
            try:
                result_json = _azure_di_poll(result_url, di_key)
            except Exception as poll_err:
                logger.warning(f"[Scoresheet] Azure DI polling: {poll_err}")
                result_queue.put(_THREAD_DONE)
                return

            analyze_result = result_json.get('analyzeResult', {})
            tables = analyze_result.get('tables', [])
            pages = analyze_result.get('pages', [])
            if not tables or not pages:
                result_queue.put(_THREAD_DONE)
                return

            # Get page dimensions for normalization
            page = pages[0]
            page_w = page.get('width', 1)
            page_h = page.get('height', 1)

            # Find the largest table
            table = max(tables, key=lambda t: t.get('rowCount', 0) * t.get('columnCount', 0))
            cells = table.get('cells', [])
            if not cells:
                result_queue.put(_THREAD_DONE)
                return

            # Extract bounding box per cell as normalized fractions
            cell_bounds = {}  # (row, col) -> {x1, y1, x2, y2} normalized
            for cell in cells:
                r, c = cell['rowIndex'], cell['columnIndex']
                regions = cell.get('boundingRegions', [])
                if not regions:
                    continue
                polygon = regions[0].get('polygon', [])
                if len(polygon) < 8:
                    continue
                # polygon is [x1,y1, x2,y2, x3,y3, x4,y4] — 4 corners
                xs = [polygon[i] for i in range(0, 8, 2)]
                ys = [polygon[i] for i in range(1, 8, 2)]
                cell_bounds[(r, c)] = {
                    'x1': min(xs) / page_w, 'y1': min(ys) / page_h,
                    'x2': max(xs) / page_w, 'y2': max(ys) / page_h,
                }

            if not cell_bounds:
                result_queue.put(_THREAD_DONE)
                return

            # Compute grid: top, bottom, column dividers, tilt
            all_y1 = [b['y1'] for b in cell_bounds.values()]
            all_y2 = [b['y2'] for b in cell_bounds.values()]
            grid_top = min(all_y1)
            grid_bottom = max(all_y2)

            # Column dividers: get unique column indices, find left/right edges
            col_count = table.get('columnCount', 0)
            col_edges = []  # list of (left, right) per column
            for ci in range(col_count):
                col_cells = [b for (r, c), b in cell_bounds.items() if c == ci]
                if col_cells:
                    col_edges.append((
                        sum(b['x1'] for b in col_cells) / len(col_cells),
                        sum(b['x2'] for b in col_cells) / len(col_cells),
                    ))
                else:
                    col_edges.append(None)

            # Build col_dividers: left edge of each col + right edge of last col
            col_dividers = []
            for edge in col_edges:
                if edge:
                    col_dividers.append(round(edge[0], 4))
            if col_edges and col_edges[-1]:
                col_dividers.append(round(col_edges[-1][1], 4))

            # Estimate tilt from row 0 cells
            tilt = 0.0
            row0_cells = [(c, b) for (r, c), b in cell_bounds.items() if r == 0]
            if len(row0_cells) >= 2:
                row0_cells.sort(key=lambda x: x[0])
                first = row0_cells[0][1]
                last = row0_cells[-1][1]
                dx = (last['x1'] + last['x2']) / 2 - (first['x1'] + first['x2']) / 2
                dy = (last['y1'] + last['y2']) / 2 - (first['y1'] + first['y2']) / 2
                if dx > 0:
                    tilt = round(math.degrees(math.atan2(dy, dx)), 2)

            # Build per-cell bounds for direct lookup: { "row-col": {x1,y1,x2,y2} }
            cells_map = {}
            for (r, c), b in cell_bounds.items():
                cells_map[f"{r}-{c}"] = {k: round(v, 4) for k, v in b.items()}

            # Detect which row is the first move row by examining cell content
            # Look for the first row where col 0 contains "01" or "1" (move number)
            cell_content = {}  # (row, col) -> content string
            for cell in cells:
                content = cell.get('content', '').strip()
                if content:
                    cell_content[(cell['rowIndex'], cell['columnIndex'])] = content

            first_move_row = 0
            row_count = table.get('rowCount', 0)
            # Header keywords that indicate a non-move row (case-insensitive)
            header_words = {'white', 'black', 'blanc', 'noir', 'weiss', 'schwarz', 'blanco', 'negro', 'bianco', 'nero'}
            for r in range(row_count):
                # Check if this row is a header row (contains WHITE/BLACK etc.)
                row_texts = [cell_content.get((r, c), '').lower().strip() for c in range(col_count)]
                is_header = any(t in header_words for t in row_texts)
                if is_header:
                    first_move_row = r + 1
                    continue
                # Check if any cell in this row contains "01" or "1" as a move number
                col0_content = cell_content.get((r, 0), '')
                if col0_content in ('01', '1', '01.', '1.'):
                    first_move_row = r
                    break
                if re.match(r'^[01][\.\s]*$', col0_content):
                    first_move_row = r
                    break

            logger.info(f"[Scoresheet] Azure DI first_move_row={first_move_row} (row_count={row_count})")

            azure_grid = {
                'top': round(grid_top, 4),
                'bottom': round(grid_bottom, 4),
                'tilt': tilt,
                'col_dividers': col_dividers,
                'col_count': col_count,
                'row_count': row_count,
                'first_move_row': first_move_row,
                'cells': cells_map,
                'source': 'azure',
            }
            logger.info(f"[Scoresheet] Azure DI grid: top={grid_top:.3f} bottom={grid_bottom:.3f} tilt={tilt} cols={col_count} dividers={col_dividers}")
            result_queue.put({"type": "azure_grid", "grid": azure_grid})

        except Exception as e:
            logger.error(f"[Scoresheet] Azure DI grid detection failed: {e}")
        finally:
            result_queue.put(_THREAD_DONE)

    threads = []
    for m in SCORESHEET_MODELS:
        t = threading.Thread(target=run_model, args=(m,))
        t.start()
        threads.append(t)

    # Azure DI grid detection — for debug visualization
    azure_thread = threading.Thread(target=run_azure_grid)
    azure_thread.start()
    threads.append(azure_thread)
    total_threads = len(SCORESHEET_MODELS) + 1

    return _sse_response(result_queue, threads, total_threads,
                         {'type': 'models', 'models': _enrich_models_with_avg('scoresheet', uid)}, 'Scoresheet')


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

    recurring_day = data.get('recurring_day')
    recurring_time = (data.get('recurring_time') or '').strip() or None

    with get_db() as conn:
        cursor = conn.execute(
            '''INSERT INTO coach_students
               (coach_user_id, student_name, city, timezone, currency, source, chesscom_username, lichess_username, recurring_day, recurring_time, email, phone_number)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id''',
            (request.user_id, name,
             (data.get('city') or '').strip() or None,
             data.get('timezone', 'UTC'),
             (data.get('currency') or '').strip() or None,
             (data.get('source') or '').strip() or None,
             (data.get('chesscom_username') or '').strip() or None,
             (data.get('lichess_username') or '').strip() or None,
             recurring_day, recurring_time,
             (data.get('email') or '').strip() or None,
             (data.get('phone_number') or '').strip() or None)
        )
        student_id = cursor.fetchone()['id']

    return jsonify({'id': student_id, 'message': 'Student added'}), 201


@coaches_bp.route('/api/coaches/students/<int:student_id>', methods=['PUT'])
@login_required
def update_coach_student(student_id):
    """Update a student's details."""
    data = request.get_json()

    allowed = ['student_name', 'city', 'timezone', 'currency', 'source', 'chesscom_username', 'lichess_username', 'recurring_day', 'recurring_time', 'email', 'phone_number']
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
            SELECT id, scheduled_at, duration_minutes, status, notes, meet_link, pack_id, created_at
            FROM coach_lessons WHERE student_id = ?
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
            WHERE cl.id = ?
        ''', (lesson_id,)).fetchone()
        if not lesson or lesson['coach_user_id'] != request.user_id:
            return jsonify({'error': 'Lesson not found'}), 404

        VALID_STATUSES = {'scheduled', 'done', 'cancelled', 'tbd'}
        if 'status' in data and data['status'] not in VALID_STATUSES:
            return jsonify({'error': f'Invalid status. Must be one of: {", ".join(VALID_STATUSES)}'}), 400

        allowed = ['scheduled_at', 'duration_minutes', 'status', 'notes']
        sets = []
        vals = []
        for field in allowed:
            if field in data:
                val = data[field]
                if isinstance(val, str) and field == 'notes':
                    val = val.strip() or None
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
    """Delete a lesson."""
    with get_db() as conn:
        lesson = conn.execute('''
            SELECT cl.id, cs.coach_user_id FROM coach_lessons cl
            JOIN coach_students cs ON cl.student_id = cs.id
            WHERE cl.id = ?
        ''', (lesson_id,)).fetchone()
        if not lesson or lesson['coach_user_id'] != request.user_id:
            return jsonify({'error': 'Lesson not found'}), 404
        conn.execute('DELETE FROM coach_lessons WHERE id = ?', (lesson_id,))
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
            SELECT cl.id, cl.scheduled_at, cl.duration_minutes, cl.status, cl.notes, cl.meet_link,
                   cs.id AS student_id, cs.student_name, cs.timezone AS student_timezone
            FROM coach_lessons cl
            JOIN coach_students cs ON cl.student_id = cs.id
            WHERE cs.coach_user_id = ?
              AND cl.scheduled_at >= ?
              AND cl.scheduled_at < ?
            ORDER BY cl.scheduled_at
        ''', (request.user_id, start, end)).fetchall()

    return jsonify({'lessons': [dict(l) for l in lessons]})


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
            LEFT JOIN coach_lessons l ON l.pack_id = p.id
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
            WHERE cs.coach_user_id = ? LIMIT 1
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
