// Lightweight chessboard — renders a FEN position with optional drag-and-drop
// Used as a companion to move tables

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { pieceImageUrl, BOARD_LIGHT as LIGHT, BOARD_DARK as DARK } from '../utils/pieces';

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

interface BoardPreviewProps {
  fen: string;
  lastMove?: { from: string; to: string } | null;
  arrow?: { from: string; to: string } | { from: string; to: string }[] | null;
  onUserMove?: (from: string, to: string) => void;
  highlightSquares?: string[];
  flipped?: boolean;
}

export function BoardPreview({ fen, lastMove, arrow, onUserMove, highlightSquares, flipped = false }: BoardPreviewProps) {
  const board = useMemo(() => fenToBoard(fen), [fen]);
  const boardRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ piece: string; fromR: number; fromC: number; x: number; y: number } | null>(null);

  const highlight = useMemo(() => {
    if (!lastMove) return { fromR: -1, fromC: -1, toR: -1, toC: -1 };
    return {
      fromC: lastMove.from.charCodeAt(0) - 97,
      fromR: 7 - (parseInt(lastMove.from[1]) - 1),
      toC: lastMove.to.charCodeAt(0) - 97,
      toR: 7 - (parseInt(lastMove.to[1]) - 1),
    };
  }, [lastMove]);

  const hlSquareSet = useMemo(() => {
    if (!highlightSquares || highlightSquares.length === 0) return null;
    const set = new Set<string>();
    for (const sq of highlightSquares) {
      const c = sq.charCodeAt(0) - 97;
      const r = 7 - (parseInt(sq[1]) - 1);
      set.add(`${r}-${c}`);
    }
    return set;
  }, [highlightSquares]);

  const draggingRef = useRef(dragging);
  draggingRef.current = dragging;

  const handlePointerDown = useCallback((e: React.PointerEvent, piece: string, r: number, c: number) => {
    if (!onUserMove) return;
    e.preventDefault();
    setDragging({ piece, fromR: r, fromC: c, x: e.clientX, y: e.clientY });
  }, [onUserMove]);

  // Document-level listeners for drag move/up/cancel — avoids stale closures and DOM removal issues
  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: PointerEvent) => {
      if (!boardRef.current) return;
      const rect = boardRef.current.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
        setDragging(null);
        return;
      }
      setDragging(d => d ? { ...d, x: e.clientX, y: e.clientY } : null);
    };

    const onUp = (e: PointerEvent) => {
      const d = draggingRef.current;
      if (!d || !boardRef.current || !onUserMove) { setDragging(null); return; }
      const rect = boardRef.current.getBoundingClientRect();
      const sqSize = rect.width / 8;
      const dj = Math.floor((e.clientX - rect.left) / sqSize);
      const di = Math.floor((e.clientY - rect.top) / sqSize);
      if (di < 0 || di > 7 || dj < 0 || dj > 7) { setDragging(null); return; }
      const toR = flipped ? 7 - di : di;
      const toC = flipped ? 7 - dj : dj;
      const fromFile = String.fromCharCode(97 + d.fromC);
      const fromRank = String(8 - d.fromR);
      const toFile = String.fromCharCode(97 + toC);
      const toRank = String(8 - toR);
      const from = `${fromFile}${fromRank}`;
      const to = `${toFile}${toRank}`;
      if (from !== to) onUserMove(from, to);
      setDragging(null);
    };

    const onCancel = () => setDragging(null);

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('touchend', onCancel);
    document.addEventListener('touchcancel', onCancel);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('touchend', onCancel);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [dragging, onUserMove, flipped]);

  return (
    <div className="w-full aspect-square relative rounded-lg overflow-hidden shadow-lg touch-none">
      <div
        ref={boardRef}
        className="grid grid-cols-8 grid-rows-8 w-full h-full"
      >
        {Array.from({ length: 64 }, (_, idx) => {
          const di = Math.floor(idx / 8);
          const dj = idx % 8;
          const r = flipped ? 7 - di : di;
          const c = flipped ? 7 - dj : dj;
          const isLight = (r + c) % 2 === 0;
          const isHL = (r === highlight.fromR && c === highlight.fromC) || (r === highlight.toR && c === highlight.toC);
          const isHLSquare = hlSquareSet?.has(`${r}-${c}`) ?? false;
          const bg = (isHL || isHLSquare) ? (isLight ? '#f7ec5a' : '#dac934') : (isLight ? LIGHT : DARK);
          const piece = board[r]?.[c];
          const isDragSource = !!(dragging && dragging.fromR === r && dragging.fromC === c);

          return (
            <div key={`${r}-${c}`} className="relative select-none" style={{ backgroundColor: bg }}>
              {dj === 0 && (
                <span className="absolute top-[3px] left-[3px] text-[0.75rem] font-extrabold leading-none pointer-events-none opacity-80" style={{ color: isLight ? DARK : LIGHT }}>
                  {flipped ? di + 1 : 8 - di}
                </span>
              )}
              {di === 7 && (
                <span className="absolute bottom-[2px] right-[4px] text-[0.75rem] font-extrabold leading-none pointer-events-none opacity-80" style={{ color: isLight ? DARK : LIGHT }}>
                  {'abcdefgh'[c]}
                </span>
              )}
              {piece && (
                <img
                  src={pieceImageUrl(piece)}
                  alt=""
                  className={`absolute inset-[5%] w-[90%] h-[90%] ${onUserMove ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}${isDragSource ? ' opacity-0' : ''}`}
                  draggable={false}
                  onPointerDown={onUserMove ? (e) => handlePointerDown(e, piece, r, c) : undefined}
                />
              )}
            </div>
          );
        })}
      </div>
      {arrow && (() => {
        const arrows = Array.isArray(arrow) ? arrow : [arrow];
        return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100">
            <defs>
              <marker id="arrowhead" markerWidth="3" markerHeight="3" refX="1.5" refY="1.5" orient="auto">
                <polygon points="0 0, 3 1.5, 0 3" fill="rgba(255,170,0,0.9)" />
              </marker>
            </defs>
            {arrows.map((a, i) => {
              const fromC = a.from.charCodeAt(0) - 97;
              const fromR = 7 - (parseInt(a.from[1]) - 1);
              const toC = a.to.charCodeAt(0) - 97;
              const toR = 7 - (parseInt(a.to[1]) - 1);
              const x1 = (fromC + 0.5) * 12.5;
              const y1 = (fromR + 0.5) * 12.5;
              const x2 = (toC + 0.5) * 12.5;
              const y2 = (toR + 0.5) * 12.5;
              const dx = x2 - x1, dy = y2 - y1;
              const len = Math.sqrt(dx * dx + dy * dy);
              const shorten = 2.5;
              const ex = x2 - (dx / len) * shorten;
              const ey = y2 - (dy / len) * shorten;
              return (
                <g key={i}>
                  <line x1={x1} y1={y1} x2={ex} y2={ey} stroke="rgba(255,170,0,0.9)" strokeWidth="2.2" strokeLinecap="round" markerEnd="url(#arrowhead)" />
                  <circle cx={x1} cy={y1} r="2" fill="rgba(255,170,0,0.7)" />
                </g>
              );
            })}
          </svg>
        );
      })()}
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
  );
}
