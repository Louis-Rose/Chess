// Diagram → FEN panel — thin view, state lives in CoachesDataContext

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { ImageIcon, Clock, Copy, Check, Loader2, RefreshCw } from 'lucide-react';
import { ImageZoomModal } from '../components/ImageZoomModal';
import { ProcessingProgressBar } from '../components/ProcessingProgressBar';

import { useLanguage } from '../../../contexts/LanguageContext';
import { useEffectiveAdmin } from '../../../contexts/AuthContext';
import { PanelShell } from '../components/PanelShell';
import { useCoachesData } from '../contexts/CoachesDataContext';
import { compressImage } from '../utils/compressImage';
import type { DiagramModelResult, DiagramExtract, DiagramRegion, PixelGroupInfo } from '../contexts/CoachesDataContext';
import { EditableBoard } from './diagram/EditableBoard';
import { SaveToKnowledgeButton } from './diagram/SaveToKnowledgeButton';
import { ComposedImage } from './diagram/ComposedImage';
import { BOARD_LIGHT as LIGHT, BOARD_DARK as DARK } from '../utils/pieces';

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
  const effectiveAdmin = useEffectiveAdmin();
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
                  ? Math.round(Math.max(...models.map(m => m.avg_elapsed || 0)))
                  : 0;
                const isPlural = (regionCount ?? 0) > 1;
                const title = allDone
                  ? t(isPlural ? 'coaches.diagram.donePlural' : 'coaches.diagram.done')
                  : t(isPlural ? 'coaches.diagram.analyzingPlural' : 'coaches.diagram.analyzing');
                return (
                  <ProcessingProgressBar
                    title={title}
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
                <ComposedImage
                  src={preview}
                  regions={regions}
                  showCandidates={effectiveAdmin}
                  onClick={() => setShowImageModal(true)}
                  className={`rounded-xl cursor-pointer hover:opacity-90 transition-all w-auto ${
                    !analyzing && models.length === 0 ? 'max-h-[65vh]' : 'max-h-80'
                  }`}
                />
              </div>

              {effectiveAdmin && (debugRawLocate || (debugRawReads && Object.keys(debugRawReads).length > 0)) && (
                <div className="max-w-xl mx-auto space-y-2 text-xs">
                  {debugRawLocate && (
                    <details open className="bg-slate-900/60 border border-slate-700 rounded">
                      <summary className="px-2 py-1 cursor-pointer text-slate-300">Phase 1 (locate) — raw LLM output</summary>
                      <pre className="px-2 py-2 text-slate-400 whitespace-pre-wrap break-words font-mono">{debugRawLocate}</pre>
                    </details>
                  )}
                  {debugRawReads && Object.keys(debugRawReads).sort((a, b) => Number(a) - Number(b)).map(k => {
                    const entry = debugRawReads[Number(k)];
                    return (
                      <details key={k} className="bg-slate-900/60 border border-slate-700 rounded">
                        <summary className="px-2 py-1 cursor-pointer text-slate-300">
                          Phase 2 (read) — region {Number(k) + 1}
                          {entry.attempt ? ` — pass ${entry.attempt}` : ''}
                        </summary>
                        <pre className="px-2 py-2 text-slate-400 whitespace-pre-wrap break-words font-mono">{entry.raw}</pre>
                      </details>
                    );
                  })}
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
                <ResultsView models={models} modelResults={modelResults} analyzing={analyzing} previewSrc={preview} totalRegions={regionCount} liveElapsedSec={liveElapsed} regions={regions} />
              )}
            </div>
          )}

      {showImageModal && preview && (
        <ImageZoomModal
          src={preview}
          alt="Diagram"
          onClose={() => setShowImageModal(false)}
          regions={regions}
          showCandidates={effectiveAdmin}
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
  liveElapsedSec?: number;
  regions?: DiagramRegion[];
}

// Translate backend reader names like "Reader 1" → "Lecteur 1" (FR)
function localizeReaderName(name: string | undefined, readerLabel: string): string {
  if (!name) return '';
  const match = name.match(/^Reader\s+(\d+)$/);
  return match ? `${readerLabel} ${match[1]}` : name;
}

type DiagramEntry =
  | { kind: 'ready'; diagram: DiagramExtract; originIdx: number }
  | { kind: 'pending'; region: DiagramRegion; originIdx: number }
  | { kind: 'reread'; diagram: DiagramExtract; originIdx: number; rereadNum: number };

function ResultsView({ models, modelResults, analyzing, previewSrc, totalRegions, liveElapsedSec, regions }: ResultsViewProps) {
  const { t } = useLanguage();
  const effectiveAdmin = useEffectiveAdmin();
  const readerLabel = t('coaches.diagram.readerLabel');
  const [selectedModelId, setSelectedModelId] = useState<string>(models[0]?.id || '');
  const [selectedDiagramIdx, setSelectedDiagramIdx] = useState(0);
  // Per-region-index re-read results (admin-only). Each region's array preserves arrival order.
  const [rereads, setRereads] = useState<Record<number, DiagramExtract[]>>({});
  const [rereadCount, setRereadCount] = useState(1);
  const [rereading, setRereading] = useState(false);
  const [rereadError, setRereadError] = useState<string | null>(null);

  // Ensure the selected model is always one that still exists
  useEffect(() => {
    if (!models.some(m => m.id === selectedModelId)) {
      setSelectedModelId(models[0]?.id || '');
      setSelectedDiagramIdx(0);
    }
  }, [models, selectedModelId]);

  const selectedModel = models.find(m => m.id === selectedModelId) || models[0];
  const mr = selectedModel ? modelResults[selectedModel.id] : undefined;
  const rawDiagrams = mr?.diagrams ?? [];
  const regionList = regions ?? [];

  // Build entries per region index: ready (phase 2 done) or pending (crop known, reading in flight).
  const count = Math.max(totalRegions ?? 0, regionList.length, rawDiagrams.length);
  const rawEntries: DiagramEntry[] = [];
  for (let i = 0; i < count; i++) {
    const d = rawDiagrams[i];
    if (d) { rawEntries.push({ kind: 'ready', diagram: d, originIdx: i }); continue; }
    const r = regionList[i];
    if (r) rawEntries.push({ kind: 'pending', region: r, originIdx: i });
  }
  // Phase 1 already returns diagram_number for every region, so pending entries can be
  // sorted the same way as ready ones — no need to wait for phase 2 to finish.
  const entryNumber = (e: DiagramEntry) =>
    e.kind === 'pending' ? e.region.diagram_number : e.diagram.diagram_number;
  const allHaveNumbers = rawEntries.length > 0 && rawEntries.every(e => typeof entryNumber(e) === 'number');
  const orderedEntries = allHaveNumbers
    ? [...rawEntries].sort((a, b) => (entryNumber(a) ?? 0) - (entryNumber(b) ?? 0))
    : rawEntries;
  // Interleave re-reads right after their original entry.
  const entries: DiagramEntry[] = [];
  for (const e of orderedEntries) {
    entries.push(e);
    (rereads[e.originIdx] ?? []).forEach((rr, i) => {
      entries.push({ kind: 'reread', diagram: rr, originIdx: e.originIdx, rereadNum: i + 1 });
    });
  }
  const entryCount = entries.length;

  // Clamp diagram index when the selected reader changes
  useEffect(() => {
    if (entryCount > 0 && selectedDiagramIdx >= entryCount) {
      setSelectedDiagramIdx(0);
    }
  }, [entryCount, selectedDiagramIdx]);

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
          className={selectClass}
        >
          {entries.length === 0 ? (
            <option value={0} disabled>
              {t('coaches.diagram.diagramLabel')} #1
            </option>
          ) : entries.map((entry, i) => {
            const num = entry.kind === 'pending' ? entry.region.diagram_number : entry.diagram.diagram_number;
            const base = typeof num === 'number'
              ? `${t('coaches.diagram.diagramLabel')} #${num}`
              : `${t('coaches.diagram.diagramLabel')} ${i + 1} / ${entryCount || (analyzing ? '?' : 1)}`;
            const label = entry.kind === 'reread' ? `${base} — Re-read ${entry.rereadNum}` : base;
            return (
              <option key={i} value={i} disabled={entry.kind === 'pending'}>
                {label}
              </option>
            );
          })}
        </select>
      </div>

      {effectiveAdmin && (() => {
        const current = entries[selectedDiagramIdx];
        const originIdx = current?.originIdx;
        // Re-read always runs against the ORIGINAL entry's crop, even when a re-read is selected.
        type OriginEntry = Extract<DiagramEntry, { kind: 'ready' } | { kind: 'pending' }>;
        const originEntry = typeof originIdx === 'number'
          ? rawEntries.find(e => e.originIdx === originIdx) as OriginEntry | undefined
          : undefined;
        const cropUrl = originEntry?.kind === 'ready'
          ? originEntry.diagram.crop_data_url
          : originEntry?.region.crop_data_url;
        const canReread = !!cropUrl && !rereading && originEntry !== undefined;
        const activeColor = originEntry?.kind === 'ready'
          ? (originEntry.diagram.fen.split(' ')[1] ?? 'w')
          : (originEntry?.region.active_color ?? 'w');

        const runReread = async () => {
          if (!canReread || typeof originIdx !== 'number' || !originEntry) return;
          setRereading(true);
          setRereadError(null);
          try {
            const requests = Array.from({ length: rereadCount }, () =>
              axios.post('/api/coaches/reread-region', { crop_data_url: cropUrl, active_color: activeColor })
            );
            const results = await Promise.allSettled(requests);
            const fresh: DiagramExtract[] = [];
            let firstError: string | null = null;
            const meta: DiagramExtract = originEntry.kind === 'ready'
              ? originEntry.diagram
              : {
                  fen: '',
                  white_player: originEntry.region.white_player,
                  black_player: originEntry.region.black_player,
                  region: originEntry.region,
                  diagram_number: originEntry.region.diagram_number,
                  crop_data_url: originEntry.region.crop_data_url,
                };
            for (const r of results) {
              if (r.status === 'fulfilled' && r.value.data?.fen) {
                fresh.push({ ...meta, fen: r.value.data.fen, pixel_colors: r.value.data.pixel_colors, pixel_debug: r.value.data.pixel_debug });
              } else if (r.status === 'rejected' && !firstError) {
                firstError = (r.reason as { response?: { data?: { error?: string } }; message?: string })
                  ?.response?.data?.error ?? (r.reason as Error)?.message ?? 'Re-read failed';
              }
            }
            if (fresh.length > 0) {
              setRereads(prev => ({ ...prev, [originIdx]: [...(prev[originIdx] ?? []), ...fresh] }));
            }
            if (firstError && fresh.length === 0) setRereadError(firstError);
          } finally {
            setRereading(false);
          }
        };

        return (
          <div className="flex items-center justify-center gap-2 text-xs">
            <label className="text-slate-400">×</label>
            <select
              value={rereadCount}
              onChange={e => setRereadCount(Number(e.target.value))}
              className="bg-slate-800 border border-slate-600 text-slate-100 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
              disabled={rereading}
            >
              {[1, 2, 3, 5, 10].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <button
              type="button"
              onClick={runReread}
              disabled={!canReread}
              className="px-2.5 py-1 rounded border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:border-slate-500 flex items-center gap-1.5 disabled:opacity-60"
              title="Admin: re-run the reader in parallel on the currently selected diagram"
            >
              <RefreshCw className={`w-3 h-3 ${rereading ? 'animate-spin' : ''}`} />
              {rereading ? 'Re-reading…' : 'Re-read (admin)'}
            </button>
            {rereadError && <span className="text-red-400">{rereadError}</span>}
          </div>
        );
      })()}

      <div className="bg-slate-700/50 rounded-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-600 flex items-center justify-center gap-2">
          <span className="text-slate-100 font-medium text-xs">{t('coaches.diagram.readerTitle')}</span>
          {(() => {
            const displayed = analyzing ? liveElapsedSec : mr?.elapsed;
            return displayed !== undefined ? (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                <span className="text-slate-400 text-xs">{displayed}s</span>
              </div>
            ) : null;
          })()}
        </div>

        {mr?.error ? (
          <p className="text-red-400 text-center py-4 px-3 text-xs">{mr.error}</p>
        ) : entryCount > 0 ? (
          <div className="p-3">
            {(() => {
              const entry = entries[selectedDiagramIdx] ?? entries[0];
              if (entry.kind === 'pending') return <PendingDiagram region={entry.region} />;
              return <FenEntry diagram={entry.diagram} previewSrc={previewSrc} />;
            })()}
          </div>
        ) : !mr ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-slate-500 text-xs animate-pulse">{t('coaches.diagram.analyzing')}</span>
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
function rebuildFen(oldFen: string, newPlacement: string): string {
  const parts = oldFen.split(' ');
  parts[0] = newPlacement;
  return parts.join(' ');
}

function FenEntry({ diagram, previewSrc }: { diagram: DiagramExtract; previewSrc?: string }) {
  const { t } = useLanguage();
  const effectiveAdmin = useEffectiveAdmin();
  const [copied, setCopied] = useState(false);
  const { white_player, black_player, region } = diagram;
  const [editedFen, setEditedFen] = useState(diagram.fen);
  const historyRef = useRef<string[]>([]);

  // Reset edited FEN and undo stack when the source diagram changes
  useEffect(() => {
    setEditedFen(diagram.fen);
    historyRef.current = [];
  }, [diagram.fen]);

  // Admin-only: threshold explorer state. Image is loaded once so the
  // debug tables below can recompute live as the slider moves.
  const initialPercentile = diagram.pixel_debug?.percentile_used ?? 7;
  const [percentile, setPercentile] = useState<number>(initialPercentile);
  const [autoTune, setAutoTune] = useState<boolean>(true);
  const [baseData, setBaseData] = useState<ImageData | null>(null);

  useEffect(() => { setPercentile(initialPercentile); }, [initialPercentile, diagram.fen]);

  useEffect(() => {
    if (!effectiveAdmin || !diagram.crop_data_url) { setBaseData(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const cvs = document.createElement('canvas');
      cvs.width = img.width;
      cvs.height = img.height;
      const ctx = cvs.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      setBaseData(ctx.getImageData(0, 0, img.width, img.height));
    };
    img.src = diagram.crop_data_url;
  }, [diagram.crop_data_url, effectiveAdmin]);

  const live = useMemo(() => {
    if (!baseData || !diagram.pixel_debug?.board_box_px || !editedFen) return null;
    return classifyAtThreshold(baseData, diagram.pixel_debug.board_box_px, editedFen, percentile, autoTune);
  }, [baseData, percentile, autoTune, diagram.pixel_debug?.board_box_px, editedFen]);

  const handleBoardChange = useCallback((newBoard: (string | null)[][]) => {
    setEditedFen(prev => {
      historyRef.current.push(prev);
      return rebuildFen(prev, boardToFenPlacement(newBoard));
    });
  }, []);

  const undo = useCallback(() => {
    const last = historyRef.current.pop();
    if (last !== undefined) setEditedFen(last);
  }, []);

  // Ctrl/Cmd+Z undoes the last board edit. Skip if a text input/textarea is focused
  // (the native undo should still work inside those).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.key === 'z' || e.key === 'Z')) return;
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (historyRef.current.length === 0) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

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
      {diagram.crop_data_url
        ? <img src={diagram.crop_data_url} alt="" className="mx-auto rounded-lg border border-slate-600 max-w-[400px] w-full" />
        : previewSrc && region && <CroppedRegion src={previewSrc} region={region} />}

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
        <button
          type="button"
          onClick={() => {
            setEditedFen(prev => {
              historyRef.current.push(prev);
              const parts = prev.split(' ');
              parts[1] = parts[1] === 'b' ? 'w' : 'b';
              return parts.join(' ');
            });
          }}
          title="Click to toggle side to move"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
            activeColor === 'b'
              ? 'bg-slate-900 border-slate-600 text-slate-100 hover:bg-slate-800'
              : 'bg-slate-100 border-slate-300 text-slate-900 hover:bg-white'
          }`}
        >
          {sideToMoveLabel}
        </button>
      </div>

      <EditableBoard fen={editedFen} onChange={handleBoardChange} pixelColors={effectiveAdmin ? (live?.pixelColors ?? diagram.pixel_colors) : undefined} />

      {diagram.crop_data_url && effectiveAdmin && (
        <ThresholdExplorer
          baseData={baseData}
          percentile={percentile}
          setPercentile={setPercentile}
          initial={initialPercentile}
          boardBox={diagram.pixel_debug?.board_box_px}
          live={live}
          autoTune={autoTune}
          setAutoTune={setAutoTune}
        />
      )}

      <PixelDebugPanel diagram={diagram} live={live} percentile={percentile} />

      <div className="flex flex-col gap-2">
        <button
          onClick={handleCopy}
          className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors flex items-center justify-center gap-2 ${
            copied
              ? 'bg-emerald-600 border-emerald-500 text-white'
              : 'bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700 hover:border-slate-500'
          }`}
        >
          {copied ? <><Check className="w-4 h-4" /> {t('coaches.diagram.copied')}</> : <><Copy className="w-4 h-4" /> {t('coaches.diagram.copyFen')}</>}
        </button>
        <SaveToKnowledgeButton diagram={diagram} editedFen={editedFen} />
      </div>
    </div>
  );
}

type LiveClassification = {
  means: Record<string, number>;
  dark_ratios: Record<string, number>;
  pieceGroups: Record<string, string>;
  groups: Record<string, PixelGroupInfo>;
  verdicts: Record<string, 'ok' | 'flip?' | 'no-check'>;
  pixelColors: Record<string, 'w' | 'b'>;
  typeThresholds: Record<string, number>;
  typePercentiles: Record<string, number>;
  globalThreshold: number;
  cellThresholds: Record<string, number>;
  typeHistograms: Record<string, number[]>;
};

function classifyAtThreshold(
  baseData: ImageData,
  boardBox: { left: number; top: number; right: number; bottom: number },
  fen: string,
  percentile: number,  // 0-100
  autoTune: boolean = false,
): LiveClassification {
  const w = baseData.width;
  const { left, top, right, bottom } = boardBox;
  const cellW = (right - left) / 8;
  const cellH = (bottom - top) / 8;
  const MIN_GAP = 0.03;

  const occupancy: Record<string, string> = {};
  fen.split(' ')[0].split('/').forEach((rankRow, r) => {
    const rankNum = 8 - r;
    let c = 0;
    for (const ch of rankRow) {
      if (ch >= '1' && ch <= '8') { c += parseInt(ch, 10); continue; }
      occupancy[`${'abcdefgh'[c]}${rankNum}`] = ch;
      c += 1;
    }
  });

  // Pass 1: gather per-cell pixels + mean (darkRatio depends on threshold, computed later)
  const cellPixels: Record<string, number[]> = {};
  const means: Record<string, number> = {};
  for (let fileIdx = 0; fileIdx < 8; fileIdx++) {
    for (let rankIdx = 0; rankIdx < 8; rankIdx++) {
      const sq = `${'abcdefgh'[fileIdx]}${rankIdx + 1}`;
      const cl = left + fileIdx * cellW;
      const ct = top + (7 - rankIdx) * cellH;
      const ix0 = Math.max(0, Math.floor(cl));
      const iy0 = Math.max(0, Math.floor(ct));
      const ix1 = Math.min(baseData.width, Math.floor(cl + cellW));
      const iy1 = Math.min(baseData.height, Math.floor(ct + cellH));
      const pixels: number[] = [];
      let sum = 0;
      for (let y = iy0; y < iy1; y++) {
        for (let x = ix0; x < ix1; x++) {
          const idx = (y * w + x) * 4;
          const gray = (baseData.data[idx] + baseData.data[idx + 1] + baseData.data[idx + 2]) / 3;
          sum += gray;
          pixels.push(gray);
        }
      }
      if (pixels.length > 0) {
        cellPixels[sq] = pixels;
        means[sq] = Math.round((sum / pixels.length) * 10) / 10;
      }
    }
  }

  const pctOf = (xs: number[], p: number) => {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const k = Math.max(0, Math.min(s.length - 1, Math.floor((p / 100) * (s.length - 1))));
    return s[k];
  };

  // Per-type threshold = percentile of that type's pooled pixels.
  const typePixels = new Map<string, number[]>();
  for (const sq of Object.keys(cellPixels)) {
    const piece = occupancy[sq];
    if (!piece) continue;
    const type = piece.toUpperCase();
    if (!typePixels.has(type)) typePixels.set(type, []);
    const arr = typePixels.get(type)!;
    for (const g of cellPixels[sq]) arr.push(g);
  }
  const typeThresholds: Record<string, number> = {};
  const typePercentiles: Record<string, number> = {};
  const typeHistograms: Record<string, number[]> = {};

  // L1-optimal gap for a given list of fills (sorted or not).
  const fillsGap = (fillsIn: number[]): number => {
    if (fillsIn.length < 2) return 0;
    const fills = [...fillsIn].sort((a, b) => a - b);
    let bestCost = Infinity;
    let bestIdx = -1;
    for (let i = 1; i < fills.length; i++) {
      const lo = fills.slice(0, i);
      const hi = fills.slice(i);
      const lm = lo.length % 2 ? lo[Math.floor(lo.length / 2)] : (lo[lo.length / 2 - 1] + lo[lo.length / 2]) / 2;
      const hm = hi.length % 2 ? hi[Math.floor(hi.length / 2)] : (hi[hi.length / 2 - 1] + hi[hi.length / 2]) / 2;
      let c = 0;
      for (const x of lo) c += Math.abs(x - lm);
      for (const x of hi) c += Math.abs(x - hm);
      if (c < bestCost) { bestCost = c; bestIdx = i; }
    }
    return bestIdx > 0 ? fills[bestIdx] - fills[bestIdx - 1] : 0;
  };

  const AUTO_CANDIDATES = [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0];

  for (const [type, pixels] of typePixels.entries()) {
    // Histogram is threshold-independent, compute once.
    const hist = new Array(256).fill(0);
    for (const g of pixels) {
      const b = Math.max(0, Math.min(255, Math.round(g)));
      hist[b]++;
    }
    typeHistograms[type] = hist;

    // Find this type's cells so we can compute fills at each candidate percentile.
    const typeCells: string[] = [];
    for (const sq of Object.keys(cellPixels)) {
      if (occupancy[sq] && occupancy[sq].toUpperCase() === type) typeCells.push(sq);
    }

    const evalAt = (p: number): { thr: number; gap: number } => {
      const thr = pctOf(pixels, p);
      const fills: number[] = [];
      for (const sq of typeCells) {
        const px = cellPixels[sq];
        let dc = 0;
        for (const g of px) if (g <= thr) dc++;
        fills.push(dc / px.length);
      }
      return { thr, gap: fillsGap(fills) };
    };

    if (autoTune) {
      let bestP = percentile;
      let best = evalAt(percentile);
      for (const p of AUTO_CANDIDATES) {
        const cur = evalAt(p);
        if (cur.gap > best.gap) { best = cur; bestP = p; }
      }
      typePercentiles[type] = bestP;
      typeThresholds[type] = best.thr;
    } else {
      typePercentiles[type] = percentile;
      typeThresholds[type] = pctOf(pixels, percentile);
    }
  }

  // Fallback (empty cells, canvas default): percentile of all board pixels.
  const allPixels: number[] = [];
  for (const sq of Object.keys(cellPixels)) {
    for (const g of cellPixels[sq]) allPixels.push(g);
  }
  const globalThreshold = pctOf(allPixels, percentile);

  // Pass 2: per-cell darkRatio using its cell's resolved threshold.
  const darkRatios: Record<string, number> = {};
  const cellThresholds: Record<string, number> = {};
  for (const sq of Object.keys(cellPixels)) {
    const piece = occupancy[sq];
    const thr = piece ? typeThresholds[piece.toUpperCase()] : globalThreshold;
    cellThresholds[sq] = thr;
    const pixels = cellPixels[sq];
    let darkCount = 0;
    for (const g of pixels) if (g <= thr) darkCount++;
    darkRatios[sq] = Math.round((darkCount / pixels.length) * 1000) / 1000;
  }

  type Member = { sq: string; llm: 'w' | 'b'; ratio: number; type: string };
  const groupMembers = new Map<string, Member[]>();
  for (let fileIdx = 0; fileIdx < 8; fileIdx++) {
    for (let rankIdx = 0; rankIdx < 8; rankIdx++) {
      const sq = `${'abcdefgh'[fileIdx]}${rankIdx + 1}`;
      const piece = occupancy[sq];
      if (!piece) continue;
      const llm: 'w' | 'b' = piece === piece.toUpperCase() ? 'w' : 'b';
      const type = piece.toUpperCase();
      if (!groupMembers.has(type)) groupMembers.set(type, []);
      groupMembers.get(type)!.push({ sq, llm, ratio: darkRatios[sq] ?? 0, type });
    }
  }

  const groups: Record<string, PixelGroupInfo> = {};
  const pieceGroups: Record<string, string> = {};
  const pixelColors: Record<string, 'w' | 'b'> = {};
  const verdicts: Record<string, 'ok' | 'flip?' | 'no-check'> = {};

  const median1D = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const n = s.length;
    return n % 2 ? s[Math.floor(n / 2)] : (s[n / 2 - 1] + s[n / 2]) / 2;
  };
  // L1-optimal 2-cluster split: minimise sum of |fill − cluster median| over
  // both clusters. Threshold = midpoint of cluster medians. Robust to
  // within-cluster outliers (single rogue fill can't drag the centre).
  const analyzeGroup = (members: Member[]) => {
    const sorted = [...members].sort((a, b) => a.ratio - b.ratio);
    const fills = sorted.map(m => m.ratio);
    if (fills.length < 2) {
      return { sorted, biggestGap: 0, gapIdx: -1, canCheck: false, thresh: null };
    }
    let bestCost = Infinity;
    let bestIdx = 1;
    let bestLo = 0, bestHi = 0;
    for (let i = 1; i < fills.length; i++) {
      const lo = fills.slice(0, i);
      const hi = fills.slice(i);
      const lm = median1D(lo);
      const hm = median1D(hi);
      let cost = 0;
      for (const x of lo) cost += Math.abs(x - lm);
      for (const x of hi) cost += Math.abs(x - hm);
      if (cost < bestCost) { bestCost = cost; bestIdx = i; bestLo = lm; bestHi = hm; }
    }
    const biggestGap = fills[bestIdx] - fills[bestIdx - 1];
    const canCheck = biggestGap >= MIN_GAP;
    const thresh = canCheck ? (bestLo + bestHi) / 2 : null;
    return { sorted, biggestGap, gapIdx: bestIdx - 1, canCheck, thresh };
  };

  const buildInfo = (members: Member[], analysis: ReturnType<typeof analyzeGroup>): PixelGroupInfo => ({
    threshold: analysis.thresh !== null ? Math.round(analysis.thresh * 1000) / 1000 : null,
    gap: analysis.sorted.length > 1 ? Math.round(analysis.biggestGap * 1000) / 1000 : null,
    min_gap: MIN_GAP,
    can_check: analysis.canCheck,
    count_w: members.filter(m => m.llm === 'w').length,
    count_b: members.filter(m => m.llm === 'b').length,
    min_fill: analysis.sorted.length ? Math.round(analysis.sorted[0].ratio * 1000) / 1000 : null,
    max_fill: analysis.sorted.length ? Math.round(analysis.sorted[analysis.sorted.length - 1].ratio * 1000) / 1000 : null,
  });

  // One group per piece type (bg ignored: background pixels sit above the
  // dark_threshold so tile color doesn't affect fill-ratios meaningfully).
  for (const [key, members] of groupMembers.entries()) {
    const analysis = analyzeGroup(members);
    groups[key] = buildInfo(members, analysis);
    for (const m of members) {
      pieceGroups[m.sq] = key;
      if (analysis.canCheck && analysis.thresh !== null) {
        const pred: 'w' | 'b' = m.ratio > analysis.thresh ? 'b' : 'w';
        pixelColors[m.sq] = pred;
        verdicts[m.sq] = pred === m.llm ? 'ok' : 'flip?';
      } else {
        verdicts[m.sq] = 'no-check';
      }
    }
  }

  return { means, dark_ratios: darkRatios, pieceGroups, groups, verdicts, pixelColors, typeThresholds, typePercentiles, globalThreshold, cellThresholds, typeHistograms };
}

interface ThresholdExplorerProps {
  baseData: ImageData | null;
  percentile: number;
  setPercentile: (v: number) => void;
  initial: number;
  boardBox?: { left: number; top: number; right: number; bottom: number; crop_w: number; crop_h: number };
  live?: LiveClassification | null;
  autoTune: boolean;
  setAutoTune: (v: boolean) => void;
}

function ThresholdExplorer({ baseData, percentile, setPercentile, initial, boardBox, live, autoTune, setAutoTune }: ThresholdExplorerProps) {
  const effectiveAdmin = useEffectiveAdmin();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Sample only pixels inside board_box so the percentage matches backend's
  // percentile. The crop's dark book-frame and labels would otherwise skew it.
  const cumHist = useMemo(() => {
    if (!baseData) return null;
    const w = baseData.width, h = baseData.height;
    const left = boardBox ? Math.max(0, Math.floor(boardBox.left)) : 0;
    const top = boardBox ? Math.max(0, Math.floor(boardBox.top)) : 0;
    const right = boardBox ? Math.min(w, Math.ceil(boardBox.right)) : w;
    const bottom = boardBox ? Math.min(h, Math.ceil(boardBox.bottom)) : h;
    const hist = new Array(256).fill(0);
    let total = 0;
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        const idx = (y * w + x) * 4;
        const g = Math.round((baseData.data[idx] + baseData.data[idx + 1] + baseData.data[idx + 2]) / 3);
        hist[g]++;
        total++;
      }
    }
    const cum = new Array(257).fill(0);
    for (let i = 0; i < 256; i++) cum[i + 1] = cum[i] + hist[i];
    return { cum, total };
  }, [baseData, boardBox]);

  useEffect(() => {
    if (!baseData) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = baseData.width;
    canvas.height = baseData.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const out = ctx.createImageData(baseData.width, baseData.height);
    const src = baseData.data;
    const dst = out.data;

    // Per-pixel threshold: look up the cell's type threshold if inside the
    // board_box; use globalThreshold everywhere else.
    const cellThresholds = live?.cellThresholds ?? null;
    const globalT = live?.globalThreshold ?? 0;
    const fallbackT = globalT;
    const W = baseData.width;
    const H = baseData.height;
    const boxed = boardBox && cellThresholds;
    const bLeft = boardBox ? boardBox.left : 0;
    const bTop = boardBox ? boardBox.top : 0;
    const bRight = boardBox ? boardBox.right : 0;
    const bBottom = boardBox ? boardBox.bottom : 0;
    const cellW = boardBox ? (bRight - bLeft) / 8 : 0;
    const cellH = boardBox ? (bBottom - bTop) / 8 : 0;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const r = src[i], g = src[i + 1], b = src[i + 2];
        const gray = (r + g + b) / 3;
        let thr = fallbackT;
        if (boxed && x >= bLeft && x < bRight && y >= bTop && y < bBottom) {
          const fileIdx = Math.min(7, Math.floor((x - bLeft) / cellW));
          const rankIdxFromTop = Math.min(7, Math.floor((y - bTop) / cellH));
          const rankNum = 8 - rankIdxFromTop;
          const sq = `${'abcdefgh'[fileIdx]}${rankNum}`;
          thr = cellThresholds[sq] ?? fallbackT;
        }
        if (gray <= thr) {
          dst[i] = 239; dst[i + 1] = 68; dst[i + 2] = 68; dst[i + 3] = 255;
        } else {
          dst[i] = r; dst[i + 1] = g; dst[i + 2] = b; dst[i + 3] = 255;
        }
      }
    }
    ctx.putImageData(out, 0, 0);

    if (boardBox) {
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(bLeft + 0.5, bTop + 0.5, bRight - bLeft - 1, bBottom - bTop - 1);
      ctx.setLineDash([]);
    }

    if (boardBox && live?.pixelColors) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      for (const sq in live.pixelColors) {
        if (live.pixelColors[sq] !== 'b') continue;
        const fileIdx = 'abcdefgh'.indexOf(sq[0]);
        const rankIdx = parseInt(sq[1], 10) - 1;
        if (fileIdx < 0 || isNaN(rankIdx)) continue;
        const cl = bLeft + fileIdx * cellW;
        const ct = bTop + (7 - rankIdx) * cellH;
        ctx.strokeRect(cl + 1, ct + 1, cellW - 2, cellH - 2);
      }
    }
  }, [baseData, percentile, boardBox, live]);

  if (!effectiveAdmin || !baseData) return null;

  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v * 10) / 10));
  const bump = (d: number) => setPercentile(clamp(percentile + d));
  const total = cumHist?.total ?? 0;
  const globalThr = Math.round(live?.globalThreshold ?? 0);
  const below = cumHist ? cumHist.cum[globalThr] : 0;
  const pctTinted = total > 0 ? (below / total) * 100 : 0;

  return (
    <details className="max-w-[400px] mx-auto bg-slate-900/60 border border-slate-700 rounded text-xs">
      <summary className="px-2 py-1 cursor-pointer text-slate-300">
        <span className="block">Threshold explorer (admin)</span>
        <span className="block">percentile: {percentile.toFixed(1)}% · global dark_thr ≈ {globalThr}</span>
        <span className="block">≈{pctTinted.toFixed(2)}% of board tinted</span>
      </summary>
      <div className="px-2 py-2 space-y-2">
        <canvas ref={canvasRef} className="mx-auto block rounded border border-slate-700 max-w-full" style={{ imageRendering: 'pixelated' }} />
        <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={autoTune}
            onChange={e => setAutoTune(e.target.checked)}
            className="accent-blue-500"
          />
          <span>Auto-tune per type (sweep 4–7%, max gap)</span>
        </label>
        <div className={`flex items-center gap-2 ${autoTune ? 'opacity-50' : ''}`}>
          <button
            type="button"
            onClick={() => bump(-0.5)}
            className="px-2 py-0.5 rounded border border-slate-600 text-slate-300 hover:bg-slate-800 font-mono"
            title="Decrease percentile by 0.5"
          >
            −
          </button>
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={percentile}
            onChange={e => setPercentile(parseFloat(e.target.value))}
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => bump(0.5)}
            className="px-2 py-0.5 rounded border border-slate-600 text-slate-300 hover:bg-slate-800 font-mono"
            title="Increase percentile by 0.5"
          >
            +
          </button>
          <span className="font-mono w-14 text-right text-slate-300">{percentile.toFixed(1)}%</span>
          <button
            type="button"
            onClick={() => setPercentile(initial)}
            className="px-2 py-0.5 rounded border border-slate-600 text-slate-300 hover:bg-slate-800"
            title="Reset to computed default percentile"
          >
            reset
          </button>
        </div>
      </div>
    </details>
  );
}

