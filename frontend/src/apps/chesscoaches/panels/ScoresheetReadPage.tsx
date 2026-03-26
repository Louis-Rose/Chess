// Scoresheet reader page — reads scoresheets with Gemini, supports iterative correction

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { Upload, ImageIcon, Clock, BookOpen, Check, ExternalLink, X, Crop, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';
import ReactCrop from 'react-image-crop';
import type { Crop as CropType, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { PanelShell } from '../components/PanelShell';
import { UploadBox } from '../components/UploadBox';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useCoachesData, getCoachesPrefs, saveCoachesPrefs } from '../contexts/CoachesDataContext';
import { compressImage } from '../utils/compressImage';
import { BoardPreview } from '../components/BoardPreview';
import { playMoveSound } from '../components/Chessboard';
import { Chess } from 'chess.js';
import type { ScoresheetMove as Move } from '../contexts/CoachesDataContext';

// Parse a moves.csv file into ground truth data
// Fetch ground truth for a scoresheet via API (by filename stem)
const groundTruthCache = new Map<string, { white_player: string; black_player: string; result: string; moves: Move[] } | null>();

async function fetchGroundTruth(filename: string | null): Promise<{ white_player: string; black_player: string; result: string; moves: Move[] } | null> {
  if (!filename) return null;
  const stem = filename.replace(/\.[^.]+$/, '');
  if (groundTruthCache.has(stem)) return groundTruthCache.get(stem)!;
  try {
    const res = await fetch(`/api/coaches/ground-truth/${encodeURIComponent(stem)}`);
    if (!res.ok) { groundTruthCache.set(stem, null); return null; }
    const data = await res.json();
    if (!data.moves || data.moves.length === 0) { groundTruthCache.set(stem, null); return null; }
    groundTruthCache.set(stem, data);
    return data;
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
    scoresheetHandleEditSave, scoresheetCancel, scoresheetClear,
  } = useCoachesData();

  const { preview, fileName, error, modelResults, reReads, models, startTime, analyzing, azureResult } = scoresheet;

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
    setAutoRun(true);
  };

  const handleCropCancel = () => {
    setCropSrc(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Auto-run one read after crop confirm
  const [autoRun, setAutoRun] = useState(false);
  useEffect(() => {
    if (autoRun && scoresheet.imageFile) {
      setAutoRun(false);
      scoresheetStartOneRead();
    }
  }, [autoRun, scoresheet.imageFile, scoresheetStartOneRead]);


  // Per-model board ply, set when "Show on board" is clicked
  const [modelBoardPlys, setModelBoardPlys] = useState<Record<string, number>>({});

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
              <p className="text-slate-200 text-base font-medium text-center">{t('coaches.cropHint')}</p>
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
              {/* Error */}
              {error && <p className="text-red-400 text-center py-4">{error}</p>}

              {/* Analyzing spinner */}
              {analyzing && (
                <div className="flex items-center justify-center gap-2 text-slate-400 animate-pulse-sync py-4">
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
                    const reRead = reReads[m.id]?.[0];
                    const currentMoves = mr?.result?.moves || [];
                    const currentElapsed = mr?.elapsed || 0;
                    const currentError = mr?.error;
                    const isRereading = mr?.rereading || false;
                    const corrections = reRead?.corrections;
                    const handleEditSave = (_readIdx: number, confirmed: Move[], correctionKey: string) => {
                      scoresheetHandleEditSave(m.id, 0, confirmed, correctionKey);
                    };
                    const handleMoveClick = (_moves: Move[], ply: number) => {
                      setModelBoardPlys(prev => ({ ...prev, [m.id]: ply }));
                    };

                    return (
                      <ModelRow key={m.id} preview={preview} onImageClick={() => setShowImageModal(true)} onReplace={() => { scoresheetClear(); fileInputRef.current?.click(); }} replaceLabel={t('coaches.replaceImage')}>
                        <h2 className="text-sm font-medium text-slate-300 mb-2 text-center">{mr?.name || m.name}</h2>
                        <div className="flex items-start">
                          {/* Left spacer (image is absolutely positioned by ModelRow) */}
                          <div className="flex-1 hidden md:block" />
                          {/* Center: tables */}
                          <div className="flex flex-wrap gap-3 items-start flex-shrink-0" data-tables>
                            {groundTruth && <GroundTruthPanel groundTruth={groundTruth} fileName={fileName} onUpdate={setGroundTruth} onMoveClick={handleMoveClick} sheetColumns={sheetColumns} rowsPerColumn={rowsPerColumn} />}
                            {!mr ? (
                              <ModelPanelLoading name={m.name} startTime={startTime} />
                            ) : (
                              <MovesPanel
                                label="Read"
                                moves={currentMoves}
                                groundTruthMoves={groundTruth?.moves}
                                disagreements={groundTruth ? buildDisagreementMap(currentMoves, groundTruth.moves) : new Map()}
                                elapsed={currentElapsed}
                                error={currentError}
                                fileName={fileName}
                                rereading={isRereading}
                                corrections={corrections}
                                onEditSave={(confirmed, corrKey) => handleEditSave(0, confirmed, corrKey)}
                                onMoveClick={handleMoveClick}
                                sheetColumns={sheetColumns}
                                rowsPerColumn={rowsPerColumn}
                              />
                            )}
                          </div>
                          {/* Right: board centered in remaining space */}
                          <div className="flex-1 hidden md:flex justify-center items-center self-stretch">
                            <ModelBoard moves={currentMoves} externalPly={modelBoardPlys[m.id]} disableDrag={!mr || isRereading} />
                          </div>
                        </div>
                      </ModelRow>
                    );
                  })}

                  {/* Azure DI section */}
                  {azureResult && (
                    <>
                      <div className="border-t border-slate-600 my-4" />
                      <h2 className="text-sm font-medium text-slate-300 mb-2 text-center">Azure Document Intelligence</h2>
                      {azureResult.loading ? (
                        <div className="flex items-center justify-center gap-2 text-slate-400 animate-pulse-sync py-4">
                          <Clock className="w-4 h-4 animate-spin" />
                          <span className="text-sm">Analyzing with Azure DI...</span>
                          <button onClick={scoresheetCancel} className="text-slate-500 hover:text-slate-300 transition-colors ml-1">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : azureResult.error ? (
                        <p className="text-red-400 text-center py-3 text-xs px-2">{azureResult.error}</p>
                      ) : azureResult.rawTables && azureResult.rawTables.length > 0 ? (
                        <div className="flex flex-wrap gap-3 items-start justify-center">
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
                      <div className="border-t border-slate-600 mt-4" />
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

interface PlyEntry {
  fen: string;
  lastMove: { from: string; to: string } | null;
  illegal?: { moveNumber: number; color: 'white' | 'black'; san: string };
  san?: string;
}

function ModelRow({ preview, onImageClick, onReplace, replaceLabel, children }: { preview: string; onImageClick: () => void; onReplace?: () => void; replaceLabel?: string; children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tbodyTop, setTbodyTop] = useState(0);
  const [tbodyHeight, setTbodyHeight] = useState(0);

  const [tablesLeft, setTablesLeft] = useState(0);

  useEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      if (!container) return;
      const thead = container.querySelector('[data-tables] thead');
      const tbody = container.querySelector('[data-tables] tbody');
      const tables = container.querySelector('[data-tables]');
      if (!thead || !tbody || !tables) return;
      const containerRect = container.getBoundingClientRect();
      const theadRect = thead.getBoundingClientRect();
      const tbodyRect = tbody.getBoundingClientRect();
      const tablesRect = tables.getBoundingClientRect();
      setTbodyTop(theadRect.top - containerRect.top);
      setTbodyHeight(tbodyRect.bottom - theadRect.top);
      setTablesLeft(tablesRect.left - containerRect.left);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* Image positioned absolutely to align with tbody */}
      {tbodyHeight > 0 && tablesLeft > 0 && (
        <div
          className="absolute hidden md:flex justify-end"
          style={{ top: tbodyTop, left: 0, width: tablesLeft - 8 }}
        >
          <div className="flex flex-col items-center">
            <img
              src={preview}
              alt="Scoresheet"
              className="rounded-xl object-cover object-top cursor-pointer hover:opacity-90 transition-opacity"
              style={{ height: tbodyHeight }}
              onClick={onImageClick}
            />
            {onReplace && (
              <button
                onClick={onReplace}
                className="bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors mt-3"
              >
                <Upload className="w-4 h-4" />
                {replaceLabel || 'Replace photo'}
              </button>
            )}
          </div>
        </div>
      )}
      {/* Content with left/right margins for image/board space */}
      {children}
    </div>
  );
}

function ModelBoard({ moves, externalPly, disableDrag }: { moves: Move[]; externalPly?: number; disableDrag?: boolean }) {
  const [ply, setPly] = useState(0);

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
        try {
          const move = chess.move(san);
          result.push({ fen: chess.fen(), lastMove: move ? { from: move.from, to: move.to } : null, san });
        } catch {
          result.push({ fen: chess.fen(), lastMove: null, illegal: { moveNumber: m.number, color, san }, san });
        }
      }
    }
    return result;
  }, [moves]);

  const maxPly = entries.length - 1;
  const safePly = Math.min(ply, maxPly);
  const currentFen = inBranch ? branch!.fens[branchPly] : entries[safePly].fen;
  const currentLastMove = inBranch ? null : entries[safePly].lastMove;
  const currentIllegal = inBranch ? undefined : entries[safePly].illegal;

  useEffect(() => { setPly(0); exitBranch(); }, [maxPly, exitBranch]);
  useEffect(() => { if (externalPly !== undefined) { setPly(externalPly); exitBranch(); } }, [externalPly, exitBranch]);

  // Play sound for a given ply (called from navigation actions, not from effects)
  const playSoundForPly = useCallback((p: number) => {
    if (p > 0 && entries[p]?.san) playMoveSound(entries[p].san!.includes('x'));
  }, [entries]);

  // Handle user move (drag & drop)
  const handleUserMove = useCallback((from: string, to: string) => {
    try {
      const chess = new Chess(currentFen);
      const move = chess.move({ from, to, promotion: 'q' });
      if (!move) return;
      const newFen = chess.fen();
      const san = move.san;

      // Check if matches next main-line move
      if (!inBranch && safePly < maxPly && entries[safePly + 1]?.san === san) {
        setPly(p => p + 1);
        playMoveSound(san.includes('x'));
        return;
      }

      // Diverges — create or extend branch
      if (inBranch && branch) {
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
  }, [currentFen, inBranch, branch, branchPly, safePly, maxPly, entries]);

  // Navigation
  const goPrev = useCallback(() => {
    if (inBranch) {
      setBranchPly(p => {
        if (p <= 1) { setBranch(null); playSoundForPly(safePly); return 0; }
        const san = branch?.sans[p - 2];
        if (san) playMoveSound(san.includes('x'));
        return p - 1;
      });
    } else {
      setPly(p => {
        const newP = Math.max(0, p - 1);
        if (newP !== p) playSoundForPly(p);
        return newP;
      });
    }
  }, [inBranch, branch, safePly, playSoundForPly]);
  const goNext = useCallback(() => {
    if (branch && branchPly < branch.fens.length - 1) {
      const san = branch.sans[branchPly];
      if (san) playMoveSound(san.includes('x'));
      setBranchPly(p => p + 1);
    } else if (!inBranch) {
      setPly(p => {
        const newP = Math.min(maxPly, p + 1);
        if (newP !== p) playSoundForPly(newP);
        return newP;
      });
    }
  }, [branch, branchPly, inBranch, maxPly, playSoundForPly]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      if (e.key === 'Home') { e.preventDefault(); exitBranch(); setPly(p => { if (p !== 0) playSoundForPly(p); return 0; }); }
      if (e.key === 'End') { e.preventDefault(); exitBranch(); setPly(p => { if (p !== maxPly) playSoundForPly(maxPly); return maxPly; }); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [maxPly, goPrev, goNext, exitBranch]);

  return (
    <div className="flex flex-col items-center w-[400px]">
      <BoardPreview fen={currentFen} lastMove={currentLastMove} onUserMove={disableDrag ? undefined : handleUserMove} />
      <div className="flex justify-center gap-1.5 mt-1.5 w-full">
        <button onClick={() => { exitBranch(); setPly(p => { if (p !== 0) playSoundForPly(p); return 0; }); }} className="flex-1 max-w-[80px] py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors flex items-center justify-center">
          <ChevronFirst className="w-6 h-6" />
        </button>
        <button onClick={goPrev} className="flex-1 max-w-[80px] py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors flex items-center justify-center">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button onClick={goNext} className="flex-1 max-w-[80px] py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors flex items-center justify-center">
          <ChevronRight className="w-6 h-6" />
        </button>
        <button onClick={() => { exitBranch(); setPly(p => { if (p !== maxPly) playSoundForPly(maxPly); return maxPly; }); }} className="flex-1 max-w-[80px] py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors flex items-center justify-center">
          <ChevronLast className="w-6 h-6" />
        </button>
      </div>
      {safePly > 0 && entries[safePly]?.san && !inBranch && (
        <p className="text-slate-300 text-sm mt-1.5">
          Move {Math.ceil(safePly / 2)} ({safePly % 2 === 1 ? 'White' : 'Black'}) : {entries[safePly].san}
        </p>
      )}
      {safePly === 0 && !inBranch && (
        <p className="text-slate-300 text-sm mt-1.5">Starting position</p>
      )}
      {inBranch && branch && branchPly > 0 && (
        <p className="text-slate-300 text-sm mt-1.5">
          Variation : {branch.sans[branchPly - 1]}
        </p>
      )}
      <p className={`text-sm mt-1 ${currentIllegal ? 'text-red-400' : 'invisible'}`}>Illegal move</p>
      {inBranch && (
        <div className="flex items-center gap-2 text-xs text-amber-400 mt-1.5">
          <span>Variation ({branch!.sans.length} move{branch!.sans.length > 1 ? 's' : ''})</span>
          <button onClick={() => { exitBranch(); }} className="text-slate-400 hover:text-white underline">Go back to main line</button>
        </div>
      )}
    </div>
  );
}

function GroundTruthPanel({ groundTruth, fileName, onUpdate, onMoveClick, sheetColumns = 1, rowsPerColumn }: {
  groundTruth: { white_player: string; black_player: string; result: string; moves: Move[] };
  fileName?: string | null;
  onUpdate: (gt: { white_player: string; black_player: string; result: string; moves: Move[] }) => void;
  onMoveClick?: (moves: Move[], ply: number) => void;
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
    <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-xl overflow-hidden self-start min-w-[260px]">
      <div className="px-2 py-2 border-b border-emerald-700/50 flex items-center justify-center gap-1.5">
        <BookOpen className="w-3 h-3 text-emerald-400" />
        <span className="text-emerald-300 font-medium text-xs">Ground Truth</span>
        {saving && <span className="text-emerald-400/50 text-[9px]">saving...</span>}
      </div>

      {(() => {
        const split = sheetColumns > 1 || validatedMoves.length > 15;
        const splitAt = split ? (rowsPerColumn || Math.ceil(validatedMoves.length / sheetColumns)) : validatedMoves.length;
        const leftMoves = validatedMoves.slice(0, splitAt);
        const rightMoves = split ? validatedMoves.slice(splitAt) : [];
        const rows = Math.max(leftMoves.length, rightMoves.length);

        const renderCell = (move: Move | undefined, color: 'white' | 'black', idx: number) => {
          if (!move) return <td className="px-1.5 py-0.5" />;
          const val = move[color];
          const legal = move[`${color}_legal` as const];
          const ply = idx * 2 + (color === 'black' ? 2 : 1);
          return (
            <MoveCell
              value={val || ''}
              legal={legal}
              onEdit={() => {
                const newVal = prompt(`Edit move ${move.number} ${color}:`, val || '');
                if (newVal !== null && newVal !== val) updateMove(move.number, color, newVal);
              }}
              onShowBoard={onMoveClick ? () => onMoveClick(groundTruth.moves, ply) : undefined}
            />
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
                    {renderCell(left, 'white', i)}
                    {renderCell(left, 'black', i)}
                    {split && <>
                      <td className="px-1.5 py-0.5 text-slate-500 text-center font-mono border-l border-emerald-700/30">{right?.number}</td>
                      {renderCell(right, 'white', splitAt + i)}
                      {renderCell(right, 'black', splitAt + i)}
                    </>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      })()}
      <div className="px-2 py-1.5 border-t border-emerald-700/50 text-center">
        <span className="text-xs font-medium text-green-400">100% accuracy</span>
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
    <div className="bg-slate-700/50 rounded-xl overflow-hidden self-start min-w-[260px]">
      <div className="px-2 py-2 border-b border-slate-600 flex items-center justify-center gap-2">
        <span className="text-slate-100 font-medium text-xs">{name}</span>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-slate-400" />
          <span className="text-slate-400 text-xs">{elapsed}s</span>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 py-12 text-slate-500 animate-pulse-sync">
        <Clock className="w-4 h-4 animate-spin" />
        <span className="text-xs">Analyzing scoresheet...</span>
      </div>
    </div>
  );
}

function MovesPanel({ label, moves, groundTruthMoves, disagreements, elapsed, error, meta, fileName, rereading, corrections, onEditSave, onMoveClick, sheetColumns = 1, rowsPerColumn }: {
  label: string;
  moves: Move[];
  groundTruthMoves?: Move[];
  disagreements: Map<number, { white: boolean; black: boolean }>;
  elapsed: number;
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
    <div className="bg-slate-700/50 rounded-xl overflow-hidden self-start min-w-[260px]">
      {/* Header */}
      <div className="px-2 py-2 border-b border-slate-600 flex items-center justify-center gap-2">
        <span className="text-slate-100 font-medium text-xs">{label}</span>
        <div className="flex items-center gap-1">
          <Clock className={`w-3 h-3 text-slate-400${rereading ? ' animate-spin' : ''}`} />
          <span className="text-slate-400 text-xs">{rereading ? liveElapsed : elapsed}s</span>
        </div>
      </div>


      {error && <p className="text-red-400 text-center py-3 text-xs px-2 max-w-[260px] break-words">{error}</p>}

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
                      onEdit={() => setEditing({ moveIdx: idx, color: 'white', value: move.white })}
                      onShowBoard={onMoveClick ? () => onMoveClick(moves, idx * 2 + 1) : undefined}
                    />
                    <MoveCell
                      value={move.black || ''}
                      legal={move.black_legal}
                      corrected={corrections?.has(`${move.number}-black`)}
                      highlight={d?.black}
                      onEdit={() => move.black !== undefined ? setEditing({ moveIdx: idx, color: 'black', value: move.black || '' }) : undefined}
                      onShowBoard={onMoveClick && move.black ? () => onMoveClick(moves, idx * 2 + 2) : undefined}
                    />
                  </>;
                };

                return (
                  <tr key={i} className="border-b border-slate-600/30 last:border-0">
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
        <div className="px-2 py-1.5 border-t border-slate-600/50 text-center">
          <span className={`text-xs font-medium ${stats.accuracy === 100 ? 'text-green-400' : stats.accuracy >= 80 ? 'text-amber-400' : 'text-red-400'}`}>
            {stats.accuracy}% accuracy
          </span>
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
            <div className="text-slate-400 text-xs mb-2 text-center">
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
            className="bg-slate-800 rounded-xl p-4 min-w-[260px] max-w-[360px] shadow-xl border border-slate-600"
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

function MoveCell({ value, legal, highlight, corrected, onEdit, onShowBoard }: {
  value: string;
  legal?: boolean;
  highlight?: boolean;
  corrected?: boolean;
  onEdit: () => void;
  onShowBoard?: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLTableCellElement>(null);
  const bg = corrected ? 'bg-green-900/50 text-green-200' : highlight ? 'bg-red-900/50 text-red-200' : 'text-slate-100';

  useEffect(() => {
    if (!showMenu) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showMenu]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left + rect.width / 2 });
    }
    setShowMenu(!showMenu);
  };

  return (
    <td
      ref={ref}
      className={`px-1.5 py-0.5 font-mono text-center cursor-pointer hover:bg-slate-600/50 ${bg}`}
      onClick={handleClick}
    >
      <span className="inline-flex items-center justify-center gap-1 w-full">
        {value}
        {legal === true && <span className="text-green-400 text-[9px]">&#10003;</span>}
        {legal === false && <span className="text-red-400 text-[9px]">&#10007;</span>}
      </span>
      {showMenu && (
        <div
          className="fixed z-[100] -translate-x-1/2 bg-slate-800 border border-slate-600 rounded-lg shadow-lg overflow-hidden whitespace-nowrap"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(false); onEdit(); }}
            className="w-full px-4 py-2.5 text-xs text-slate-200 hover:bg-slate-700 text-left"
          >
            Edit
          </button>
          {onShowBoard && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(false); onShowBoard(); }}
              className="w-full px-4 py-2.5 text-xs text-slate-200 hover:bg-slate-700 text-left border-t border-slate-700"
            >
              Show on board
            </button>
          )}
        </div>
      )}
    </td>
  );
}
