import os
import logging
import requests as http_requests
from flask import Blueprint, jsonify, request, Response
from auth import login_required, admin_required
from database import get_db, USE_POSTGRES

logger = logging.getLogger(__name__)

coaches_bp = Blueprint('coaches', __name__)

GROUND_TRUTH_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'scoresheets')


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

def _scoresheet_clean_san(san):
    """Clean up common OCR artifacts from a SAN move."""
    import re
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
    import re
    stripped = san.replace('-', '').replace(' ', '')
    if re.fullmatch(r'[oO0]{3}', stripped):
        return 'O-O-O'
    if re.fullmatch(r'[oO0]{2}', stripped):
        return 'O-O'
    return san


def _scoresheet_push_san(board, san):
    """Try to push a SAN move, tolerating castling variants, missing/extra 'x', and OCR artifacts."""
    import chess
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
        import re
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
    import chess
    import re
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
                return f"Ambiguous: did you mean {' or '.join(candidates)}?"
            if len(candidates) == 1:
                return f"Did you mean {candidates[0]}?"
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


def _scoresheet_validate_moves(moves, stop_at_illegal=False):
    """Validate moves with python-chess, adding legality flags.
    If stop_at_illegal, truncate after the first illegal move."""
    import chess
    board = chess.Board()
    for i, move in enumerate(moves):
        for color in ("white", "black"):
            san = move.get(color)
            if not san or san == "?":
                move.pop(f"{color}_legal", None)
                continue
            # Normalize castling and clean OCR artifacts in the output
            cleaned = _scoresheet_clean_san(san)
            normalized = _scoresheet_normalize_castling(cleaned)
            if normalized != san:
                move[color] = normalized
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
    import json as json_module
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


