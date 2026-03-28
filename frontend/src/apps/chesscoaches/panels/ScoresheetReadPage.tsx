// Scoresheet reader page — reads scoresheets with Gemini, supports iterative correction

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { Upload, ImageIcon, Clock, BookOpen, Check, ExternalLink, X, Crop, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, ChevronDown, RotateCcw, AlertTriangle } from 'lucide-react';
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
import { pieceImageUrl } from '../utils/pieces';
import { Chess } from 'chess.js';
import type { ScoresheetMove as Move } from '../contexts/CoachesDataContext';

// Parse a moves.csv file into ground truth data
// Fetch ground truth for a scoresheet via API (by filename stem) — used by GroundTruthPanel (admin)
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
    scoresheetHandleEditSave, scoresheetReread, scoresheetCancel,
  } = useCoachesData();

  const { preview, fileName, error, modelResults, reReads, models, startTime, analyzing } = scoresheet;

  // Fetch ground truth for accuracy comparison
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
  const [showExampleModal, setShowExampleModal] = useState(false);
  const closeModal = useCallback(() => { setShowImageModal(false); setShowExampleModal(false); }, []);
  useEffect(() => {
    if (!showImageModal && !showExampleModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showImageModal, showExampleModal, closeModal]);


  const [modelsCollapsed, setModelsCollapsed] = useState(true);

  // ── Live elapsed timer for status table ──
  const [liveGlobalElapsed, setLiveGlobalElapsed] = useState(0);
  useEffect(() => {
    if (!startTime || !analyzing) { setLiveGlobalElapsed(0); return; }
    setLiveGlobalElapsed(Math.round((Date.now() - startTime) / 1000));
    const id = setInterval(() => setLiveGlobalElapsed(Math.round((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startTime, analyzing]);

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
      activeModelBoardId = 0;
      scoresheetStartOneRead();
    }
  }, [autoRun, scoresheet.imageFile, scoresheetStartOneRead]);


  // Per-model board ply + source tracking
  const [modelBoardPlys, setModelBoardPlys] = useState<Record<string, { ply: number; source: 'gt' | 'read' | 'nav' }>>({});
  // Consensus overrides: user edits on top of the computed consensus
  const [consensusOverrides, setConsensusOverrides] = useState<Move[] | null>(null);

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
              <div className="relative flex justify-center">
                {/* User's photo — centered */}
                <div className="max-w-sm">
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
                {/* Example — positioned to the right of the centered image */}
                <div className="hidden lg:block w-64 flex-shrink-0 absolute left-[calc(50%+14rem)] top-1/2 -translate-y-1/2">
                  <p className="text-slate-200 text-sm font-medium text-center mb-2 -mt-6">{t('coaches.example')}</p>
                  <img
                    src="/cropping_example.jpeg"
                    alt="Cropping example"
                    className="rounded-lg opacity-90 w-full cursor-pointer hover:opacity-100 transition-opacity"
                    onClick={() => setShowExampleModal(true)}
                  />
                </div>
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

              {/* Status table — shows during and after analysis */}
              {models.length > 0 && (
                <div className="flex justify-center">
                <div className="bg-slate-700/30 rounded-lg overflow-hidden inline-block min-w-[400px]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-700/50 text-slate-400 text-xs uppercase tracking-wider">
                        <th className="px-4 py-2 text-left w-1/3">Model</th>
                        <th className="px-4 py-2 text-center w-1/3">Status</th>
                        <th className="px-4 py-2 text-center w-1/3">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/30">
                      {models.map(m => {
                        const mr = modelResults[m.id];
                        const done = !!(mr?.result || mr?.error);
                        const failed = !!mr?.error;
                        return (
                          <tr key={m.id}>
                            <td className="px-4 py-2.5 text-slate-200 font-medium">{m.name}</td>
                            <td className="px-4 py-2.5 text-center">
                              {done ? (
                                failed
                                  ? <span className="text-red-400 inline-flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Error</span>
                                  : <span className="text-emerald-400 inline-flex items-center gap-1"><Check className="w-4 h-4" /> Done</span>
                              ) : (
                                <span className="text-slate-500 inline-flex items-center gap-1"><Clock className="w-4 h-4 animate-spin" /> Reading...</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {done ? (
                                failed ? <span className="text-red-400">—</span> : <span className="text-emerald-400">{mr?.elapsed}s</span>
                              ) : (
                                <span className="text-slate-500">{liveGlobalElapsed}s</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Consensus row */}
                      {(() => {
                        const finishedCount = models.filter(m => !!(modelResults[m.id]?.result || modelResults[m.id]?.error)).length;
                        const allDone = finishedCount === models.length;
                        const hasConsensus = models
                          .map(m => modelResults[m.id]?.result?.moves)
                          .filter((mv): mv is Move[] => !!mv && mv.length > 0).length >= 2;
                        if (!hasConsensus && !allDone) return null;
                        return (
                          <tr>
                            <td className="px-4 py-2.5 text-slate-200 font-medium">{t('coaches.consensus')}</td>
                            <td className="px-4 py-2.5 text-center">
                              {allDone && hasConsensus
                                ? <span className="text-emerald-400 inline-flex items-center gap-1"><Check className="w-4 h-4" /> Done</span>
                                : <span className="text-slate-500 inline-flex items-center gap-1"><Clock className="w-4 h-4 animate-spin" /> Computing...</span>}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {allDone && hasConsensus
                                ? <span className="text-emerald-400">—</span>
                                : <span className="text-slate-500">{liveGlobalElapsed}s</span>}
                            </td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
                </div>
              )}
              {analyzing && models.length === 0 && (
                <div className="flex items-center justify-center gap-2 text-slate-400 animate-pulse-sync py-4">
                  <Clock className="w-4 h-4 animate-spin" />
                  <span className="text-sm">{t('coaches.analyzing')}</span>
                  <button onClick={scoresheetCancel} className="text-slate-500 hover:text-slate-300 transition-colors ml-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Retry button — moved inside results block, between consensus and models */}

              {/* Results: one row per model — [image | GT | read | board] */}
              {models.length > 0 && (() => {
                // Get column info from any model that has results (for GT panel consistency)
                const anyResult = Object.values(modelResults).find(r => r?.result)?.result;
                const sheetColumns = (anyResult as any)?.columns || 1;
                const rowsPerColumn = (anyResult as any)?.rows_per_column || null;

                // Compute cross-model disagreements
                const allModelMovesForDisagreement = models
                  .map(m => modelResults[m.id]?.result?.moves)
                  .filter((mv): mv is Move[] => !!mv && mv.length > 0);
                const modelDisagreements = new Set<string>();
                if (allModelMovesForDisagreement.length >= 2) {
                  const maxLen = Math.max(...allModelMovesForDisagreement.map(mv => mv.length));
                  for (let i = 0; i < maxLen; i++) {
                    for (const color of ['white', 'black'] as const) {
                      const values = new Set<string>();
                      for (const mv of allModelMovesForDisagreement) {
                        const val = mv[i]?.[color];
                        if (val) values.add(val.replace(/[+#]/g, ''));
                      }
                      if (values.size > 1) modelDisagreements.add(`${i + 1}-${color}`);
                    }
                  }
                }

                return (
                <div className="space-y-8">
                  {/* Consensus row — majority vote across all models */}
                  {(() => {
                    const allModelMoves = models
                      .map(m => modelResults[m.id]?.result?.moves)
                      .filter((mv): mv is Move[] => !!mv && mv.length > 0);
                    if (allModelMoves.length < 2) return null;
                    const maxLen = Math.max(...allModelMoves.map(mv => mv.length));
                    // Two-pass smart consensus algorithm.
                    // Pass 1: greedy left-to-right using majority votes for downstream simulation.
                    // Pass 2: same algorithm but uses Pass 1 results for downstream simulation,
                    //         producing better choices and accurate "illegals after" counts.

                    // Helper: run one greedy pass given a downstream reference sequence
                    const runConsensusPass = (downstreamRef: Move[]) => {
                      const result: Move[] = [];
                      const details: Record<string, { candidate: string; votes: number; downstreamIllegals: number; chosen: boolean }[]> = {};
                      const passChess = new Chess();

                      for (let i = 0; i < maxLen; i++) {
                        const move: Move = { number: i + 1, white: '' };
                        for (const color of ['white', 'black'] as const) {
                          const votes: Record<string, number> = {};
                          for (const modelMv of allModelMoves) {
                            const val = modelMv[i]?.[color];
                            if (val) {
                              const normalized = val.replace(/[+#]/g, '');
                              votes[normalized] = (votes[normalized] || 0) + 1;
                            }
                          }
                          const candidates = Object.entries(votes).sort((a, b) => b[1] - a[1]);
                          if (candidates.length === 0) continue;

                          const detailKey = `${i + 1}-${color}`;
                          if (candidates.length === 1) {
                            (move as any)[color] = candidates[0][0];
                            details[detailKey] = [{ candidate: candidates[0][0], votes: candidates[0][1], downstreamIllegals: 0, chosen: true }];
                            try { passChess.move(candidates[0][0]); } catch { /* validation will catch */ }
                          } else {
                            let bestCandidate = candidates[0][0];
                            let bestIllegals = Infinity;
                            let bestVotes = candidates[0][1];
                            const dets: { candidate: string; votes: number; downstreamIllegals: number; chosen: boolean }[] = [];

                            for (const [candidate, voteCount] of candidates) {
                              const simChess = new Chess(passChess.fen());
                              let illegals = 0;
                              try { simChess.move(candidate); } catch { illegals += 100; }

                              if (illegals === 0) {
                                // Simulate remaining moves using the downstream reference
                                if (color === 'white' && downstreamRef[i]?.black) {
                                  try { simChess.move(downstreamRef[i].black!); } catch { illegals++; }
                                }
                                for (let j = i + 1; j < maxLen; j++) {
                                  for (const c of ['white', 'black'] as const) {
                                    const san = downstreamRef[j]?.[c];
                                    if (!san) continue;
                                    try { simChess.move(san); } catch { illegals++; }
                                  }
                                }
                              }

                              dets.push({ candidate, votes: voteCount, downstreamIllegals: illegals, chosen: false });
                              if (illegals < bestIllegals || (illegals === bestIllegals && voteCount > bestVotes)) {
                                bestIllegals = illegals;
                                bestCandidate = candidate;
                                bestVotes = voteCount;
                              }
                            }

                            const allIllegal = dets.every(d => d.downstreamIllegals >= 100);
                            if (allIllegal) {
                              details[detailKey] = dets;
                              (move as any)[color] = candidates[0][0];
                              (move as any)[`${color}_legal`] = false;
                              (move as any)[`${color}_reason`] = 'All options are illegal — please correct manually';
                              const fen = passChess.fen().split(' ');
                              fen[1] = fen[1] === 'w' ? 'b' : 'w';
                              passChess.load(fen.join(' '));
                            } else {
                              for (const d of dets) { if (d.candidate === bestCandidate) d.chosen = true; }
                              details[detailKey] = dets;
                              (move as any)[color] = bestCandidate;
                              try { passChess.move(bestCandidate); } catch {
                                const fen = passChess.fen().split(' ');
                                fen[1] = fen[1] === 'w' ? 'b' : 'w';
                                passChess.load(fen.join(' '));
                              }
                            }
                          }
                        }
                        result.push(move);
                      }
                      return { moves: result, details };
                    };

                    // Collect majority-vote moves (used as downstream ref for Pass 1)
                    const majorityMoves: Move[] = [];
                    for (let i = 0; i < maxLen; i++) {
                      const mv: Move = { number: i + 1, white: '' };
                      for (const color of ['white', 'black'] as const) {
                        const votes: Record<string, number> = {};
                        for (const modelMv of allModelMoves) {
                          const val = modelMv[i]?.[color];
                          if (val) {
                            const normalized = val.replace(/[+#]/g, '');
                            votes[normalized] = (votes[normalized] || 0) + 1;
                          }
                        }
                        const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1]);
                        if (sorted.length > 0) (mv as any)[color] = sorted[0][0];
                      }
                      majorityMoves.push(mv);
                    }

                    // Pass 1: use majority votes as downstream reference
                    const pass1 = runConsensusPass(majorityMoves);
                    // Pass 2: use Pass 1 results as downstream reference
                    const pass2 = runConsensusPass(pass1.moves);

                    const consensusMoves = pass2.moves;
                    const voteDetails = pass2.details;

                    // Remove trailing empty moves
                    while (consensusMoves.length > 0 && !consensusMoves[consensusMoves.length - 1].white && !consensusMoves[consensusMoves.length - 1].black) {
                      consensusMoves.pop();
                    }
                    if (consensusMoves.length === 0) return null;
                    // Validate legality with chess.js, auto-resolve ambiguities
                    const valChess = new Chess();
                    for (let ci = 0; ci < consensusMoves.length; ci++) {
                      const cm = consensusMoves[ci];
                      for (const color of ['white', 'black'] as const) {
                        const san = cm[color];
                        if (!san) continue;
                        try { valChess.move(san); (cm as any)[`${color}_legal`] = true; }
                        catch {
                          // Check if it's an ambiguity: find legal moves by same piece to same square
                          const pieceMatch = san.match(/^([KQRBN])/);
                          const destMatch = san.match(/([a-h][1-8])/);
                          if (pieceMatch && destMatch) {
                            const piece = pieceMatch[1];
                            const dest = destMatch[1];
                            const candidates = valChess.moves().filter(m => m.startsWith(piece) && m.includes(dest));
                            if (candidates.length > 1) {
                              // Ambiguity! Try each candidate, pick the one with fewest downstream illegals
                              let bestAmbig = candidates[0];
                              let bestAmbigIllegals = Infinity;
                              for (const cand of candidates) {
                                const simA = new Chess(valChess.fen());
                                let ill = 0;
                                try { simA.move(cand); } catch { ill += 100; }
                                if (ill === 0) {
                                  for (let j = ci; j < consensusMoves.length; j++) {
                                    for (const c2 of ['white', 'black'] as const) {
                                      if (j === ci && c2 === color) continue; // skip current
                                      if (j === ci && color === 'black') continue; // already past white
                                      const s2 = consensusMoves[j]?.[c2];
                                      if (!s2) continue;
                                      try { simA.move(s2); } catch { ill++; }
                                    }
                                  }
                                }
                                if (ill < bestAmbigIllegals) { bestAmbigIllegals = ill; bestAmbig = cand; }
                              }
                              // Auto-resolve: use the best disambiguation
                              (cm as any)[color] = bestAmbig;
                              (cm as any)[`${color}_reason`] = `Ambiguous: did you mean ${candidates.join(' or ')}? Auto-resolved to ${bestAmbig}`;
                              try { valChess.move(bestAmbig); (cm as any)[`${color}_legal`] = true; }
                              catch { (cm as any)[`${color}_legal`] = false; }
                              continue;
                            } else if (candidates.length === 1) {
                              // Only one legal move by this piece to this square — auto-fix
                              (cm as any)[color] = candidates[0];
                              (cm as any)[`${color}_reason`] = `Did you mean ${candidates[0]}?`;
                              try { valChess.move(candidates[0]); (cm as any)[`${color}_legal`] = true; }
                              catch { (cm as any)[`${color}_legal`] = false; }
                              continue;
                            }
                          }
                          // Not ambiguity, just illegal
                          (cm as any)[`${color}_legal`] = false;
                          const fen = valChess.fen().split(' ');
                          fen[1] = fen[1] === 'w' ? 'b' : 'w';
                          valChess.load(fen.join(' '));
                        }
                      }
                    }
                    const consensusId = '__consensus__';
                    const consensusColumns = sheetColumns;
                    const consensusRowsPerColumn = rowsPerColumn;
                    // Apply overrides on top of computed consensus
                    const displayConsensusMoves = consensusOverrides || consensusMoves;
                    const handleConsensusEditSave = (_readIdx: number, confirmed: Move[], _corrKey: string) => {
                      // Re-validate with chess.js
                      const ch = new Chess();
                      for (const cm of confirmed) {
                        for (const col of ['white', 'black'] as const) {
                          const san = cm[col];
                          if (!san) continue;
                          try { ch.move(san); (cm as any)[`${col}_legal`] = true; }
                          catch {
                            (cm as any)[`${col}_legal`] = false;
                            const f = ch.fen().split(' ');
                            f[1] = f[1] === 'w' ? 'b' : 'w';
                            ch.load(f.join(' '));
                          }
                        }
                      }
                      setConsensusOverrides(confirmed);
                    };
                    const handleConsensusBoardPly = (ply: number) => {
                      setModelBoardPlys(prev => ({ ...prev, [consensusId]: { ply, source: 'nav' as const } }));
                    };
                    const deselectConsensus = () => {
                      setModelBoardPlys(p => { const rest = { ...p }; delete rest[consensusId]; return rest; });
                    };
                    return (
                      <ModelRow key={consensusId} preview={preview} onImageClick={() => setShowImageModal(true)}>
                        <h2 className="text-sm font-medium text-slate-300 mb-2 text-center">{t('coaches.consensus')} ({allModelMoves.length} {t('coaches.models')})</h2>
                        <div className="flex items-stretch" onClick={deselectConsensus}>
                          <div className="flex-1 hidden md:block" />
                          <div className="flex flex-wrap gap-3 items-start flex-shrink-0" data-tables onClick={e => e.stopPropagation()}>
                            <MovesPanel
                              label={t('coaches.consensus')}
                              moves={displayConsensusMoves}
                              groundTruthMoves={groundTruth?.moves}
                              disagreements={groundTruth ? (() => { const m = new Map<number, { white: boolean; black: boolean }>(); const gt = groundTruth.moves; for (let idx = 0; idx < Math.max(displayConsensusMoves.length, gt.length); idx++) { const cm = displayConsensusMoves[idx]; const gm = gt[idx]; const wd = !movesMatch(cm?.white || '', gm?.white || ''); const bd = !movesMatch(cm?.black || '', gm?.black || ''); if (wd || bd) m.set(idx + 1, { white: wd, black: bd }); } return m; })() : new Map()}
                              elapsed={0}
                              fileName={fileName}
                              onEditSave={(confirmed, corrKey) => handleConsensusEditSave(0, confirmed, corrKey)}
                              originalMoves={consensusOverrides ? consensusMoves : undefined}
                              onMoveClick={(movesArr, ply) => {
                                setModelBoardPlys(p => ({ ...p, [consensusId]: { ply, source: 'read' as const } }));
                                const moveIdx = Math.floor((ply - 1) / 2);
                                const color = ply % 2 === 1 ? 'white' : 'black';
                                const san = movesArr[moveIdx]?.[color];
                                if (san) playMoveSound(san.includes('x'));
                              }}
                              activePly={modelBoardPlys[consensusId]?.ply}
                              sheetColumns={consensusColumns}
                              rowsPerColumn={consensusRowsPerColumn}
                              modelDisagreements={modelDisagreements}
                              voteDetails={voteDetails}
                            />
                          </div>
                          <div className="flex-1 hidden md:flex justify-center items-center -mb-20" onClick={e => e.stopPropagation()}>
                            <ModelBoard moves={displayConsensusMoves} externalPly={modelBoardPlys[consensusId]?.ply} onPlyChange={handleConsensusBoardPly} disableDrag autoActivate={false} previewFen={null} />
                          </div>
                        </div>
                      </ModelRow>
                    );
                  })()}


                  {/* Re-analyze button — between consensus and individual models */}
                  {!analyzing && preview && (
                    <div className="flex justify-center py-2">
                      <button
                        onClick={() => { activeModelBoardId = 0; scoresheetStartOneRead(); }}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors text-sm"
                      >
                        <RotateCcw className="w-4 h-4" />
                        {models.length > 0 ? t('coaches.reanalyze') : t('coaches.analyze')}
                      </button>
                    </div>
                  )}


                  {/* Individual model reads — collapsible */}
                  <div className="flex justify-center">
                  <div className="border border-slate-600/50 rounded-xl overflow-hidden inline-block">
                    <button
                      onClick={() => setModelsCollapsed(c => !c)}
                      className="w-full flex items-center justify-center gap-2 px-6 py-3 hover:bg-slate-700/30 transition-colors"
                    >
                      <span className="text-base text-slate-100 font-medium">{t('coaches.individualReads') || 'Individual model reads'}</span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${modelsCollapsed ? '' : 'rotate-180'}`} />
                    </button>
                    {!modelsCollapsed && (
                      <div className="flex flex-wrap gap-3 items-start justify-center px-4 pb-4 border-t border-slate-600/50">
                        {models.map((m) => {
                          const mr = modelResults[m.id];
                          const reRead = reReads[m.id]?.[0];
                          const currentMoves = mr?.result?.moves || [];
                          const modelColumns = (mr?.result as any)?.columns || sheetColumns;
                          const modelRowsPerColumn = (mr?.result as any)?.rows_per_column || rowsPerColumn;
                          const currentElapsed = mr?.elapsed || 0;
                          const currentError = mr?.error;
                          const isRereading = mr?.rereading || false;
                          const corrections = reRead?.corrections;
                          return (
                            <div key={m.id}>
                              {!mr ? (
                                <ModelPanelLoading name={m.name} startTime={startTime} />
                              ) : (
                                <MovesPanel
                                  label={mr?.name || m.name}
                                  moves={currentMoves}
                                  groundTruthMoves={undefined}
                                  disagreements={new Map()}
                                  elapsed={currentElapsed}
                                  error={currentError}
                                  fileName={fileName}
                                  rereading={isRereading}
                                  corrections={corrections}
                                  onEditSave={(confirmed, corrKey) => { scoresheetHandleEditSave(m.id, 0, confirmed, corrKey); }}
                                  onReread={() => scoresheetReread(m.id)}
                                  sheetColumns={modelColumns}
                                  rowsPerColumn={modelRowsPerColumn}
                                  modelDisagreements={modelDisagreements}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  </div>

                  {/* Azure DI section — disabled, kept for future use */}

                  {/* Old status bar removed — replaced by status table at top */}
                </div>
                );
              })()}
            </div>
          )}

      {/* Fullscreen image modal */}
      {showImageModal && preview && (
        <div
          onClick={closeModal}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[0.5px] cursor-pointer"
        >
          <img
            src={preview}
            alt="Scoresheet"
            className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain"
          />
        </div>
      )}

      {/* Example image modal */}
      {showExampleModal && (
        <div
          onClick={closeModal}
          className="fixed inset-0 z-50 flex items-center justify-center pl-64 bg-slate-900/60 backdrop-blur-[0.5px] cursor-pointer"
        >
          <img
            src="/cropping_example.jpeg"
            alt="Cropping example"
            className="max-w-[85vw] max-h-[95vh] rounded-xl object-contain"
          />
        </div>
      )}
    </PanelShell>
  );
}

interface PlyEntry {
  fen: string;
  lastMove: { from: string; to: string } | null;
  illegal?: { moveNumber: number; color: 'white' | 'black'; san: string; reason?: string };
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
      if (!tables) return;
      const containerRect = container.getBoundingClientRect();
      const tablesRect = tables.getBoundingClientRect();
      setTablesLeft(tablesRect.left - containerRect.left);
      if (thead && tbody) {
        const theadRect = thead.getBoundingClientRect();
        const tbodyRect = tbody.getBoundingClientRect();
        setTbodyTop(theadRect.top - containerRect.top);
        setTbodyHeight(tbodyRect.bottom - theadRect.top);
      } else {
        // Loading state: use a reasonable default height close to final table size
        setTbodyTop(tablesRect.top - containerRect.top);
        setTbodyHeight(Math.max(tablesRect.height, 500));
      }
    };
    measure();
    // Re-measure after layout settles (tables may render after initial mount)
    const timer = setTimeout(measure, 200);
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    const tablesEl = containerRef.current?.querySelector('[data-tables]');
    if (tablesEl) observer.observe(tablesEl);
    // Re-measure when DOM changes (e.g. loading → results)
    const mutationObs = new MutationObserver(measure);
    if (containerRef.current) mutationObs.observe(containerRef.current, { childList: true, subtree: true });
    return () => { observer.disconnect(); mutationObs.disconnect(); clearTimeout(timer); };
  }, []);

  return (
    <div ref={containerRef} className="relative" style={{ minHeight: tbodyHeight > 0 ? tbodyTop + tbodyHeight + 60 : undefined }}>
      {/* Image positioned absolutely, vertically centered with the row */}
      {tbodyHeight > 0 && tablesLeft > 0 && (
        <div
          className="absolute hidden md:flex items-center justify-center"
          style={{ top: 0, bottom: 0, left: 0, width: tablesLeft - 8 }}
        >
          <div className="flex flex-col items-center">
            <img
              src={preview}
              alt="Scoresheet"
              className="rounded-xl object-cover object-top cursor-pointer hover:opacity-90 transition-opacity"
              style={{ maxHeight: tbodyHeight }}
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

// Track which ModelBoard instance is "active" (last interacted with)
let activeModelBoardId = 0;
let nextModelBoardId = 0;

function ModelBoard({ moves, externalPly, onPlyChange, disableDrag, autoActivate, previewFen }: { moves: Move[]; externalPly?: number; onPlyChange?: (ply: number) => void; disableDrag?: boolean; autoActivate?: boolean; previewFen?: string | null }) {
  const { t } = useLanguage();
  const [instanceId] = useState(() => ++nextModelBoardId);
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
          const reason = m[`${color}_reason` as 'white_reason' | 'black_reason'];
          result.push({ fen: chess.fen(), lastMove: null, illegal: { moveNumber: m.number, color, san, reason }, san });
          // Flip turn so next move validates from the right side
          const fen = chess.fen().split(' ');
          fen[1] = fen[1] === 'w' ? 'b' : 'w';
          chess.load(fen.join(' '));
        }
      }
    }
    return result;
  }, [moves]);

  const maxPly = entries.length - 1;
  const safePly = Math.min(ply, maxPly);
  const currentFen = previewFen || (inBranch ? branch!.fens[branchPly] : entries[safePly].fen);
  const currentLastMove = previewFen ? null : (inBranch ? null : entries[safePly].lastMove);
  const currentIllegal = inBranch ? undefined : entries[safePly].illegal;

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
  useEffect(() => { if (externalPly !== undefined) { setPly(externalPly); exitBranch(); activeModelBoardId = instanceId; } }, [externalPly, exitBranch, instanceId]);


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
        if (newP !== p) { playSoundForPly(p); onPlyChange?.(newP); }
        return newP;
      });
    }
  }, [inBranch, branch, safePly, playSoundForPly, onPlyChange]);
  const goNext = useCallback(() => {
    if (branch && branchPly < branch.fens.length - 1) {
      const san = branch.sans[branchPly];
      if (san) playMoveSound(san.includes('x'));
      setBranchPly(p => p + 1);
    } else if (!inBranch) {
      setPly(p => {
        const newP = Math.min(maxPly, p + 1);
        if (newP !== p) { playSoundForPly(newP); onPlyChange?.(newP); }
        return newP;
      });
    }
  }, [branch, branchPly, inBranch, maxPly, playSoundForPly, onPlyChange]);

  const goFirst = useCallback(() => {
    exitBranch(); setPly(p => { if (p !== 0) { playSoundForPly(p); onPlyChange?.(0); } return 0; });
  }, [exitBranch, playSoundForPly, onPlyChange]);
  const goLast = useCallback(() => {
    exitBranch(); setPly(p => { if (p !== maxPly) { playSoundForPly(maxPly); onPlyChange?.(maxPly); } return maxPly; });
  }, [exitBranch, maxPly, playSoundForPly, onPlyChange]);

  // Activate this board on any click, then keyboard only responds to active board
  const activate = useCallback(() => { activeModelBoardId = instanceId; }, [instanceId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (activeModelBoardId !== instanceId) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
      if (e.key === 'Home') { e.preventDefault(); goFirst(); }
      if (e.key === 'End') { e.preventDefault(); goLast(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [instanceId, goPrev, goNext, goFirst, goLast]);

  return (
    <div className="flex flex-col items-center w-[400px]" onClick={activate}>
      <BoardPreview fen={currentFen} lastMove={currentLastMove} onUserMove={disableDrag ? undefined : handleUserMove} highlightSquares={ambiguousSquares} />
      <div className="flex justify-center gap-1.5 mt-1.5 w-full">
        <button onClick={goFirst} className="flex-1 max-w-[80px] py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors flex items-center justify-center">
          <ChevronFirst className="w-6 h-6" />
        </button>
        <button onClick={goPrev} className="flex-1 max-w-[80px] py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors flex items-center justify-center">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button onClick={goNext} className="flex-1 max-w-[80px] py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors flex items-center justify-center">
          <ChevronRight className="w-6 h-6" />
        </button>
        <button onClick={goLast} className="flex-1 max-w-[80px] py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors flex items-center justify-center">
          <ChevronLast className="w-6 h-6" />
        </button>
      </div>
      <div className="mt-1.5 text-sm text-center min-h-[44px]">
        {safePly > 0 && entries[safePly]?.san && !inBranch && (
          <p className="text-slate-300">
            {t('coaches.move')} {Math.ceil(safePly / 2)} ({safePly % 2 === 1 ? t('coaches.moveWhite') : t('coaches.moveBlack')}) : {entries[safePly].san}
          </p>
        )}
        {safePly === 0 && !inBranch && (
          <p className="text-slate-300">{t('coaches.startingPosition')}</p>
        )}
        {inBranch && branch && branchPly > 0 && (
          <p className="text-slate-300">
            {t('coaches.variation')} : {branch.sans[branchPly - 1]}
          </p>
        )}
        {currentIllegal && (
          <>
            <p className="text-red-400">{t('coaches.illegalMove')}</p>
            {currentIllegal.reason && <p className="text-red-400">{currentIllegal.reason}</p>}
          </>
        )}
      </div>
      {inBranch && (
        <div className="flex items-center gap-2 text-xs text-amber-400 mt-1">
          <span>{t('coaches.variation')} ({branch!.sans.length} {branch!.sans.length > 1 ? t('coaches.variationMovesPlural') : t('coaches.variationMoves')})</span>
          <button onClick={() => { exitBranch(); }} className="text-slate-400 hover:text-white underline">{t('coaches.backToMainLine')}</button>
        </div>
      )}
    </div>
  );
}

// @ts-ignore — kept for potential admin/dev use
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function GroundTruthPanel({ groundTruth, fileName, onUpdate, onMoveClick, activePly, onPreview, onClearPreview, sheetColumns = 1, rowsPerColumn }: {
  groundTruth: { white_player: string; black_player: string; result: string; moves: Move[] };
  fileName?: string | null;
  onUpdate: (gt: { white_player: string; black_player: string; result: string; moves: Move[] }) => void;
  onMoveClick?: (moves: Move[], ply: number) => void;
  activePly?: number;
  onPreview?: (moveIdx: number, color: 'white' | 'black', san: string) => void;
  onClearPreview?: () => void;
  sheetColumns?: number;
  rowsPerColumn?: number | null;
}) {
  const { t } = useLanguage();
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

  const [editing, setEditing] = useState<{ moveNumber: number; moveIdx: number; color: 'white' | 'black'; value: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  // Legal moves at editing position
  const legalMoves = useMemo(() => {
    if (!editing) return [];
    try {
      const chess = new Chess();
      for (let i = 0; i < editing.moveIdx; i++) {
        const m = groundTruth.moves[i];
        if (m.white) try { chess.move(m.white); } catch { break; }
        if (m.black) try { chess.move(m.black); } catch { break; }
      }
      if (editing.color === 'black') {
        const m = groundTruth.moves[editing.moveIdx];
        if (m?.white) try { chess.move(m.white); } catch { /* */ }
      }
      return chess.moves().sort();
    } catch { return []; }
  }, [editing, groundTruth.moves]);

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
        <span className="text-emerald-300 font-medium text-xs">{t('coaches.groundTruth')}</span>
        {saving && <span className="text-emerald-400/50 text-[9px]">{t('coaches.saving')}</span>}
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
              active={activePly === ply}
              reason={move[`${color}_reason` as 'white_reason' | 'black_reason']}
              onEdit={() => {
                setEditing({ moveNumber: move.number, moveIdx: idx, color, value: val || '' });
                onMoveClick?.(groundTruth.moves, ply);
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
        <span className="text-xs font-medium text-green-400">100% {t('coaches.accuracy')}</span>
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

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-[0.5px]"
          onClick={() => { setEditing(null); onClearPreview?.(); }}
        >
          <div
            className="bg-slate-800 rounded-xl p-4 min-w-[260px] shadow-xl border border-slate-600"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-slate-400 text-xs mb-2 text-center">
              {t('coaches.move')} {editing.moveNumber} · {editing.color === 'white' ? t('coaches.moveWhite') : t('coaches.moveBlack')}
            </div>
            {validatedMoves[editing.moveIdx]?.[`${editing.color}_reason` as 'white_reason' | 'black_reason'] && (
              <p className="text-red-400 text-sm mb-2 text-center">{validatedMoves[editing.moveIdx][`${editing.color}_reason` as 'white_reason' | 'black_reason']}</p>
            )}
            <input
              ref={inputRef}
              value={editing.value}
              onChange={e => setEditing({ ...editing, value: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') { updateMove(editing.moveNumber, editing.color, editing.value); setEditing(null); onClearPreview?.(); } if (e.key === 'Escape') { setEditing(null); onClearPreview?.(); } }}
              className="w-full bg-slate-700 text-slate-100 font-mono text-sm px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
            />
            <MoveSuggestions legalMoves={legalMoves} color={editing.color} value={editing.value} reason={validatedMoves[editing.moveIdx]?.[`${editing.color}_reason` as 'white_reason' | 'black_reason']} onSelect={san => {
              setEditing({ ...editing, value: san });
              onPreview?.(editing.moveIdx, editing.color, san);
              playMoveSound(san.includes('x'));
            }} onDeselect={() => {
              const orig = groundTruth.moves[editing.moveIdx]?.[editing.color] || '';
              setEditing({ ...editing, value: orig });
              onClearPreview?.();
              playMoveSound(false);
            }} />
            <div className="mt-3">
              <button
                onClick={() => { updateMove(editing.moveNumber, editing.color, editing.value); setEditing(null); onClearPreview?.(); }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 rounded-lg transition-colors"
              >
                {t('coaches.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function ModelPanelLoading({ name, startTime }: { name: string; startTime: number | null }) {
  const { t } = useLanguage();
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
        <span className="text-xs">{t('coaches.analyzing')}</span>
      </div>
    </div>
  );
}

function MovesPanel({ label, moves, groundTruthMoves, disagreements, elapsed, error, meta, fileName, rereading, corrections, onEditSave, onReread, onMoveClick, activePly, onPreview, onClearPreview, sheetColumns = 1, rowsPerColumn, modelDisagreements, originalMoves, voteDetails }: {
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
  onReread?: () => void;
  onMoveClick?: (moves: Move[], ply: number) => void;
  activePly?: number;
  onPreview?: (moveIdx: number, color: 'white' | 'black', san: string) => void;
  onClearPreview?: () => void;
  sheetColumns?: number;
  rowsPerColumn?: number | null;
  modelDisagreements?: Set<string>;
  originalMoves?: Move[];
  voteDetails?: Record<string, { candidate: string; votes: number; downstreamIllegals: number; chosen: boolean }[]>;
}) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState<{ moveIdx: number; color: 'white' | 'black'; value: string } | null>(null);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const [showIllegalModal, setShowIllegalModal] = useState(false);
  const [voteInfoKey, setVoteInfoKey] = useState<string | null>(null);
  const hasIllegalMoves = moves.some(m => m.white_legal === false || m.black_legal === false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rereadStartRef = useRef<number | null>(null);

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

    // Build all moves with the edit applied, clear legality for re-validation
    const confirmed: Move[] = [];
    for (let i = 0; i < moves.length; i++) {
      const m = { ...moves[i] };
      if (i === editedMoveIdx) {
        m[editedColor] = editedValue;
      }
      delete m.white_legal;
      delete m.black_legal;
      delete m.white_reason;
      delete m.black_reason;
      confirmed.push(m);
    }

    const correctionKey = `${moves[editedMoveIdx].number}-${editedColor}`;
    onEditSave(confirmed, correctionKey);
  };


  const stats = groundTruthMoves && moves.length > 0 ? computeStats(moves, groundTruthMoves) : null;

  return (
    <div className="bg-slate-700/50 rounded-xl overflow-hidden self-start min-w-[320px]">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-slate-600 flex items-center justify-center gap-2">
        <span className="text-slate-100 font-medium text-sm">{label}</span>
        <div className="flex items-center gap-1">
          <Clock className={`w-3 h-3 text-slate-400${rereading ? ' animate-spin' : ''}`} />
          <span className="text-slate-400 text-xs">{rereading ? liveElapsed : elapsed}s</span>
        </div>
      </div>


      {error && <p className="text-red-400 text-center py-3 text-xs px-2 break-words max-w-sm mx-auto">{error}</p>}

      {/* Moves table */}
      {moves.length > 0 && (() => {
        const split = sheetColumns > 1 || moves.length > 15;
        const splitAt = split ? (rowsPerColumn || Math.ceil(moves.length / sheetColumns)) : moves.length;
        const leftMoves = moves.slice(0, splitAt);
        const rightMoves = split ? moves.slice(splitAt) : [];
        const rows = Math.max(leftMoves.length, rightMoves.length);

        return (
          <table className="w-full text-sm">
            <thead className="bg-slate-700">
              <tr className="border-b border-slate-600">
                <th className="px-2 py-1.5 text-slate-400 font-medium text-center w-8">#</th>
                <th className="px-2 py-1.5 text-slate-400 font-medium text-center">White</th>
                <th className="px-2 py-1.5 text-slate-400 font-medium text-center">Black</th>
                {split && <>
                  <th className="px-2 py-1.5 text-slate-400 font-medium text-center w-8 border-l border-slate-600">#</th>
                  <th className="px-2 py-1.5 text-slate-400 font-medium text-center">White</th>
                  <th className="px-2 py-1.5 text-slate-400 font-medium text-center">Black</th>
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
                  if (!move) return <><td className="px-2 py-1" /><td className="px-2 py-1" /><td className="px-2 py-1" /></>;
                  return <>
                    <td className="px-2 py-1 text-slate-500 text-center font-mono">{move.number}</td>
                    <MoveCell
                      value={move.white}
                      legal={move.white_legal}
                      highlight={d?.white}
                      corrected={corrections?.has(`${move.number}-white`)}
                      active={activePly === idx * 2 + 1}
                      reason={move.white_reason}
                      confidence={move.white_confidence}
                      disputed={modelDisagreements?.has(`${move.number}-white`)}
                      onEdit={() => { setEditing({ moveIdx: idx, color: 'white', value: move.white }); onMoveClick?.(moves, idx * 2 + 1); }}
                      onShowBoard={onMoveClick ? () => onMoveClick(moves, idx * 2 + 1) : undefined}
                      onVoteInfo={voteDetails ? () => setVoteInfoKey(`${move.number}-white`) : undefined}
                    />
                    <MoveCell
                      value={move.black || ''}
                      legal={move.black_legal}
                      corrected={corrections?.has(`${move.number}-black`)}
                      highlight={d?.black}
                      active={activePly === idx * 2 + 2}
                      reason={move.black_reason}
                      confidence={move.black_confidence}
                      disputed={modelDisagreements?.has(`${move.number}-black`)}
                      onEdit={() => { if (move.black !== undefined) { setEditing({ moveIdx: idx, color: 'black', value: move.black || '' }); onMoveClick?.(moves, idx * 2 + 2); } }}
                      onShowBoard={onMoveClick && move.black ? () => onMoveClick(moves, idx * 2 + 2) : undefined}
                      onVoteInfo={voteDetails ? () => setVoteInfoKey(`${move.number}-black`) : undefined}
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
            {stats.accuracy}% {t('coaches.accuracy')}
          </span>
        </div>
      )}
      {/* Move quality counts */}
      {moves.length > 0 && !rereading && (() => {
        let illegal = 0, medium = 0, low = 0;
        for (const m of moves) {
          for (const color of ['white', 'black'] as const) {
            if (!m[color]) continue;
            if (m[`${color}_legal` as const] === false) illegal++;
            const conf = m[`${color}_confidence` as 'white_confidence' | 'black_confidence'];
            if (conf === 'medium') medium++;
            if (conf === 'low') low++;
          }
        }
        const disagreementCount = modelDisagreements?.size || 0;
        return (
          <div className="px-2 py-2 border-t border-slate-600/50 flex flex-col items-center gap-0.5 text-xs min-h-[3.5rem]">
            {disagreementCount > 0 && <span className="text-red-400">{disagreementCount} {disagreementCount === 1 ? 'disagreement' : 'disagreements'}</span>}
            {illegal > 0 && <span className="text-orange-400">{illegal} illegal {illegal === 1 ? 'move' : 'moves'}</span>}
            {medium > 0 && <span className="text-yellow-400">{medium} uncertain {medium === 1 ? 'move' : 'moves'}</span>}
            {low > 0 && <span className="text-red-400">{low} low confidence {low === 1 ? 'move' : 'moves'}</span>}
          </div>
        );
      })()}
      {rereading ? (
        <div className="flex items-center justify-center gap-1.5 py-2.5 border-t border-slate-600/50 text-xs text-blue-400 animate-pulse">
          <Clock className="w-3 h-3 animate-spin" />
          <span>{t('coaches.rereading')}</span>
        </div>
      ) : moves.length > 0 && (<>
        {onReread && corrections && corrections.size > 0 && (
          <button
            onClick={onReread}
            className="w-full px-2 py-2.5 border-t border-slate-600/50 text-center text-sm text-blue-400 hover:bg-slate-600/40 transition-colors flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t('coaches.rereadFromEdit')}
          </button>
        )}
        <ChesscomAnalysisButton moves={moves} meta={meta} hasIllegalMoves={hasIllegalMoves} onIllegalClick={() => setShowIllegalModal(true)} />
        <LichessStudyButton moves={moves} meta={meta} fileName={fileName} hasIllegalMoves={hasIllegalMoves} onIllegalClick={() => setShowIllegalModal(true)} />
      </>)}

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-[0.5px]"
          onClick={() => { setEditing(null); onClearPreview?.(); }}
        >
          <div
            className="bg-slate-800 rounded-xl p-4 min-w-[260px] shadow-xl border border-slate-600"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-slate-400 text-xs mb-2 text-center">
              {t('coaches.move')} {moves[editing.moveIdx]?.number} · {editing.color === 'white' ? t('coaches.moveWhite') : t('coaches.moveBlack')}
            </div>
            {moves[editing.moveIdx]?.[`${editing.color}_reason` as 'white_reason' | 'black_reason'] && (
              <p className="text-red-400 text-sm mb-2 text-center">{moves[editing.moveIdx][`${editing.color}_reason` as 'white_reason' | 'black_reason']}</p>
            )}
            <input
              ref={inputRef}
              value={editing.value}
              onChange={e => setEditing({ ...editing, value: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') { handleSave(); onClearPreview?.(); } if (e.key === 'Escape') { setEditing(null); onClearPreview?.(); } }}
              className="w-full bg-slate-700 text-slate-100 font-mono text-sm px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none"
            />
            <MoveSuggestions legalMoves={legalMoves} color={editing.color} value={editing.value} reason={moves[editing.moveIdx]?.[`${editing.color}_reason` as 'white_reason' | 'black_reason']} onSelect={san => {
              setEditing({ ...editing, value: san });
              onPreview?.(editing.moveIdx, editing.color, san);
              playMoveSound(san.includes('x'));
            }} onDeselect={() => {
              const orig = moves[editing.moveIdx]?.[editing.color] || '';
              setEditing({ ...editing, value: orig });
              onClearPreview?.();
              playMoveSound(false);
            }} />
            <div className="mt-3 space-y-1.5">
              <button
                onClick={() => { handleSave(); onClearPreview?.(); }}
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[0.5px]"
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

      {/* Vote info modal */}
      {voteInfoKey && voteDetails?.[voteInfoKey] && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[0.5px]"
          onClick={() => setVoteInfoKey(null)}
        >
          <div
            className="bg-slate-800 rounded-xl p-5 min-w-[300px] max-w-md shadow-xl border border-slate-600 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-slate-100 font-medium text-center">
              {t('coaches.move')} {voteInfoKey.split('-')[0]} · {voteInfoKey.split('-')[1] === 'white' ? t('coaches.moveWhite') : t('coaches.moveBlack')}
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-600 text-slate-400">
                  <th className="py-1.5 text-left px-2">{t('coaches.voteCandidate')}</th>
                  <th className="py-1.5 text-center px-2">{t('coaches.voteVotes')}</th>
                  <th className="py-1.5 text-center px-2">{t('coaches.voteIllegals')}</th>
                </tr>
              </thead>
              <tbody>
                {voteDetails[voteInfoKey].map(d => (
                  <tr key={d.candidate} className={`border-b border-slate-700/50 ${d.chosen ? 'bg-blue-600/20' : ''}`}>
                    <td className="py-1.5 px-2 font-mono text-slate-100">
                      {d.candidate} {d.chosen && <span className="text-blue-400 text-xs">✓</span>}
                    </td>
                    <td className="py-1.5 px-2 text-center text-slate-300">{d.votes}</td>
                    <td className="py-1.5 px-2 text-center text-slate-300">{d.downstreamIllegals >= 100 ? t('coaches.voteItselfIllegal') : d.downstreamIllegals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {voteDetails[voteInfoKey].every(d => !d.chosen) && (
              <p className="text-red-400 text-xs text-center">{t('coaches.voteAllIllegal')}</p>
            )}
            <button
              onClick={() => setVoteInfoKey(null)}
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

function ChesscomAnalysisButton({ moves, meta, hasIllegalMoves, onIllegalClick }: {
  moves: Move[];
  meta?: { white?: string; black?: string; result?: string };
  hasIllegalMoves?: boolean;
  onIllegalClick?: () => void;
}) {
  const { t } = useLanguage();
  const handleClick = () => {
    if (hasIllegalMoves) { onIllegalClick?.(); return; }
    const moveText = moves.map(m =>
      `${m.number}. ${m.white}${m.black ? ' ' + m.black : ''}`
    ).join(' ');
    const pgn = `[White "${meta?.white || '?'}"]\n[Black "${meta?.black || '?'}"]\n[Result "${meta?.result || '*'}"]\n[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]\n\n${moveText} ${meta?.result || '*'}`;
    window.open(`https://www.chess.com/analysis?pgn=${encodeURIComponent(pgn)}`, '_blank');
  };
  return (
    <button
      onClick={handleClick}
      className="w-full px-2 py-2.5 border-t border-slate-600/50 text-center text-sm text-slate-200 hover:bg-slate-600/40 transition-colors flex items-center justify-center gap-1.5"
    >
      <ExternalLink className="w-3.5 h-3.5" /> {t('coaches.lichess.openChesscom')}
    </button>
  );
}


function LichessStudyButton({ moves, meta, fileName, hasIllegalMoves, onIllegalClick }: {
  moves: Move[];
  meta?: { white?: string; black?: string; result?: string };
  fileName?: string | null;
  hasIllegalMoves?: boolean;
  onIllegalClick?: () => void;
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
    if (hasIllegalMoves) { onIllegalClick?.(); return; }
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
        className="w-full px-2 py-2.5 border-t border-slate-600/50 text-center text-sm text-slate-200 hover:bg-slate-600/40 transition-colors flex items-center justify-center gap-1.5"
      >
        <ExternalLink className="w-3.5 h-3.5" /> {t('coaches.lichess.sendToStudy')}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[0.5px]"
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
                  className="inline-flex items-center justify-center gap-1.5 w-full mt-2 bg-blue-600 hover:bg-blue-500 text-white text-xs py-2 rounded-lg transition-colors"
                >
                  {t('coaches.lichess.openStudy')} <ExternalLink className="w-3 h-3" />
                </a>
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
  const isWhite = color === 'white';

  // Extract suggested moves from ambiguous reason (e.g., "Ambiguous: did you mean Nfd2 or Nbd2?")
  const suggestedMoves = useMemo(() => {
    if (!reason) return [];
    const match = reason.match(/did you mean (.+)\?/i);
    if (!match) return [];
    return match[1].split(/ or |, /).map(s => s.trim()).filter(s => legalMoves.includes(s));
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

function MoveCell({ value, legal, highlight, corrected, active, reason, confidence, disputed, onEdit, onShowBoard, onVoteInfo }: {
  value: string;
  legal?: boolean;
  highlight?: boolean;
  corrected?: boolean;
  active?: boolean;
  reason?: string;
  confidence?: 'high' | 'medium' | 'low';
  disputed?: boolean;
  onEdit: () => void;
  onShowBoard?: () => void;
  onVoteInfo?: () => void;
}) {
  const { t } = useLanguage();
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLTableCellElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isLowConfidence = confidence === 'low';
  const isMediumConfidence = confidence === 'medium';
  const bg = active ? 'bg-blue-600/40 text-blue-100' : corrected ? 'bg-green-900/50 text-green-200' : highlight ? 'bg-red-900/50 text-red-200' : isLowConfidence ? 'bg-red-500/20 text-red-200' : isMediumConfidence ? 'bg-yellow-500/20 text-yellow-100' : 'text-slate-100';

  // Close menu when this cell is no longer active
  useEffect(() => {
    if (!active && showMenu) setShowMenu(false);
  }, [active, showMenu]);

  useEffect(() => {
    if (!showMenu) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setShowMenu(false);
    };
    const updatePos = () => {
      if (ref.current && menuRef.current) {
        const rect = ref.current.getBoundingClientRect();
        menuRef.current.style.top = `${rect.bottom + 4}px`;
        menuRef.current.style.left = `${rect.left + rect.width / 2}px`;
      }
    };
    document.addEventListener('mousedown', handle);
    window.addEventListener('scroll', updatePos, true);
    return () => { document.removeEventListener('mousedown', handle); window.removeEventListener('scroll', updatePos, true); };
  }, [showMenu]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onShowBoard) onShowBoard();
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left + rect.width / 2 });
    }
    setShowMenu(!showMenu);
  };

  return (
    <td
      ref={ref}
      className={`px-2 py-1 font-mono text-center cursor-pointer hover:bg-slate-600/50 ${bg}${disputed ? ' ring-1 ring-inset ring-red-500' : ''}`}
      onClick={handleClick}
    >
      <span className="inline-flex items-center justify-center gap-1 w-full">
        {value}
        {legal === true && <span className="text-green-400 text-[10px]">&#10003;</span>}
        {legal === false && <span className="text-red-400 text-[10px]" title={reason}>&#10007;</span>}
      </span>
      {showMenu && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[100] -translate-x-1/2 bg-slate-800 border border-slate-600 rounded-lg shadow-lg whitespace-nowrap"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu(false); onEdit(); }}
            className="block w-full px-4 py-2.5 text-xs text-slate-200 hover:bg-slate-700 text-left rounded-t-lg"
          >
            {t('coaches.editMove')}
          </button>
          {onVoteInfo && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(false); onVoteInfo(); }}
              className="block w-full px-4 py-2.5 text-xs text-slate-200 hover:bg-slate-700 text-left rounded-b-lg border-t border-slate-600"
            >
              {t('coaches.voteInfo')}
            </button>
          )}
        </div>,
        document.body
      )}
    </td>
  );
}
