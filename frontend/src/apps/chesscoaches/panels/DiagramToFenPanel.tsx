// Diagram → FEN panel — thin view, state lives in CoachesDataContext

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ImageIcon, Clock, Copy, Check } from 'lucide-react';
import { ImageZoomModal } from '../components/ImageZoomModal';
import { ProcessingProgressBar } from '../components/ProcessingProgressBar';

import { useLanguage } from '../../../contexts/LanguageContext';
import { useAuth } from '../../../contexts/AuthContext';
import { PanelShell } from '../components/PanelShell';
import { useCoachesData } from '../contexts/CoachesDataContext';
import { compressImage } from '../utils/compressImage';
import type { DiagramModelResult, DiagramExtract } from '../contexts/CoachesDataContext';

const REGION_COLORS = [
  'rgba(99,102,241,0.7)',   // indigo
  'rgba(168,85,247,0.7)',   // purple
  'rgba(20,184,166,0.7)',   // teal
  'rgba(245,158,11,0.7)',   // amber
  'rgba(239,68,68,0.7)',    // red
  'rgba(34,197,94,0.7)',    // green
  'rgba(59,130,246,0.7)',   // blue
  'rgba(236,72,153,0.7)',   // pink
];

function RegionOverlay({ regions }: { regions: { x: number; y: number; width: number; height: number }[] }) {
  return (
    <>
      {regions.map((r, i) => {
        const color = REGION_COLORS[i % REGION_COLORS.length];
        return (
          <div
            key={i}
            className="absolute rounded pointer-events-none"
            style={{
              left: `${r.x}%`,
              top: `${r.y}%`,
              width: `${r.width}%`,
              height: `${r.height}%`,
              border: `2px solid ${color}`,
            }}
          >
            <span
              className="absolute top-1 left-1 text-sm font-bold leading-none"
              style={{ color }}
            >
              {i + 1}
            </span>
          </div>
        );
      })}
    </>
  );
}

function CroppedRegion({ src, region }: { src: string; region: { x: number; y: number; width: number; height: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const sx = Math.round(region.x / 100 * img.width);
      const sy = Math.round(region.y / 100 * img.height);
      const sw = Math.round(region.width / 100 * img.width);
      const sh = Math.round(region.height / 100 * img.height);
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    };
    img.src = src;
  }, [src, region]);
  return <canvas ref={canvasRef} className="mx-auto rounded-lg border border-slate-600 max-w-[400px] w-full" />;
}

