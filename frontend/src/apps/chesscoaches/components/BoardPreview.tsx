// Lightweight chessboard — renders a FEN position with optional drag-and-drop
// Used as a companion to move tables

import { useMemo, useState, useCallback, useRef } from 'react';
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
  onUserMove?: (from: string, to: string) => void;
}

export function BoardPreview({ fen, lastMove, onUserMove }: BoardPreviewProps) {
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

  const handlePointerDown = useCallback((e: React.PointerEvent, piece: string, r: number, c: number) => {
    if (!onUserMove) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging({ piece, fromR: r, fromC: c, x: e.clientX, y: e.clientY });
  }, [onUserMove]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(d => d ? { ...d, x: e.clientX, y: e.clientY } : null);
  }, [dragging]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging || !boardRef.current || !onUserMove) { setDragging(null); return; }
    const rect = boardRef.current.getBoundingClientRect();
    const sqSize = rect.width / 8;
    const dj = Math.floor((e.clientX - rect.left) / sqSize);
    const di = Math.floor((e.clientY - rect.top) / sqSize);
    if (di < 0 || di > 7 || dj < 0 || dj > 7) { setDragging(null); return; }
    const toR = di;
    const toC = dj;
    const fromFile = String.fromCharCode(97 + dragging.fromC);
    const fromRank = String(8 - dragging.fromR);
    const toFile = String.fromCharCode(97 + toC);
    const toRank = String(8 - toR);
    const from = `${fromFile}${fromRank}`;
    const to = `${toFile}${toRank}`;
    if (from !== to) onUserMove(from, to);
    setDragging(null);
  }, [dragging, onUserMove]);

  return (
    <div className="w-full aspect-square relative rounded-lg overflow-hidden shadow-lg touch-none">
      <div
        ref={boardRef}
        className="grid grid-cols-8 grid-rows-8 w-full h-full"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {Array.from({ length: 64 }, (_, idx) => {
          const r = Math.floor(idx / 8);
          const c = idx % 8;
          const isLight = (r + c) % 2 === 0;
          const isHL = (r === highlight.fromR && c === highlight.fromC) || (r === highlight.toR && c === highlight.toC);
          const bg = isHL ? (isLight ? '#f7ec5a' : '#dac934') : (isLight ? LIGHT : DARK);
          const piece = (dragging && dragging.fromR === r && dragging.fromC === c) ? null : board[r]?.[c];

          return (
            <div key={idx} className="relative select-none" style={{ backgroundColor: bg }}>
              {c === 0 && (
                <span className="absolute top-[3px] left-[3px] text-[0.75rem] font-extrabold leading-none pointer-events-none opacity-80" style={{ color: isLight ? DARK : LIGHT }}>
                  {8 - r}
                </span>
              )}
              {r === 7 && (
                <span className="absolute bottom-[2px] right-[4px] text-[0.75rem] font-extrabold leading-none pointer-events-none opacity-80" style={{ color: isLight ? DARK : LIGHT }}>
                  {'abcdefgh'[c]}
                </span>
              )}
              {piece && (
                <img
                  src={pieceImageUrl(piece)}
                  alt=""
                  className={`absolute inset-[5%] w-[90%] h-[90%] ${onUserMove ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}
                  draggable={false}
                  onPointerDown={onUserMove ? (e) => handlePointerDown(e, piece, r, c) : undefined}
                />
              )}
            </div>
          );
        })}
      </div>
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
