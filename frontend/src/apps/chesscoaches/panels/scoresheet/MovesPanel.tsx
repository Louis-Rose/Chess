import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../../../contexts/LanguageContext';
import { playMoveSound } from '../../components/Chessboard';
import { pieceImageUrl } from '../../utils/pieces';
import { Chess } from 'chess.js';
import { toNotation } from './utils';
import type { ScoresheetMove as Move } from '../../contexts/CoachesDataContext';
import type { VoteState, ConsensusMeta } from './types';

export function MovesPanel({ label, moves, disagreements, meta, onMetaChange, onEditSave, onMoveClick, activePly, originalMoves, voteDetails, loading, onVoteStateChange, totalMoves }: {
  label: string;
  moves: Move[];
  disagreements: Map<number, { white: boolean; black: boolean }>;
  meta?: ConsensusMeta;
  onMetaChange?: (field: string, value: string) => void;
  onEditSave?: (confirmed: Move[], correctionKey: string) => void;
  onMoveClick?: (moves: Move[], ply: number) => void;
  activePly?: number;
  originalMoves?: Move[];
  voteDetails?: Record<string, { candidate: string; votes: number; downstreamIllegals: number; chosen: boolean; models: string[]; confidenceByModel: Record<string, string> }[]>;
  loading?: boolean;
  onVoteStateChange?: (state: VoteState | null) => void;
  totalMoves?: number;
}) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState<{ moveIdx: number; color: 'white' | 'black'; value: string } | null>(null);
  const [editFromVoteKey, setEditFromVoteKey] = useState<string | null>(null);
  const [showIllegalModal, setShowIllegalModal] = useState(false);
  const [voteInfoKey, setVoteInfoKey] = useState<string | null>(null);
  const [, setVoteEditValue] = useState<string | null>(null);
  // Notify parent when vote modal opens/closes (for board drag integration)
  useEffect(() => {
    if (!onVoteStateChange) return;
    if (voteInfoKey) {
      const [mn, cl] = voteInfoKey.split('-');
      onVoteStateChange({
        setEditValue: (san: string) => { setVoteEditValue(san); },
        moveIdx: parseInt(mn) - 1,
        color: cl as 'white' | 'black',
        goToMove: (moveNumber: number, color: 'white' | 'black', ply: number) => {
          setVoteInfoKey(`${moveNumber}-${color}`);
          onMoveClick?.(moves, ply);
        },
        clearSelection: () => { setVoteInfoKey(null); },
      });
    } else {
      onVoteStateChange(null);
    }
  }, [voteInfoKey, onVoteStateChange]);

  // Auto-select first move of the game when all models are done
  useEffect(() => {
    if (moves && moves.length > 0 && !loading && !voteInfoKey) {
      setVoteInfoKey('1-white');
      onMoveClick?.(moves, 1);
    }
  }, [moves, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputRef = useRef<HTMLInputElement>(null);

  // Compute legal moves at the editing position
  const legalMoves = useMemo(() => {
    if (!editing) return [];
    try {
      const chess = new Chess();
      for (let i = 0; i < editing.moveIdx; i++) {
        const m = moves[i];
        if (m.white) try { chess.move(m.white); } catch { break; }
        if (m.black) try { chess.move(m.black); } catch { break; }
      }
      // For the editing move's row, play white first if we're editing black
      if (editing.color === 'black') {
        const m = moves[editing.moveIdx];
        if (m?.white) try { chess.move(m.white); } catch { /* */ }
      }
      return chess.moves().sort();
    } catch { return []; }
  }, [editing, moves]);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);


  const handleSave = () => {
    if (!editing || !onEditSave) return;
    const editedMoveIdx = editing.moveIdx;
    const editedColor = editing.color;
    const editedValue = editing.value;
    setEditing(null);
    setEditFromVoteKey(null);

    // Build all moves with the edit applied, clear legality for re-validation
    const confirmed: Move[] = [];
    for (let i = 0; i < moves.length; i++) {
      const m = { ...moves[i] };
      if (i === editedMoveIdx) {
        m[editedColor] = editedValue;
        m[`${editedColor}_confirmed`] = true;
        delete m[`${editedColor}_reason`];
      }
      delete m.white_legal;
      delete m.black_legal;
      confirmed.push(m);
    }

    const correctionKey = `${moves[editedMoveIdx].number}-${editedColor}`;
    onEditSave(confirmed, correctionKey);
  };



  return (
    <div className={`bg-slate-700/50 rounded-xl overflow-hidden self-start min-w-[320px] ${loading ? 'animate-loading-pulse' : ''}`}>
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-slate-600 flex items-center justify-center">
        <span className="text-slate-100 font-medium text-sm">{label}</span>
      </div>

      {/* Game metadata */}
      {meta && (meta.white || meta.black || meta.result || meta.date || meta.event) && (
        <div className="px-3 py-2 border-b border-slate-600/30 text-sm text-slate-300 space-y-1">
          {meta.white && <div className="flex items-center gap-2">
            <span className="text-slate-400 w-28 text-right shrink-0">Player (White) :</span>
            <input value={meta.white} onChange={e => onMetaChange?.('white', e.target.value)} className="flex-1 bg-transparent text-slate-100 border-b border-slate-600 focus:border-blue-500 outline-none px-1 py-0.5" />
          </div>}
          {meta.black && <div className="flex items-center gap-2">
            <span className="text-slate-400 w-28 text-right shrink-0">Player (Black) :</span>
            <input value={meta.black} onChange={e => onMetaChange?.('black', e.target.value)} className="flex-1 bg-transparent text-slate-100 border-b border-slate-600 focus:border-blue-500 outline-none px-1 py-0.5" />
          </div>}
          {meta.result && <div className="flex items-center gap-2">
            <span className="text-slate-400 w-28 text-right shrink-0">Result :</span>
            <input value={meta.result} onChange={e => onMetaChange?.('result', e.target.value)} className="flex-1 bg-transparent text-slate-100 font-semibold border-b border-slate-600 focus:border-blue-500 outline-none px-1 py-0.5" />
          </div>}
          {meta.date && <div className="flex items-center gap-2">
            <span className="text-slate-400 w-28 text-right shrink-0">Date :</span>
            <input value={meta.date} onChange={e => onMetaChange?.('date', e.target.value)} placeholder="DD/MM/YYYY" className="flex-1 bg-transparent text-slate-100 border-b border-slate-600 focus:border-blue-500 outline-none px-1 py-0.5" />
          </div>}
          {meta.event && <div className="flex items-center gap-2">
            <span className="text-slate-400 w-28 text-right shrink-0">Event :</span>
            <input value={meta.event} onChange={e => onMetaChange?.('event', e.target.value)} className="flex-1 bg-transparent text-slate-100 border-b border-slate-600 focus:border-blue-500 outline-none px-1 py-0.5" />
          </div>}
        </div>
      )}



      {/* Moves table */}
      <div className={`${loading ? 'pointer-events-none' : ''}`}>
      {(totalMoves || moves.length) > 0 && (() => {
        const displayTotal = totalMoves || moves.length;
        const numCols = 2;
        const perCol = Math.ceil(displayTotal / numCols);
        // Pad moves array to total length for rendering empty rows
        const paddedMoves: (Move | undefined)[] = Array.from({ length: displayTotal }, (_, i) => moves[i]);
        const columns = Array.from({ length: numCols }, (_, c) => paddedMoves.slice(c * perCol, (c + 1) * perCol));
        const rows = Math.max(...columns.map(col => col.length));
        const hasTime = moves.some(m => m.white_time != null || m.black_time != null);

        const renderHalf = (move: Move | undefined, idx: number, d: { white: boolean; black: boolean } | undefined, moveNumber?: number) => {
          if (!move) return <><td className="px-3 py-1.5 text-slate-500 text-center font-mono">{moveNumber || ''}</td><td className="px-3 py-1.5" /><td className="px-3 py-1.5" /></>;
          return <>
            <td className="px-3 py-1.5 text-slate-500 text-center font-mono">{move.number}</td>
            <MoveCell
              value={toNotation(move.white, meta?.notation)}
              legal={move.white_legal}
              highlight={(d?.white || !!move.white_reason) && !move.white_confirmed}
              active={activePly === idx * 2 + 1}
              confidence={move.white_confidence}
              time={move.white_time}
              hasTime={hasTime}
              onShowBoard={onMoveClick ? () => onMoveClick(moves, idx * 2 + 1) : undefined}
              onVoteInfo={voteDetails ? () => { setVoteInfoKey(`${move.number}-white`); setVoteEditValue(move.white || ''); onMoveClick?.(moves, idx * 2 + 1); } : undefined}
            />
            <MoveCell
              value={toNotation(move.black || '', meta?.notation)}
              legal={move.black_legal}
              highlight={(d?.black || !!move.black_reason) && !move.black_confirmed}
              active={activePly === idx * 2 + 2}
              confidence={move.black_confidence}
              time={move.black_time}
              hasTime={hasTime}
              onShowBoard={onMoveClick && move.black ? () => onMoveClick(moves, idx * 2 + 2) : undefined}
              onVoteInfo={voteDetails ? () => { setVoteInfoKey(`${move.number}-black`); setVoteEditValue(move.black || ''); onMoveClick?.(moves, idx * 2 + 2); } : undefined}
            />
          </>;
        };

        return (
          <table className="w-full text-base">
            <thead className="bg-slate-700">
              <tr className="border-b border-slate-600">
                {columns.map((_, c) => (
                  <React.Fragment key={c}>
                    <th className={`px-3 py-2 text-slate-400 font-medium text-center w-8 ${c > 0 ? 'border-l border-slate-600' : ''}`}>#</th>
                    <th className="px-3 py-2 text-slate-400 font-medium text-center">{hasTime ? 'White (⏱)' : 'White'}</th>
                    <th className="px-3 py-2 text-slate-400 font-medium text-center">{hasTime ? 'Black (⏱)' : 'Black'}</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, i) => (
                <tr key={i} className="border-b border-slate-600/30 last:border-0">
                  {columns.map((col, c) => {
                    const move = col[i];
                    const idx = c * perCol + i;
                    const expectedNumber = idx + 1;
                    const d = move ? disagreements.get(move.number) : undefined;
                    if (!move && c > 0) return <React.Fragment key={c}><td className="px-3 py-1.5 border-l border-slate-600/30 text-slate-500 text-center font-mono">{expectedNumber <= displayTotal ? expectedNumber : ''}</td><td className="px-3 py-1.5" /><td className="px-3 py-1.5" /></React.Fragment>;
                    return <React.Fragment key={c}>{renderHalf(move, idx, d, expectedNumber)}</React.Fragment>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })()}
      </div>

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 md:left-56 2xl:left-64 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-[2px]"
          onClick={() => { setEditing(null); setEditFromVoteKey(null); }}
        >
          <div
            className="bg-slate-800 rounded-xl p-4 min-w-[260px] shadow-xl border border-slate-600"
            onClick={e => e.stopPropagation()}
          >
            {editFromVoteKey && (
              <button
                onClick={() => { setEditing(null); setVoteInfoKey(editFromVoteKey); setEditFromVoteKey(null); }}
                className="text-slate-400 hover:text-slate-200 text-xs mb-2 transition-colors"
              >
                &larr; Back to votes
              </button>
            )}
            <div className="text-slate-100 text-sm font-medium mb-2 text-center">
              {t('coaches.move')} {moves[editing.moveIdx]?.number} · {editing.color === 'white' ? t('coaches.moveWhite') : t('coaches.moveBlack')}
            </div>
            {moves[editing.moveIdx]?.[`${editing.color}_reason`] && (
              <p className="text-red-400 text-sm mb-2 text-center">{moves[editing.moveIdx][`${editing.color}_reason`]}</p>
            )}
            <MoveSuggestions legalMoves={legalMoves} color={editing.color} value={editing.value} reason={moves[editing.moveIdx]?.[`${editing.color}_reason`]} onSelect={san => {
              setEditing({ ...editing, value: san });
              playMoveSound(san.includes('x'));
            }} onDeselect={() => {
              const orig = moves[editing.moveIdx]?.[editing.color] || '';
              setEditing({ ...editing, value: orig });
              playMoveSound(false);
            }} />
            <div className="mt-3 space-y-1.5">
              {onMoveClick && (
                <button
                  onClick={() => {
                    const ply = editing.color === 'white' ? editing.moveIdx * 2 : editing.moveIdx * 2 + 1;
                    onMoveClick(moves, ply);
                    setEditing({ ...editing, value: '' });
                  }}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs py-1.5 rounded-lg transition-colors"
                >
                  Show position before this move
                </button>
              )}
              <button
                onClick={() => { handleSave(); }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 rounded-lg transition-colors"
              >
                {t('coaches.save')}
              </button>
              {originalMoves && (() => {
                const origVal = originalMoves[editing.moveIdx]?.[editing.color] || '';
                const currentVal = moves[editing.moveIdx]?.[editing.color] || '';
                if (origVal === currentVal) return null;
                return (
                  <button
                    onClick={() => { setEditing({ ...editing, value: origVal }); }}
                    className="w-full bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-1.5 rounded-lg transition-colors"
                  >
                    {t('coaches.revertToConsensus')} ({origVal})
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Illegal moves modal */}
      {showIllegalModal && createPortal(
        <div
          className="fixed inset-0 md:left-56 2xl:left-64 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[2px]"
          onClick={() => setShowIllegalModal(false)}
        >
          <div
            className="bg-slate-800 rounded-xl p-5 max-w-sm shadow-xl border border-slate-600 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-slate-100 font-medium text-center">{t('coaches.illegalMovesTitle')}</h3>
            <p className="text-slate-300 text-sm text-center whitespace-pre-line">{t('coaches.illegalMovesDesc')}</p>
            <div className="flex items-center justify-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-green-400"><span className="text-[10px]">&#10003;</span> {t('coaches.legalMove')}</span>
              <span className="flex items-center gap-1 text-red-400"><span className="text-[10px]">&#10007;</span> {t('coaches.illegal')}</span>
            </div>
            <button
              onClick={() => setShowIllegalModal(false)}
              className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm py-2 rounded-lg transition-colors"
            >
              OK
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const PIECE_FILTERS = [
  { key: 'K', label: 'K', fen: (w: boolean) => w ? 'K' : 'k' },
  { key: 'Q', label: 'Q', fen: (w: boolean) => w ? 'Q' : 'q' },
  { key: 'R', label: 'R', fen: (w: boolean) => w ? 'R' : 'r' },
  { key: 'B', label: 'B', fen: (w: boolean) => w ? 'B' : 'b' },
  { key: 'N', label: 'N', fen: (w: boolean) => w ? 'N' : 'n' },
  { key: 'P', label: '', fen: (w: boolean) => w ? 'P' : 'p' },
  { key: 'O', label: 'O-O', fen: (w: boolean) => w ? 'K' : 'k' },
];

function getPieceKey(san: string): string {
  if (san.startsWith('O-O')) return 'O';
  const ch = san[0];
  if (ch >= 'A' && ch <= 'Z' && 'KQRBN'.includes(ch)) return ch;
  return 'P';
}

function MoveSuggestions({ legalMoves, color, value, reason, onSelect, onDeselect }: {
  legalMoves: string[];
  color: 'white' | 'black';
  value: string;
  reason?: string;
  onSelect: (san: string) => void;
  onDeselect?: () => void;
}) {
  const { t } = useLanguage();
  // Pre-select piece filter based on current value
  const [pieceFilter, setPieceFilter] = useState<string | null>(() => {
    if (!value) return null;
    return getPieceKey(value);
  });
  // Sync piece filter when value changes externally (e.g., drag on board)
  useEffect(() => {
    if (value) setPieceFilter(getPieceKey(value));
  }, [value]);
  const isWhite = color === 'white';

  // Extract suggested moves from ambiguous reason (e.g., "Ambiguous (N5h4/N3h4) → N5h4")
  const suggestedMoves = useMemo(() => {
    if (!reason) return [];
    const match = reason.match(/Ambiguous \((.+)\)/);
    if (!match) return [];
    return match[1].split('/').map(s => s.trim()).filter(s => legalMoves.includes(s));
  }, [reason, legalMoves]);

  const suggestedPieceKey = suggestedMoves.length > 0 ? getPieceKey(suggestedMoves[0]) : null;

  // Which pieces have legal moves?
  const availablePieces = useMemo(() => {
    const set = new Set<string>();
    for (const san of legalMoves) set.add(getPieceKey(san));
    return set;
  }, [legalMoves]);

  const filtered = pieceFilter ? legalMoves.filter(san => getPieceKey(san) === pieceFilter) : [];
  // When the selected piece matches the ambiguous piece, separate suggested from others
  const showSuggested = pieceFilter === suggestedPieceKey && suggestedMoves.length > 0;
  const suggestedFiltered = showSuggested ? suggestedMoves : [];
  const otherFiltered = showSuggested ? filtered.filter(san => !suggestedMoves.includes(san)) : filtered;

  if (legalMoves.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {/* Piece filter row */}
      {!pieceFilter && <p className="text-slate-500 text-[10px] text-center">{t('coaches.selectPiece')}</p>}
      <div className="flex justify-center gap-1">
        {PIECE_FILTERS.filter(p => availablePieces.has(p.key)).map(p => (
          <button
            key={p.key}
            onClick={() => setPieceFilter(pieceFilter === p.key ? null : p.key)}
            className={`flex items-center justify-center w-8 h-8 rounded transition-colors ${
              pieceFilter === p.key ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'
            }`}
          >
            {p.key === 'O' ? (
              <span className="text-[9px] text-slate-300 font-mono">O-O</span>
            ) : (
              <img src={pieceImageUrl(p.fen(isWhite))} alt={p.label} className="w-5 h-5" draggable={false} />
            )}
          </button>
        ))}
      </div>
      {/* Suggested moves (from ambiguous diagnosis) */}
      {suggestedFiltered.length > 0 && (
        <div className="flex flex-wrap gap-1 justify-center">
          {suggestedFiltered.map(san => {
            const isSelected = san === value;
            return (
              <button
                key={san}
                onClick={() => isSelected ? onDeselect?.() : onSelect(san)}
                className={`px-2 py-1 rounded text-xs font-mono transition-colors border ${
                  isSelected ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-700 text-amber-300 hover:bg-slate-600 border-amber-500/40'
                }`}
              >
                {san}
              </button>
            );
          })}
        </div>
      )}
      {/* Other filtered moves */}
      {otherFiltered.length > 0 && (
        <div className="flex flex-wrap gap-1 justify-center max-w-[320px] mx-auto">
          {otherFiltered.map(san => {
            const isSelected = san === value;
            return (
              <button
                key={san}
                onClick={() => isSelected ? onDeselect?.() : onSelect(san)}
                className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                  isSelected ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {san}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MoveCell({ value, legal, highlight, active, confidence, time, hasTime, onShowBoard, onVoteInfo }: {
  value: string;
  legal?: boolean;
  highlight?: boolean;
  active?: boolean;
  confidence?: 'high' | 'medium' | 'low';
  time?: number;
  hasTime?: boolean;
  onShowBoard?: () => void;
  onVoteInfo?: () => void;
}) {
  const isLowConfidence = confidence === 'low';
  const isIllegal = legal === false;
  const bg = (highlight || isIllegal || isLowConfidence) ? 'bg-yellow-500/50 text-yellow-100' : 'text-slate-100';
  const border = active ? 'outline outline-3 outline-blue-400 -outline-offset-1 animate-pulse' : '';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onVoteInfo) { onVoteInfo(); return; }
    if (onShowBoard) onShowBoard();
  };

  return (
    <td
      className={`px-3 py-1.5 font-mono text-center cursor-pointer hover:bg-slate-600/50 ${bg} ${border}`}
      onClick={handleClick}
    >
      {hasTime ? (
        <span className="inline-flex items-center w-full">
          <span className="flex-1 text-center">{value}</span>
          <span className="flex-1 text-center">{time != null ? `(${time})` : ''}</span>
        </span>
      ) : (
        <span className="inline-flex items-center justify-center gap-1 w-full">
          {value}
        </span>
      )}
    </td>
  );
}
