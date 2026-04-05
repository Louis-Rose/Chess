// Interactive chessboard — renders a position from FEN, with move navigation

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Chess } from 'chess.js';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, ArrowUpDown } from 'lucide-react';
import { pieceImageUrl, BOARD_LIGHT as LIGHT, BOARD_DARK as DARK } from '../utils/pieces';

/* ── FEN parsing ── */

function fenToBoard(fen: string): (string | null)[][] {
  const rows = fen.split(' ')[0].split('/');
  return rows.map(row => {
    const squares: (string | null)[] = [];
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        for (let i = 0; i < parseInt(ch); i++) squares.push(null);
      } else {
        squares.push(ch);
      }
    }
    return squares;
  });
}

/* ── Extract SANs from raw PGN text ── */

export function extractSans(pgn: string): string[] {
  const movetext = pgn
    .split('\n')
    .filter(l => !l.startsWith('[') && l.trim())
    .join(' ')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\$\d+/g, '')
    .replace(/\([^)]*\)/g, '');

  const sans: string[] = [];
  const tokens = movetext.match(/[A-Ka-kNBRQO][a-h1-8x+#=NBRQ]*|O-O-O|O-O/g);
  if (!tokens) return sans;

  for (const token of tokens) {
    if (['O', 'K', 'Q', 'R', 'B', 'N'].includes(token)) continue;
    sans.push(token);
  }

  return sans;
}

/* ── Extract clock annotations from PGN ── */

function extractStartTime(pgn: string): string | null {
  const m = pgn.match(/\[TimeControl\s+"(\d+)/);
  if (!m) return null;
  const secs = parseInt(m[1]);
  const h = Math.floor(secs / 3600);
  const min = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function extractClocks(pgn: string): (string | null)[] {
  const clocks: (string | null)[] = [];
  const movetext = pgn
    .split('\n')
    .filter(l => !l.startsWith('[') && l.trim())
    .join(' ');

  // Match each SAN move followed (possibly) by a clock comment
  // Walk through tokens: SAN, then optional {[%clk h:mm:ss]}
  const regex = /([A-Ka-kNBRQO][a-h1-8x+#=NBRQ]*|O-O(?:-O)?)\s*(?:\{[^}]*?\[%clk\s+(\d+:\d+:\d+)(?:\.\d+)?\][^}]*?\})?/g;
  let m;
  while ((m = regex.exec(movetext)) !== null) {
    clocks.push(m[2] || null);
  }
  return clocks;
}

/* ── Build position history using chess.js ── */

export function buildPositions(pgn: string): { fens: string[]; sans: string[] } {
  const chess = new Chess();

  try {
    const cleaned = pgn
      .replace(/\{[^}]*\}/g, '')
      .replace(/\$\d+/g, '');
    chess.loadPgn(cleaned);
    const history = chess.history();

    const fens: string[] = [];
    const chess2 = new Chess();
    fens.push(chess2.fen());
    for (const san of history) {
      chess2.move(san);
      fens.push(chess2.fen());
    }
    return { fens, sans: history };
  } catch {
    const sans = extractSans(pgn);
    const chess2 = new Chess();
    const fens: string[] = [chess2.fen()];
    const validSans: string[] = [];
    for (const san of sans) {
      try {
        chess2.move(san);
        fens.push(chess2.fen());
        validSans.push(san);
      } catch {
        break;
      }
    }
    return { fens, sans: validSans };
  }
}

/* ── Move sounds via Web Audio API ── */

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

const SOUND_VOL = 0.75; // volume multiplier (level 2)

// Helper: create a noise buffer source
function noiseSource(ctx: AudioContext, durationSec: number): AudioBufferSourceNode {
  const len = Math.ceil(ctx.sampleRate * durationSec);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

// All variations: sharp transient click + board body resonance
// Tuned around the Tournament baseline with different balances
export function playMoveSound(isCapture: boolean) {
  try {
    const ctx = getAudioCtx();
    const t = ctx.currentTime;

    const v = SOUND_VOL;
    const tHz = 3000, tDur = 0.005, tVol = (isCapture ? 0.053 : 0.03) * v;
    const bType: BiquadFilterType = 'bandpass';
    const bHz = isCapture ? 400 : 600, bQ = 1, bDur = 0.06, bVol = (isCapture ? 0.12 : 0.075) * v;

    // Transient click (highpass noise)
    const src1 = noiseSource(ctx, tDur);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(tHz, t);
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(tVol, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + tDur * 0.9);
    src1.connect(hp);
    hp.connect(g1);
    g1.connect(ctx.destination);
    src1.start(t); src1.stop(t + tDur);

    // Board body resonance
    const src2 = noiseSource(ctx, bDur + 0.02);
    const bf = ctx.createBiquadFilter();
    bf.type = bType;
    bf.frequency.setValueAtTime(bHz, t);
    bf.Q.setValueAtTime(bQ, t);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(bVol, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + bDur);
    src2.connect(bf);
    bf.connect(g2);
    g2.connect(ctx.destination);
    src2.start(t); src2.stop(t + bDur + 0.02);
  } catch {
    // Audio not available
  }
}

/* ── Board colors ── */

/* Board colors imported from utils/pieces */

/* ── Component ── */

interface ChessboardProps {
  pgn: string;
  initialPly?: number;
}

export function Chessboard({ pgn, initialPly }: ChessboardProps) {
  const { fens, sans } = useMemo(() => buildPositions(pgn), [pgn]);
  const clocks = useMemo(() => extractClocks(pgn), [pgn]);
  const startTime = useMemo(() => extractStartTime(pgn), [pgn]);
  const maxPly = fens.length - 1;

  const [ply, setPly] = useState(initialPly ?? maxPly);
  const [flipped, setFlipped] = useState(false);

  // Branch (variation) state: user-made moves that diverge from the main line
  const [branch, setBranch] = useState<{ startPly: number; fens: string[]; sans: string[] } | null>(null);
  const [branchPly, setBranchPly] = useState(0); // index within branch.fens

  const inBranch = branch !== null && branchPly > 0;

  // The FEN currently displayed
  const currentFen = inBranch ? branch!.fens[branchPly] : fens[ply];

  useEffect(() => {
    setPly(initialPly ?? fens.length - 1);
    setBranch(null);
    setBranchPly(0);
  }, [pgn, fens.length, initialPly]);

  const exitBranch = useCallback(() => { setBranch(null); setBranchPly(0); }, []);

  const goFirst = useCallback(() => { exitBranch(); setPly(0); }, [exitBranch]);
  const goPrev = useCallback(() => {
    if (inBranch) {
      // Go back within branch; at branch start, return to main line
      setBranchPly(p => {
        if (p <= 1) { setBranch(null); return 0; }
        return p - 1;
      });
    } else {
      setBranch(null); setBranchPly(0);
      setPly(p => Math.max(0, p - 1));
    }
  }, [inBranch]);
  const goNext = useCallback(() => {
    if (branch && branchPly < branch.fens.length - 1) {
      setBranchPly(p => p + 1);
    } else if (!inBranch) {
      setPly(p => Math.min(maxPly, p + 1));
    }
  }, [branch, branchPly, inBranch, maxPly]);
  const goLast = useCallback(() => { exitBranch(); setPly(maxPly); }, [exitBranch, maxPly]);

  // Handle a user move on the board (drag & drop)
  const handleUserMove = useCallback((from: string, to: string) => {
    try {
      const chess = new Chess(currentFen);
      // Try the move (allow promotion to queen by default)
      const move = chess.move({ from, to, promotion: 'q' });
      if (!move) return;

      const newFen = chess.fen();
      const san = move.san;

      // Check if this matches the next move in the main line
      if (!inBranch && ply < maxPly && san === sans[ply]) {
        // Matches main line — just advance
        setPly(p => p + 1);
        playMoveSound(san.includes('x'));
        return;
      }

      // Diverges — create or extend branch
      if (inBranch && branch) {
        // Extend existing branch
        setBranch({
          ...branch,
          fens: [...branch.fens.slice(0, branchPly + 1), newFen],
          sans: [...branch.sans.slice(0, branchPly), san],
        });
        setBranchPly(branchPly + 1);
      } else {
        // New branch from current main-line ply
        setBranch({
          startPly: ply,
          fens: [fens[ply], newFen],
          sans: [san],
        });
        setBranchPly(1);
      }
      playMoveSound(san.includes('x'));
    } catch {
      // Invalid move — ignore
    }
  }, [currentFen, inBranch, branch, branchPly, ply, maxPly, sans, fens]);

  // Drag & drop state
  const boardRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ piece: string; fromR: number; fromC: number; x: number; y: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent, piece: string, r: number, c: number) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging({ piece, fromR: r, fromC: c, x: e.clientX, y: e.clientY });
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      setDragging(null);
      return;
    }
    setDragging(d => d ? { ...d, x: e.clientX, y: e.clientY } : null);
  }, [dragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging || !boardRef.current) { setDragging(null); return; }
    const rect = boardRef.current.getBoundingClientRect();
    const sqSize = rect.width / 8;
    const dj = Math.floor((e.clientX - rect.left) / sqSize);
    const di = Math.floor((e.clientY - rect.top) / sqSize);
    if (di < 0 || di > 7 || dj < 0 || dj > 7) { setDragging(null); return; }
    const toR = flipped ? 7 - di : di;
    const toC = flipped ? 7 - dj : dj;
    const fromFile = String.fromCharCode(97 + dragging.fromC);
    const fromRank = String(8 - dragging.fromR);
    const toFile = String.fromCharCode(97 + toC);
    const toRank = String(8 - toR);
    const from = `${fromFile}${fromRank}`;
    const to = `${toFile}${toRank}`;
    if (from !== to) handleUserMove(from, to);
    setDragging(null);
  }, [dragging, flipped, handleUserMove]);

  // Play sound on ply change (skip initial render)
  const isInitialRender = useRef(true);
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    if (!inBranch && ply > 0 && ply <= sans.length) {
      const san = sans[ply - 1];
      playMoveSound(san.includes('x'));
    }
  }, [ply, sans, inBranch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      if (e.key === 'Home') { e.preventDefault(); goFirst(); }
      if (e.key === 'End') { e.preventDefault(); goLast(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goFirst, goPrev, goNext, goLast]);

  const board = fenToBoard(currentFen);

  // Current clocks for each side — fall back to starting time
  const currentClocks = useMemo(() => {
    let whiteClock: string | null = null;
    let blackClock: string | null = null;
    for (let i = ply - 1; i >= 0; i--) {
      const isWhiteMove = i % 2 === 0;
      if (isWhiteMove && !whiteClock && clocks[i]) whiteClock = clocks[i];
      if (!isWhiteMove && !blackClock && clocks[i]) blackClock = clocks[i];
      if (whiteClock && blackClock) break;
    }
    if (!whiteClock && startTime) whiteClock = startTime;
    if (!blackClock && startTime) blackClock = startTime;
    return { whiteClock, blackClock };
  }, [ply, clocks, startTime]);

  const moveList = useMemo(() => {
    const pairs: { num: number; white: string; black?: string; whitePly: number; blackPly?: number; whiteClk?: string | null; blackClk?: string | null }[] = [];
    for (let i = 0; i < sans.length; i += 2) {
      pairs.push({
        num: Math.floor(i / 2) + 1,
        white: sans[i],
        black: sans[i + 1],
        whitePly: i + 1,
        blackPly: sans[i + 1] ? i + 2 : undefined,
        whiteClk: clocks[i] || null,
        blackClk: clocks[i + 1] || null,
      });
    }
    return pairs;
  }, [sans]);

  // Clock component
  const ClockDisplay = ({ time, isBlack }: { time: string | null; isBlack: boolean }) => {
    if (!time) return <div className="h-8" />;
    return (
      <div className={`font-mono font-bold text-base px-3 py-1 rounded shadow inline-block ${
        isBlack
          ? 'bg-slate-900 text-white border border-slate-600'
          : 'bg-white text-slate-900'
      }`}>
        {time}
      </div>
    );
  };

  // Top clock = black side when normal, white side when flipped
  const topClock = flipped ? currentClocks.whiteClock : currentClocks.blackClock;
  const bottomClock = flipped ? currentClocks.blackClock : currentClocks.whiteClock;
  const topIsBlack = !flipped;
  const bottomIsBlack = flipped;

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Board + move list */}
      <div className="relative w-full max-w-[560px]">

      {/* Top clock */}
      <div className="flex justify-end mb-1 min-h-[32px]">
        <ClockDisplay time={topClock} isBlack={topIsBlack} />
      </div>

      {/* Board row: board with absolutely positioned flip button */}
      <div className="relative">
      {/* Flip button */}
      <button
        onClick={() => setFlipped(f => !f)}
        className="absolute -left-12 top-1/2 -translate-y-1/2 p-2.5 rounded-lg bg-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors flex-shrink-0 border border-slate-600 hidden md:block"
        title="Flip board"
      >
        <ArrowUpDown className="w-5 h-5" />
      </button>
      <div className="w-full aspect-square relative rounded-lg overflow-hidden shadow-lg touch-none">
        {/* HTML grid board */}
        <div
          ref={boardRef}
          className="grid grid-cols-8 grid-rows-8 w-full h-full"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {(() => {
            // Compute highlight squares from the last move (main line or branch)
            let fromR = -1, fromC = -1, toR = -1, toC = -1;
            if (inBranch && branch && branchPly > 0) {
              try {
                const chess = new Chess(branch.fens[branchPly - 1]);
                const move = chess.move(branch.sans[branchPly - 1]);
                if (move) {
                  fromC = move.from.charCodeAt(0) - 97;
                  fromR = 7 - (parseInt(move.from[1]) - 1);
                  toC = move.to.charCodeAt(0) - 97;
                  toR = 7 - (parseInt(move.to[1]) - 1);
                }
              } catch {}
            } else if (ply > 0) {
              try {
                const chess = new Chess(fens[ply - 1]);
                const move = chess.move(sans[ply - 1]);
                if (move) {
                  fromC = move.from.charCodeAt(0) - 97;
                  fromR = 7 - (parseInt(move.from[1]) - 1);
                  toC = move.to.charCodeAt(0) - 97;
                  toR = 7 - (parseInt(move.to[1]) - 1);
                }
              } catch {}
            }

            const squares = [];
            for (let di = 0; di < 8; di++) {
              for (let dj = 0; dj < 8; dj++) {
                const r = flipped ? 7 - di : di;
                const c = flipped ? 7 - dj : dj;
                const isLight = (r + c) % 2 === 0;
                const isHighlight = (r === fromR && c === fromC) || (r === toR && c === toC);
                const bg = isHighlight
                  ? (isLight ? '#f7ec5a' : '#dac934')
                  : (isLight ? LIGHT : DARK);
                const piece = (dragging && dragging.fromR === r && dragging.fromC === c) ? null : board[r]?.[c];

                squares.push(
                  <div
                    key={`${r}-${c}`}
                    className="relative select-none"
                    style={{ backgroundColor: bg }}
                  >
                    {/* Coordinate labels */}
                    {dj === 0 && (
                      <span
                        className="absolute top-[3px] left-[3px] text-[0.75rem] font-extrabold leading-none pointer-events-none opacity-80"
                        style={{ color: isLight ? DARK : LIGHT }}
                      >
                        {flipped ? di + 1 : 8 - di}
                      </span>
                    )}
                    {di === 7 && (
                      <span
                        className="absolute bottom-[2px] right-[4px] text-[0.75rem] font-extrabold leading-none pointer-events-none opacity-80"
                        style={{ color: isLight ? DARK : LIGHT }}
                      >
                        {'abcdefgh'[c]}
                      </span>
                    )}
                    {piece && (
                      <img
                        src={pieceImageUrl(piece)}
                        alt=""
                        className="absolute inset-[5%] w-[90%] h-[90%] cursor-grab active:cursor-grabbing"
                        draggable={false}
                        onPointerDown={(e) => handlePointerDown(e, piece, r, c)}
                      />
                    )}
                  </div>
                );
              }
            }
            return squares;
          })()}
        </div>
        {/* Dragging ghost piece */}
        {dragging && (
          <img
            src={pieceImageUrl(dragging.piece)}
            alt=""
            className="fixed pointer-events-none z-50 w-16 h-16 -translate-x-1/2 -translate-y-1/2"
            style={{ left: dragging.x, top: dragging.y }}
            draggable={false}
          />
        )}
      </div>
      </div>

      {/* Bottom clock */}
      <div className="flex justify-end mt-1 min-h-[32px]">
        <ClockDisplay time={bottomClock} isBlack={bottomIsBlack} />
      </div>

      {/* Move list — right of board */}
      <div className="hidden md:flex flex-col w-[180px] absolute left-full top-0 bottom-0 ml-3">
        <div className="flex-1 overflow-y-auto border border-slate-600 rounded-lg">
          <table className="w-full text-sm font-mono">
            <thead>
              <tr className="border-b border-slate-600 bg-slate-700/50">
                <th className="text-slate-400 font-bold text-xs px-2 py-1.5 text-right w-8"></th>
                <th className="text-slate-400 font-bold text-xs px-2 py-1.5 text-left">White</th>
                <th className="text-slate-400 font-bold text-xs px-2 py-1.5 text-left">Black</th>
              </tr>
            </thead>
            <tbody>
              {moveList.map(({ num, white, black, whitePly, blackPly }) => (
                <tr key={num} className="border-b border-slate-700/50 last:border-b-0">
                  <td className="text-slate-500 text-right px-2 py-0.5">{num}.</td>
                  <td className="px-1 py-0.5">
                    <button
                      onClick={() => { exitBranch(); setPly(whitePly); }}
                      className={`w-full text-left px-1 rounded hover:bg-slate-600 transition-colors ${
                        !inBranch && ply === whitePly ? 'bg-blue-600/40 text-white' : 'text-slate-300'
                      }`}
                    >
                      {white}
                    </button>
                  </td>
                  <td className="px-1 py-0.5">
                    {black ? (
                      <button
                        onClick={() => { exitBranch(); setPly(blackPly!); }}
                        className={`w-full text-left px-1 rounded hover:bg-slate-600 transition-colors ${
                          !inBranch && ply === blackPly ? 'bg-blue-600/40 text-white' : 'text-slate-300'
                        }`}
                      >
                        {black}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {/* Branch indicator */}
      {inBranch && (
        <div className="flex items-center gap-2 text-xs text-amber-400">
          <span>Variation ({branch!.sans.length} move{branch!.sans.length > 1 ? 's' : ''})</span>
          <button onClick={exitBranch} className="text-slate-400 hover:text-white underline">Go back to main line</button>
        </div>
      )}

      {/* Navigation controls */}
      <div className="flex items-center gap-1">
        <button onClick={goFirst} disabled={ply === 0 && !inBranch} className="p-2 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-default transition-colors">
          <ChevronFirst className="w-5 h-5" />
        </button>
        <button onClick={goPrev} disabled={ply === 0 && !inBranch} className="p-2 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-default transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button onClick={goNext} disabled={ply === maxPly && !inBranch} className="p-2 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-default transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        <button
          onClick={() => setFlipped(f => !f)}
          className="md:hidden p-2 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors"
          title="Flip board"
        >
          <ArrowUpDown className="w-5 h-5" />
        </button>
        <button onClick={goLast} disabled={ply === maxPly && !inBranch} className="p-2 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-default transition-colors">
          <ChevronLast className="w-5 h-5" />
        </button>
      </div>

      {/* Move list — mobile fallback (below board) */}
      <div className="md:hidden w-full max-w-[560px] max-h-[160px] overflow-y-auto border border-slate-600 rounded-lg">
        <table className="w-full text-sm font-mono">
          <thead>
            <tr className="border-b border-slate-600 bg-slate-700/50 sticky top-0">
              <th className="text-slate-400 font-bold text-xs px-2 py-1.5 text-right w-8"></th>
              <th className="text-slate-400 font-bold text-xs px-2 py-1.5 text-left">White</th>
              <th className="text-slate-400 font-bold text-xs px-2 py-1.5 text-left">Black</th>
            </tr>
          </thead>
          <tbody>
            {moveList.map(({ num, white, black, whitePly, blackPly }) => (
              <tr key={num} className="border-b border-slate-700/50 last:border-b-0">
                <td className="text-slate-500 text-right px-2 py-0.5">{num}.</td>
                <td className="px-1 py-0.5">
                  <button
                    onClick={() => setPly(whitePly)}
                    className={`w-full text-left px-1 rounded hover:bg-slate-600 transition-colors ${
                      ply === whitePly ? 'bg-blue-600/40 text-white' : 'text-slate-300'
                    }`}
                  >
                    {white}
                  </button>
                </td>
                <td className="px-1 py-0.5">
                  {black ? (
                    <button
                      onClick={() => setPly(blackPly!)}
                      className={`w-full text-left px-1 rounded hover:bg-slate-600 transition-colors ${
                        ply === blackPly ? 'bg-blue-600/40 text-white' : 'text-slate-300'
                      }`}
                    >
                      {black}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