def _log_api_usage(feature, model_id, input_tokens, output_tokens, elapsed, error=None, request_id=None):
    """Log a Gemini API call to the api_usage table."""
    try:
        with get_db() as conn:
            conn.execute(
                """INSERT INTO api_usage (request_id, feature, model_id, input_tokens, output_tokens, elapsed_seconds, error)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (request_id, feature, model_id, input_tokens, output_tokens, elapsed, error),
            )
    except Exception as e:
        logger.error(f"[API Usage] Failed to log: {e}")


SCORESHEET_MODELS = [
    {"id": "gemini-3-flash-preview", "name": "Gemini 3 Flash"},
    {"id": "gemini-3.1-pro-preview", "name": "Gemini 3.1 Pro"},
    {"id": "gemini-3.1-flash-lite-preview", "name": "Gemini 3.1 Flash-Lite"},
]

SCORESHEET_READ_PROMPT = """You are analyzing a handwritten chess tournament scoresheet image.

Extract ALL moves from the scoresheet and return them as a JSON object with this exact format:
{
  "white_player": "Name or empty string if unreadable",
  "black_player": "Name or empty string if unreadable",
  "event": "Tournament name or empty string if unreadable",
  "date": "Date or empty string if unreadable",
  "result": "1-0, 0-1, 1/2-1/2, or * if unreadable/ongoing",
  "columns": 2,
  "rows_per_column": 15,
  "moves": [
    {"number": 1, "white": "e4", "white_confidence": "high", "black": "e5", "black_confidence": "high"},
    {"number": 2, "white": "Nf3", "white_confidence": "high", "black": "Nc6", "black_confidence": "medium"}
  ]
}

Rules:
- Transcribe EXACTLY what is written on the sheet — do not add or remove symbols
- Some players write captures with "x" (e.g. Nxd4) and some without (e.g. Nd4). Read what is actually written.
- If a move is unreadable, use "?" as the move
- If black's last move is missing (white won or game ended), omit the "black" field for that move
- Include ALL moves you can read, even partially
- Be careful with similar-looking pieces: K (King), N (Knight), B (Bishop), R (Rook), Q (Queen)
- Chess moves always end with a rank digit (1-8), optionally followed by + or #. If you see a letter "l" or "I" at the end, it is the digit "1". Do not output moves ending in letters like "Reel" — that should be "Re1".
- Castling: O-O (kingside), O-O-O (queenside)
- For each move, include a confidence level: "high" (clearly readable), "medium" (somewhat ambiguous), or "low" (hard to read/guessing)
- "columns": how many columns of moves the scoresheet has (usually 1, 2, or 3)
- "rows_per_column": how many move rows fit in each column on the sheet

Return ONLY the JSON object, no other text."""


@coaches_bp.route('/api/coaches/reread-scoresheet', methods=['POST'])
def reread_scoresheet():
    """Re-read a scoresheet from a given position after user confirms moves."""
    from google import genai
    from google.genai import types
    import chess
    import json as json_module
    import time as time_module
    import uuid

    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    image_file = request.files['image']
    image_bytes = image_file.read()
    mime_type = image_file.content_type or 'image/jpeg'

    confirmed_moves = json_module.loads(request.form.get('confirmed_moves', '[]'))
    model_id = request.form.get('model_id', 'gemini-3-flash-preview')
    req_id = uuid.uuid4().hex[:12]

    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        return jsonify({"error": "GEMINI_API_KEY not configured"}), 500

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
- Some players write captures with "x" (e.g. Nxd4) and some without (e.g. Nd4). Read what is actually written.
- If a move is unreadable, use "?"
- Be careful with similar-looking pieces: K (King), N (Knight), B (Bishop), R (Rook), Q (Queen)
- Chess moves always end with a rank digit (1-8), optionally followed by + or #. If you see a letter "l" or "I" at the end, it is the digit "1".
- Castling: O-O (kingside), O-O-O (queenside)

Return ONLY a JSON object:
{{
  "moves": [
    {{"number": {resume_num}, {'"white": "...", "black": "..."' if resume_color == 'white' else '"black": "..."'}}},
    ...
  ]
}}"""

    client = genai.Client(api_key=api_key)
    start = time_module.time()
    try:
        response = client.models.generate_content(
            model=model_id,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                prompt,
            ],
            config={"response_mime_type": "application/json"},
        )
    except Exception as e:
        elapsed = round(time_module.time() - start)
        logger.error(f"[Scoresheet reread] {model_id} failed: {e}")
        _log_api_usage('reread', model_id, 0, 0, elapsed, error=str(e), request_id=req_id)
        return jsonify({"error": str(e)}), 500

    elapsed = round(time_module.time() - start)
    usage = getattr(response, 'usage_metadata', None)
    in_tok = getattr(usage, 'prompt_token_count', 0) or 0
    out_tok = getattr(usage, 'candidates_token_count', 0) or 0
    _log_api_usage('reread', model_id, in_tok, out_tok, elapsed, request_id=req_id)
    gemini_result, warnings = _scoresheet_parse_response(response.text)
    new_moves = gemini_result.get("moves", [])

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
    import time as time_module

    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    image_file = request.files['image']
    image_bytes = image_file.read()
    mime_type = image_file.content_type or 'image/jpeg'

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
    poll_headers = {'Ocp-Apim-Subscription-Key': key}
    result_json = None
    for _ in range(60):
        time_module.sleep(1)
        try:
            result_resp = http_requests.get(result_url, headers=poll_headers, timeout=10)
            result_json = result_resp.json()
        except Exception as e:
            return jsonify({"error": f"Polling failed: {e}"}), 500
        status = result_json.get('status')
        if status == 'succeeded':
            break
        if status == 'failed':
            return jsonify({"error": "Azure DI analysis failed"}), 500
    else:
        return jsonify({"error": "Azure DI timed out"}), 500

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


