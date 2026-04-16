// Editable 8x8 chessboard used by the Diagram → FEN panel.

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLanguage } from '../../../../contexts/LanguageContext';
import { pieceImageUrl, BOARD_LIGHT as LIGHT, BOARD_DARK as DARK } from '../../utils/pieces';

const PIECE_PALETTE = ['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p'];

type SquareMenu =
  | { kind: 'piece'; r: number; c: number; piece: string }
  | { kind: 'empty'; r: number; c: number }
  | { kind: 'picker'; r: number; c: number }
  | null;

export function fenToBoard(fen: string): (string | null)[][] {
  const rows = fen.split(' ')[0].split('/');
  return rows.map(row => {
    const squares: (string | null)[] = [];
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') for (let i = 0; i < parseInt(ch); i++) squares.push(null);
      else squares.push(ch);
    }
    return squares;
  });
}

export function EditableBoard({ fen, onChange }: { fen: string; onChange: (board: (string | null)[][]) => void }) {
  const { t } = useLanguage();
  const board = useMemo(() => fenToBoard(fen), [fen]);
  const boardRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ piece: string; fromR: number; fromC: number; x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<SquareMenu>(null);
  const [moveFrom, setMoveFrom] = useState<{ r: number; c: number } | null>(null);
  const didDragRef = useRef(false);

  // Close menu when the FEN changes
  useEffect(() => { setMenu(null); setMoveFrom(null); }, [fen]);

  const mutate = useCallback((fn: (b: (string | null)[][]) => void) => {
    const next = board.map(row => [...row]);
    fn(next);
    onChange(next);
  }, [board, onChange]);

  const handleSquareClick = useCallback((r: number, c: number) => {
    if (didDragRef.current) { didDragRef.current = false; return; }
    if (moveFrom) {
      if (moveFrom.r === r && moveFrom.c === c) { setMoveFrom(null); return; }
      const piece = board[moveFrom.r][moveFrom.c];
      if (piece) {
        mutate(b => { b[moveFrom.r][moveFrom.c] = null; b[r][c] = piece; });
      }
      setMoveFrom(null);
      return;
    }
    // Toggle menu
    if (menu && menu.r === r && menu.c === c) { setMenu(null); return; }
    const piece = board[r][c];
    setMenu(piece ? { kind: 'piece', r, c, piece } : { kind: 'empty', r, c });
  }, [menu, moveFrom, board, mutate]);

  const pendingDragRef = useRef<{ piece: string; fromR: number; fromC: number; startX: number; startY: number } | null>(null);

  const handlePointerDown = useCallback((_e: React.PointerEvent, piece: string, r: number, c: number) => {
    pendingDragRef.current = { piece, fromR: r, fromC: c, startX: _e.clientX, startY: _e.clientY };
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pd = pendingDragRef.current;
      if (pd && !dragging) {
        if (Math.abs(e.clientX - pd.startX) > 4 || Math.abs(e.clientY - pd.startY) > 4) {
          setMenu(null);
          setMoveFrom(null);
          setDragging({ piece: pd.piece, fromR: pd.fromR, fromC: pd.fromC, x: e.clientX, y: e.clientY });
        }
        return;
      }
      if (dragging) {
        setDragging(d => d ? { ...d, x: e.clientX, y: e.clientY } : null);
      }
    };
    const onUp = (e: PointerEvent) => {
      const wasDragging = !!dragging;
      if (dragging && boardRef.current) {
        const rect = boardRef.current.getBoundingClientRect();
        const sqSize = rect.width / 8;
        const toC = Math.floor((e.clientX - rect.left) / sqSize);
        const toR = Math.floor((e.clientY - rect.top) / sqSize);
        if (toR >= 0 && toR < 8 && toC >= 0 && toC < 8 && (toR !== dragging.fromR || toC !== dragging.fromC)) {
          mutate(b => { b[dragging.fromR][dragging.fromC] = null; b[toR][toC] = dragging.piece; });
        }
      }
      pendingDragRef.current = null;
      setDragging(null);
      didDragRef.current = wasDragging;
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); };
  }, [dragging, mutate]);

  // Close the menu when clicking outside the board
  useEffect(() => {
    if (!menu) return;
    const onDocClick = (e: MouseEvent) => {
      if (boardRef.current && !boardRef.current.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menu]);

  return (
    <div className="relative mx-auto" style={{ maxWidth: 400 }}>
      <div className="rounded-lg overflow-hidden shadow-lg">
        <div ref={boardRef} className="grid grid-cols-8 grid-rows-8 aspect-square">
          {board.map((row, r) =>
            row.map((piece, c) => {
              const isLight = (r + c) % 2 === 0;
              const isDragSource = dragging && dragging.fromR === r && dragging.fromC === c;
              const isMoveFrom = moveFrom && moveFrom.r === r && moveFrom.c === c;
              const isMenuSquare = menu && menu.r === r && menu.c === c;
              const highlighted = isMoveFrom || isMenuSquare;
              return (
                <div
                  key={`${r}-${c}`}
                  className={`relative select-none cursor-pointer ${highlighted ? 'ring-2 ring-inset ring-blue-400' : ''}`}
                  style={{ backgroundColor: isLight ? LIGHT : DARK }}
                  onClick={() => handleSquareClick(r, c)}
                >
                  {c === 0 && (
                    <span className="absolute top-0.5 left-0.5 text-[0.6rem] font-bold leading-none pointer-events-none" style={{ color: isLight ? DARK : LIGHT }}>
                      {8 - r}
                    </span>
                  )}
                  {r === 7 && (
                    <span className="absolute bottom-0.5 right-1 text-[0.6rem] font-bold leading-none pointer-events-none" style={{ color: isLight ? DARK : LIGHT }}>
                      {'abcdefgh'[c]}
                    </span>
                  )}
                  {piece && !isDragSource && (
                    <img
                      src={pieceImageUrl(piece)}
                      alt=""
                      className="absolute inset-[5%] w-[90%] h-[90%] cursor-grab"
                      draggable={false}
                      onPointerDown={e => handlePointerDown(e, piece, r, c)}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {menu && <SquareMenuPopover
        menu={menu}
        t={t}
        onAdd={() => setMenu({ kind: 'picker', r: menu.r, c: menu.c })}
        onMove={() => { setMoveFrom({ r: menu.r, c: menu.c }); setMenu(null); }}
        onDelete={() => { mutate(b => { b[menu.r][menu.c] = null; }); setMenu(null); }}
        onPick={(p) => { mutate(b => { b[menu.r][menu.c] = p; }); setMenu(null); }}
      />}

      {dragging && (
        <img
          src={pieceImageUrl(dragging.piece)}
          alt=""
          className="fixed pointer-events-none z-50 w-12 h-12 -translate-x-1/2 -translate-y-1/2"
          style={{ left: dragging.x, top: dragging.y }}
          draggable={false}
        />
      )}
    </div>
  );
}

interface SquareMenuPopoverProps {
  menu: NonNullable<SquareMenu>;
  t: (key: string) => string;
  onAdd: () => void;
  onMove: () => void;
  onDelete: () => void;
  onPick: (piece: string) => void;
}

function SquareMenuPopover({ menu, t, onAdd, onMove, onDelete, onPick }: SquareMenuPopoverProps) {
  // Position popover near the clicked square. Flip above the square when on the bottom half.
  const leftPct = (menu.c + 0.5) / 8 * 100;
  const flipUp = menu.r >= 5;
  const topPct = flipUp ? menu.r / 8 * 100 : (menu.r + 1) / 8 * 100;
  const style: React.CSSProperties = {
    left: `${leftPct}%`,
    top: `${topPct}%`,
    transform: flipUp ? 'translate(-50%, calc(-100% - 6px))' : 'translate(-50%, 6px)',
  };
  return (
    <div
      className="absolute z-40 rounded-lg bg-slate-900 border border-slate-600 shadow-xl p-1.5"
      style={style}
      onMouseDown={e => e.stopPropagation()}
    >
      {menu.kind === 'piece' && (
        <div className="flex flex-col gap-1 min-w-[130px]">
          <button
            onClick={onMove}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-slate-200 hover:bg-slate-700"
          >
            <span className="text-base leading-none">✥</span>
            {t('coaches.diagram.movePiece')}
          </button>
          <button
            onClick={onDelete}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-red-400 hover:bg-slate-700"
          >
            <span className="text-base leading-none">✕</span>
            {t('coaches.diagram.erasePiece')}
          </button>
        </div>
      )}
      {menu.kind === 'empty' && (
        <div className="flex flex-col gap-1 min-w-[130px]">
          <button
            onClick={onAdd}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-slate-200 hover:bg-slate-700"
          >
            <span className="text-base leading-none">+</span>
            {t('coaches.diagram.addPiece')}
          </button>
        </div>
      )}
      {menu.kind === 'picker' && (
        <div className="grid grid-cols-6 gap-1 w-[216px]">
          {PIECE_PALETTE.map(p => (
            <button
              key={p}
              onClick={() => onPick(p)}
              className="w-8 h-8 rounded border border-slate-600 bg-slate-800 hover:border-slate-400"
            >
              <img src={pieceImageUrl(p)} alt={p} className="w-6 h-6 mx-auto" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