export function DiagramToFenPanel() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const { diagram, diagramSetImage, diagramAnalyze, diagramClear } = useCoachesData();
  const { preview, models, modelResults, analyzing, startTime, error, regions, regionCount, regionsRead, debugRawLocate, debugRawReads } = diagram;
  const [liveElapsed, setLiveElapsed] = useState(0);

  // Tick the elapsed counter while analysis is running; freeze on completion
  useEffect(() => {
    if (!startTime) { setLiveElapsed(0); return; }
    if (!analyzing) return; // analysis finished — leave liveElapsed at its last value
    const tick = () => setLiveElapsed(Math.round((Date.now() - startTime) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime, analyzing]);
  const [showImageModal, setShowImageModal] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const uploadFromFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const { file: compressed, preview: dataUrl } = await compressImage(file);
    diagramSetImage(compressed, dataUrl);
  }, [diagramSetImage]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so the same file can be picked again after a clear
    e.target.value = '';
    if (file) uploadFromFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFromFile(file);
  };

  // Paste-from-clipboard support — only active while the empty state is showing
  useEffect(() => {
    if (preview) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (file) uploadFromFile(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [preview, uploadFromFile]);

  return (
    <PanelShell title={t('coaches.navDiagram')} onBack={preview ? diagramClear : undefined}>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {!preview ? (
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="text-white text-lg text-center px-2 space-y-1">
                <p>{t('coaches.diagram.explainer')}</p>
                <p>{t('coaches.diagram.explainerNote')}</p>
              </div>
              <div
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                className={`border-2 border-dashed rounded-xl min-h-[50vh] flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-blue-500 bg-blue-500/5'
                    : 'border-slate-600 hover:border-blue-500 hover:bg-slate-800/30'
                }`}
              >
                <ImageIcon className="w-16 h-16 text-slate-400" />
                <p className="text-slate-200 font-medium text-lg">{t('coaches.diagram.uploadPrompt')}</p>
                <p className="text-slate-500 text-sm">{t('coaches.diagram.dropHint')}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {(analyzing || models.length > 0) && (() => {
                const finishedCount = models.filter(m => !!modelResults[m.id]?.elapsed).length;
                const allDone = !analyzing && models.length > 0 && finishedCount === models.length;
                // Progress: 20% for region detection, then 20-100% for reading each region
                const pct = regionCount
                  ? Math.round(20 + (regionsRead || 0) / regionCount * 80)
                  : regions ? 20 : 0;
                const maxAvg = models.length > 0
                  ? Math.round(Math.max(...models.map(m => m.avg_elapsed || 0)) * 1.3 * (regionCount || 1))
                  : 0;
                return (
                  <ProcessingProgressBar
                    title={t('coaches.diagram.analyzing')}
                    pct={pct}
                    elapsedSec={liveElapsed}
                    maxAvgSec={maxAvg}
                    allDone={allDone}
                    onCancel={diagramClear}
                    cancelLabel={allDone ? t('coaches.startFresh') : t('coaches.stopProcessing')}
                  />
                );
              })()}

              <div className="flex justify-center">
              <div className="relative">
                <img
                  src={preview}
                  alt="Diagram"
                  className={`rounded-xl cursor-pointer hover:opacity-90 transition-all ${
                    !analyzing && models.length === 0 ? 'max-h-[65vh]' : 'max-h-80'
                  }`}
                  onClick={() => setShowImageModal(true)}
                />
                {regions && regions.length > 0 && <RegionOverlay regions={regions} />}
              </div>
              </div>

              {user?.is_admin && (debugRawLocate || (debugRawReads && Object.keys(debugRawReads).length > 0)) && (
                <div className="max-w-xl mx-auto space-y-2 text-xs">
                  {debugRawLocate && (
                    <details open className="bg-slate-900/60 border border-slate-700 rounded">
                      <summary className="px-2 py-1 cursor-pointer text-slate-300">Phase 1 (locate) — raw LLM output</summary>
                      <pre className="px-2 py-2 text-slate-400 whitespace-pre-wrap break-words font-mono">{debugRawLocate}</pre>
                    </details>
                  )}
                  {debugRawReads && Object.keys(debugRawReads).sort((a, b) => Number(a) - Number(b)).map(k => (
                    <details key={k} className="bg-slate-900/60 border border-slate-700 rounded">
                      <summary className="px-2 py-1 cursor-pointer text-slate-300">Phase 2 (read) — region {Number(k) + 1}</summary>
                      <pre className="px-2 py-2 text-slate-400 whitespace-pre-wrap break-words font-mono">{debugRawReads[Number(k)]}</pre>
                    </details>
                  ))}
                </div>
              )}

              {!analyzing && models.length === 0 && (
                <div className="flex justify-center">
                  <button
                    onClick={diagramAnalyze}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                  >
                    {t('coaches.diagram.analyze')}
                  </button>
                </div>
              )}

              {error && <p className="text-red-400 text-center py-4">{error}</p>}

              {models.length > 0 && (
                <ResultsView models={models} modelResults={modelResults} analyzing={analyzing} previewSrc={preview} totalRegions={regionCount} />
              )}
            </div>
          )}

      {showImageModal && preview && (
        <ImageZoomModal
          src={preview}
          alt="Diagram"
          onClose={() => setShowImageModal(false)}
          overlay={regions && regions.length > 0 ? <RegionOverlay regions={regions} /> : undefined}
        />
      )}
    </PanelShell>
  );
}

interface ResultsViewProps {
  models: { id: string; name: string }[];
  modelResults: Record<string, DiagramModelResult>;
  analyzing: boolean;
  previewSrc?: string;
  totalRegions?: number;
}

// Translate backend reader names like "Reader 1" → "Lecteur 1" (FR)
function localizeReaderName(name: string | undefined, readerLabel: string): string {
  if (!name) return '';
  const match = name.match(/^Reader\s+(\d+)$/);
  return match ? `${readerLabel} ${match[1]}` : name;
}

function ResultsView({ models, modelResults, analyzing, previewSrc, totalRegions }: ResultsViewProps) {
  const { t } = useLanguage();
  const readerLabel = t('coaches.diagram.readerLabel');
  const [selectedModelId, setSelectedModelId] = useState<string>(models[0]?.id || '');
  const [selectedDiagramIdx, setSelectedDiagramIdx] = useState(0);

  // Ensure the selected model is always one that still exists
  useEffect(() => {
    if (!models.some(m => m.id === selectedModelId)) {
      setSelectedModelId(models[0]?.id || '');
      setSelectedDiagramIdx(0);
    }
  }, [models, selectedModelId]);

  const selectedModel = models.find(m => m.id === selectedModelId) || models[0];
  const mr = selectedModel ? modelResults[selectedModel.id] : undefined;
  const diagrams = mr?.diagrams ?? [];
  const diagramCount = diagrams.length;
  const allHaveNumbers = diagramCount > 0 && diagrams.every(d => typeof d.diagram_number === 'number');

  // Clamp diagram index when the selected reader changes
  useEffect(() => {
    if (diagramCount > 0 && selectedDiagramIdx >= diagramCount) {
      setSelectedDiagramIdx(0);
    }
  }, [diagramCount, selectedDiagramIdx]);

  const selectClass =
    'bg-slate-800 border border-slate-600 text-slate-100 text-sm rounded-lg px-3 py-2 hover:border-slate-500 focus:border-blue-500 focus:outline-none';

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="flex flex-wrap justify-center gap-3">
        {models.length > 1 && (
          <select
            value={selectedModelId}
            onChange={e => setSelectedModelId(e.target.value)}
            className={selectClass}
          >
            {models.map(m => (
              <option key={m.id} value={m.id}>
                {localizeReaderName(modelResults[m.id]?.name || m.name, readerLabel)}
              </option>
            ))}
          </select>
        )}

        <select
          value={selectedDiagramIdx}
          onChange={e => setSelectedDiagramIdx(Number(e.target.value))}
          disabled={diagramCount <= 1 && !totalRegions}
          className={`${selectClass} ${diagramCount <= 1 && !totalRegions ? 'opacity-50' : ''}`}
        >
          {Array.from({ length: totalRegions || Math.max(diagramCount, 1) }, (_, i) => {
            const label = allHaveNumbers && i < diagramCount
              ? `${t('coaches.diagram.diagramLabel')} #${diagrams[i].diagram_number}`
              : `${t('coaches.diagram.diagramLabel')} ${i + 1} / ${totalRegions || (analyzing ? '?' : Math.max(diagramCount, 1))}`;
            return (
              <option key={i} value={i} disabled={i >= diagramCount}>
                {label}
              </option>
            );
          })}
        </select>
      </div>

      <div className="bg-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-600 flex items-center justify-center gap-2">
          <span className="text-slate-100 font-medium text-xs">{localizeReaderName(mr?.name || selectedModel?.name, readerLabel)}</span>
          {mr?.elapsed !== undefined && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              <span className="text-slate-400 text-xs">{mr.elapsed}s</span>
            </div>
          )}
        </div>

        {!mr ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-slate-500 text-xs animate-pulse">{t('coaches.diagram.analyzing')}</span>
          </div>
        ) : mr.error ? (
          <p className="text-red-400 text-center py-4 px-3 text-xs">{mr.error}</p>
        ) : diagramCount > 0 ? (
          <div className="p-3">
            <FenEntry diagram={diagrams[selectedDiagramIdx] ?? diagrams[0]} previewSrc={previewSrc} />
          </div>
        ) : (
          <p className="text-slate-500 text-center py-4 px-3 text-xs">{t('coaches.diagram.noneDetected')}</p>
        )}
      </div>
    </div>
  );
}

