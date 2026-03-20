// Interactive chessboard — renders a position from FEN, with move navigation

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Chess } from 'chess.js';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';

/* ── Piece SVG paths — filled style for both colors ── */

// All pieces use the filled (black) unicode glyphs for consistent style.
// White pieces get white fill + dark stroke, black pieces get dark fill + dark stroke.
const PIECE_CHAR: Record<string, string> = {
  K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

function isWhitePiece(piece: string): boolean {
  return piece === piece.toUpperCase();
}

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

/* ── Board colors ── */

const LIGHT = '#f0d9b5';
const DARK = '#b58863';

/* ── Component ── */

interface ChessboardProps {
  pgn: string;
  initialPly?: number;
}

export function Chessboard({ pgn, initialPly }: ChessboardProps) {
  const { fens, sans } = useMemo(() => buildPositions(pgn), [pgn]);
  const maxPly = fens.length - 1;

  const [ply, setPly] = useState(initialPly ?? maxPly);

  useEffect(() => {
    setPly(initialPly ?? fens.length - 1);
  }, [pgn, fens.length, initialPly]);

  const goFirst = useCallback(() => setPly(0), []);
  const goPrev = useCallback(() => setPly(p => Math.max(0, p - 1)), []);
  const goNext = useCallback(() => setPly(p => Math.min(maxPly, p + 1)), [maxPly]);
  const goLast = useCallback(() => setPly(maxPly), [maxPly]);

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

  const board = fenToBoard(fens[ply]);

  const moveList = useMemo(() => {
    const pairs: { num: number; white: string; black?: string; whitePly: number; blackPly?: number }[] = [];
    for (let i = 0; i < sans.length; i += 2) {
      pairs.push({
        num: Math.floor(i / 2) + 1,
        white: sans[i],
        black: sans[i + 1],
        whitePly: i + 1,
        blackPly: sans[i + 1] ? i + 2 : undefined,
      });
    }
    return pairs;
  }, [sans]);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Board */}
      <div className="w-full max-w-[560px] aspect-square">
        <svg viewBox="0 0 800 800" className="w-full h-full rounded-lg overflow-hidden shadow-lg">
          {/* Highlight last move (render behind pieces) */}
          {ply > 0 && (() => {
            try {
              const chess = new Chess(fens[ply - 1]);
              const move = chess.move(sans[ply - 1]);
              if (!move) return null;
              const fromC = move.from.charCodeAt(0) - 97;
              const fromR = 7 - (parseInt(move.from[1]) - 1);
              const toC = move.to.charCodeAt(0) - 97;
              const toR = 7 - (parseInt(move.to[1]) - 1);
              return (
                <g>
                  {/* Draw all squares first */}
                  {board.map((row, r) =>
                    row.map((_, c) => {
                      const isLight = (r + c) % 2 === 0;
                      const isFrom = r === fromR && c === fromC;
                      const isTo = r === toR && c === toC;
                      return (
                        <rect
                          key={`bg-${r}-${c}`}
                          x={c * 100} y={r * 100} width={100} height={100}
                          fill={isFrom || isTo ? (isLight ? '#f7ec5a' : '#dac934') : (isLight ? LIGHT : DARK)}
                        />
                      );
                    })
                  )}
                </g>
              );
            } catch {
              // Fallback: draw squares without highlight
              return (
                <g>
                  {board.map((row, r) =>
                    row.map((_, c) => (
                      <rect key={`bg-${r}-${c}`} x={c * 100} y={r * 100} width={100} height={100} fill={(r + c) % 2 === 0 ? LIGHT : DARK} />
                    ))
                  )}
                </g>
              );
            }
          })()}
          {/* Squares without highlight (when at start position) */}
          {ply === 0 && board.map((row, r) =>
            row.map((_, c) => (
              <rect key={`bg-${r}-${c}`} x={c * 100} y={r * 100} width={100} height={100} fill={(r + c) % 2 === 0 ? LIGHT : DARK} />
            ))
          )}
          {/* Coordinate labels */}
          {Array.from({ length: 8 }).map((_, c) => (
            <text key={`file-${c}`} x={c * 100 + 90} y={796} fontSize="18" fontWeight="700" fill={(7 + c) % 2 === 0 ? DARK : LIGHT} textAnchor="end" fontFamily="system-ui">
              {'abcdefgh'[c]}
            </text>
          ))}
          {Array.from({ length: 8 }).map((_, r) => (
            <text key={`rank-${r}`} x={6} y={r * 100 + 20} fontSize="18" fontWeight="700" fill={(r) % 2 === 0 ? DARK : LIGHT} fontFamily="system-ui">
              {8 - r}
            </text>
          ))}
          {/* Pieces */}
          {board.map((row, r) =>
            row.map((piece, c) => {
              if (!piece) return null;
              const x = c * 100 + 50;
              const y = r * 100 + 58;
              const white = isWhitePiece(piece);
              return (
                <text
                  key={`piece-${r}-${c}`}
                  x={x}
                  y={y}
                  fontSize="72"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={white ? '#fff' : '#1e1e1e'}
                  stroke={white ? '#1e1e1e' : '#1e1e1e'}
                  strokeWidth={white ? 1.5 : 0}
                  style={{ userSelect: 'none' }}
                  paintOrder={white ? 'stroke' : undefined}
                >
                  {PIECE_CHAR[piece]}
                </text>
              );
            })
          )}
        </svg>
      </div>

      {/* Navigation controls */}
      <div className="flex items-center gap-1">
        <button onClick={goFirst} disabled={ply === 0} className="p-2 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-default transition-colors">
          <ChevronFirst className="w-5 h-5" />
        </button>
        <button onClick={goPrev} disabled={ply === 0} className="p-2 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-default transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button onClick={goNext} disabled={ply === maxPly} className="p-2 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-default transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        <button onClick={goLast} disabled={ply === maxPly} className="p-2 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-default transition-colors">
          <ChevronLast className="w-5 h-5" />
        </button>
      </div>

      {/* Move list */}
      <div className="w-full max-w-[560px] max-h-[160px] overflow-y-auto bg-slate-700/30 rounded-lg p-2">
        <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 gap-y-0.5 text-sm font-mono">
          {moveList.map(({ num, white, black, whitePly, blackPly }) => (
            <div key={num} className="contents">
              <span className="text-slate-500 text-right pr-1">{num}.</span>
              <button
                onClick={() => setPly(whitePly)}
                className={`text-left px-1 rounded hover:bg-slate-600 transition-colors ${
                  ply === whitePly ? 'bg-blue-600/40 text-white' : 'text-slate-300'
                }`}
              >
                {white}
              </button>
              {black ? (
                <button
                  onClick={() => setPly(blackPly!)}
                  className={`text-left px-1 rounded hover:bg-slate-600 transition-colors ${
                    ply === blackPly ? 'bg-blue-600/40 text-white' : 'text-slate-300'
                  }`}
                >
                  {black}
                </button>
              ) : <span />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