DIAGRAM_READ_PROMPT = """You are analyzing a chess diagram image (screenshot, photo, or printed diagram).

Extract the position and return ONLY the FEN string (Forsyth-Edwards Notation).

Rules:
- Return ONLY the FEN string, nothing else — no explanation, no markdown, no quotes
- Include all 6 FEN fields: piece placement, active color, castling, en passant, halfmove clock, fullmove number
- If you cannot determine active color, castling rights, or en passant, use reasonable defaults: "w KQkq - 0 1"
- Be careful distinguishing pieces: K (King), Q (Queen), R (Rook), B (Bishop), N (Knight), P (pawn)
- White pieces are uppercase (KQRBNP), black pieces are lowercase (kqrbnp)
- Read the board from rank 8 (top) to rank 1 (bottom), file a (left) to file h (right)
- Empty squares are represented by digits (1-8) counting consecutive empties

Example output:
rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"""


@coaches_bp.route('/api/coaches/read-diagram', methods=['POST'])
def read_diagram():
    """Analyze a chess diagram image with multiple Gemini models in parallel, streaming results via SSE."""
    from google import genai
    from google.genai import types
    import json as json_module
    import threading
    import queue
    import time as time_module
    import uuid

    logger.info("[Diagram] Request received")

    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    image_file = request.files['image']
    if not image_file.filename:
        return jsonify({"error": "Empty filename"}), 400

    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        logger.error("[Diagram] GEMINI_API_KEY not configured")
        return jsonify({"error": "GEMINI_API_KEY not configured"}), 500

    image_bytes = image_file.read()
    mime_type = image_file.content_type or 'image/jpeg'
    logger.info(f"[Diagram] Image: {len(image_bytes)} bytes, {mime_type}")

    THREAD_DONE = "THREAD_DONE"
    req_id = uuid.uuid4().hex[:12]

    result_queue = queue.Queue()
    client = genai.Client(api_key=api_key)

    def run_model(model_info):
        model_id = model_info["id"]
        model_name = model_info["name"]
        logger.info(f"[Diagram] Starting {model_name} ({model_id})")
        start = time_module.time()
        try:
            response = client.models.generate_content(
                model=model_id,
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    DIAGRAM_READ_PROMPT,
                ],
            )
            elapsed = round(time_module.time() - start)
            usage = getattr(response, 'usage_metadata', None)
            in_tok = getattr(usage, 'prompt_token_count', 0) or 0
            out_tok = getattr(usage, 'candidates_token_count', 0) or 0
            fen = response.text.strip().strip('`').strip()
            # Remove markdown code block if present
            if fen.startswith('fen\n'):
                fen = fen[4:].strip()
            logger.info(f"[Diagram] {model_name} responded in {elapsed}s: {fen[:80]} ({in_tok}+{out_tok} tokens)")
            result_queue.put({"type": "result", "model_id": model_id, "name": model_name, "fen": fen, "elapsed": elapsed})
            _log_api_usage('diagram', model_id, in_tok, out_tok, elapsed, request_id=req_id)
        except Exception as e:
            elapsed = round(time_module.time() - start)
            logger.error(f"[Diagram] {model_name} failed after {elapsed}s: {e}")
            result_queue.put({"type": "result", "model_id": model_id, "name": model_name, "error": str(e), "elapsed": elapsed})
            _log_api_usage('diagram', model_id, 0, 0, elapsed, error=str(e), request_id=req_id)
        finally:
            result_queue.put(THREAD_DONE)

    threads = []
    for m in SCORESHEET_MODELS:
        t = threading.Thread(target=run_model, args=(m,))
        t.start()
        threads.append(t)

    def generate():
        yield f"data: {json_module.dumps({'type': 'models', 'models': SCORESHEET_MODELS})}\n\n"

        threads_done = 0
        while threads_done < len(SCORESHEET_MODELS):
            try:
                item = result_queue.get(timeout=300)
                if item is THREAD_DONE:
                    threads_done += 1
                    continue
                yield f"data: {json_module.dumps(item)}\n\n"
            except queue.Empty:
                break

        yield "data: {\"type\": \"done\"}\n\n"
        logger.info("[Diagram] All models done.")

        for t in threads:
            t.join(timeout=1)

    return Response(generate(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
    })


