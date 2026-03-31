// Scoresheet reader page — reads scoresheets with Gemini, supports iterative correction

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

import { Upload, ImageIcon, Clock, Check, ExternalLink, Crop, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
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

/** Replay moves on a board and return copies with canonical SAN (correct +/# annotations). */
function normalizeMoves(moves: Move[]): Move[] {
  const chess = new Chess();
  return moves.map(m => {
    const out: Move = { ...m };
    for (const color of ['white', 'black'] as const) {
      const san = m[color];
      if (!san) continue;
      try {
        const move = chess.move(san);
        if (move) { out[color] = move.san; }
      } catch {
        // illegal move — keep original text
      }
    }
    return out;
  });
}

function buildPgn(moves: Move[], meta?: { white?: string; black?: string; result?: string }): string {
  const headers = [
    `[White "${meta?.white || '?'}"]`,
    `[Black "${meta?.black || '?'}"]`,
    `[Result "${meta?.result || '*'}"]`,
  ].join('\n');
  const normalized = normalizeMoves(moves);
  const moveText = normalized.map(m =>
    `${m.number}. ${m.white}${m.black ? ' ' + m.black : ''}`
  ).join(' ');
  return `${headers}\n\n${moveText} ${meta?.result || '*'}\n`;
}


export function ScoresheetReadPage() {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    scoresheet, scoresheetSetImage, scoresheetStartOneRead,
    scoresheetClear,
  } = useCoachesData();

  const { preview, fileName, error, modelResults, models, startTime, analyzing, azureGrid } = scoresheet;

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


  const [voteState, setVoteState] = useState<{ setEditValue: (san: string) => void; moveIdx: number; color: 'white' | 'black' } | null>(null);

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
  const [consensusPreviewFen, setConsensusPreviewFen] = useState<string | null>(null);

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

              {/* Processing progress bar */}
              {models.length > 0 && (() => {
                const finishedCount = models.filter(m => !!(modelResults[m.id]?.result || modelResults[m.id]?.error)).length;
                const allDone = finishedCount === models.length;
                const pct = models.length > 0 ? Math.round((finishedCount / models.length) * 100) : 0;
                const maxAvg = Math.round(Math.max(...models.map(m => m.avg_elapsed || 0)) * 1.3);
                return (
                  <div className="flex justify-center">
                    <div className="inline-block min-w-[300px] max-w-[400px] w-full">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-slate-300 inline-flex items-center gap-1.5">
                          {!allDone && <Clock className="w-3.5 h-3.5 animate-spin" />}
                          {t('coaches.processing')}
                        </span>
                        <span className="text-sm text-slate-400">
                          {allDone
                            ? <span className="text-emerald-400 inline-flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {t('coaches.status.done')}</span>
                            : <>{liveGlobalElapsed}s{maxAvg > 0 ? <> / ~{maxAvg}s (estimated)</> : ''}</>
                          }
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ease-out ${allDone ? 'bg-emerald-500' : 'bg-blue-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-center mt-1">
                        <span className={`text-sm font-medium ${allDone ? 'text-emerald-500' : 'text-blue-500'}`}>{pct}%</span>
                      </div>
                      {(() => {
                        const r = Object.values(modelResults).find(mr => mr?.result)?.result;
                        if (!r) return null;
                        const parts: string[] = [];
                        if (r.white_player || r.black_player) parts.push(`${r.white_player || '?'} vs ${r.black_player || '?'}`);
                        if (r.result && r.result !== '*') parts.push(r.result);
                        if (r.date) parts.push(r.date);
                        if (r.event) parts.push(r.event);
                        if (parts.length === 0) return null;
                        return (
                          <p className="text-xs text-slate-400 text-center mt-2">{parts.join(' — ')}</p>
                        );
                      })()}
                    </div>
                  </div>
                );
              })()}

              {/* Old model status table removed — see git history (commit 6309c734) */}

              {/* Re-analyze button — hidden for now */}

              {/* Results: consensus + individual reads */}
              {models.length > 0 && (() => {
                // Get column info from any model that has results (for GT panel consistency)
                const anyResult = Object.values(modelResults).find(r => r?.result)?.result;
                const sheetColumns = (anyResult as any)?.columns || 1;
                const rowsPerColumn = (anyResult as any)?.rows_per_column || null;

                // Average grid boundaries across models that returned them
                // Azure DI provides grid cell coordinates; no Gemini grid fallback
                const gridData = (() => {
                  if (azureGrid && azureGrid.cells && Object.keys(azureGrid.cells).length > 0) {
                    return azureGrid;
                  }
                  return undefined;
                })();

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
                        if (val) values.add(val.replace(/[+#x]/g, ''));
                      }
                      if (values.size > 1) modelDisagreements.add(`${i + 1}-${color}`);
                    }
                  }
                }

                return (
                <div className="space-y-8">
                  {/* Results */}
                  <div className="border border-slate-600/50 rounded-xl overflow-hidden">
                    <div className="w-full flex items-center justify-center px-6 py-3">
                      <span className="text-base text-slate-100 font-medium">{t('coaches.results') || 'Results'}</span>
                    </div>
                    <div className="border-t border-slate-600/50 py-4">
                  {(() => {
                    const modelEntries = models
                      .filter(m => modelResults[m.id]?.result?.moves && modelResults[m.id]!.result!.moves.length > 0)
                      .map(m => ({ name: m.name, moves: modelResults[m.id]!.result!.moves }));
                    const allModelMoves = modelEntries.map(e => e.moves);
                    const modelNames = modelEntries.map(e => e.name);
                    const hasResults = allModelMoves.length >= 1;
                    const allModelsFinished = allModelMoves.length === models.length;
                    const consensusReady = allModelMoves.length >= 2 && allModelsFinished;

                    const consensusId = '__consensus__';

                    // Early display: if only 1 model has results, show its moves directly (read-only)
                    let consensusMoves: Move[];
                    let voteDetails: Record<string, { candidate: string; votes: number; downstreamIllegals: number; chosen: boolean; models: string[]; confidenceByModel: Record<string, string>; pass1Choice?: string }[]>;

                    if (allModelMoves.length === 1) {
                      // Single model — use its validated moves, no vote details
                      consensusMoves = allModelMoves[0].map((m, i) => ({ ...m, number: i + 1 }));
                      voteDetails = {};
                    } else if (allModelMoves.length === 0) {
                      consensusMoves = [];
                      voteDetails = {};
                    } else {

                    const maxLen = allModelMoves.length > 0 ? Math.max(...allModelMoves.map(mv => mv.length)) : 0;
                    // Two-pass smart consensus algorithm.

                    // Helper: run one greedy pass given a downstream reference sequence
                    const runConsensusPass = (downstreamRef: Move[]) => {
                      const result: Move[] = [];
                      const details: Record<string, { candidate: string; votes: number; downstreamIllegals: number; chosen: boolean; models: string[]; confidenceByModel: Record<string, string> }[]> = {};
                      const passChess = new Chess();

                      for (let i = 0; i < maxLen; i++) {
                        const move: Move = { number: i + 1, white: '' };
                        for (const color of ['white', 'black'] as const) {
                          const votes: Record<string, number> = {};
                          const votersByCandidate: Record<string, string[]> = {};
                          const confidenceByModel: Record<string, string> = {};
                          for (let mi = 0; mi < allModelMoves.length; mi++) {
                            const moveObj = allModelMoves[mi][i];
                            const val = moveObj?.[color];
                            if (val) {
                              const normalized = val.replace(/[+#x]/g, '');
                              votes[normalized] = (votes[normalized] || 0) + 1;
                              if (!votersByCandidate[normalized]) votersByCandidate[normalized] = [];
                              votersByCandidate[normalized].push(modelNames[mi]);
                              const conf = moveObj?.[`${color}_confidence` as 'white_confidence' | 'black_confidence'];
                              if (conf) confidenceByModel[modelNames[mi]] = conf;
                            }
                          }
                          const candidates = Object.entries(votes).sort((a, b) => b[1] - a[1]);
                          if (candidates.length === 0) continue;

                          const detailKey = `${i + 1}-${color}`;
                          if (candidates.length === 1) {
                            (move as any)[color] = candidates[0][0];
                            details[detailKey] = [{ candidate: candidates[0][0], votes: candidates[0][1], downstreamIllegals: 0, chosen: true, models: votersByCandidate[candidates[0][0]] || [], confidenceByModel }];
                            try { passChess.move(candidates[0][0]); } catch { /* validation will catch */ }
                          } else {
                            let bestCandidate = candidates[0][0];
                            let bestIllegals = Infinity;
                            let bestVotes = candidates[0][1];
                            const dets: { candidate: string; votes: number; downstreamIllegals: number; chosen: boolean; models: string[]; confidenceByModel: Record<string, string> }[] = [];

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

                              dets.push({ candidate, votes: voteCount, downstreamIllegals: illegals, chosen: false, models: votersByCandidate[candidate] || [], confidenceByModel });
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
                              fen[3] = '-'; // clear en-passant square to keep FEN valid
                              passChess.load(fen.join(' '));
                            } else {
                              for (const d of dets) { if (d.candidate === bestCandidate) d.chosen = true; }
                              details[detailKey] = dets;
                              (move as any)[color] = bestCandidate;
                              try { passChess.move(bestCandidate); } catch {
                                const fen = passChess.fen().split(' ');
                                fen[1] = fen[1] === 'w' ? 'b' : 'w';
                                fen[3] = '-'; // clear en-passant square to keep FEN valid
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
                            const normalized = val.replace(/[+#x]/g, '');
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

                    consensusMoves = pass2.moves;
                    // Combine pass1 and pass2 details for the vote info modal
                    voteDetails = {};
                    for (const key of Object.keys(pass2.details)) {
                      const p1Choice = pass1.details[key]?.find(d => d.chosen)?.candidate;
                      voteDetails[key] = pass2.details[key].map(d => ({ ...d, pass1Choice: p1Choice }));
                    }

                    } // end else (>= 2 models)

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
                              (cm as any)[`${color}_reason`] = `Ambiguous (${candidates.join('/')}) → ${bestAmbig}`;
                              try { valChess.move(bestAmbig); (cm as any)[`${color}_legal`] = true; }
                              catch { (cm as any)[`${color}_legal`] = false; }
                              continue;
                            } else if (candidates.length === 1) {
                              // Only one legal move by this piece to this square — auto-fix
                              (cm as any)[color] = candidates[0];
                              (cm as any)[`${color}_reason`] = `Auto-fixed → ${candidates[0]}`;
                              try { valChess.move(candidates[0]); (cm as any)[`${color}_legal`] = true; }
                              catch { (cm as any)[`${color}_legal`] = false; }
                              continue;
                            }
                          }
                          // Not ambiguity, just illegal
                          (cm as any)[`${color}_legal`] = false;
                          const fen = valChess.fen().split(' ');
                          fen[1] = fen[1] === 'w' ? 'b' : 'w';
                          fen[3] = '-'; // clear en-passant square to keep FEN valid
                          valChess.load(fen.join(' '));
                        }
                      }
                    }
                    // Remove disagreements where consensus is legal, backed by 2+ models, and all dissenters are illegal
                    for (const key of [...modelDisagreements]) {
                      const [numStr, colorStr] = key.split('-');
                      const idx = parseInt(numStr) - 1;
                      const color = colorStr as 'white' | 'black';
                      const details = voteDetails?.[key];
                      const cMove = consensusMoves[idx]?.[color];
                      const cLegal = consensusMoves[idx]?.[`${color}_legal` as 'white_legal' | 'black_legal'];
                      if (!details || !cMove || cLegal === false) continue;
                      const chosen = details.find((d: { chosen: boolean }) => d.chosen);
                      if (!chosen || chosen.votes < 2) continue;
                      const ch = new Chess();
                      try {
                        for (let j = 0; j < idx; j++) {
                          if (consensusMoves[j]?.white) ch.move(consensusMoves[j].white);
                          if (consensusMoves[j]?.black) ch.move(consensusMoves[j].black!);
                        }
                        if (color === 'black' && consensusMoves[idx]?.white) ch.move(consensusMoves[idx].white);
                      } catch { continue; }
                      const allDissentersIllegal = details.every((d: { chosen: boolean; candidate: string }) => {
                        if (d.chosen) return true;
                        try { ch.move(d.candidate); ch.undo(); return false; } catch { return true; }
                      });
                      if (allDissentersIllegal) modelDisagreements.delete(key);
                    }

                    const consensusColumns = sheetColumns;
                    const consensusRowsPerColumn = rowsPerColumn;

                    // Build consensus meta (player names + result) from model results
                    const consensusMeta: { white?: string; black?: string; result?: string } = {};
                    {
                      const results = Object.values(modelResults).map(mr => mr?.result).filter(Boolean);
                      const pick = (vals: (string | undefined)[]) => {
                        const counts: Record<string, number> = {};
                        for (const v of vals) { if (v) counts[v] = (counts[v] || 0) + 1; }
                        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                        return sorted[0]?.[0] || undefined;
                      };
                      consensusMeta.white = pick(results.map(r => r!.white_player));
                      consensusMeta.black = pick(results.map(r => r!.black_player));
                      consensusMeta.result = pick(results.map(r => r!.result));
                    }

                    // Apply overrides on top of computed consensus, then normalize +/# annotations
                    const rawConsensusMoves = consensusOverrides || consensusMoves;
                    const displayConsensusMoves = normalizeMoves(rawConsensusMoves);
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
                    const handleConfirmMove = (moveNumber: number, color: 'white' | 'black') => {
                      const current = consensusOverrides || [...consensusMoves.map(m => ({ ...m }))];
                      const idx = moveNumber - 1;
                      if (current[idx]) {
                        delete (current[idx] as any)[`${color}_reason`];
                        // Clear the disagreement highlight by ensuring the move is marked as confirmed
                        (current[idx] as any)[`${color}_confirmed`] = true;
                      }
                      setConsensusOverrides([...current]);
                    };
                    const handleConsensusBoardPly = (ply: number) => {
                      setModelBoardPlys(prev => ({ ...prev, [consensusId]: { ply, source: 'nav' as const } }));
                      setConsensusPreviewFen(null); // Clear drag preview when navigating
                    };
                    const deselectConsensus = () => {
                      setModelBoardPlys(p => { const rest = { ...p }; delete rest[consensusId]; return rest; });
                    };
                    // Compute unresolved moves for review bar
                    const hasIssues = allModelsFinished && (modelDisagreements.size > 0 || displayConsensusMoves.some(m => m.white_reason || m.black_reason) || displayConsensusMoves.some(m => m.white_legal === false || m.black_legal === false));
                    const unresolvedPlies: number[] = [];
                    if (allModelsFinished) {
                      displayConsensusMoves.forEach((m, idx) => {
                        const d = modelDisagreements.has(`${m.number}-white`) || !!m.white_reason || m.white_legal === false || m.white_confidence === 'low';
                        const dBlack = modelDisagreements.has(`${m.number}-black`) || !!m.black_reason || m.black_legal === false || m.black_confidence === 'low';
                        if (d && !(m as any).white_confirmed) unresolvedPlies.push(idx * 2 + 1);
                        if (dBlack && m.black && !(m as any).black_confirmed) unresolvedPlies.push(idx * 2 + 2);
                      });
                    }
                    const allVerified = hasIssues && unresolvedPlies.length === 0;
                    const unresolvedMovesList = unresolvedPlies.map(ply => {
                      const moveIdx = Math.floor((ply - 1) / 2);
                      const color = ply % 2 === 1 ? 'white' : 'black';
                      return { moveNumber: moveIdx + 1, color: color as 'white' | 'black', ply };
                    });

                    return (<>
                        {allModelsFinished && allVerified && (
                          <div className="flex justify-center mb-3 animate-[fadeIn_0.4s_ease-out]">
                            <div className="inline-flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 rounded-lg px-4 py-2">
                              <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center animate-[scaleIn_0.3s_ease-out]">
                                <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                              </span>
                              <span className="text-sm text-emerald-300 font-medium">Verification complete — PGN is ready</span>
                            </div>
                          </div>
                        )}
                        <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr] md:gap-4 md:px-4 items-start" onClick={consensusReady ? deselectConsensus : undefined}>
                          {/* Left: scoresheet image */}
                          <div className="flex justify-end items-center" onClick={e => e.stopPropagation()}>
                            <ScoreSheetImage preview={preview} onImageClick={() => setShowImageModal(true)} fileName={fileName || undefined} activePly={modelBoardPlys[consensusId]?.ply} sheetColumns={consensusColumns} rowsPerColumn={consensusRowsPerColumn} totalMoves={displayConsensusMoves.length} gridData={gridData} />
                          </div>
                          {/* Center: moves table */}
                          <div className="self-start" onClick={e => e.stopPropagation()}>
                            {!hasResults || consensusMoves.length === 0 ? (
                              <div className="bg-slate-700/50 rounded-xl overflow-hidden self-start min-w-[540px]">
                                <div className="flex items-center justify-center gap-2 text-slate-400 animate-pulse-sync py-12">
                                  <Clock className="w-4 h-4 animate-spin" />
                                  <span className="text-sm">{t('coaches.analyzing')}</span>
                                </div>
                              </div>
                            ) : (
                            <MovesPanel
                              label={!allModelsFinished || analyzing ? `${t('coaches.processing')}...` : t('coaches.consensus')}
                              moves={displayConsensusMoves}

                              disagreements={(() => {
                                const m = new Map<number, { white: boolean; black: boolean }>();
                                modelDisagreements.forEach(key => {
                                  const [numStr, color] = key.split('-');
                                  const num = parseInt(numStr);
                                  const existing = m.get(num) || { white: false, black: false };
                                  existing[color as 'white' | 'black'] = true;
                                  m.set(num, existing);
                                });
                                return m;
                              })()}
                              elapsed={!allModelsFinished || analyzing ? liveGlobalElapsed : Math.max(...models.map(m => modelResults[m.id]?.elapsed || 0))}
                              loading={!allModelsFinished || analyzing}
                              meta={consensusMeta}
                              fileName={fileName}
                              onEditSave={allModelsFinished && !analyzing ? (confirmed, corrKey) => handleConsensusEditSave(0, confirmed, corrKey) : undefined}
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
                              voteDetails={allModelsFinished && !analyzing ? voteDetails : undefined}

                              onVoteStateChange={setVoteState}
                              unresolvedMoves={hasIssues && !allVerified ? unresolvedMovesList : undefined}
                            />
                            )}
                          </div>
                          {/* Right: board + detail panel */}
                          <div className="flex flex-col items-start gap-3 max-w-[400px]" onClick={e => e.stopPropagation()}>
                            <ModelBoard moves={hasResults ? displayConsensusMoves : []} externalPly={hasResults ? modelBoardPlys[consensusId]?.ply : 0} onPlyChange={hasResults ? handleConsensusBoardPly : () => {}} disableDrag={!voteState} autoActivate={false} previewFen={consensusPreviewFen} targetPly={voteState ? (voteState.color === 'white' ? voteState.moveIdx * 2 + 1 : voteState.moveIdx * 2 + 2) : undefined} onDragSetMove={voteState ? (san) => {
                              if (!san) { voteState.setEditValue(''); return; }
                              voteState.setEditValue(san);
                            } : undefined} highlightedPlies={hasResults && allModelsFinished ? (() => {
                              const plies: number[] = [];
                              displayConsensusMoves.forEach((m, idx) => {
                                const d = modelDisagreements.has(`${m.number}-white`) || !!m.white_reason || m.white_legal === false || m.white_confidence === 'low';
                                const dBlack = modelDisagreements.has(`${m.number}-black`) || !!m.black_reason || m.black_legal === false || m.black_confidence === 'low';
                                if (d && !(m as any).white_confirmed) plies.push(idx * 2 + 1);
                                if (dBlack && m.black && !(m as any).black_confirmed) plies.push(idx * 2 + 2);
                              });
                              return plies;
                            })() : undefined} />
                            {/* Move detail panel */}
                            {voteState && allModelsFinished && !analyzing && (() => {
                              const moveIdx = voteState.moveIdx;
                              const colorStr = voteState.color;
                              const moveObj = displayConsensusMoves[moveIdx];
                              if (!moveObj) return null;
                              const displayMove = moveObj[colorStr] || '—';
                              const isIllegal = moveObj[`${colorStr}_legal` as 'white_legal' | 'black_legal'] === false;
                              const reason = moveObj[`${colorStr}_reason` as 'white_reason' | 'black_reason'];
                              // Zoomed scoresheet cell
                              const cellCrop = preview && gridData?.cells ? (() => {
                                const rows = consensusRowsPerColumn || Math.ceil(displayConsensusMoves.length / Math.max(consensusColumns, 1));
                                const sheetCol = Math.floor(moveIdx / rows);
                                const rowInCol = moveIdx % rows;
                                const azureCols = gridData.col_count || 4;
                                const colsPerSection = Math.round(azureCols / Math.max(consensusColumns, 1));
                                const moveNumOffset = colsPerSection >= 3 ? 1 : 0;
                                const azureCol = sheetCol * colsPerSection + moveNumOffset + (colorStr === 'black' ? 1 : 0);
                                const rowOffset = gridData.first_move_row ?? (gridData.row_count && gridData.row_count > rows ? 1 : 0);
                                const azureRow = rowInCol + rowOffset;
                                const cell = gridData.cells![`${azureRow}-${azureCol}`];
                                if (!cell) return null;
                                const padX = (cell.x2 - cell.x1) * 0.2;
                                const padY = (cell.y2 - cell.y1) * 0.2;
                                const cx1 = Math.max(0, cell.x1 - padX);
                                const cy1 = Math.max(0, cell.y1 - padY);
                                const cx2 = Math.min(1, cell.x2 + padX);
                                const cy2 = Math.min(1, cell.y2 + padY);
                                const cropW = cx2 - cx1;
                                const cropH = cy2 - cy1;
                                const cW = 180;
                                const cH = cW * (cropH / cropW);
                                return { cx1, cy1, cropW, cropH, cW, cH };
                              })() : null;
                              const targetPly = colorStr === 'white' ? moveIdx * 2 + 1 : moveIdx * 2 + 2;
                              const boardAtTarget = modelBoardPlys[consensusId]?.ply === targetPly;
                              return (
                                <div className="w-full space-y-2 bg-slate-700/50 rounded-xl p-4">
                                  <h3 className="text-slate-100 font-medium text-sm text-center">
                                    Move {moveIdx + 1} ({colorStr === 'black' ? 'Black' : 'White'})
                                  </h3>
                                  {(isIllegal || reason) && (
                                    <p className="text-yellow-400 text-xs text-center">
                                      {isIllegal && 'Illegal move'}
                                      {isIllegal && reason && ' · '}
                                      {reason}
                                    </p>
                                  )}
                                  {cellCrop && (
                                    <div className="rounded-lg overflow-hidden border border-slate-600 mx-auto" style={{ width: cellCrop.cW, height: cellCrop.cH }}>
                                      <img src={preview} alt="Cell" draggable={false} style={{ display: 'block', width: cellCrop.cW / cellCrop.cropW, height: cellCrop.cH / cellCrop.cropH, marginLeft: -(cellCrop.cx1 / cellCrop.cropW) * cellCrop.cW, marginTop: -(cellCrop.cy1 / cellCrop.cropH) * cellCrop.cH, maxWidth: 'none' }} />
                                    </div>
                                  )}
                                  <div className="text-center py-1">
                                    <p className="text-lg text-slate-100 font-semibold">Read as <span className="font-mono">{displayMove}</span></p>
                                  </div>
                                  <div className="flex flex-col gap-1.5">
                                    <p className="text-sm text-slate-100 text-center">Confirm, or drag a piece on the board</p>
                                    {boardAtTarget ? (
                                      <button
                                        onClick={() => handleConfirmMove(moveIdx + 1, colorStr)}
                                        className="w-full bg-emerald-700 hover:bg-emerald-600 text-white text-xs py-1.5 rounded-lg transition-colors"
                                      >
                                        Confirm {displayMove}
                                      </button>
                                    ) : (
                                      <button disabled className="w-full text-xs py-1.5 rounded-lg bg-slate-700 text-slate-500 cursor-not-allowed">
                                        Confirm
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                        {/* Mobile: image above table */}
                        <div className="md:hidden flex flex-col items-center gap-3">
                          <img src={preview} alt="Scoresheet" className="max-h-[200px] rounded-xl object-contain cursor-pointer" onClick={() => setShowImageModal(true)} />
                          {!hasResults || consensusMoves.length === 0 ? (
                            <div className="bg-slate-700/50 rounded-xl overflow-hidden min-w-[320px]">
                              <div className="flex items-center justify-center gap-2 text-slate-400 animate-pulse-sync py-12">
                                <Clock className="w-4 h-4 animate-spin" />
                                <span className="text-sm">{t('coaches.analyzing')}</span>
                              </div>
                            </div>
                          ) : (
                            <MovesPanel
                              label={!allModelsFinished || analyzing ? `${t('coaches.processing')}...` : t('coaches.consensus')}
                              moves={displayConsensusMoves}
                              disagreements={new Map()}
                              elapsed={!allModelsFinished || analyzing ? liveGlobalElapsed : Math.max(...models.map(m => modelResults[m.id]?.elapsed || 0))}
                              loading={!allModelsFinished || analyzing}
                              meta={consensusMeta}
                              fileName={fileName}
                              onMoveClick={(_movesArr, ply) => {
                                setModelBoardPlys(p => ({ ...p, [consensusId]: { ply, source: 'read' as const } }));
                              }}
                              activePly={modelBoardPlys[consensusId]?.ply}
                              sheetColumns={consensusColumns}
                              rowsPerColumn={consensusRowsPerColumn}
                            />
                          )}
                        </div>
                    </>);
                  })()}
                    </div>
                  </div>



                  {/* Azure DI section — disabled, kept for future use */}

                  {/* New scoresheet button — bottom of page, only after processing */}
                  {!analyzing && (
                    <div className="flex justify-center py-4">
                      <button
                        onClick={() => { scoresheetClear(); fileInputRef.current?.click(); }}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors text-sm bg-slate-700 border-slate-600 hover:bg-slate-600 text-slate-300"
                      >
                        <Upload className="w-4 h-4" />
                        {t('coaches.replaceImage')}
                      </button>
                    </div>
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
          className="fixed inset-0 z-50 flex items-center justify-center pl-56 2xl:pl-64 bg-slate-900/60 backdrop-blur-[0.5px] cursor-pointer"
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

function ScoreSheetImage({ preview, onImageClick, fileName, activePly, sheetColumns = 1, rowsPerColumn, totalMoves, gridData }: { preview: string; onImageClick: () => void; fileName?: string; activePly?: number; sheetColumns?: number; rowsPerColumn?: number | null; totalMoves?: number; gridData?: { top: number; bottom: number; tilt: number; col_dividers: number[]; cells?: Record<string, { x1: number; y1: number; x2: number; y2: number }>; col_count?: number; row_count?: number; first_move_row?: number } }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number; nw: number; nh: number } | null>(null);

  const highlight = activePly != null && activePly > 0 && totalMoves && imgSize && gridData?.cells ? (() => {
    const rows = rowsPerColumn || Math.ceil(totalMoves / Math.max(sheetColumns, 1));
    const moveIdx = Math.floor((activePly - 1) / 2);
    const isBlack = activePly % 2 === 0;
    const sheetCol = Math.floor(moveIdx / rows);
    const rowInCol = moveIdx % rows;
    const scale = imgSize.w / imgSize.nw;
    const azureCols = gridData.col_count || 4;
    const colsPerSection = Math.round(azureCols / Math.max(sheetColumns, 1));
    const moveNumOffset = colsPerSection >= 3 ? 1 : 0;
    const azureCol = sheetCol * colsPerSection + moveNumOffset + (isBlack ? 1 : 0);
    const rowOffset = gridData.first_move_row ?? (gridData.row_count && gridData.row_count > rows ? 1 : 0);
    const cell = gridData.cells![`${rowInCol + rowOffset}-${azureCol}`];
    if (!cell) return null;
    const scaledNH = imgSize.nh * scale;
    const x = cell.x1 * imgSize.w, y = cell.y1 * scaledNH;
    const w = (cell.x2 - cell.x1) * imgSize.w, h = (cell.y2 - cell.y1) * scaledNH;
    const pad = { x: w * 0.2, y: h * 0.2 };
    return { left: x - pad.x, top: y - pad.y, width: w + pad.x * 2, height: h + pad.y * 2, tilt: gridData.tilt || 0 };
  })() : null;

  return (
    <div className="flex flex-col items-center">
      <div className="relative overflow-hidden rounded-xl">
        <img
          ref={imgRef}
          src={preview}
          alt="Scoresheet"
          className="object-cover object-top cursor-pointer hover:opacity-90 transition-opacity max-w-[320px] max-h-[600px]"
          onClick={onImageClick}
          onLoad={() => { if (imgRef.current) setImgSize({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight, nw: imgRef.current.naturalWidth, nh: imgRef.current.naturalHeight }); }}
        />
        {highlight && (
          <div
            className="absolute pointer-events-none rounded-sm transition-all duration-200"
            style={{
              left: highlight.left, top: highlight.top, width: highlight.width, height: highlight.height,
              backgroundColor: 'rgba(59, 130, 246, 0.3)', border: '2px solid rgba(59, 130, 246, 0.7)',
              transform: highlight.tilt ? `rotate(${highlight.tilt}deg)` : undefined, transformOrigin: 'left center',
            }}
          />
        )}
      </div>
      {fileName && <span className="text-slate-100 text-sm mt-2 truncate max-w-full">{fileName}</span>}
    </div>
  );
}

// Track which ModelBoard instance is "active" (last interacted with)
let activeModelBoardId = 0;
let nextModelBoardId = 0;

function ModelBoard({ moves, externalPly, onPlyChange, disableDrag, autoActivate, previewFen, highlightedPlies: _highlightedPlies, onDragSetMove, compact, targetPly }: { moves: Move[]; externalPly?: number; onPlyChange?: (ply: number) => void; disableDrag?: boolean; autoActivate?: boolean; previewFen?: string | null; highlightedPlies?: number[]; onDragSetMove?: (san: string) => void; compact?: boolean; targetPly?: number }) {
  const { t } = useLanguage();
  const [instanceId] = useState(() => ++nextModelBoardId);
  const [ply, setPly] = useState(0);
  const lastEmittedPly = useRef<number | undefined>(undefined);

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
          fen[3] = '-'; // clear en-passant square to keep FEN valid
          chess.load(fen.join(' '));
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
  const currentArrow = showArrow ? entries[safePly].lastMove : null;
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
  useEffect(() => {
    if (externalPly !== undefined && externalPly !== lastEmittedPly.current) {
      setPly(externalPly); exitBranch(); activeModelBoardId = instanceId;
    }
    lastEmittedPly.current = undefined;
  }, [externalPly, exitBranch, instanceId]);


  // Play sound for a given ply (called from navigation actions, not from effects)
  const playSoundForPly = useCallback((p: number) => {
    if (p > 0 && entries[p]?.san) playMoveSound(entries[p].san!.includes('x'));
  }, [entries]);

  // Emit ply change to parent, marking it so the externalPly echo is skipped
  const emitPly = useCallback((p: number) => {
    lastEmittedPly.current = p;
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
      setPly(p => {
        const newP = Math.max(0, p - 1);
        if (newP !== p) { playSoundForPly(p); emitPly(newP); }
        return newP;
      });
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
      setPly(p => {
        const newP = Math.min(maxPly, p + 1);
        if (newP !== p) { playSoundForPly(newP); emitPly(newP); }
        return newP;
      });
    }
  }, [branch, branchPly, inBranch, maxPly, playSoundForPly, emitPly, onDragSetMove]);

  const goFirst = useCallback(() => {
    exitBranch(); setPly(p => { if (p !== 0) { playSoundForPly(p); emitPly(0); } return 0; });
  }, [exitBranch, playSoundForPly, emitPly]);
  const goLast = useCallback(() => {
    exitBranch(); setPly(p => { if (p !== maxPly) { playSoundForPly(maxPly); emitPly(maxPly); } return maxPly; });
  }, [exitBranch, maxPly, playSoundForPly, emitPly]);

  // Handle user move (drag & drop)
  const handleUserMove = useCallback((from: string, to: string) => {
    // Detect reverse of last move (dragging piece back) → go previous
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

      // Check if matches next main-line move
      if (!inBranch && safePly < maxPly && entries[safePly + 1]?.san === san) {
        if (onDragSetMove) onDragSetMove(san);
        setPly(p => p + 1);
        emitPly(safePly + 1);
        playMoveSound(san.includes('x'));
        return;
      }

      // When vote modal is open and not yet in a branch, set the vote value and create a one-move branch
      // Note: do NOT call onPlyChange here — it would update externalPly which triggers an effect
      // that destroys the branch we just created (feedback loop via parent state)
      if (onDragSetMove && !inBranch) {
        onDragSetMove(san);
        setBranch({ startPly: safePly, fens: [entries[safePly].fen, newFen], sans: [san] });
        setBranchPly(1);
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
        // Clear vote selection when extending beyond the first variation move
        if (onDragSetMove) onDragSetMove('');
      } else {
        setBranch({ startPly: safePly, fens: [entries[safePly].fen, newFen], sans: [san] });
        setBranchPly(1);
      }
      playMoveSound(san.includes('x'));
    } catch { /* invalid move */ }
  }, [currentFen, inBranch, branch, branchPly, safePly, maxPly, entries, onDragSetMove, goPrev]);

  // Activate this board on any click, then keyboard only responds to active board
  const activate = useCallback(() => { activeModelBoardId = instanceId; }, [instanceId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
  }, [instanceId, goPrev, goNext, goFirst, goLast, onDragSetMove]);


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
      <div className="relative flex justify-center gap-1.5 mt-1.5 w-full">
        {!compact && (
          <button onClick={goFirst} className="flex-1 max-w-[80px] py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors flex items-center justify-center">
            <ChevronFirst className="w-5 h-5" />
          </button>
        )}
        {compact ? (
          <>
            <button onClick={goPrev} className="flex-1 py-1 2xl:py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors flex items-center justify-center gap-1 text-xs 2xl:text-sm">
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
            <button onClick={goNext} className="flex-1 py-1 2xl:py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors flex items-center justify-center gap-1 text-xs 2xl:text-sm">
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <button onClick={goPrev} className="flex-1 max-w-[80px] py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors flex items-center justify-center">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={goNext} className="flex-1 max-w-[80px] py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors flex items-center justify-center">
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
        {!compact && (
          <button onClick={goLast} className="flex-1 max-w-[80px] py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition-colors flex items-center justify-center">
            <ChevronLast className="w-5 h-5" />
          </button>
        )}
      </div>
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



function MovesPanel({ label, moves, disagreements, elapsed, error, meta, fileName, rereading, corrections, onEditSave, onReread, onMoveClick, activePly, onPreview, onClearPreview, sheetColumns = 1, rowsPerColumn, originalMoves, voteDetails, showMoveInfo, loading, onVoteStateChange, unresolvedMoves }: {
  label: string;
  moves: Move[];
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
  voteDetails?: Record<string, { candidate: string; votes: number; downstreamIllegals: number; chosen: boolean; models: string[]; confidenceByModel: Record<string, string>; pass1Choice?: string }[]>;

  showMoveInfo?: boolean;
  loading?: boolean;
  onVoteStateChange?: (state: { setEditValue: (san: string) => void; moveIdx: number; color: 'white' | 'black' } | null) => void;
  unresolvedMoves?: { moveNumber: number; color: 'white' | 'black'; ply: number }[];
}) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState<{ moveIdx: number; color: 'white' | 'black'; value: string } | null>(null);
  const [editFromVoteKey, setEditFromVoteKey] = useState<string | null>(null);
  const [liveElapsed, setLiveElapsed] = useState(0);
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
      });
    } else {
      onVoteStateChange(null);
    }
  }, [voteInfoKey, onVoteStateChange]);

  const [moveInfoKey, setMoveInfoKey] = useState<string | null>(null);
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
    setEditFromVoteKey(null);

    // Build all moves with the edit applied, clear legality for re-validation
    const confirmed: Move[] = [];
    for (let i = 0; i < moves.length; i++) {
      const m = { ...moves[i] };
      if (i === editedMoveIdx) {
        m[editedColor] = editedValue;
        (m as any)[`${editedColor}_confirmed`] = true;
        delete (m as any)[`${editedColor}_reason`];
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
      <div className="px-3 py-2.5 border-b border-slate-600 relative flex items-center justify-center">
        <span className="text-slate-100 font-medium text-sm">{label}</span>
        <div className="absolute right-3 flex items-center gap-1">
          <Clock className={`w-3 h-3 text-slate-400${rereading ? ' animate-spin' : ''}`} />
          <span className="text-slate-400 text-xs">{rereading ? liveElapsed : elapsed}s</span>
        </div>
      </div>


      {error && <p className="text-red-400 text-center py-3 text-xs px-2 break-words max-w-sm mx-auto">{error}</p>}

      {/* Game result */}
      {meta?.result && meta.result !== '*' && (
        <div className="px-3 py-1.5 border-b border-slate-600/30 text-center">
          <span className="text-slate-300 text-xs">
            {meta.white || '?'} vs {meta.black || '?'} — <span className="font-semibold text-slate-100">{meta.result}</span>
          </span>
        </div>
      )}

      {/* Review summary bar */}
      {unresolvedMoves && unresolvedMoves.length > 0 && (
        <div className="px-3 py-2 border-b border-yellow-500/20 bg-yellow-500/10 text-center">
          <p className="text-sm text-yellow-200/80 mb-1.5">You need to review those moves:</p>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {unresolvedMoves.map(({ moveNumber, color }) => (
              <span
                key={`${moveNumber}-${color}`}
                className="px-2 py-0.5 rounded text-sm bg-yellow-500/30 text-yellow-100"
              >
                {moveNumber} ({color === 'white' ? 'White' : 'Black'})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Moves table */}
      <div className={`${loading ? 'pointer-events-none' : ''}`}>
      {moves.length > 0 && (() => {
        const numCols = sheetColumns > 1 ? sheetColumns : (moves.length > 15 ? 2 : 1);
        const perCol = rowsPerColumn || Math.ceil(moves.length / numCols);
        const columns = Array.from({ length: numCols }, (_, c) => moves.slice(c * perCol, (c + 1) * perCol));
        const rows = Math.max(...columns.map(col => col.length));

        const renderHalf = (move: Move | undefined, idx: number, d: { white: boolean; black: boolean } | undefined) => {
          if (!move) return <><td className="px-3 py-1.5" /><td className="px-3 py-1.5" /><td className="px-3 py-1.5" /></>;
          return <>
            <td className="px-3 py-1.5 text-slate-500 text-center font-mono">{move.number}</td>
            <MoveCell
              value={move.white}
              legal={move.white_legal}
              highlight={(d?.white || !!move.white_reason) && !(move as any).white_confirmed}
              corrected={corrections?.has(`${move.number}-white`) || (originalMoves && originalMoves[idx]?.white !== move.white && move.white_legal !== false) || !!(move as any).white_confirmed}
              active={activePly === idx * 2 + 1}
              reason={move.white_reason}
              confidence={move.white_confidence}
              onShowBoard={onMoveClick ? () => onMoveClick(moves, idx * 2 + 1) : undefined}
              onVoteInfo={voteDetails ? () => { setVoteInfoKey(`${move.number}-white`); setVoteEditValue(move.white || ''); onMoveClick?.(moves, idx * 2 + 1); } : undefined}
              onMoveInfo={showMoveInfo ? () => setMoveInfoKey(`${move.number}-white`) : undefined}
            />
            <MoveCell
              value={move.black || ''}
              legal={move.black_legal}
              corrected={corrections?.has(`${move.number}-black`) || (originalMoves && originalMoves[idx]?.black !== move.black && move.black_legal !== false) || !!(move as any).black_confirmed}
              highlight={(d?.black || !!move.black_reason) && !(move as any).black_confirmed}
              active={activePly === idx * 2 + 2}
              reason={move.black_reason}
              confidence={move.black_confidence}
              onShowBoard={onMoveClick && move.black ? () => onMoveClick(moves, idx * 2 + 2) : undefined}
              onVoteInfo={voteDetails ? () => { setVoteInfoKey(`${move.number}-black`); setVoteEditValue(move.black || ''); onMoveClick?.(moves, idx * 2 + 2); } : undefined}
              onMoveInfo={showMoveInfo ? () => setMoveInfoKey(`${move.number}-black`) : undefined}
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
                    <th className="px-3 py-2 text-slate-400 font-medium text-center">White</th>
                    <th className="px-3 py-2 text-slate-400 font-medium text-center">Black</th>
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
                    const d = move ? disagreements.get(move.number) : undefined;
                    if (!move && c > 0) return <React.Fragment key={c}><td className={`px-3 py-1.5 ${c > 0 ? 'border-l border-slate-600/30' : ''}`} /><td className="px-3 py-1.5" /><td className="px-3 py-1.5" /></React.Fragment>;
                    return <React.Fragment key={c}>{renderHalf(move, idx, d)}</React.Fragment>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
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
      </div>

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center pl-56 2xl:pl-64 bg-slate-900/20 backdrop-blur-[0.5px]"
          onClick={() => { setEditing(null); onClearPreview?.(); setEditFromVoteKey(null); }}
        >
          <div
            className="bg-slate-800 rounded-xl p-4 min-w-[260px] shadow-xl border border-slate-600"
            onClick={e => e.stopPropagation()}
          >
            {editFromVoteKey && (
              <button
                onClick={() => { setEditing(null); onClearPreview?.(); setVoteInfoKey(editFromVoteKey); setEditFromVoteKey(null); }}
                className="text-slate-400 hover:text-slate-200 text-xs mb-2 transition-colors"
              >
                &larr; Back to votes
              </button>
            )}
            <div className="text-slate-100 text-sm font-medium mb-2 text-center">
              {t('coaches.move')} {moves[editing.moveIdx]?.number} · {editing.color === 'white' ? t('coaches.moveWhite') : t('coaches.moveBlack')}
            </div>
            {moves[editing.moveIdx]?.[`${editing.color}_reason` as 'white_reason' | 'black_reason'] && (
              <p className="text-red-400 text-sm mb-2 text-center">{moves[editing.moveIdx][`${editing.color}_reason` as 'white_reason' | 'black_reason']}</p>
            )}
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
              {onMoveClick && (
                <button
                  onClick={() => {
                    const ply = editing.color === 'white' ? editing.moveIdx * 2 : editing.moveIdx * 2 + 1;
                    onMoveClick(moves, ply);
                    onClearPreview?.();
                    setEditing({ ...editing, value: '' });
                  }}
                  className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs py-1.5 rounded-lg transition-colors"
                >
                  Show position before this move
                </button>
              )}
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

      {/* Old vote modal removed — now inline in MovesPanel */}

      {/* Move info modal (for individual reads) */}
      {moveInfoKey && (() => {
        const [numStr, colorStr] = moveInfoKey.split('-');
        const moveIdx = parseInt(numStr) - 1;
        const move = moves[moveIdx];
        if (!move) return null;
        const san = move[colorStr as 'white' | 'black'];
        const legal = move[`${colorStr}_legal` as 'white_legal' | 'black_legal'];
        const conf = move[`${colorStr}_confidence` as 'white_confidence' | 'black_confidence'];
        const reason = move[`${colorStr}_reason` as 'white_reason' | 'black_reason'];
        const isHighlighted = legal === false || !!reason;
        return createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center pl-56 2xl:pl-64 bg-slate-900/60 backdrop-blur-[0.5px]"
            onClick={() => setMoveInfoKey(null)}
          >
            <div
              className="bg-slate-800 rounded-xl p-5 min-w-[260px] max-w-sm shadow-xl border border-slate-600 space-y-3"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-slate-100 font-medium text-center">
                {t('coaches.move')} {numStr} · {colorStr === 'white' ? t('coaches.moveWhite') : t('coaches.moveBlack')}
              </h3>
              <div className="text-center font-mono text-lg text-slate-100">{san || '—'}</div>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-slate-700/50">
                    <td className="py-1.5 px-2 text-slate-400">Legality</td>
                    <td className="py-1.5 px-2 text-right">
                      {legal === true ? <span className="text-green-400">Legal</span> : legal === false ? <span className="text-red-400">Illegal</span> : <span className="text-slate-500">—</span>}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-700/50">
                    <td className="py-1.5 px-2 text-slate-400">Confidence</td>
                    <td className={`py-1.5 px-2 text-right ${conf === 'high' ? 'text-emerald-400' : conf === 'medium' ? 'text-yellow-400' : conf === 'low' ? 'text-red-400' : 'text-slate-500'}`}>
                      {conf || '—'}
                    </td>
                  </tr>
                  {isHighlighted && (
                    <tr>
                      <td className="py-1.5 px-2 text-slate-400">Highlighted</td>
                      <td className="py-1.5 px-2 text-right text-yellow-400 text-xs">
                        {legal === false ? 'Illegal move' : reason || ''}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>,
          document.body
        );
      })()}
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
    const normalized = normalizeMoves(moves);
    const moveText = normalized.map(m =>
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

function MoveCell({ value, legal, highlight, corrected, active, confidence, onShowBoard, onVoteInfo, onMoveInfo }: {
  value: string;
  legal?: boolean;
  highlight?: boolean;
  corrected?: boolean;
  active?: boolean;
  reason?: string;
  confidence?: 'high' | 'medium' | 'low';
  onShowBoard?: () => void;
  onVoteInfo?: () => void;
  onMoveInfo?: () => void;
}) {
  const isLowConfidence = confidence === 'low';
  const isIllegal = legal === false;
  const bg = active ? 'bg-blue-600/40 text-blue-100' : corrected ? 'bg-green-900/50 text-green-200' : (highlight || isIllegal || isLowConfidence) ? 'bg-yellow-500/25 text-yellow-100' : 'text-slate-100';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onMoveInfo) { onMoveInfo(); return; }
    if (onVoteInfo) { onVoteInfo(); return; }
    if (onShowBoard) onShowBoard();
  };

  return (
    <td
      className={`px-3 py-1.5 font-mono text-center cursor-pointer hover:bg-slate-600/50 ${bg}`}
      onClick={handleClick}
    >
      <span className="inline-flex items-center justify-center gap-1 w-full">
        {value}
      </span>
    </td>
  );
}
