// Lightweight chessboard — renders a FEN position, no controls
// Used as a companion to move tables

import { useMemo } from 'react';
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
}

export function BoardPreview({ fen, lastMove }: BoardPreviewProps) {
  const board = useMemo(() => fenToBoard(fen), [fen]);

  const highlight = useMemo(() => {
    if (!lastMove) return { fromR: -1, fromC: -1, toR: -1, toC: -1 };
    return {
      fromC: lastMove.from.charCodeAt(0) - 97,
      fromR: 7 - (parseInt(lastMove.from[1]) - 1),
      toC: lastMove.to.charCodeAt(0) - 97,
      toR: 7 - (parseInt(lastMove.to[1]) - 1),
    };
  }, [lastMove]);

  return (
    <div className="w-full aspect-square relative rounded-lg overflow-hidden shadow-lg">
      <div className="grid grid-cols-8 grid-rows-8 w-full h-full">
        {Array.from({ length: 64 }, (_, idx) => {
          const r = Math.floor(idx / 8);
          const c = idx % 8;
          const isLight = (r + c) % 2 === 0;
          const isHL = (r === highlight.fromR && c === highlight.fromC) || (r === highlight.toR && c === highlight.toC);
          const bg = isHL ? (isLight ? '#f7ec5a' : '#dac934') : (isLight ? LIGHT : DARK);
          const piece = board[r]?.[c];

          return (
            <div key={idx} className="relative select-none" style={{ backgroundColor: bg }}>
              {c === 0 && (
                <span className="absolute top-0.5 left-0.5 text-[0.55rem] font-bold leading-none pointer-events-none" style={{ color: isLight ? DARK : LIGHT }}>
                  {8 - r}
                </span>
              )}
              {r === 7 && (
                <span className="absolute bottom-0.5 right-0.5 text-[0.55rem] font-bold leading-none pointer-events-none" style={{ color: isLight ? DARK : LIGHT }}>
                  {'abcdefgh'[c]}
                </span>
              )}
              {piece && (
                <img src={pieceImageUrl(piece)} alt="" className="absolute inset-[5%] w-[90%] h-[90%] pointer-events-none" draggable={false} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