function DarkBgHistogram({ histogram, threshold, width = 420, height = 80 }: { histogram: number[]; threshold: number; width?: number; height?: number }) {
  const W = width;
  const H = height;
  const max = Math.max(...histogram);
  if (max === 0) return null;
  const barW = W / 256;
  const thresholdX = (threshold / 255) * W;
  return (
    <svg width={W} height={H + 18} className="block">
      {histogram.map((count, i) => {
        if (count === 0) return null;
        const h = (count / max) * H;
        const x = i * barW;
        const isInk = i < threshold;
        return <rect key={i} x={x} y={H - h} width={Math.max(barW, 1)} height={h} fill={isInk ? '#ef4444' : '#64748b'} />;
      })}
      <line x1={thresholdX} y1={0} x2={thresholdX} y2={H} stroke="#eab308" strokeWidth={1} strokeDasharray="3 2" />
      <text x={Math.min(thresholdX + 3, W - 80)} y={10} fill="#eab308" fontSize={10} fontFamily="monospace">thr={threshold}</text>
      <line x1={0} y1={H} x2={W} y2={H} stroke="#475569" strokeWidth={0.5} />
      <text x={0} y={H + 12} fill="#64748b" fontSize={9} fontFamily="monospace">0</text>
      <text x={W / 2 - 8} y={H + 12} fill="#64748b" fontSize={9} fontFamily="monospace">128</text>
      <text x={W - 22} y={H + 12} fill="#64748b" fontSize={9} fontFamily="monospace">255</text>
    </svg>
  );
}

