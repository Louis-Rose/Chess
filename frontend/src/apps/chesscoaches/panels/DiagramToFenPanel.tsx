// Diagram → FEN panel — thin view, state lives in CoachesDataContext

import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ImageIcon, Clock, Copy, Check, Loader2, RefreshCw } from 'lucide-react';
import { ImageZoomModal } from '../components/ImageZoomModal';
import { ProcessingProgressBar } from '../components/ProcessingProgressBar';

import { useLanguage } from '../../../contexts/LanguageContext';
import { useEffectiveAdmin } from '../../../contexts/AuthContext';
import { PanelShell } from '../components/PanelShell';
import { useCoachesData } from '../contexts/CoachesDataContext';
import { compressImage } from '../utils/compressImage';
import type { DiagramModelResult, DiagramExtract, DiagramRegion } from '../contexts/CoachesDataContext';
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
  const { preview, models, modelResults, analyzing, startTime, error, regions, regionCount, regionsRead, locateCount, debugRawLocate, debugRawReads, debugRawRereads, rereading, rereadDone, rereadTotal, rereadStartTime } = diagram;
  const [liveElapsed, setLiveElapsed] = useState(0);

  // Tick the elapsed counter while analysis or a re-read is running; freeze on completion.
  useEffect(() => {
    const base = rereading ? rereadStartTime : startTime;
    const active = rereading || analyzing;
    if (!base) { setLiveElapsed(0); return; }
    if (!active) return; // leave liveElapsed at its last value
    const tick = () => setLiveElapsed(Math.round((Date.now() - base) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime, analyzing, rereading, rereadStartTime]);
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
              {(analyzing || rereading || models.length > 0) && (() => {
                const finishedCount = models.filter(m => !!modelResults[m.id]?.elapsed).length;
                const scanDone = !analyzing && models.length > 0 && finishedCount === models.length;
                const allDone = scanDone && !rereading;
                // Reread overrides the scan bar while active. Otherwise: 20%
                // for region detection, then 20-100% for reading each region.
                const pct = rereading && rereadTotal > 0
                  ? Math.round((rereadDone / rereadTotal) * 100)
                  : regionCount
                    ? Math.round(20 + (regionsRead || 0) / regionCount * 80)
                    : regions ? 20 : 0;
                const maxAvg = models.length > 0
                  ? Math.round(Math.max(...models.map(m => m.avg_elapsed || 0)))
                  : 0;
                const isPlural = (regionCount ?? 0) > 1;
                const locatePlural = (locateCount ?? 0) !== 1;
                const locateTitle = (locateCount ?? 0) > 0
                  ? t(locatePlural ? 'coaches.diagram.locatingFoundPlural' : 'coaches.diagram.locatingFound').replace('{count}', String(locateCount))
                  : t('coaches.diagram.locating');
                const title = rereading
                  ? t('coaches.diagram.rereading')
                  : allDone
                    ? t(isPlural ? 'coaches.diagram.donePlural' : 'coaches.diagram.done')
                    : analyzing && !regions
                      ? locateTitle
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
                  onClick={() => setShowImageModal(true)}
                  className={`rounded-xl cursor-pointer hover:opacity-90 transition-all w-auto ${
                    !analyzing && models.length === 0 ? 'max-h-[65vh]' : 'max-h-80'
                  }`}
                />
              </div>

              {effectiveAdmin && (debugRawLocate || (debugRawReads && Object.keys(debugRawReads).length > 0) || (debugRawRereads && Object.keys(debugRawRereads).length > 0)) && (
                <div className="max-w-xl mx-auto space-y-2 text-xs">
                  {debugRawLocate && (
                    <details open className="bg-slate-900/60 border border-slate-700 rounded">
                      <summary className="px-2 py-1 cursor-pointer text-slate-300">Phase 1 (locate) — raw LLM output</summary>
                      <pre className="px-2 py-2 text-slate-400 whitespace-pre-wrap break-words font-mono">{debugRawLocate}</pre>
                    </details>
                  )}
                  {(() => {
                    const readKeys = new Set<number>();
                    if (debugRawReads) Object.keys(debugRawReads).forEach(k => readKeys.add(Number(k)));
                    if (debugRawRereads) Object.keys(debugRawRereads).forEach(k => readKeys.add(Number(k)));
                    return Array.from(readKeys).sort((a, b) => a - b).map(k => {
                      const entry = debugRawReads?.[k];
                      const rereadList = debugRawRereads?.[k] ?? [];
                      return (
                        <div key={k} className="space-y-1">
                          {entry && (
                            <details className="bg-slate-900/60 border border-slate-700 rounded">
                              <summary className={`px-2 py-1 cursor-pointer ${entry.timedOut ? 'text-rose-300' : 'text-slate-300'}`}>
                                Phase 2 (read) — region {k + 1}
                                {entry.timedOut
                                  ? ` — timed out after ${entry.timeoutSeconds ?? '?'}s · ${entry.partialChars ?? entry.raw?.length ?? 0} chars streamed`
                                  : entry.attempt ? ` — pass ${entry.attempt}` : ''}
                              </summary>
                              <pre className="px-2 py-2 text-slate-400 whitespace-pre-wrap break-words font-mono">{entry.raw}</pre>
                            </details>
                          )}
                          {rereadList.map((raw, i) => (
                            <details key={i} className="bg-slate-900/60 border border-slate-700 rounded ml-4">
                              <summary className="px-2 py-1 cursor-pointer text-slate-300">
                                Re-read — region {k + 1} — #{i + 1}
                              </summary>
                              <pre className="px-2 py-2 text-slate-400 whitespace-pre-wrap break-words font-mono">{raw}</pre>
                            </details>
                          ))}
                        </div>
                      );
                    });
                  })()}
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
  | { kind: 'reread'; diagram: DiagramExtract; originIdx: number; rereadNum: number }
  | { kind: 'reread-pending'; originIdx: number; rereadNum: number; diagram_number: number | null | undefined };

function ResultsView({ models, modelResults, analyzing, previewSrc, totalRegions, liveElapsedSec, regions }: ResultsViewProps) {
  const { t } = useLanguage();
  const effectiveAdmin = useEffectiveAdmin();
  const { diagram: diagramState, diagramRereadStart, diagramRereadTick, diagramRereadEnd, diagramRereadRawAdd } = useCoachesData();
  const { rereading, rereadTotal, rereadDone } = diagramState;
  const readerLabel = t('coaches.diagram.readerLabel');
  const [selectedModelId, setSelectedModelId] = useState<string>(models[0]?.id || '');
  const [selectedDiagramIdx, setSelectedDiagramIdx] = useState(0);
  // Per-region-index re-read results (admin-only). Each region's array preserves arrival order.
  const [rereads, setRereads] = useState<Record<number, DiagramExtract[]>>({});
  const [rereadCount, setRereadCount] = useState(1);
  const [rereadOriginIdx, setRereadOriginIdx] = useState<number | null>(null);
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
  const entryNumber = (e: DiagramEntry) => {
    if (e.kind === 'pending') return e.region.diagram_number;
    if (e.kind === 'reread-pending') return e.diagram_number;
    return e.diagram.diagram_number;
  };
  const allHaveNumbers = rawEntries.length > 0 && rawEntries.every(e => typeof entryNumber(e) === 'number');
  const orderedEntries = allHaveNumbers
    ? [...rawEntries].sort((a, b) => (entryNumber(a) ?? 0) - (entryNumber(b) ?? 0))
    : rawEntries;
  // Interleave re-reads right after their original entry; while a reread
  // batch is in flight for this origin, append disabled placeholders for
  // the still-pending requests (same pattern used for phase-2 reads).
  const entries: DiagramEntry[] = [];
  for (const e of orderedEntries) {
    entries.push(e);
    const landed = rereads[e.originIdx] ?? [];
    landed.forEach((rr, i) => {
      entries.push({ kind: 'reread', diagram: rr, originIdx: e.originIdx, rereadNum: i + 1 });
    });
    if (rereading && rereadOriginIdx === e.originIdx) {
      const pendingCount = Math.max(0, rereadTotal - rereadDone);
      const originNum = entryNumber(e);
      for (let i = 0; i < pendingCount; i++) {
        entries.push({ kind: 'reread-pending', originIdx: e.originIdx, rereadNum: landed.length + i + 1, diagram_number: originNum });
      }
    }
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
            const num = entry.kind === 'pending'
              ? entry.region.diagram_number
              : entry.kind === 'reread-pending'
                ? entry.diagram_number
                : entry.diagram.diagram_number;
            const base = typeof num === 'number'
              ? `${t('coaches.diagram.diagramLabel')} #${num}`
              : `${t('coaches.diagram.diagramLabel')} ${i + 1} / ${entryCount || (analyzing ? '?' : 1)}`;
            const label = entry.kind === 'reread' || entry.kind === 'reread-pending'
              ? `${base} — Re-read ${entry.rereadNum}`
              : base;
            const isPending = entry.kind === 'pending' || entry.kind === 'reread-pending';
            return (
              <option key={i} value={i} disabled={isPending}>
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
          setRereadError(null);
          setRereadOriginIdx(originIdx);
          diagramRereadStart(rereadCount);
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
          let firstError: string | null = null;
          let successCount = 0;
          try {
            const requests = Array.from({ length: rereadCount }, () =>
              axios.post('/api/coaches/reread-region', { crop_data_url: cropUrl, active_color: activeColor })
                .then(resp => {
                  if (typeof resp.data?.raw === 'string') {
                    diagramRereadRawAdd(originIdx, resp.data.raw);
                  }
                  if (resp.data?.fen) {
                    successCount += 1;
                    const fresh: DiagramExtract = { ...meta, fen: resp.data.fen };
                    setRereads(prev => ({ ...prev, [originIdx]: [...(prev[originIdx] ?? []), fresh] }));
                  }
                })
                .catch(err => {
                  if (!firstError) {
                    const e = err as { response?: { data?: { error?: string } }; message?: string };
                    firstError = e?.response?.data?.error ?? e?.message ?? 'Re-read failed';
                  }
                })
                .finally(() => diagramRereadTick())
            );
            await Promise.all(requests);
            if (firstError && successCount === 0) setRereadError(firstError);
          } finally {
            setRereadOriginIdx(null);
            diagramRereadEnd();
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
              if (entry.kind === 'reread-pending') {
                // The user can't select a pending placeholder (disabled), but the
                // fallback to entries[0] can land here momentarily during a render.
                const originEntry = rawEntries.find(e => e.originIdx === entry.originIdx);
                if (originEntry?.kind === 'pending') return <PendingDiagram region={originEntry.region} />;
                if (originEntry?.kind === 'ready') return <FenEntry diagram={originEntry.diagram} previewSrc={previewSrc} />;
                return null;
              }
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
  const [copied, setCopied] = useState(false);
  const { white_player, black_player, region } = diagram;
  const [editedFen, setEditedFen] = useState(diagram.fen);
  const historyRef = useRef<string[]>([]);

  // Reset edited FEN and undo stack when the source diagram changes
  useEffect(() => {
    setEditedFen(diagram.fen);
    historyRef.current = [];
  }, [diagram.fen]);

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

      <EditableBoard fen={editedFen} onChange={handleBoardChange} />

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
