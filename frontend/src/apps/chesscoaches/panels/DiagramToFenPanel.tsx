// Diagram → FEN panel — thin view, state lives in CoachesDataContext

import { useState, useRef, useEffect, useCallback } from 'react';
import { ImageIcon, Clock, Copy, Check, Loader2 } from 'lucide-react';
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
import { BOARD_LIGHT as LIGHT, BOARD_DARK as DARK } from '../utils/pieces';

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

interface RegionBox { x: number; y: number; width: number; height: number; }
interface Region extends RegionBox {
  tight_box?: RegionBox;
  padded_box?: RegionBox;
  selected_variant?: 'tight' | 'padded';
}

function RegionOverlay({ regions, showCandidates = false }: { regions: Region[]; showCandidates?: boolean }) {
  return (
    <>
      {regions.map((r, i) => {
        const color = REGION_COLORS[i % REGION_COLORS.length];
        const rejected = showCandidates && r.tight_box && r.padded_box
          ? (r.selected_variant === 'padded' ? r.tight_box : r.padded_box)
          : null;
        return (
          <div key={i} className="pointer-events-none">
            {rejected && (
              <div
                className="absolute rounded"
                style={{
                  left: `${rejected.x}%`,
                  top: `${rejected.y}%`,
                  width: `${rejected.width}%`,
                  height: `${rejected.height}%`,
                  border: `1px dashed ${color}`,
                  opacity: 0.5,
                }}
              />
            )}
            <div
              className="absolute rounded"
              style={{
                left: `${r.x}%`,
                top: `${r.y}%`,
                width: `${r.width}%`,
                height: `${r.height}%`,
                border: `3px solid ${color}`,
              }}
            >
              <span
                className="absolute top-1 left-1 text-sm font-bold leading-none"
                style={{ color }}
              >
                {i + 1}
              </span>
            </div>
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
                {regions && regions.length > 0 && <RegionOverlay regions={regions} showCandidates={effectiveAdmin} />}
              </div>
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
          overlay={regions && regions.length > 0 ? <RegionOverlay regions={regions} showCandidates={effectiveAdmin} /> : undefined}
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
  | { kind: 'ready'; diagram: DiagramExtract }
  | { kind: 'pending'; region: DiagramRegion };

function ResultsView({ models, modelResults, analyzing, previewSrc, totalRegions, liveElapsedSec, regions }: ResultsViewProps) {
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
  const rawDiagrams = mr?.diagrams ?? [];
  const regionList = regions ?? [];

  // Build entries per region index: ready (phase 2 done) or pending (crop known, reading in flight).
  const count = Math.max(totalRegions ?? 0, regionList.length, rawDiagrams.length);
  const rawEntries: DiagramEntry[] = [];
  for (let i = 0; i < count; i++) {
    const d = rawDiagrams[i];
    if (d) { rawEntries.push({ kind: 'ready', diagram: d }); continue; }
    const r = regionList[i];
    if (r) rawEntries.push({ kind: 'pending', region: r });
  }
  // Phase 1 already returns diagram_number for every region, so pending entries can be
  // sorted the same way as ready ones — no need to wait for phase 2 to finish.
  const entryNumber = (e: DiagramEntry) =>
    e.kind === 'ready' ? e.diagram.diagram_number : e.region.diagram_number;
  const allHaveNumbers = rawEntries.length > 0 && rawEntries.every(e => typeof entryNumber(e) === 'number');
  const entries = allHaveNumbers
    ? [...rawEntries].sort((a, b) => (entryNumber(a) ?? 0) - (entryNumber(b) ?? 0))
    : rawEntries;
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
          disabled={entryCount <= 1}
          className={`${selectClass} ${entryCount <= 1 ? 'opacity-50' : ''}`}
        >
          {entries.map((entry, i) => {
            const num = entry.kind === 'ready' ? entry.diagram.diagram_number : entry.region.diagram_number;
            const label = typeof num === 'number'
              ? `${t('coaches.diagram.diagramLabel')} #${num}`
              : `${t('coaches.diagram.diagramLabel')} ${i + 1} / ${entryCount || (analyzing ? '?' : 1)}`;
            return (
              <option key={i} value={i}>
                {label}
              </option>
            );
          })}
        </select>
      </div>

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
              return entry.kind === 'ready'
                ? <FenEntry diagram={entry.diagram} previewSrc={previewSrc} />
                : <PendingDiagram region={entry.region} />;
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