function PixelDebugPanel({ diagram, live, percentile }: { diagram: DiagramExtract; live?: LiveClassification | null; percentile?: number }) {
  const effectiveAdmin = useEffectiveAdmin();
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [zoomedHist, setZoomedHist] = useState<{ histogram: number[]; threshold: number; label: string } | null>(null);
  if (!effectiveAdmin) return null;
  const dbg = diagram.pixel_debug;
  if (!dbg) return null;
  const colors = live?.pixelColors ?? diagram.pixel_colors ?? {};
  const means = live?.means ?? dbg.means;
  const darkRatios = live?.dark_ratios ?? dbg.dark_ratios;
  const groupsMap = live?.groups ?? dbg.groups ?? {};
  const pieceGroupsMap = live?.pieceGroups ?? dbg.piece_groups ?? {};
  const verdictsMap = live?.verdicts ?? dbg.verdicts ?? {};
  const displayedPercentile = percentile ?? dbg.percentile_used ?? 7;
  const displayedGlobalThreshold = Math.round(live?.globalThreshold ?? dbg.dark_threshold);
  const typeThresholds = live?.typeThresholds ?? {};

  // Reconstruct 64-square occupancy from the FEN so we can show every cell,
  // empty and occupied, with its measurements.
  const fenRows = diagram.fen.split(' ')[0].split('/');
  const occupancy: Record<string, string> = {};
  fenRows.forEach((rankRow, r) => {
    const rankNum = 8 - r;
    let c = 0;
    for (const ch of rankRow) {
      if (ch >= '1' && ch <= '8') { c += parseInt(ch); continue; }
      occupancy[`${'abcdefgh'[c]}${rankNum}`] = ch;
      c += 1;
    }
  });

  type Row = {
    sq: string;
    piece: string | null;
    llm: 'w' | 'b' | null;
    px: 'w' | 'b' | null;
    mean: number | undefined;
    darkRatio: number | undefined;
    isDark: boolean;
    group: string | undefined;
    groupThresh: number | null | undefined;
    verdict: 'ok' | 'flip?' | 'no-check' | undefined;
  };
  const rows: Row[] = [];
  for (let rankIdx = 7; rankIdx >= 0; rankIdx--) {
    for (let fileIdx = 0; fileIdx < 8; fileIdx++) {
      const sq = `${'abcdefgh'[fileIdx]}${rankIdx + 1}`;
      const piece = occupancy[sq] ?? null;
      const llm: 'w' | 'b' | null = piece ? (piece === piece.toUpperCase() ? 'w' : 'b') : null;
      const group = pieceGroupsMap[sq];
      const groupInfo = group ? groupsMap[group] : undefined;
      rows.push({
        sq,
        piece,
        llm,
        px: colors[sq] ?? null,
        mean: means?.[sq],
        darkRatio: darkRatios?.[sq],
        isDark: (fileIdx + rankIdx) % 2 === 0,
        group,
        groupThresh: groupInfo?.threshold,
        verdict: verdictsMap[sq],
      });
    }
  }

  const PIECE_ORDER = 'KQRBNP';
  const pieceRank = (ch: string | null | undefined) =>
    ch ? PIECE_ORDER.indexOf(ch.toUpperCase()) : 99;
  // Hide empty squares; sort by piece type (KQRBNP), then rank 8→1, then file a→h.
  const pieceRows = rows.filter(r => r.piece != null);
  pieceRows.sort((a, b) => {
    const pr = pieceRank(a.piece) - pieceRank(b.piece);
    if (pr !== 0) return pr;
    const aRank = parseInt(a.sq[1], 10);
    const bRank = parseInt(b.sq[1], 10);
    if (aRank !== bRank) return bRank - aRank;
    return a.sq[0] < b.sq[0] ? -1 : 1;
  });

  const allGroupEntries = Object.entries(groupsMap).sort(([a], [b]) =>
    PIECE_ORDER.indexOf(a) - PIECE_ORDER.indexOf(b)
  );
  const groupEntries = typeFilter === 'all'
    ? allGroupEntries
    : allGroupEntries.filter(([k]) => k === typeFilter);
  const visiblePieceRows = typeFilter === 'all'
    ? pieceRows
    : pieceRows.filter(r => r.piece && r.piece.toUpperCase() === typeFilter);

  const gapValues = groupEntries.map(([, g]) => g.gap).filter((v): v is number => v != null);
  const avgGap = gapValues.length ? gapValues.reduce((a, b) => a + b, 0) / gapValues.length : null;

  return (
    <details className="max-w-xl mx-auto bg-slate-900/60 border border-slate-700 rounded text-xs">
      <summary className="px-2 py-1 cursor-pointer text-slate-300">
        Pixel-ratio debug — percentile={displayedPercentile.toFixed(1)}% · global_thr≈{displayedGlobalThreshold}
        {dbg.board_box_px && <> | box=({dbg.board_box_px.left},{dbg.board_box_px.top})→({dbg.board_box_px.right},{dbg.board_box_px.bottom}) in {dbg.board_box_px.crop_w}×{dbg.board_box_px.crop_h}</>}
      </summary>

      {(() => {
        const typedHist = typeFilter !== 'all' ? live?.typeHistograms?.[typeFilter] : undefined;
        const histogram = typedHist ?? dbg.board_histogram;
        if (!histogram || !histogram.some(v => v > 0)) return null;
        const threshold = typedHist ? Math.round(typeThresholds[typeFilter] ?? 0) : displayedGlobalThreshold;
        const label = typedHist
          ? `${typeFilter}-cell pixel histogram — threshold = ${typeFilter} dark_thr (${threshold})`
          : `All-board pixel histogram — threshold at ${dbg.percentile_used ?? '?'}th percentile`;
        return (
          <div className="px-2 py-2 border-b border-slate-700">
            <div className="text-slate-500 mb-1">{label}</div>
            <button
              type="button"
              onClick={() => setZoomedHist({ histogram, threshold, label })}
              className="block w-full cursor-zoom-in"
              title="Click to zoom"
            >
              <DarkBgHistogram histogram={histogram} threshold={threshold} />
            </button>
          </div>
        );
      })()}

      {zoomedHist && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setZoomedHist(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded p-4 max-w-[95vw] max-h-[95vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3 text-slate-300">
              <span className="text-xs">{zoomedHist.label}</span>
              <button
                type="button"
                onClick={() => setZoomedHist(null)}
                className="px-2 py-0.5 rounded border border-slate-600 hover:bg-slate-800 text-xs"
              >
                close
              </button>
            </div>
            <DarkBgHistogram histogram={zoomedHist.histogram} threshold={zoomedHist.threshold} width={1024} height={320} />
          </div>
        </div>
      )}
      {allGroupEntries.length > 0 && (
        <div className="px-2 py-2 border-b border-slate-700">
          <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-400">
            <label htmlFor="piece-type-filter">Filter by type:</label>
            <select
              id="piece-type-filter"
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-slate-200 font-mono"
            >
              <option value="all">all</option>
              {PIECE_ORDER.split('').map(ch => (
                <option key={ch} value={ch}>{ch}</option>
              ))}
            </select>
          </div>
          <div className="text-slate-500 mb-1">
            Groups (type) — threshold from largest gap in fills
            {avgGap != null && <span className="ml-2 text-slate-300">avg gap: {(avgGap * 100).toFixed(1)}%</span>}
          </div>
          <table className="w-full text-left font-mono text-[11px] text-slate-300">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800">
                <th className="pr-3">group</th>
                <th className="pr-3">n</th>
                <th className="pr-3">pct</th>
                <th className="pr-3">dark_thr</th>
                <th className="pr-3">min→max</th>
                <th className="pr-3">thresh</th>
                <th>gap check</th>
              </tr>
            </thead>
            <tbody>
              {groupEntries.map(([k, g]) => {
                const gapPct = g.gap != null ? `${(g.gap * 100).toFixed(1)}%` : '—';
                const minGapPct = `${(g.min_gap * 100).toFixed(0)}%`;
                const typePct = live?.typePercentiles?.[k];
                return (
                  <tr key={k} className={g.can_check ? '' : 'text-slate-500'}>
                    <td className="pr-3">{k}</td>
                    <td className="pr-3">{g.count_w + g.count_b}</td>
                    <td className="pr-3">{typePct != null ? `${typePct.toFixed(1)}%` : '—'}</td>
                    <td className="pr-3">{typeThresholds[k] != null ? Math.round(typeThresholds[k]) : '—'}</td>
                    <td className="pr-3">{g.min_fill != null ? `${(g.min_fill * 100).toFixed(1)}%` : '—'}→{g.max_fill != null ? `${(g.max_fill * 100).toFixed(1)}%` : '—'}</td>
                    <td className="pr-3">{g.threshold != null ? `${(g.threshold * 100).toFixed(1)}%` : '—'}</td>
                    <td>{gapPct}{g.gap != null && (g.can_check ? ' ✓' : ` ✗ (<${minGapPct})`)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-2 py-2 overflow-x-auto">
        <table className="w-full text-left font-mono text-[11px] text-slate-300">
          <thead>
            <tr className="text-slate-500 border-b border-slate-700">
              <th className="pr-3">group</th>
              <th className="pr-3">sq</th>
              <th className="pr-3">sq_bg</th>
              <th className="pr-3">LLM</th>
              <th className="pr-3">Px</th>
              <th className="pr-3">mean</th>
              <th className="pr-3">dark%</th>
              <th className="pr-3">g_thr%</th>
              <th>verdict</th>
            </tr>
          </thead>
          <tbody>
            {visiblePieceRows.map(row => {
              const darkPct = row.darkRatio !== undefined ? (row.darkRatio * 100).toFixed(1) : '—';
              const gThrPct = row.groupThresh != null ? (row.groupThresh * 100).toFixed(1) : '—';
              const cls =
                row.verdict === 'flip?' ? 'text-red-400' :
                row.verdict === 'no-check' ? 'text-amber-400' :
                row.piece ? '' : 'text-slate-500';
              return (
                <tr key={row.sq} className={cls}>
                  <td className="pr-3">{row.group ?? '—'}</td>
                  <td className="pr-3">{row.sq}</td>
                  <td className="pr-3">{row.isDark ? 'dark' : 'light'}</td>
                  <td className="pr-3">{row.llm ?? '—'}</td>
                  <td className="pr-3">{row.px ?? '—'}</td>
                  <td className="pr-3">{row.mean ?? '—'}</td>
                  <td className="pr-3">{darkPct}</td>
                  <td className="pr-3">{gThrPct}</td>
                  <td>{row.verdict ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function PendingDiagram({ region }: { region: DiagramRegion }) {
  const { t } = useLanguage();
  const hasPlayers = !!(region.white_player || region.black_player);
  const sideToMoveLabel = region.active_color === 'b' ? t('coaches.diagram.blackToPlay') : t('coaches.diagram.whiteToPlay');
  return (
    <div className="space-y-3">
      {region.crop_data_url && (
        <img src={region.crop_data_url} alt="" className="mx-auto rounded-lg border border-slate-600 max-w-[400px] w-full" />
      )}
      {hasPlayers && (
        <div className="flex items-center justify-center gap-2 text-sm font-medium">
          <span className="w-3 h-3 rounded-full bg-white border border-slate-400 inline-block" />
          <span className="text-slate-100">{region.white_player || '—'}</span>
          <span className="text-slate-500 mx-1">vs</span>
          <span className="text-slate-100">{region.black_player || '—'}</span>
          <span className="w-3 h-3 rounded-full bg-slate-900 border border-slate-500 inline-block" />
        </div>
      )}
      {region.active_color && (
        <div className="flex justify-center">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              region.active_color === 'b'
                ? 'bg-slate-900 border-slate-600 text-slate-100'
                : 'bg-slate-100 border-slate-300 text-slate-900'
            }`}
          >
            {sideToMoveLabel}
          </span>
        </div>
      )}
      <div className="relative mx-auto aspect-square w-full max-w-[400px] rounded-lg overflow-hidden shadow-lg">
        <div className="grid h-full w-full grid-cols-8 grid-rows-8">
          {Array.from({ length: 64 }, (_, i) => {
            const r = Math.floor(i / 8), c = i % 8;
            const isLight = (r + c) % 2 === 0;
            return <div key={i} style={{ backgroundColor: isLight ? LIGHT : DARK }} />;
          })}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/10">
          <Loader2 className="w-10 h-10 text-slate-100 drop-shadow animate-spin" />
        </div>
      </div>
    </div>
  );
}
