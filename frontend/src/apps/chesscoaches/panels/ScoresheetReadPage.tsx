// Scoresheet reader page — reads scoresheets with Gemini, supports iterative correction

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Upload, ImageIcon, Clock, BookOpen, Check, Play, RotateCcw, Square, ExternalLink, X, Crop } from 'lucide-react';
import ReactCrop from 'react-image-crop';
import type { Crop as CropType, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { PanelShell } from '../components/PanelShell';
import { UploadBox } from '../components/UploadBox';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useCoachesData, getCoachesPrefs, saveCoachesPrefs } from '../contexts/CoachesDataContext';
import { compressImage } from '../utils/compressImage';
import { BoardPreview } from '../components/BoardPreview';
import { Chess } from 'chess.js';
import type { ScoresheetMove as Move, ScoresheetReadEntry as ReadEntry } from '../contexts/CoachesDataContext';

// Parse a moves.csv file into ground truth data
function parseMovesCsv(csv: string): { white_player: string; black_player: string; result: string; moves: Move[] } | null {
  const lines = csv.trim().split('\n');
  let white_player = '', black_player = '', result = '*';
  const moves: Move[] = [];
  let inMoves = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed === 'move,white,black') { inMoves = true; continue; }
    if (!inMoves) {
      const [key, ...rest] = trimmed.split(',');
      const val = rest.join(',');
      if (key === 'white_player') white_player = val;
      else if (key === 'black_player') black_player = val;
      else if (key === 'result') result = val;
    } else {
      const [num, white, black] = trimmed.split(',');
      const move: Move = { number: parseInt(num), white };
      if (black) move.black = black;
      moves.push(move);
    }
  }
  if (moves.length === 0) return null;
  return { white_player, black_player, result, moves };
}

// Fetch ground truth CSV for a scoresheet (by filename stem)
const groundTruthCache = new Map<string, { white_player: string; black_player: string; result: string; moves: Move[] } | null>();

async function fetchGroundTruth(filename: string | null): Promise<{ white_player: string; black_player: string; result: string; moves: Move[] } | null> {
  if (!filename) return null;
  const stem = filename.replace(/\.[^.]+$/, '');
  if (groundTruthCache.has(stem)) return groundTruthCache.get(stem)!;
  try {
    const res = await fetch(`/scoresheets/${stem}/moves.csv`);
    if (!res.ok) { groundTruthCache.set(stem, null); return null; }
    const csv = await res.text();
    const parsed = parseMovesCsv(csv);
    groundTruthCache.set(stem, parsed);
    return parsed;
  } catch {
    groundTruthCache.set(stem, null);
    return null;
  }
}

function buildPgn(moves: Move[], meta?: { white?: string; black?: string; result?: string }): string {
  const headers = [
    `[White "${meta?.white || '?'}"]`,
    `[Black "${meta?.black || '?'}"]`,
    `[Result "${meta?.result || '*'}"]`,
  ].join('\n');
  const moveText = moves.map(m =>
    `${m.number}. ${m.white}${m.black ? ' ' + m.black : ''}`
  ).join(' ');
  return `${headers}\n\n${moveText} ${meta?.result || '*'}\n`;
}


interface AccuracyStats {
  accuracy: number;
  mistakesThatAreIllegal: number | null;  // % of reading mistakes that are also illegal
  illegalThatAreMistakes: number | null;   // % of illegal moves that are also reading mistakes
}

/** Compare two SAN moves tolerating capture 'x' differences (Bxc6 ≡ Bc6). */
function movesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  // Strip all 'x' and compare
  return a.replace(/x/g, '') === b.replace(/x/g, '');
}

function computeStats(modelMoves: Move[], gtMoves: Move[]): AccuracyStats | null {
  const total = gtMoves.reduce((n, m) => n + 1 + (m.black ? 1 : 0), 0);
  if (total === 0) return null;

  let correct = 0;
  let mistakes = 0;
  let illegal = 0;
  let mistakesAndIllegal = 0;

  for (let i = 0; i < gtMoves.length; i++) {
    const gt = gtMoves[i];
    const mm = modelMoves[i];
    for (const color of ['white', 'black'] as const) {
      if (color === 'black' && !gt.black) continue;
      const gtVal = gt[color] || '';
      const mmVal = mm?.[color] || '';
      const isMistake = !movesMatch(mmVal, gtVal);
      const legalKey = `${color}_legal` as const;
      const isIllegal = mm?.[legalKey] === false;
      if (!isMistake) correct++;
      if (isMistake) mistakes++;
      if (isIllegal) illegal++;
      if (isMistake && isIllegal) mistakesAndIllegal++;
    }
  }

  return {
    accuracy: Math.round((correct / total) * 100),
    mistakesThatAreIllegal: mistakes > 0 ? Math.round((mistakesAndIllegal / mistakes) * 100) : null,
    illegalThatAreMistakes: illegal > 0 ? Math.round((mistakesAndIllegal / illegal) * 100) : null,
  };
}

