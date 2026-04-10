// Diagram → FEN panel — thin view, state lives in CoachesDataContext

import { useState, useRef, useEffect, useCallback } from 'react';
import { ImageIcon, Clock, Copy, Check } from 'lucide-react';
import { LichessStudyButton } from './scoresheet/ExportButtons';
import { ImageZoomModal } from '../components/ImageZoomModal';
import { ProcessingProgressBar } from '../components/ProcessingProgressBar';
import { Chess } from 'chess.js';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelShell } from '../components/PanelShell';
import { useCoachesData } from '../contexts/CoachesDataContext';
import { compressImage } from '../utils/compressImage';
import type { DiagramModelResult, DiagramExtract } from '../contexts/CoachesDataContext';

export function DiagramToFenPanel() {
  const { t } = useLanguage();
  const fileRef = useRef<HTMLInputElement>(null);
  const { diagram, diagramSetImage, diagramAnalyze, diagramClear } = useCoachesData();
  const { preview, models, modelResults, analyzing, startTime, error, regions, regionCount, regionsRead } = diagram;
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
                // Progress: 10% for region detection, then 10-100% for reading each region
                const pct = regionCount
                  ? Math.round(10 + (regionsRead || 0) / regionCount * 90)
                  : regions ? 10 : 0;
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

              <div className="relative mx-auto inline-block">
                <img
                  src={preview}
                  alt="Diagram"
                  className={`rounded-xl cursor-pointer hover:opacity-90 transition-all ${
                    !analyzing && models.length === 0 ? 'max-h-[65vh]' : 'max-h-80'
                  }`}
                  onClick={() => setShowImageModal(true)}
                />
                {regions && regions.length > 0 && (
                  <>
                    {regions.map((r, i) => (
                      <div
                        key={i}
                        className="absolute border-2 border-blue-400/70 rounded pointer-events-none"
                        style={{
                          left: `${r.x}%`,
                          top: `${r.y}%`,
                          width: `${r.width}%`,
                          height: `${r.height}%`,
                        }}
                      >
                        <span className="absolute -top-4 left-1 text-[10px] text-blue-400 font-bold">{i + 1}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>

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
                <ResultsView models={models} modelResults={modelResults} analyzing={analyzing} previewSrc={preview} />
              )}
            </div>
          )}

      {showImageModal && preview && (
        <ImageZoomModal src={preview} alt="Diagram" onClose={() => setShowImageModal(false)} />
      )}
    </PanelShell>
  );
}

interface ResultsViewProps {
  models: { id: string; name: string }[];
  modelResults: Record<string, DiagramModelResult>;
  analyzing: boolean;
  previewSrc?: string;
}

// Translate backend reader names like "Reader 1" → "Lecteur 1" (FR)
function localizeReaderName(name: string | undefined, readerLabel: string): string {
  if (!name) return '';
  const match = name.match(/^Reader\s+(\d+)$/);
  return match ? `${readerLabel} ${match[1]}` : name;
}

function ResultsView({ models, modelResults, analyzing, previewSrc }: ResultsViewProps) {
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
          disabled={diagramCount <= 1}
          className={`${selectClass} ${diagramCount <= 1 ? 'opacity-50' : ''}`}
        >
          {Array.from({ length: Math.max(diagramCount, 1) }, (_, i) => (
            <option key={i} value={i}>
              {t('coaches.diagram.diagramLabel')} {i + 1} / {analyzing ? '?' : Math.max(diagramCount, 1)}
            </option>
          ))}
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

function FenEntry({ diagram, previewSrc }: { diagram: DiagramExtract; previewSrc?: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const { fen, white_player, black_player, region } = diagram;

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(fen); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = fen;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const validFen = (() => {
    try { new Chess(fen); return true; } catch { return false; }
  })();

  // Pull "w" or "b" out of the FEN's active color field
  const activeColor = fen.split(' ')[1];
  const sideToMoveLabel =
    activeColor === 'b' ? t('coaches.diagram.blackToPlay') : t('coaches.diagram.whiteToPlay');
  const hasPlayers = !!(white_player || black_player);

  return (
    <div className="space-y-3">
      {previewSrc && region && (
        <div
          className="relative mx-auto overflow-hidden rounded-lg border border-slate-600"
          style={{
            width: '100%',
            maxWidth: '400px',
            aspectRatio: `${region.width} / ${region.height}`,
          }}
        >
          <img
            src={previewSrc}
            alt="Diagram region"
            className="absolute"
            style={{
              width: `${100 / (region.width / 100)}%`,
              height: `${100 / (region.height / 100)}%`,
              left: `-${region.x / region.width * 100}%`,
              top: `-${region.y / region.height * 100}%`,
            }}
          />
        </div>
      )}
      {validFen && <StaticBoard fen={fen} />}

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
      <LichessStudyButton
        fen={fen}
        chapterName={[white_player, black_player].filter(Boolean).join(' vs ') || 'Diagram'}
      />
    </div>
  );
}

import { pieceImageUrl, BOARD_LIGHT as LIGHT, BOARD_DARK as DARK } from '../utils/pieces';

function StaticBoard({ fen }: { fen: string }) {
  const rows = fen.split(' ')[0].split('/');
  const board: (string | null)[][] = rows.map(row => {
    const squares: (string | null)[] = [];
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') for (let i = 0; i < parseInt(ch); i++) squares.push(null);
      else squares.push(ch);
    }
    return squares;
  });

  return (
    <div className="mx-auto rounded-lg overflow-hidden shadow-lg" style={{ maxWidth: 400 }}>
      <div className="grid grid-cols-8 grid-rows-8 aspect-square">
        {board.map((row, r) =>
          row.map((piece, c) => {
            const isLight = (r + c) % 2 === 0;
            return (
              <div
                key={`${r}-${c}`}
                className="relative select-none"
                style={{ backgroundColor: isLight ? LIGHT : DARK }}
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
                {piece && (
                  <img
                    src={pieceImageUrl(piece)}
                    alt=""
                    className="absolute inset-[5%] w-[90%] h-[90%] pointer-events-none"
                    draggable={false}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