function boardToFenPlacement(board: (string | null)[][]): string {
  return board.map(row => {
    let s = '';
    let empty = 0;
    for (const sq of row) {
      if (!sq) { empty++; }
      else { if (empty) { s += empty; empty = 0; } s += sq; }
    }
    if (empty) s += empty;
    return s;
  }).join('/');
}

function fenToBoard(fen: string): (string | null)[][] {
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

function rebuildFen(oldFen: string, newPlacement: string): string {
  const parts = oldFen.split(' ');
  parts[0] = newPlacement;
  return parts.join(' ');
}

function FenEntry({ diagram, previewSrc }: { diagram: DiagramExtract; previewSrc?: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const { white_player, black_player, region } = diagram;
  const [editedFen, setEditedFen] = useState(diagram.fen);

  // Reset edited FEN when diagram changes
  useEffect(() => { setEditedFen(diagram.fen); }, [diagram.fen]);

  const handleBoardChange = useCallback((newBoard: (string | null)[][]) => {
    setEditedFen(prev => rebuildFen(prev, boardToFenPlacement(newBoard)));
  }, []);

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(editedFen); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = editedFen;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeColor = editedFen.split(' ')[1];
  const sideToMoveLabel =
    activeColor === 'b' ? t('coaches.diagram.blackToPlay') : t('coaches.diagram.whiteToPlay');
  const hasPlayers = !!(white_player || black_player);

  return (
    <div className="space-y-3">
      {previewSrc && region && <CroppedRegion src={previewSrc} region={region} />}

      {hasPlayers && (
        <div className="flex items-center justify-center gap-2 text-sm font-medium">
          <span className="w-3 h-3 rounded-full bg-white border border-slate-400 inline-block" />
          <span className="text-slate-100">{white_player || '—'}</span>
          <span className="text-slate-500 mx-1">vs</span>
          <span className="text-slate-100">{black_player || '—'}</span>
          <span className="w-3 h-3 rounded-full bg-slate-900 border border-slate-500 inline-block" />
        </div>
      )}

      <div className="flex justify-center">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
            activeColor === 'b'
              ? 'bg-slate-900 border-slate-600 text-slate-100'
              : 'bg-slate-100 border-slate-300 text-slate-900'
          }`}
        >
          {sideToMoveLabel}
        </span>
      </div>

      <EditableBoard fen={editedFen} onChange={handleBoardChange} />

      <button
        onClick={handleCopy}
        className={`w-full px-3 py-2 text-sm font-medium rounded-lg border transition-colors flex items-center justify-center gap-2 ${
          copied
            ? 'bg-emerald-600 border-emerald-500 text-white'
            : 'bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700 hover:border-slate-500'
        }`}
      >
        {copied ? <><Check className="w-4 h-4" /> {t('coaches.diagram.copied')}</> : <><Copy className="w-4 h-4" /> {t('coaches.diagram.copyFen')}</>}
      </button>
    </div>
  );
}

import { pieceImageUrl, BOARD_LIGHT as LIGHT, BOARD_DARK as DARK } from '../utils/pieces';

const PIECE_PALETTE = ['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p'];

type SquareMenu =
  | { kind: 'piece'; r: number; c: number; piece: string }
  | { kind: 'empty'; r: number; c: number }
  | { kind: 'picker'; r: number; c: number }
  | null;

function EditableBoard({ fen, onChange }: { fen: string; onChange: (board: (string | null)[][]) => void }) {
  const editing = true;
  const { t } = useLanguage();
  const board = useMemo(() => fenToBoard(fen), [fen]);
  const boardRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ piece: string; fromR: number; fromC: number; x: number; y: number } | null>(null);
  const [menu, setMenu] = useState<SquareMenu>(null);
  const [moveFrom, setMoveFrom] = useState<{ r: number; c: number } | null>(null);
  const didDragRef = useRef(false);

  // Close menu when exiting edit mode or when the FEN changes
  useEffect(() => { if (!editing) { setMenu(null); setMoveFrom(null); } }, [editing]);
  useEffect(() => { setMenu(null); setMoveFrom(null); }, [fen]);

  const mutate = useCallback((fn: (b: (string | null)[][]) => void) => {
    const next = board.map(row => [...row]);
    fn(next);
    onChange(next);
  }, [board, onChange]);

  const handleSquareClick = useCallback((r: number, c: number) => {
    if (!editing) return;
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
  }, [editing, menu, moveFrom, board, mutate]);

  const pendingDragRef = useRef<{ piece: string; fromR: number; fromC: number; startX: number; startY: number } | null>(null);

  const handlePointerDown = useCallback((_e: React.PointerEvent, piece: string, r: number, c: number) => {
    if (!editing) return;
    pendingDragRef.current = { piece, fromR: r, fromC: c, startX: _e.clientX, startY: _e.clientY };
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
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
  }, [editing, dragging, mutate]);

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
              return (
                <div
                  key={`${r}-${c}`}
                  className={`relative select-none ${editing ? 'cursor-pointer' : ''} ${isMoveFrom ? 'ring-2 ring-inset ring-blue-400' : ''}`}
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
                      className={`absolute inset-[5%] w-[90%] h-[90%] ${editing ? 'cursor-grab' : ''}`}
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
        <div className="grid grid-cols-6 gap-1">
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