@coaches_bp.route('/api/coaches/read-scoresheet', methods=['POST'])
def read_scoresheet():
    """Analyze a scoresheet image with multiple Gemini models in parallel, streaming results via SSE."""
    from google import genai
    from google.genai import types
    import json as json_module
    import threading
    import queue
    import time as time_module
    import uuid

    logger.info("[Scoresheet] Request received")

    if 'image' not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    image_file = request.files['image']
    if not image_file.filename:
        return jsonify({"error": "Empty filename"}), 400

    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        logger.error("[Scoresheet] GEMINI_API_KEY not configured")
        return jsonify({"error": "GEMINI_API_KEY not configured"}), 500

    image_bytes = image_file.read()
    mime_type = image_file.content_type or 'image/jpeg'
    logger.info(f"[Scoresheet] Image: {len(image_bytes)} bytes, {mime_type}")

    THREAD_DONE = "THREAD_DONE"
    req_id = uuid.uuid4().hex[:12]

    result_queue = queue.Queue()
    client = genai.Client(api_key=api_key)

    def run_model(model_info):
        model_id = model_info["id"]
        model_name = model_info["name"]
        logger.info(f"[Scoresheet] Starting {model_name} ({model_id})")
        start = time_module.time()
        try:
            response = client.models.generate_content(
                model=model_id,
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    SCORESHEET_READ_PROMPT,
                ],
                config={"response_mime_type": "application/json"},
            )
            elapsed = round(time_module.time() - start)
            usage = getattr(response, 'usage_metadata', None)
            in_tok = getattr(usage, 'prompt_token_count', 0) or 0
            out_tok = getattr(usage, 'candidates_token_count', 0) or 0
            logger.info(f"[Scoresheet] {model_name} responded in {elapsed}s ({in_tok}+{out_tok} tokens)")

            result, warnings = _scoresheet_parse_response(response.text)
            result["moves"] = _scoresheet_validate_moves(result.get("moves", []))

            move_count = len(result.get("moves", []))
            logger.info(f"[Scoresheet] {model_name}: {move_count} moves")
            item = {"type": "result", "model_id": model_id, "name": model_name, "result": result, "elapsed": elapsed,
                    "input_tokens": in_tok, "output_tokens": out_tok}
            if warnings:
                item["warnings"] = warnings
            result_queue.put(item)
            _log_api_usage('scoresheet', model_id, in_tok, out_tok, elapsed, request_id=req_id)

        except Exception as e:
            elapsed = round(time_module.time() - start)
            logger.error(f"[Scoresheet] {model_name} failed after {elapsed}s: {e}")
            result_queue.put({"type": "result", "model_id": model_id, "name": model_name, "error": str(e), "elapsed": elapsed})
            _log_api_usage('scoresheet', model_id, 0, 0, elapsed, error=str(e), request_id=req_id)
        finally:
            result_queue.put(THREAD_DONE)

    threads = []
    for m in SCORESHEET_MODELS:
        t = threading.Thread(target=run_model, args=(m,))
        t.start()
        threads.append(t)

    def generate():
        yield f"data: {json_module.dumps({'type': 'models', 'models': SCORESHEET_MODELS})}\n\n"

        threads_done = 0
        while threads_done < len(SCORESHEET_MODELS):
            try:
                item = result_queue.get(timeout=300)
                if item is THREAD_DONE:
                    threads_done += 1
                    continue
                yield f"data: {json_module.dumps(item)}\n\n"
            except queue.Empty:
                break

        yield "data: {\"type\": \"done\"}\n\n"
        logger.info(f"[Scoresheet] All models done.")

        for t in threads:
            t.join(timeout=1)

    return Response(generate(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
    })


# ── Coach Students Management ──