export function ScoresheetReadPage() {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    scoresheet, scoresheetSetImage, scoresheetStartOneRead,
    scoresheetStartMultipleReads, scoresheetStopMultipleReads,
    scoresheetHandleEditSave, scoresheetCancel, scoresheetClear,
  } = useCoachesData();

  const { preview, fileName, error, modelResults, reReads, models, autoRunning, startTime, analyzing, azureResult } = scoresheet;

  const [groundTruth, setGroundTruth] = useState<{ white_player: string; black_player: string; result: string; moves: Move[] } | null>(null);
  useEffect(() => {
    setGroundTruth(null);
    fetchGroundTruth(fileName).then(setGroundTruth);
  }, [fileName]);

  // Pick up shared image from Web Share Target
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('shared') !== '1') return;
    // Clean up URL
    const url = new URL(window.location.href);
    url.searchParams.delete('shared');
    window.history.replaceState({}, '', url.pathname + url.search);
    // Retrieve file from SW cache
    (async () => {
      try {
        const cache = await caches.open('share-target-temp');
        const response = await cache.match('/shared-image');
        if (!response) return;
        const blob = await response.blob();
        const name = response.headers.get('X-File-Name') || 'shared-scoresheet.jpg';
        const raw = new File([blob], name, { type: blob.type });
        const { file: compressed, preview: dataUrl } = await compressImage(raw);
        scoresheetSetImage(compressed, dataUrl, name);
        await cache.delete('/shared-image');
      } catch { /* ignore */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [showImageModal, setShowImageModal] = useState(false);
  const closeModal = useCallback(() => setShowImageModal(false), []);
  useEffect(() => {
    if (!showImageModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showImageModal, closeModal]);

  const buildDisagreementMap = useCallback((moves: Move[], gtMoves: Move[]) => {
    const map = new Map<number, { white: boolean; black: boolean }>();
    const maxLen = Math.max(moves.length, gtMoves.length);
    for (let i = 0; i < maxLen; i++) {
      const modelMove = moves[i];
      const gtMove = gtMoves[i];
      const whiteDiff = !movesMatch(modelMove?.white || '', gtMove?.white || '');
      const blackDiff = !movesMatch(modelMove?.black || '', gtMove?.black || '');
      if (whiteDiff || blackDiff) {
        map.set(i + 1, { white: whiteDiff, black: blackDiff });
      }
    }
    return map;
  }, []);

  // ── Crop state ──
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropFileName, setCropFileName] = useState('');
  const [crop, setCrop] = useState<CropType>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const cropImgRef = useRef<HTMLImageElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { preview: dataUrl } = await compressImage(file);
    setCropSrc(dataUrl);
    setCropFileName(file.name);
    // Default crop: full image so the user sees the handles immediately
    const defaultCrop: CropType = { unit: '%', x: 0, y: 0, width: 100, height: 100 };
    setCrop(defaultCrop);
    setCompletedCrop(undefined);
  };

  const handleCropConfirm = async () => {
    const img = cropImgRef.current;
    if (!img || !cropSrc) return;

    let finalFile: File;
    let finalPreview: string;

    if (completedCrop && completedCrop.width > 0 && completedCrop.height > 0) {
      // Crop the image
      const canvas = document.createElement('canvas');
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;
      canvas.width = completedCrop.width * scaleX;
      canvas.height = completedCrop.height * scaleY;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(
        img,
        completedCrop.x * scaleX, completedCrop.y * scaleY,
        completedCrop.width * scaleX, completedCrop.height * scaleY,
        0, 0, canvas.width, canvas.height,
      );
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.90)
      );
      finalFile = new File([blob], cropFileName.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
      finalPreview = canvas.toDataURL('image/jpeg', 0.90);
    } else {
      // No crop — use full image
      const res = await fetch(cropSrc);
      const blob = await res.blob();
      finalFile = new File([blob], cropFileName.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
      finalPreview = cropSrc;
    }

    console.log(`[Scoresheet] Cropped image: ${(finalFile.size / 1024).toFixed(0)} KB`);
    scoresheetSetImage(finalFile, finalPreview, cropFileName);
    setCropSrc(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCropCancel = () => {
    setCropSrc(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startOneRead = scoresheetStartOneRead;
  const startMultipleReads = () => groundTruth && scoresheetStartMultipleReads(groundTruth.moves);
  const stopMultipleReads = scoresheetStopMultipleReads;

  // Move click handler (unused for now — each model has its own board)
  const handleMoveClick = useCallback((_moves: Move[], _ply: number) => {}, []);

  return (
    <PanelShell title={t('coaches.navScoresheets')}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {cropSrc ? (
            /* ── Crop step ── */
            <div className="space-y-4">
              <div className="flex justify-center h-[36px] items-center">
                <p className="text-slate-200 text-base font-medium text-center">{t('coaches.cropHint')}</p>
              </div>
              <div className="flex justify-center max-w-sm mx-auto">
                <ReactCrop
                  crop={crop}
                  onChange={setCrop}
                  onComplete={setCompletedCrop}
                >
                  <img
                    ref={cropImgRef}
                    src={cropSrc}
                    alt="Crop"
                    className="rounded-lg max-h-[50vh]"
                  />
                </ReactCrop>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={handleCropCancel}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors"
                >
                  {t('coaches.cancel')}
                </button>
                <button
                  onClick={handleCropConfirm}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                >
                  <Crop className="w-3.5 h-3.5" />
                  {t('coaches.cropConfirm')}
                </button>
              </div>
            </div>
          ) : !preview ? (
            <UploadBox
              onClick={() => fileInputRef.current?.click()}
              icon={<ImageIcon className="w-10 h-10 text-slate-400" />}
              title={t('coaches.uploadPrompt')}
            />
          ) : (
            <div className="space-y-4">
              {/* Replace button */}
              <div className="flex justify-center h-[36px] items-center">
                <button
                  onClick={() => { scoresheetClear(); fileInputRef.current?.click(); }}
                  className="bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  {t('coaches.replaceImage')}
                </button>
              </div>

              {/* Before results: centered image + buttons */}
              {models.length === 0 && (
                <>
                  <img
                    src={preview}
                    alt="Scoresheet"
                    className="rounded-xl max-h-[50vh] max-w-sm mx-auto cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setShowImageModal(true)}
                  />
                  {/* Run buttons */}
                  {!analyzing && !autoRunning && (
                    <div className="flex items-center justify-center gap-3">
                      <button
                        onClick={startOneRead}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Run one read
                      </button>
                      {groundTruth && (
                        <button
                          onClick={startMultipleReads}
                          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Run multiple reads
                        </button>
                      )}
                    </div>
                  )}
                  {autoRunning && (
                    <div className="flex items-center justify-center">
                      <button
                        onClick={stopMultipleReads}
                        className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg transition-colors"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        Stop
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Error */}
              {error && <p className="text-red-400 text-center py-4">{error}</p>}

              {/* Analyzing spinner */}
              {analyzing && (
                <div className="flex items-center justify-center gap-2 text-slate-400 animate-pulse py-4">
                  <Clock className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Analyzing scoresheet...</span>
                  <button onClick={scoresheetCancel} className="text-slate-500 hover:text-slate-300 transition-colors ml-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Results: one row per model — [image | GT | read | board] */}
              {models.length > 0 && (() => {
                const firstResult = modelResults[models[0].id]?.result;
                const sheetColumns = (firstResult as any)?.columns || 1;
                const rowsPerColumn = (firstResult as any)?.rows_per_column || null;
                return (
                <div className="space-y-8">
                  {models.map((m) => {
                    const mr = modelResults[m.id];
                    const extraReads = reReads[m.id] || [];
                    const allReads: ReadEntry[] = mr?.result
                      ? [{ moves: mr.result.moves, elapsed: mr.elapsed, warnings: mr.warnings, error: mr.error }, ...extraReads]
                      : [];
                    const meta = mr?.result ? { white: mr.result.white_player, black: mr.result.black_player, result: mr.result.result } : undefined;
                    const handleEditSave = (readIdx: number, confirmed: Move[], correctionKey: string) => {
                      scoresheetHandleEditSave(m.id, readIdx, confirmed, correctionKey);
                    };
                    const latestMoves = allReads.length > 0 ? allReads[allReads.length - 1].moves : [];

                    return (
                      <div key={m.id}>
                        <h2 className="text-sm font-medium text-slate-300 mb-2 text-center">{mr?.name || m.name}</h2>
                        <div className="flex items-start">
                          {/* Left: image centered in remaining space */}
                          <div className="flex-1 hidden md:flex justify-center items-start">
                            <img
                              src={preview}
                              alt="Scoresheet"
                              className="rounded-xl max-w-[200px] object-contain object-top cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => setShowImageModal(true)}
                            />
                          </div>
                          {/* Center: tables */}
                          <div className="flex flex-wrap gap-3 items-start flex-shrink-0">
                            {groundTruth && <GroundTruthPanel groundTruth={groundTruth} fileName={fileName} onUpdate={setGroundTruth} sheetColumns={sheetColumns} rowsPerColumn={rowsPerColumn} />}
                            {!mr ? (
                              <ModelPanelLoading name={m.name} startTime={startTime} />
                            ) : (
                              allReads.map((read, readIdx) => (
                                <MovesPanel
                                  key={readIdx}
                                  label={`Read ${readIdx + 1}`}
                                  moves={read.moves}
                                  groundTruthMoves={groundTruth?.moves}
                                  disagreements={groundTruth ? buildDisagreementMap(read.moves, groundTruth.moves) : new Map()}
                                  elapsed={read.elapsed}
                                  warnings={read.warnings}
                                  error={read.error}
                                  meta={meta}
                                  fileName={fileName}
                                  rereading={read.rereading}
                                  corrections={read.corrections}
                                  onEditSave={(confirmed, corrKey) => handleEditSave(readIdx, confirmed, corrKey)}
                                  onMoveClick={handleMoveClick}
                                  sheetColumns={sheetColumns}
                                  rowsPerColumn={rowsPerColumn}
                                />
                              ))
                            )}
                          </div>
                          {/* Right: board centered in remaining space */}
                          <div className="flex-1 hidden md:flex justify-center items-center self-stretch">
                            <ModelBoard moves={latestMoves} />
                          </div>
                        </div>
                        {mr && allReads.length > 0 && !allReads.some(r => r.rereading) && (
                          <div className="text-xs text-slate-400 mt-1 px-1">
                            {allReads.length} {allReads.length === 1 ? 'run' : 'runs'} — {allReads.reduce((sum, r) => sum + (r.elapsed || 0), 0)}s total
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Azure DI section */}
                  {azureResult && (
                    <>
                      <div className="border-t border-slate-600 my-4" />
                      <h2 className="text-sm font-medium text-slate-300 mb-2 px-1">Azure Document Intelligence</h2>
                      {azureResult.loading ? (
                        <div className="flex items-center justify-center gap-2 text-slate-400 animate-pulse py-4">
                          <Clock className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Analyzing with Azure DI...</span>
                          <button onClick={scoresheetCancel} className="text-slate-500 hover:text-slate-300 transition-colors ml-1">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : azureResult.error ? (
                        <p className="text-red-400 text-center py-3 text-xs px-2">{azureResult.error}</p>
                      ) : azureResult.rawTables && azureResult.rawTables.length > 0 ? (
                        <div className="flex flex-wrap gap-3 items-start">
                          {azureResult.rawTables.map((t) => (
                            <div key={t.index} className="bg-slate-700/50 rounded-xl overflow-hidden self-start min-w-[200px]">
                              <div className="px-2 py-2 border-b border-slate-600 flex items-center justify-center gap-2">
                                <span className="text-slate-100 font-medium text-xs">Raw Table {t.index + 1}</span>
                                <span className="text-slate-400 text-xs">{t.rowCount}r x {t.columnCount}c</span>
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  <span className="text-slate-400 text-xs">{azureResult.elapsed}s</span>
                                </div>
                              </div>
                              <table className="w-full text-xs">
                                <tbody>
                                  {t.rows.map((row, ri) => (
                                    <tr key={ri} className="border-b border-slate-600/30 last:border-0">
                                      {row.map((cell, ci) => (
                                        <td key={ci} className="px-1.5 py-0.5 font-mono text-slate-100 text-center">
                                          {cell || <span className="text-slate-600">-</span>}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-500 text-center py-3 text-xs">No tables detected</p>
                      )}
                    </>
                  )}
                </div>
                );
              })()}
            </div>
          )}

      {/* Fullscreen image modal */}
      {showImageModal && preview && (
        <div
          onClick={closeModal}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[1.5px] cursor-pointer"
        >
          <img
            src={preview}
            alt="Scoresheet"
            className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain"
          />
        </div>
      )}
    </PanelShell>
  );
}

function EditableCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        className="cursor-pointer hover:bg-emerald-800/40 px-0.5 rounded"
      >
        {value || '\u00A0'}
      </span>
    );
  }
  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== value) onSave(draft); }}
      onKeyDown={e => { if (e.key === 'Enter') { setEditing(false); if (draft !== value) onSave(draft); } if (e.key === 'Escape') { setEditing(false); setDraft(value); } }}
      className="bg-slate-900 text-slate-100 font-mono text-xs text-center w-16 px-1 py-0 rounded border border-emerald-500 outline-none"
      style={{ fontSize: '16px' }}
    />
  );
}

function ModelBoard({ moves }: { moves: Move[] }) {
  const [ply, setPly] = useState(0);

  const data = useMemo(() => {
    const chess = new Chess();
    const fens: string[] = [chess.fen()];
    const lastMoves: ({ from: string; to: string } | null)[] = [null];
    for (const m of moves) {
      for (const color of ['white', 'black'] as const) {
        const san = m[color];
        if (!san) continue;
        try {
          const result = chess.move(san);
          fens.push(chess.fen());
          lastMoves.push(result ? { from: result.from, to: result.to } : null);
        } catch {
          fens.push(chess.fen());
          lastMoves.push(null);
        }
      }
    }
    return { fens, lastMoves };
  }, [moves]);

  const maxPly = data.fens.length - 1;
  const safePly = Math.min(ply, maxPly);

  // Auto-set to last position when moves change
  useEffect(() => { setPly(maxPly); }, [maxPly]);

  return (
    <div className="flex flex-col items-center w-[250px]">
      <BoardPreview fen={data.fens[safePly]} lastMove={data.lastMoves[safePly]} />
      <div className="flex justify-center gap-1.5 mt-2">
        <button onClick={() => setPly(0)} className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors">⏮</button>
        <button onClick={() => setPly(p => Math.max(0, p - 1))} className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors">◀</button>
        <button onClick={() => setPly(p => Math.min(maxPly, p + 1))} className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors">▶</button>
        <button onClick={() => setPly(maxPly)} className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors">⏭</button>
      </div>
    </div>
  );
}

function GroundTruthPanel({ groundTruth, fileName, onUpdate, sheetColumns = 1, rowsPerColumn }: {
  groundTruth: { white_player: string; black_player: string; result: string; moves: Move[] };
  fileName?: string | null;
  onUpdate: (gt: { white_player: string; black_player: string; result: string; moves: Move[] }) => void;
  sheetColumns?: number;
  rowsPerColumn?: number | null;
}) {
  const [validatedMoves, setValidatedMoves] = useState<Move[]>(groundTruth.moves);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/coaches/validate-moves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moves: groundTruth.moves }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(json => { if (json && !cancelled) setValidatedMoves(json.moves); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [groundTruth.moves]);

  const saveToServer = useCallback((updated: { white_player: string; black_player: string; result: string; moves: Move[] }) => {
    if (!fileName) return;
    const stem = fileName.replace(/\.[^.]+$/, '');
    setSaving(true);
    fetch('/api/coaches/ground-truth', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: stem, ...updated, moves: updated.moves.map(m => ({ number: m.number, white: m.white, black: m.black })) }),
    })
      .then(() => { groundTruthCache.delete(stem); })
      .catch(() => {})
      .finally(() => setSaving(false));
  }, [fileName]);

  const updateMove = useCallback((moveNumber: number, color: 'white' | 'black', value: string) => {
    const newMoves = groundTruth.moves.map(m =>
      m.number === moveNumber ? { ...m, [color]: value } : m
    );
    const updated = { ...groundTruth, moves: newMoves };
    onUpdate(updated);
    saveToServer(updated);
  }, [groundTruth, onUpdate, saveToServer]);

  return (
    <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-xl overflow-hidden self-start w-[380px]">
      <div className="px-2 py-2 border-b border-emerald-700/50 flex items-center gap-1.5">
        <BookOpen className="w-3 h-3 text-emerald-400" />
        <span className="text-emerald-300 font-medium text-xs">Ground Truth</span>
        {saving && <span className="text-emerald-400/50 text-[9px]">saving...</span>}
      </div>

      <div className="px-2 py-1 border-b border-emerald-700/30 text-[10px] text-emerald-400/60 min-h-[22px]">
        {'\u00A0'}
      </div>

      <div className="px-2 py-1.5 border-b border-emerald-700/30 text-xs text-center">
        <div className="flex flex-wrap gap-x-3 justify-center">
          <div><span className="text-slate-400">W:</span> <span className="text-slate-200">{groundTruth.white_player}</span></div>
          <div><span className="text-slate-400">B:</span> <span className="text-slate-200">{groundTruth.black_player}</span></div>
        </div>
        <div>
          <span className="text-slate-400">Result:</span> <span className="text-slate-200">{groundTruth.result}</span>
        </div>
      </div>

      {(() => {
        const split = sheetColumns > 1 || validatedMoves.length > 15;
        const splitAt = split ? (rowsPerColumn || Math.ceil(validatedMoves.length / sheetColumns)) : validatedMoves.length;
        const leftMoves = validatedMoves.slice(0, splitAt);
        const rightMoves = split ? validatedMoves.slice(splitAt) : [];
        const rows = Math.max(leftMoves.length, rightMoves.length);

        const renderCell = (move: Move | undefined, color: 'white' | 'black') => {
          if (!move) return <td className="px-1.5 py-0.5" />;
          const val = move[color];
          const legal = move[`${color}_legal` as const];
          return (
            <td className="px-1.5 py-0.5 font-mono text-slate-100 text-center">
              <span className="inline-flex items-center gap-1">
                <EditableCell value={val || ''} onSave={v => updateMove(move.number, color, v)} />
                {legal === true && <span className="text-green-400 text-[9px]">&#10003;</span>}
                {legal === false && <span className="text-red-400 text-[9px]">&#10007;</span>}
              </span>
            </td>
          );
        };

        return (
          <table className="w-full text-xs">
            <thead className="bg-emerald-900/40">
              <tr className="border-b border-emerald-700/50">
                <th className="px-1.5 py-1 text-slate-400 font-medium text-center w-6">#</th>
                <th className="px-1.5 py-1 text-slate-400 font-medium text-center">White</th>
                <th className="px-1.5 py-1 text-slate-400 font-medium text-center">Black</th>
                {split && <>
                  <th className="px-1.5 py-1 text-slate-400 font-medium text-center w-6 border-l border-emerald-700/50">#</th>
                  <th className="px-1.5 py-1 text-slate-400 font-medium text-center">White</th>
                  <th className="px-1.5 py-1 text-slate-400 font-medium text-center">Black</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, i) => {
                const left = leftMoves[i];
                const right = rightMoves[i];
                return (
                  <tr key={i} className="border-b border-emerald-700/20 last:border-0">
                    <td className="px-1.5 py-0.5 text-slate-500 text-center font-mono">{left?.number}</td>
                    {renderCell(left, 'white')}
                    {renderCell(left, 'black')}
                    {split && <>
                      <td className="px-1.5 py-0.5 text-slate-500 text-center font-mono border-l border-emerald-700/30">{right?.number}</td>
                      {renderCell(right, 'white')}
                      {renderCell(right, 'black')}
                    </>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      })()}
      <div className="px-2 py-1.5 border-t border-emerald-700/50 text-center space-y-0.5 flex flex-col items-center justify-center">
        <div>
          <span className="text-xs font-medium text-green-400">100% accuracy</span>
        </div>
        <div className="text-[10px] text-emerald-400/40">{'\u00A0'}</div>
        <div className="text-[10px] text-emerald-400/40">{'\u00A0'}</div>
      </div>
      <ChesscomAnalysisButton
        moves={validatedMoves}
        meta={{ white: groundTruth.white_player, black: groundTruth.black_player, result: groundTruth.result }}
      />
      <LichessStudyButton
        moves={validatedMoves}
        meta={{ white: groundTruth.white_player, black: groundTruth.black_player, result: groundTruth.result }}
        fileName={fileName}
      />
    </div>
  );
}


function ModelPanelLoading({ name, startTime }: { name: string; startTime: number | null }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) return;
    setElapsed(Math.round((Date.now() - startTime) / 1000));
    const id = setInterval(() => setElapsed(Math.round((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startTime]);

  return (
    <div className="bg-slate-700/50 rounded-xl overflow-hidden self-start w-[380px]">
      <div className="px-2 py-2 border-b border-slate-600 flex items-center justify-center gap-2">
        <span className="text-slate-100 font-medium text-xs">{name}</span>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-slate-400" />
          <span className="text-slate-400 text-xs">{elapsed}s</span>
        </div>
      </div>
      <div className="flex items-center justify-center py-12">
        <span className="text-slate-500 text-xs">Analyzing scoresheet...</span>
      </div>
    </div>
  );
}

const WARNING_LABELS: Record<string, string> = {
  json_repaired: 'JSON repaired',
  unwrapped_array: 'Unwrapped array',
};

function MovesPanel({ label, moves, groundTruthMoves, disagreements, elapsed, warnings, error, meta, fileName, rereading, corrections, onEditSave, onMoveClick, sheetColumns = 1, rowsPerColumn }: {
  label: string;
  moves: Move[];
  groundTruthMoves?: Move[];
  disagreements: Map<number, { white: boolean; black: boolean }>;
  elapsed: number;
  warnings?: string[];
  error?: string;
  meta?: { white?: string; black?: string; result?: string };
  fileName?: string | null;
  rereading?: boolean;
  corrections?: Set<string>;
  onEditSave?: (confirmed: Move[], correctionKey: string) => void;
  onMoveClick?: (moves: Move[], ply: number) => void;
  sheetColumns?: number;
  rowsPerColumn?: number | null;
}) {
  const [editing, setEditing] = useState<{ moveIdx: number; color: 'white' | 'black'; value: string } | null>(null);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rereadStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  useEffect(() => {
    if (rereading) {
      rereadStartRef.current = Date.now();
      setLiveElapsed(0);
      const id = setInterval(() => setLiveElapsed(Math.round((Date.now() - rereadStartRef.current!) / 1000)), 1000);
      return () => clearInterval(id);
    }
  }, [rereading]);

  const handleSave = () => {
    if (!editing || !onEditSave) return;
    const editedMoveIdx = editing.moveIdx;
    const editedColor = editing.color;
    const editedValue = editing.value;
    setEditing(null);

    // Build confirmed moves: all moves up to and including the edited one
    const confirmed: Move[] = [];
    for (let i = 0; i <= editedMoveIdx; i++) {
      const m = { ...moves[i] };
      if (i === editedMoveIdx) {
        m[editedColor] = editedValue;
        if (editedColor === 'white') {
          delete m.black;
          delete m.black_legal;
        }
      }
      delete m.white_legal;
      delete m.black_legal;
      confirmed.push(m);
    }

    const correctionKey = `${moves[editedMoveIdx].number}-${editedColor}`;
    onEditSave(confirmed, correctionKey);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setEditing(null);
  };

  const stats = groundTruthMoves && moves.length > 0 ? computeStats(moves, groundTruthMoves) : null;

  return (
    <div className="bg-slate-700/50 rounded-xl overflow-hidden self-start w-[380px]">
      {/* Header */}
      <div className="px-2 py-2 border-b border-slate-600 flex items-center justify-center gap-2">
        <span className="text-slate-100 font-medium text-xs">{label}</span>
        <div className="flex items-center gap-1">
          <Clock className={`w-3 h-3 text-slate-400${rereading ? ' animate-spin' : ''}`} />
          <span className="text-slate-400 text-xs">{rereading ? liveElapsed : elapsed}s</span>
        </div>
      </div>

      {/* Warnings */}
      <div className="px-2 py-1 border-b border-slate-600/50 text-[10px] text-amber-400 min-h-[22px] text-center">
        {warnings && warnings.length > 0
          ? warnings.map(w => WARNING_LABELS[w] || w).join(' · ')
          : '\u00A0'}
      </div>

      {error && <p className="text-red-400 text-center py-3 text-xs px-2">{error}</p>}

      {/* Game info */}
      {meta && (
        <div className="px-2 py-1.5 border-b border-slate-600/50 text-xs text-center">
          <div className="flex flex-wrap gap-x-3 justify-center">
            <div><span className="text-slate-400">W:</span> <span className="text-slate-200">{meta.white || ''}</span></div>
            <div><span className="text-slate-400">B:</span> <span className="text-slate-200">{meta.black || ''}</span></div>
          </div>
          <div>
            <span className="text-slate-400">Result:</span> <span className="text-slate-200">{meta.result && meta.result !== '*' ? meta.result : ''}</span>
          </div>
        </div>
      )}

      {/* Moves table */}
      {moves.length > 0 && (() => {
        const split = sheetColumns > 1 || moves.length > 15;
        const splitAt = split ? (rowsPerColumn || Math.ceil(moves.length / sheetColumns)) : moves.length;
        const leftMoves = moves.slice(0, splitAt);
        const rightMoves = split ? moves.slice(splitAt) : [];
        const rows = Math.max(leftMoves.length, rightMoves.length);

        return (
          <table className="w-full text-xs">
            <thead className="bg-slate-700">
              <tr className="border-b border-slate-600">
                <th className="px-1.5 py-1 text-slate-400 font-medium text-center w-6">#</th>
                <th className="px-1.5 py-1 text-slate-400 font-medium text-center">White</th>
                <th className="px-1.5 py-1 text-slate-400 font-medium text-center">Black</th>
                {split && <>
                  <th className="px-1.5 py-1 text-slate-400 font-medium text-center w-6 border-l border-slate-600">#</th>
                  <th className="px-1.5 py-1 text-slate-400 font-medium text-center">White</th>
                  <th className="px-1.5 py-1 text-slate-400 font-medium text-center">Black</th>
                </>}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }, (_, i) => {
                const left = leftMoves[i];
                const right = rightMoves[i];
                const leftIdx = i;
                const rightIdx = splitAt + i;
                const dLeft = left ? disagreements.get(left.number) : undefined;
                const dRight = right ? disagreements.get(right.number) : undefined;

                const renderHalf = (move: Move | undefined, idx: number, d: { white: boolean; black: boolean } | undefined) => {
                  if (!move) return <><td className="px-1.5 py-0.5" /><td className="px-1.5 py-0.5" /><td className="px-1.5 py-0.5" /></>;
                  return <>
                    <td className="px-1.5 py-0.5 text-slate-500 text-center font-mono">{move.number}</td>
                    <MoveCell
                      value={move.white}
                      legal={move.white_legal}
                      highlight={d?.white}
                      corrected={corrections?.has(`${move.number}-white`)}
                      onClick={() => setEditing({ moveIdx: idx, color: 'white', value: move.white })}
                    />
                    <MoveCell
                      value={move.black || ''}
                      legal={move.black_legal}
                      corrected={corrections?.has(`${move.number}-black`)}
                      highlight={d?.black}
                      onClick={() => move.black !== undefined ? setEditing({ moveIdx: idx, color: 'black', value: move.black || '' }) : undefined}
                    />
                  </>;
                };

                return (
                  <tr key={i} className="border-b border-slate-600/30 last:border-0 cursor-pointer hover:bg-slate-600/30"
                    onClick={() => onMoveClick?.(moves, (left ? leftIdx : rightIdx) * 2 + ((left || right)?.black ? 2 : 1))}
                  >
                    {renderHalf(left, leftIdx, dLeft)}
                    {split && <>{right ? (
                      <>{renderHalf(right, rightIdx, dRight)}</>
                    ) : (
                      <><td className="px-1.5 py-0.5 border-l border-slate-600/30" /><td className="px-1.5 py-0.5" /><td className="px-1.5 py-0.5" /></>
                    )}</>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      })()}
      {/* Stats */}
      {stats && !rereading && (
        <div className="px-2 py-1.5 border-t border-slate-600/50 text-center space-y-0.5">
          <div>
            <span className={`text-xs font-medium ${stats.accuracy === 100 ? 'text-green-400' : stats.accuracy >= 80 ? 'text-amber-400' : 'text-red-400'}`}>
              {stats.accuracy}% accuracy
            </span>
          </div>
          <div className="text-[10px] text-slate-400">
            {stats.mistakesThatAreIllegal !== null ? `${stats.mistakesThatAreIllegal}% of mistakes are illegal` : '\u00A0'}
          </div>
          <div className="text-[10px] text-slate-400">
            {stats.illegalThatAreMistakes !== null ? `${stats.illegalThatAreMistakes}% of illegal are mistakes` : '\u00A0'}
          </div>
        </div>
      )}
      {rereading ? (
        <div className="flex items-center justify-center gap-1.5 py-2.5 border-t border-slate-600/50 text-xs text-blue-400 animate-pulse">
          <Clock className="w-3 h-3 animate-spin" />
          <span>Re-reading from edit...</span>
        </div>
      ) : moves.length > 0 && (<>
        <ChesscomAnalysisButton moves={moves} meta={meta} />
        <LichessStudyButton moves={moves} meta={meta} fileName={fileName} />
      </>)}

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[1.5px]"
          onClick={() => setEditing(null)}
        >
          <div
            className="bg-slate-800 rounded-xl p-4 min-w-[260px] shadow-xl border border-slate-600"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-slate-400 text-xs mb-2">
              Move {moves[editing.moveIdx]?.number} · {editing.color === 'white' ? 'White' : 'Black'}
            </div>
            <input
              ref={inputRef}
              value={editing.value}
              onChange={e => setEditing({ ...editing, value: e.target.value })}
              onKeyDown={handleKeyDown}
              className="w-full bg-slate-700 text-slate-100 font-mono text-sm px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleSave}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 rounded-lg transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-1.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChesscomAnalysisButton({ moves, meta }: {
  moves: Move[];
  meta?: { white?: string; black?: string; result?: string };
}) {
  const { t } = useLanguage();
  const handleClick = () => {
    const moveText = moves.map(m =>
      `${m.number}. ${m.white}${m.black ? ' ' + m.black : ''}`
    ).join(' ');
    const pgn = `[White "${meta?.white || '?'}"]\n[Black "${meta?.black || '?'}"]\n[Result "${meta?.result || '*'}"]\n[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]\n\n${moveText} ${meta?.result || '*'}`;
    window.open(`https://www.chess.com/analysis?pgn=${encodeURIComponent(pgn)}`, '_blank');
  };
  return (
    <button
      onClick={handleClick}
      className="w-full px-2 py-2.5 border-t border-slate-600/50 text-center text-xs text-slate-400 hover:bg-slate-600/40 hover:text-slate-200 transition-colors flex items-center justify-center gap-1.5"
    >
      <ExternalLink className="w-3 h-3" /> {t('coaches.lichess.openChesscom')}
    </button>
  );
}


function LichessStudyButton({ moves, meta, fileName }: {
  moves: Move[];
  meta?: { white?: string; black?: string; result?: string };
  fileName?: string | null;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [needsUsername, setNeedsUsername] = useState(false);
  const [studies, setStudies] = useState<{ id: string; name: string }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [success, setSuccess] = useState<{ studyId: string; studyName: string } | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchStudies = useCallback(async (username: string) => {
    setLoading(true);
    setError('');
    setStudies(null);
    try {
      const res = await fetch(`/api/coaches/lichess/studies?username=${encodeURIComponent(username)}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setStudies(json.studies);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOpen = () => {
    setSuccess(null);
    setError('');
    const prefs = getCoachesPrefs();
    if (prefs.lichess_username) {
      setOpen(true);
      setNeedsUsername(false);
      fetchStudies(prefs.lichess_username);
    } else {
      setOpen(true);
      setNeedsUsername(true);
      setUsernameInput('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleSaveUsername = () => {
    const trimmed = usernameInput.trim();
    if (!trimmed) return;
    saveCoachesPrefs({ lichess_username: trimmed });
    setNeedsUsername(false);
    fetchStudies(trimmed);
  };

  const handleChangeUser = () => {
    setNeedsUsername(true);
    setStudies(null);
    setUsernameInput(getCoachesPrefs().lichess_username || '');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelectStudy = async (study: { id: string; name: string }) => {
    setImporting(true);
    setError('');
    const pgn = buildPgn(moves, meta);
    const chapterName = fileName?.replace(/\.[^.]+$/, '') || [meta?.white, meta?.black].filter(Boolean).join(' vs ') || 'Scoresheet';
    try {
      const res = await fetch(`/api/coaches/lichess/studies/${study.id}/import-pgn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pgn, name: chapterName }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Import failed');
      setSuccess({ studyId: study.id, studyName: study.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setStudies(null);
    setError('');
    setNeedsUsername(false);
    setSuccess(null);
    setImporting(false);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="w-full px-2 py-2.5 border-t border-slate-600/50 text-center text-xs text-slate-400 hover:bg-slate-600/40 hover:text-slate-200 transition-colors flex items-center justify-center gap-1.5"
      >
        <ExternalLink className="w-3 h-3" /> {t('coaches.lichess.sendToStudy')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[1.5px]"
          onClick={handleClose}
        >
          <div
            className="bg-slate-800 rounded-xl p-4 min-w-[300px] max-w-[360px] shadow-xl border border-slate-600"
            onClick={e => e.stopPropagation()}
          >
            {success ? (
              <div className="text-center py-4">
                <Check className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <div className="text-slate-200 text-sm font-medium mb-1">{t('coaches.lichess.imported')}</div>
                <div className="text-slate-400 text-xs mb-3">{success.studyName}</div>
                <a
                  href={`https://lichess.org/study/${success.studyId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {t('coaches.lichess.openStudy')} <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  onClick={handleClose}
                  className="w-full mt-4 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-1.5 rounded-lg transition-colors"
                >
                  {t('coaches.lichess.close')}
                </button>
              </div>
            ) : needsUsername ? (
              <>
                <div className="text-slate-200 text-sm font-medium mb-1">{t('coaches.lichess.usernamePrompt')}</div>
                <div className="text-slate-500 text-xs mb-3">{t('coaches.lichess.usernameHint')}</div>
                <input
                  ref={inputRef}
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveUsername()}
                  placeholder="username"
                  className="w-full bg-slate-700 text-slate-100 text-sm px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleSaveUsername}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 rounded-lg transition-colors"
                  >
                    {t('coaches.lichess.save')}
                  </button>
                  <button
                    onClick={handleClose}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-1.5 rounded-lg transition-colors"
                  >
                    {t('coaches.lichess.cancel')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-slate-200 text-sm font-medium">{t('coaches.lichess.selectStudy')}</div>
                  <button
                    onClick={handleChangeUser}
                    className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {getCoachesPrefs().lichess_username} · {t('coaches.lichess.changeUser')}
                  </button>
                </div>
                {loading && (
                  <div className="flex items-center justify-center gap-2 text-slate-400 animate-pulse py-6">
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    <span className="text-xs">{t('coaches.lichess.loading')}</span>
                  </div>
                )}
                {importing && (
                  <div className="flex items-center justify-center gap-2 text-blue-400 animate-pulse py-6">
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    <span className="text-xs">{t('coaches.lichess.importing')}</span>
                  </div>
                )}
                {error && <p className="text-red-400 text-center py-3 text-xs">{error}</p>}
                {!importing && studies && studies.length === 0 && (
                  <p className="text-slate-500 text-center py-6 text-xs">{t('coaches.lichess.noStudies')}</p>
                )}
                {!importing && studies && studies.length > 0 && (
                  <div className="max-h-[300px] overflow-y-auto space-y-2">
                    {studies.map(s => (
                      <button
                        key={s.id}
                        onClick={() => handleSelectStudy(s)}
                        disabled={importing}
                        className="w-full text-center px-3 py-2 rounded-lg text-xs text-slate-200 bg-slate-700 hover:bg-slate-600 hover:text-white transition-colors disabled:opacity-50"
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={handleClose}
                  className="w-full mt-3 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-1.5 rounded-lg transition-colors"
                >
                  {t('coaches.lichess.cancel')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function MoveCell({ value, legal, highlight, corrected, onClick }: {
  value: string;
  legal?: boolean;
  highlight?: boolean;
  corrected?: boolean;
  onClick: () => void;
}) {
  const bg = corrected ? 'bg-green-900/50 text-green-200' : highlight ? 'bg-red-900/50 text-red-200' : 'text-slate-100';
  return (
    <td
      className={`px-1.5 py-0.5 font-mono text-center cursor-pointer hover:bg-slate-600/50 ${bg}`}
      onClick={onClick}
    >
      <span className="inline-flex items-center justify-center gap-1 w-full">
        {value}
        {legal === true && <span className="text-green-400 text-[9px]">&#10003;</span>}
        {legal === false && <span className="text-red-400 text-[9px]">&#10007;</span>}
      </span>
    </td>
  );
}
