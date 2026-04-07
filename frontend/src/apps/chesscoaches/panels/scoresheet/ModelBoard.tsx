import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../../../contexts/LanguageContext';
import { BoardPreview } from '../../components/BoardPreview';
import { playMoveSound } from '../../components/Chessboard';
import { Chess } from 'chess.js';
import type { ScoresheetMove as Move } from '../../contexts/CoachesDataContext';
import type { PlyEntry } from './types';

// Track which ModelBoard instance is "active" (last interacted with)
let activeModelBoardId = 0;
let nextModelBoardId = 0;

/** Reset active board (e.g. when starting a fresh read) */
export function resetActiveModelBoard() {
  activeModelBoardId = 0;
}

export function ModelBoard({ moves, externalPly, onPlyChange, disableDrag, disableNav, autoActivate, previewFen, highlightedPlies: _highlightedPlies, onDragSetMove, compact, targetPly }: {
  moves: Move[];
  externalPly?: number;
  onPlyChange?: (ply: number) => void;
  disableDrag?: boolean;
  disableNav?: boolean;
  autoActivate?: boolean;
  previewFen?: string | null;
  highlightedPlies?: number[];
  onDragSetMove?: (san: string) => void;
  compact?: boolean;
  targetPly?: number;
}) {
  const { t } = useLanguage();
  const [instanceId] = useState(() => ++nextModelBoardId);
  const [internalPly, setInternalPly] = useState(0);
  // Use externalPly directly when provided (controlled mode), fall back to internal state
  const ply = externalPly !== undefined ? externalPly : internalPly;
  const setPly = useCallback((p: number | ((prev: number) => number)) => {
    setInternalPly(p);
  }, []);

  // Branch (variation) state
  const [branch, setBranch] = useState<{ startPly: number; fens: string[]; sans: string[] } | null>(null);
  const [branchPly, setBranchPly] = useState(0);
  const inBranch = branch !== null && branchPly > 0;
  const exitBranch = useCallback(() => { setBranch(null); setBranchPly(0); }, []);

  const entries = useMemo(() => {
    const chess = new Chess();
    const result: PlyEntry[] = [{ fen: chess.fen(), lastMove: null }];
    for (const m of moves) {
      for (const color of ['white', 'black'] as const) {
        const san = m[color];
        if (!san) continue;
        const moveReason = m[`${color}_reason`];
        try {
          const move = chess.move(san);
          result.push({ fen: chess.fen(), lastMove: move ? { from: move.from, to: move.to } : null, san, reason: moveReason });
        } catch {
          const reason = moveReason;
          result.push({ fen: chess.fen(), lastMove: null, illegal: { moveNumber: m.number, color, san, reason }, san });
          // Flip turn so next move validates from the right side
          const fen = chess.fen().split(' ');
          fen[1] = fen[1] === 'w' ? 'b' : 'w';
          fen[3] = '-'; // clear en-passant square to keep FEN valid
          try { chess.load(fen.join(' ')); } catch {}
        }
      }
    }
    return result;
  }, [moves]);

  const maxPly = entries.length - 1;
  const safePly = Math.min(ply, maxPly);
  // Show position BEFORE the move with an arrow overlay for all moves
  const showArrow = safePly > 0 && !inBranch && !previewFen;
  const displayPly = showArrow ? safePly - 1 : safePly;
  const currentFen = previewFen || (inBranch ? branch!.fens[branchPly] : entries[displayPly].fen);
  const currentLastMove = previewFen ? null : (inBranch && branch && branchPly > 0 ? (() => {
    try {
      const chess = new Chess(branch.fens[branchPly - 1]);
      const move = chess.move(branch.sans[branchPly - 1]);
      return move ? { from: move.from, to: move.to } : null;
    } catch { return null; }
  })() : showArrow ? null : entries[displayPly].lastMove);
  const currentArrow: { from: string; to: string } | { from: string; to: string }[] | null = showArrow ? (() => {
    const entry = entries[safePly];
    // If the move failed (illegal/ambiguous), try to show possible arrows from the position
    if (!entry.lastMove && entry.san) {
      try {
        const ch = new Chess(entries[displayPly].fen);
        const san = entry.san;
        const pieceMatch = san.match(/^([KQRBN])/);
        const destMatch = san.match(/([a-h][1-8])/);
        if (pieceMatch && destMatch) {
          const piece = pieceMatch[1];
          const dest = destMatch[1];
          const candidates = ch.moves({ verbose: true }).filter(m => m.san.startsWith(piece) && m.to === dest);
          if (candidates.length >= 1) {
            const arrows = candidates.map(m => ({ from: m.from, to: m.to }));
            return arrows.length > 1 ? arrows : arrows[0];
          }
        }
      } catch { /* fall through */ }
    }
    if (entry.lastMove && entry.san) {
      // For castling, show both king and rook arrows
      const castleSan = entry.san.replace(/[+#]/g, '');
      if (castleSan === 'O-O' || castleSan === 'O-O-O') {
        const rank = entry.lastMove.from[1]; // '1' for white, '8' for black
        if (castleSan === 'O-O') {
          return [entry.lastMove, { from: `h${rank}`, to: `f${rank}` }];
        } else {
          return [entry.lastMove, { from: `a${rank}`, to: `d${rank}` }];
        }
      }
    }
    return entry.lastMove;
  })() : null;
  const currentIllegal = inBranch ? undefined : entries[displayPly].illegal;

  // Compute highlight squares for ambiguous moves
  const ambiguousSquares = useMemo(() => {
    if (!currentIllegal?.reason) return undefined;
    const match = currentIllegal.reason.match(/did you mean (.+)\?/i);
    if (!match) return undefined;
    const sans = match[1].split(/ or |, /).map(s => s.trim());
    try {
      const chess = new Chess(entries[safePly].fen);
      const squares: string[] = [];
      for (const san of sans) {
        const move = chess.move(san);
        if (move) {
          if (!squares.includes(move.from)) squares.push(move.from);
          if (!squares.includes(move.to)) squares.push(move.to);
          chess.undo();
        }
      }
      return squares.length > 0 ? squares : undefined;
    } catch { return undefined; }
  }, [currentIllegal, entries, safePly]);

  const prevMaxPlyRef = useRef(0);
  useEffect(() => {
    // Only reset to ply 0 on fresh results (was 0, now has moves)
    // On re-read (maxPly changes but ply was already set), preserve position
    if (prevMaxPlyRef.current === 0 && maxPly > 0) {
      setPly(0); exitBranch();
    }
    if (autoActivate && maxPly > 0 && activeModelBoardId === 0) activeModelBoardId = instanceId;
    prevMaxPlyRef.current = maxPly;
  }, [maxPly, exitBranch, autoActivate, instanceId]);
  // When externalPly changes, exit any branch
  const prevExternalPly = useRef(externalPly);
  if (externalPly !== undefined && externalPly !== prevExternalPly.current) {
    if (inBranch) { setBranch(null); setBranchPly(0); }
    activeModelBoardId = instanceId;
  }
  prevExternalPly.current = externalPly;


  // Play sound for a given ply (called from navigation actions, not from effects)
  const playSoundForPly = useCallback((p: number) => {
    if (p > 0 && entries[p]?.san) playMoveSound(entries[p].san!.includes('x'));
  }, [entries]);

  const emitPly = useCallback((p: number) => {
    onPlyChange?.(p);
  }, [onPlyChange]);

  // Navigation
  const goPrev = useCallback(() => {
    if (inBranch) {
      if (branchPly <= 1) {
        // Exit and destroy branch immediately
        playSoundForPly(safePly);
        if (onDragSetMove) {
          onDragSetMove('');
          emitPly(safePly);
        }
        exitBranch();
      } else {
        setBranchPly(p => {
          const san = branch?.sans[p - 2];
          if (san) playMoveSound(san.includes('x'));
          if (p - 1 === 1 && onDragSetMove && branch?.sans[0]) {
            onDragSetMove(branch.sans[0]);
          }
          return p - 1;
        });
      }
    } else {
      const newP = Math.max(0, safePly - 1);
      if (newP !== safePly) { playSoundForPly(safePly); setPly(newP); emitPly(newP); }
    }
  }, [inBranch, branch, safePly, playSoundForPly, emitPly, onDragSetMove]);
  const goNext = useCallback(() => {
    if (inBranch && branch && branchPly < branch.fens.length - 1) {
      const san = branch.sans[branchPly];
      if (san) playMoveSound(san.includes('x'));
      // Clear vote value when going past the first variation move
      if (branchPly >= 1 && onDragSetMove) {
        onDragSetMove('');
      }
      setBranchPly(p => p + 1);
    } else if (!inBranch) {
      const newP = Math.min(maxPly, safePly + 1);
      if (newP !== safePly) {
        playSoundForPly(newP);
        setPly(newP);
        emitPly(newP);
        if (showArrow && targetPly !== undefined && safePly === targetPly && entries[safePly]?.san && onDragSetMove) {
          onDragSetMove(entries[safePly].san!);
        }
      }
    }
  }, [branch, branchPly, inBranch, maxPly, safePly, playSoundForPly, emitPly, onDragSetMove, showArrow, entries, targetPly]);

  const goFirst = useCallback(() => {
    exitBranch();
    if (safePly !== 0) { playSoundForPly(safePly); setPly(0); emitPly(0); }
  }, [exitBranch, safePly, playSoundForPly, emitPly]);
  const goLast = useCallback(() => {
    exitBranch();
    if (safePly !== maxPly) { playSoundForPly(maxPly); setPly(maxPly); emitPly(maxPly); }
  }, [exitBranch, safePly, maxPly, playSoundForPly, emitPly]);

  // Handle user move (drag & drop)
  const handleUserMove = useCallback((from: string, to: string) => {
    // Detect reverse of last move (dragging piece back) → go previous
    // If in a 1-move branch (user already dragged), allow undoing or picking a different move
    if (inBranch && branch && branchPly === 1 && onDragSetMove) {
      // Check if dragging the piece back (reversing the branch move)
      const branchMove = (() => {
        try {
          const ch = new Chess(branch.fens[0]);
          const m = ch.move(branch.sans[0]);
          return m ? { from: m.from, to: m.to } : null;
        } catch { return null; }
      })();
      if (branchMove && from === branchMove.to && to === branchMove.from) {
        // Undo — exit branch, clear pick, go back to arrow view
        onDragSetMove('');
        exitBranch();
        return;
      }
      // Only allow replacement moves from the pre-branch position (same color)
      // Block moves of the opposing color (which would be valid from the current branch fen)
      exitBranch();
      try {
        const chess = new Chess(entries[displayPly].fen);
        const move = chess.move({ from, to, promotion: 'q' });
        if (!move) return;
        onDragSetMove(move.san);
        setBranch({ startPly: displayPly, fens: [entries[displayPly].fen, chess.fen()], sans: [move.san] });
        setBranchPly(1);
        playMoveSound(move.san.includes('x'));
      } catch { /* invalid move — likely wrong color */ }
      return;
    }
    const lastMove = inBranch && branch ? null : entries[safePly]?.lastMove;
    if (lastMove && from === lastMove.to && to === lastMove.from) {
      goPrev();
      return;
    }
    try {
      const chess = new Chess(currentFen);
      const move = chess.move({ from, to, promotion: 'q' });
      if (!move) return;
      const newFen = chess.fen();
      const san = move.san;

      // Check if matches the arrow move (displayed move) or next main-line move
      const nextMainPly = showArrow ? safePly : safePly + 1;
      if (!inBranch && nextMainPly <= maxPly && entries[nextMainPly]?.san === san) {
        if (onDragSetMove) onDragSetMove(san);
        if (showArrow) {
          // Show the result of the drag by creating a one-move branch
          setBranch({ startPly: displayPly, fens: [entries[displayPly].fen, newFen], sans: [san] });
          setBranchPly(1);
        } else {
          setPly(p => p + 1); emitPly(safePly + 1);
        }
        playMoveSound(san.includes('x'));
        return;
      }

      // When vote modal is open and not yet in a branch, set the vote value and create a one-move branch
      if (onDragSetMove && !inBranch) {
        onDragSetMove(san);
        setBranch({ startPly: safePly, fens: [entries[safePly].fen, newFen], sans: [san] });
        setBranchPly(1);
        playMoveSound(san.includes('x'));
        return;
      }

      // Diverges — create or extend branch
      if (inBranch && branch) {
        // In edit mode, block extending the branch (only allow replacement via the handler above)
        if (onDragSetMove) return;
        setBranch({
          ...branch,
          fens: [...branch.fens.slice(0, branchPly + 1), newFen],
          sans: [...branch.sans.slice(0, branchPly), san],
        });
        setBranchPly(branchPly + 1);
      } else {
        setBranch({ startPly: safePly, fens: [entries[safePly].fen, newFen], sans: [san] });
        setBranchPly(1);
      }
      playMoveSound(san.includes('x'));
    } catch { /* invalid move */ }
  }, [currentFen, inBranch, branch, branchPly, safePly, maxPly, entries, onDragSetMove, goPrev, showArrow, displayPly]);

  // Activate this board on any click, then keyboard only responds to active board
  const activate = useCallback(() => { activeModelBoardId = instanceId; }, [instanceId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (disableNav) return;
      if (onDragSetMove) {
        // Modal board: capture keyboard exclusively using capture phase + stopImmediatePropagation
        if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); goPrev(); }
        if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); goNext(); }
        if (e.key === 'Home') { e.preventDefault(); e.stopImmediatePropagation(); goFirst(); }
        if (e.key === 'End') { e.preventDefault(); e.stopImmediatePropagation(); goLast(); }
      } else {
        if (activeModelBoardId !== 0 && activeModelBoardId !== instanceId) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
        if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
        if (e.key === 'Home') { e.preventDefault(); goFirst(); }
        if (e.key === 'End') { e.preventDefault(); goLast(); }
      }
    };
    // Modal board uses capture phase so it fires before and blocks the main board
    window.addEventListener('keydown', handler, !!onDragSetMove);
    return () => {
      window.removeEventListener('keydown', handler, !!onDragSetMove);
      // When modal board unmounts, release active state so main board can respond to keys
      if (onDragSetMove && activeModelBoardId === instanceId) activeModelBoardId = 0;
    };
  }, [instanceId, goPrev, goNext, goFirst, goLast, onDragSetMove, disableNav]);


  return (
    <div className="flex flex-col items-center w-full max-w-[480px]" onClick={activate}>
      {/* Player bar — Black (top) */}
      {(() => {
        const isBlackTurn = currentFen.split(' ')[1] === 'b';
        return (
          <div className="w-full flex items-center gap-2 px-2 py-1 rounded-t-lg bg-slate-600/50">
            <span className="w-3 h-3 rounded-full bg-slate-900 border border-slate-500 inline-block" />
            <span className="text-xs text-slate-300">Black</span>
            {isBlackTurn && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          </div>
        );
      })()}
      <BoardPreview fen={currentFen} lastMove={currentLastMove} arrow={currentArrow} onUserMove={disableDrag ? undefined : handleUserMove} highlightSquares={ambiguousSquares} />
      {/* Player bar — White (bottom) */}
      {(() => {
        const isWhiteTurn = currentFen.split(' ')[1] === 'w';
        return (
          <div className="w-full flex items-center gap-2 px-2 py-1 rounded-b-lg bg-slate-600/50">
            <span className="w-3 h-3 rounded-full bg-slate-100 border border-slate-400 inline-block" />
            <span className="text-xs text-slate-300">White</span>
            {isWhiteTurn && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          </div>
        );
      })()}
      {!disableNav && <div className="relative flex justify-center gap-1.5 mt-1.5 w-full">
        {!compact && (
          <button onClick={goFirst} disabled={disableNav} className={`flex-1 max-w-[80px] py-1.5 rounded-lg transition-colors flex items-center justify-center ${disableNav ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
            <ChevronFirst className="w-5 h-5" />
          </button>
        )}
        {compact ? (
          <>
            <button onClick={goPrev} disabled={disableNav} className={`flex-1 py-1 2xl:py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1 text-xs 2xl:text-sm ${disableNav ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <div className="flex-1 py-1 2xl:py-2.5 bg-slate-700 rounded-lg flex items-center justify-center px-2 text-center">
              {(() => {
                const displayPly = inBranch ? (branch!.startPly + branchPly) : safePly;
                if (displayPly <= 0) return <span className="text-xs 2xl:text-sm text-slate-400">Start</span>;
                return (
                  <span className="text-xs 2xl:text-sm text-slate-100">
                    {t('coaches.move')} {Math.ceil(displayPly / 2)} ({displayPly % 2 === 1 ? t('coaches.moveWhite') : t('coaches.moveBlack')})
                  </span>
                );
              })()}
            </div>
            <button onClick={goNext} disabled={disableNav} className={`flex-1 py-1 2xl:py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1 text-xs 2xl:text-sm ${disableNav ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <button onClick={goPrev} disabled={disableNav} className={`flex-1 max-w-[80px] py-1.5 rounded-lg transition-colors flex items-center justify-center ${disableNav ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={goNext} disabled={disableNav} className={`flex-1 max-w-[80px] py-1.5 rounded-lg transition-colors flex items-center justify-center ${disableNav ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
        {!compact && (
          <button onClick={goLast} disabled={disableNav} className={`flex-1 max-w-[80px] py-1.5 rounded-lg transition-colors flex items-center justify-center ${disableNav ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
            <ChevronLast className="w-5 h-5" />
          </button>
        )}
      </div>}
      {compact && targetPly !== undefined && (
        <button
          onClick={() => { exitBranch(); setPly(targetPly); playSoundForPly(targetPly); emitPly(targetPly); if (onDragSetMove) onDragSetMove(''); }}
          className={`w-full mt-1 2xl:mt-1.5 py-1.5 2xl:py-2 rounded-lg transition-colors text-xs 2xl:text-sm ${safePly === targetPly && !inBranch ? 'bg-slate-700 text-slate-400 cursor-default' : 'bg-slate-700 hover:bg-slate-600 text-yellow-400'}`}
          disabled={safePly === targetPly && !inBranch}
        >
          {(() => {
            const effectivePly = inBranch && branch ? branch.startPly + branchPly : safePly;
            const diff = targetPly - effectivePly;
            if (diff === 0 && !inBranch) return 'Currently at highlighted move';
            const sign = diff > 0 ? `+${diff}` : `${diff}`;
            return `Go to highlighted move (${sign})`;
          })()}
        </button>
      )}
    </div>
  );
}