@coaches_bp.route('/api/coaches/students', methods=['GET'])
@login_required
def get_coach_students():
    """List all students for the authenticated coach."""
    with get_db() as conn:
        rows = conn.execute(
            'SELECT * FROM coach_students WHERE coach_user_id = ? ORDER BY is_active DESC, student_name ASC',
            (request.user_id,)
        ).fetchall()
        students = []
        for r in rows:
            s = dict(r)
            # Upcoming lesson
            upcoming = conn.execute(
                '''SELECT id, scheduled_at, duration_minutes, status
                   FROM coach_lessons WHERE student_id = ? AND status = 'scheduled'
                   ORDER BY scheduled_at ASC LIMIT 1''',
                (s['id'],)
            ).fetchone()
            s['next_lesson'] = dict(upcoming) if upcoming else None
            students.append(s)
    return jsonify({'students': students})


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
               (coach_user_id, student_name, timezone, currency, recurring_day, recurring_time)
               VALUES (?, ?, ?, ?, ?, ?)''',
            (request.user_id, name, data.get('timezone', 'UTC'),
             (data.get('currency') or '').strip() or None,
             recurring_day, recurring_time)
        )
        if USE_POSTGRES:
            student_id = conn.execute('SELECT lastval() AS id').fetchone()['id']
        else:
            student_id = cursor.lastrowid

    return jsonify({'id': student_id, 'message': 'Student added'}), 201


@coaches_bp.route('/api/coaches/students/<int:student_id>', methods=['PUT'])
@login_required
def update_coach_student(student_id):
    """Update a student's details."""
    data = request.get_json()

    allowed = ['student_name', 'timezone', 'currency', 'recurring_day', 'recurring_time', 'is_active']
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
def get_student_lessons(student_id):
    """Get all lessons for a specific student."""
    with get_db() as conn:
        # Verify ownership
        student = conn.execute(
            'SELECT * FROM coach_students WHERE id = ? AND coach_user_id = ?',
            (student_id, request.user_id)
        ).fetchone()
        if not student:
            return jsonify({'error': 'Student not found'}), 404

        rows = conn.execute(
            '''SELECT id, student_id, scheduled_at, duration_minutes, status, paid, created_at
               FROM coach_lessons WHERE student_id = ?
               ORDER BY scheduled_at DESC''',
            (student_id,)
        ).fetchall()
    return jsonify({'student': dict(student), 'lessons': [dict(r) for r in rows]})


@coaches_bp.route('/api/coaches/students/<int:student_id>/lessons', methods=['POST'])
@login_required
def add_coach_lesson(student_id):
    """Schedule a lesson for a student."""
    data = request.get_json()
    scheduled_at = data.get('scheduled_at')
    if not scheduled_at:
        return jsonify({'error': 'scheduled_at required'}), 400

    with get_db() as conn:
        conn.execute(
            '''INSERT INTO coach_lessons (student_id, scheduled_at, duration_minutes, status)
               VALUES (?, ?, ?, 'scheduled')''',
            (student_id, scheduled_at, data.get('duration_minutes', 60))
        )
    return jsonify({'message': 'Lesson scheduled'}), 201


@coaches_bp.route('/api/coaches/lessons/week', methods=['GET'])
@login_required
def get_week_lessons():
    """Get all lessons for the coach within a date range, with student names.
    Auto-generates lessons from recurring slots if they don't exist yet."""
    start = request.args.get('start')
    end = request.args.get('end')
    coach_tz = request.args.get('tz', 'UTC')
    if not start or not end:
        return jsonify({'error': 'start and end required'}), 400

    from datetime import datetime, timedelta
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(coach_tz)
    except Exception:
        import zoneinfo
        tz = zoneinfo.ZoneInfo('UTC')

    start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
    end_dt = datetime.fromisoformat(end.replace('Z', '+00:00'))

    with get_db() as conn:
        # Auto-generate lessons from recurring slots
        students = conn.execute(
            '''SELECT id, recurring_day, recurring_time FROM coach_students
               WHERE coach_user_id = ? AND is_active = 1 AND recurring_day IS NOT NULL AND recurring_time IS NOT NULL''',
            (request.user_id,)
        ).fetchall()

        for s in students:
            # recurring_day: 0=Mon..6=Sun, recurring_time: "HH:MM" in coach's TZ
            rd = s['recurring_day']
            rt = s['recurring_time']
            if rt is None:
                continue

            # Find the date for this weekday within start..end
            # start_dt is Monday 00:00 UTC typically
            start_local = start_dt.astimezone(tz)
            # Monday=0 in our system
            current_weekday = start_local.weekday()  # Python: Mon=0
            days_ahead = rd - current_weekday
            if days_ahead < 0:
                days_ahead += 7
            lesson_date = start_local + timedelta(days=days_ahead)

            try:
                h, m = rt.split(':')
                lesson_dt = lesson_date.replace(hour=int(h), minute=int(m), second=0, microsecond=0)
            except (ValueError, TypeError):
                continue

            # Convert to UTC for storage
            lesson_utc = lesson_dt.astimezone(zoneinfo.ZoneInfo('UTC'))

            if lesson_utc < start_dt or lesson_utc >= end_dt:
                continue

            # Check if a lesson already exists for this student at this time
            lesson_str = lesson_utc.strftime('%Y-%m-%d %H:%M:%S')
            existing = conn.execute(
                '''SELECT id FROM coach_lessons
                   WHERE student_id = ? AND scheduled_at = ?''',
                (s['id'], lesson_str)
            ).fetchone()

            if not existing:
                conn.execute(
                    '''INSERT INTO coach_lessons (student_id, scheduled_at, duration_minutes, status)
                       VALUES (?, ?, 60, 'scheduled')''',
                    (s['id'], lesson_str)
                )

        # Now fetch all lessons for the week
        rows = conn.execute(
            '''SELECT l.id, l.student_id, l.scheduled_at, l.duration_minutes, l.status, l.created_at,
                      s.student_name
               FROM coach_lessons l
               JOIN coach_students s ON l.student_id = s.id
               WHERE s.coach_user_id = ? AND l.scheduled_at >= ? AND l.scheduled_at < ?
               ORDER BY l.scheduled_at ASC''',
            (request.user_id, start, end)
        ).fetchall()
    return jsonify({'lessons': [dict(r) for r in rows]})


@coaches_bp.route('/api/coaches/lessons/<int:lesson_id>', methods=['PUT'])
@login_required
def update_coach_lesson(lesson_id):
    """Update a lesson's status or time."""
    data = request.get_json()
    allowed = ['scheduled_at', 'duration_minutes', 'status', 'paid']
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

    vals.append(lesson_id)

    with get_db() as conn:
        old = conn.execute('SELECT status, student_id FROM coach_lessons WHERE id = ?', (lesson_id,)).fetchone()
        if not old:
            return jsonify({'error': 'Lesson not found'}), 404

        conn.execute(f'UPDATE coach_lessons SET {", ".join(sets)} WHERE id = ?', tuple(vals))

    return jsonify({'message': 'Lesson updated'})


@coaches_bp.route('/api/coaches/lessons/unpaid', methods=['GET'])
@login_required
def get_unpaid_lessons():
    """Get all completed but unpaid lessons for the coach."""
    with get_db() as conn:
        rows = conn.execute(
            '''SELECT l.id, l.student_id, l.scheduled_at, l.duration_minutes, l.status, l.paid,
                      s.student_name
               FROM coach_lessons l
               JOIN coach_students s ON l.student_id = s.id
               WHERE s.coach_user_id = ? AND l.status = 'completed' AND (l.paid = 0 OR l.paid IS NULL)
               ORDER BY l.scheduled_at DESC''',
            (request.user_id,)
        ).fetchall()
    return jsonify({'lessons': [dict(r) for r in rows]})


@coaches_bp.route('/api/coaches/lichess/studies', methods=['GET'])
@login_required
def get_lichess_studies():
    """Fetch a Lichess user's studies via the Lichess API."""
    username = request.args.get('username', '').strip()
    if not username:
        return jsonify({'error': 'Lichess username required'}), 400
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
        import json as _json
        studies = []
        for line in resp.iter_lines():
            if line:
                obj = _json.loads(line)
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
