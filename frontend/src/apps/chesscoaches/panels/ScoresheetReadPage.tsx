// Scoresheet reader page — reads scoresheets with Gemini, supports iterative correction

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ImageIcon, FileText, Clock, Check, X } from 'lucide-react';
import { PanelShell } from '../components/PanelShell';
import { UploadBox } from '../components/UploadBox';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useCoachesData, getCoachesPrefs, saveCoachesPrefs } from '../contexts/CoachesDataContext';
import { compressImage } from '../utils/compressImage';
import { playMoveSound } from '../components/Chessboard';
import { Chess } from 'chess.js';
import type { ScoresheetMove as Move } from '../contexts/CoachesDataContext';

import { resolvePawnCapture, toNotation } from './scoresheet/utils';
import { ModelBoard, resetActiveModelBoard } from './scoresheet/ModelBoard';
import { MovesPanel } from './scoresheet/MovesPanel';
import { ChesscomAnalysisButton, LichessStudyButton } from './scoresheet/ExportButtons';
import type { VoteState } from './scoresheet/types';


export function ScoresheetReadPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevAllVerifiedRef = useRef(false);
  const {
    scoresheet, scoresheetSetImage, scoresheetStartOneRead,
    scoresheetClear, scoresheetSetOverrides,
  } = useCoachesData();

  const { preview, fileName, error, modelResults, models, startTime, analyzing } = scoresheet;

  // First-time users: auto-load sample scoresheet into preview
  // Track whether the user entered as a first-timer this browser session (survives remounts)
  const wasFirstTimer = useRef((() => {
    if (sessionStorage.getItem('scoresheet-was-first-timer') === '1') return true;
    if (!getCoachesPrefs().scoresheet_success) { sessionStorage.setItem('scoresheet-was-first-timer', '1'); return true; }
    return false;
  })());
  const initialSuccess = useRef(getCoachesPrefs().scoresheet_success);
  const [hasHadSuccess, setHasHadSuccess] = useState(initialSuccess.current);
  const autoSampleTriggered = useRef(false);
  useEffect(() => {
    if (initialSuccess.current || autoSampleTriggered.current || preview) return;
    autoSampleTriggered.current = true;
    fetch('/sample_scoresheet.jpeg')
      .then(r => r.blob())
      .then(blob => {
        const dataUrl = URL.createObjectURL(blob);
        setCropSrc(dataUrl);
        setCropFileName('sample_scoresheet.jpeg');
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  const [selectedNotation, setSelectedNotation] = useState('');
  const [imageZoomLevel, setImageZoomLevel] = useState(0); // 0=closed, 1=fit, 2=extra zoom
  const closeModal = useCallback(() => { setImageZoomLevel(0); }, []);
  useEffect(() => {
    if (!imageZoomLevel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [imageZoomLevel, closeModal]);


  const [voteState, setVoteState] = useState<VoteState | null>(null);
  const [userPickedMove, setUserPickedMove] = useState<string | null>(null);
  const unresolvedCountRef = useRef(0);
  const handleVoteStateChange = useCallback((s: VoteState | null) => {
    setVoteState(prev => {
      if (prev && s && prev.moveIdx === s.moveIdx && prev.color === s.color) return s;
      setUserPickedMove(null);
      return s;
    });
  }, []);

  // ── Crop state (only used for first-time demo) ──
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropFileName, setCropFileName] = useState('');
  const [preparingImage, setPreparingImage] = useState(false);
  const preparingStartTime = useRef<number | null>(null);
  // Clear preparingImage once preview is set (same render cycle, no flicker)
  useEffect(() => { if (preview && preparingImage) setPreparingImage(false); }, [preview, preparingImage]);

  // ── Live elapsed timer ──
  const [liveGlobalElapsed, setLiveGlobalElapsed] = useState(0);
  useEffect(() => {
    const getT0 = () => preparingStartTime.current || startTime;
    if (!getT0()) { setLiveGlobalElapsed(0); return; }
    const tick = () => { const t0 = getT0(); setLiveGlobalElapsed(t0 ? Math.round((Date.now() - t0) / 1000) : 0); };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime, analyzing, preparingImage]);

  // Auto-crop+rotate an image using Azure DI, then go straight to processing
  const processImage = useCallback(async (imageBlob: Blob, fileName: string) => {
    setPreparingImage(true);
    preparingStartTime.current = Date.now();
    // Load image into an HTMLImageElement for canvas operations
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(imageBlob);
    });
    const img = await new Promise<HTMLImageElement>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.src = dataUrl;
    });

    // Call auto-crop API for rotation + crop
    let rotation = 0;
    let cropPct: { x: number; y: number; width: number; height: number } | null = null;
    try {
      const formData = new FormData();
      formData.append('image', imageBlob, fileName);
      const res = await fetch('/api/coaches/auto-crop', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        rotation = data.rotation || 0;
        if (data.crop) cropPct = data.crop;
      }
    } catch {}

    // Apply rotation + crop on canvas
    const rad = (rotation * Math.PI) / 180;
    const nw = img.naturalWidth, nh = img.naturalHeight;
    let finalFile: File;
    let finalPreview: string;

    if (cropPct && (cropPct.x > 0 || cropPct.y > 0 || cropPct.width < 100 || cropPct.height < 100)) {
      // Crop + optional rotation
      const cx = cropPct.x / 100 * nw, cy = cropPct.y / 100 * nh;
      const cw = cropPct.width / 100 * nw, ch = cropPct.height / 100 * nh;
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d')!;
      ctx.translate(cw / 2, ch / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -(cx + cw / 2), -(cy + ch / 2));
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.90));
      finalFile = new File([blob], fileName.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
      finalPreview = canvas.toDataURL('image/jpeg', 0.90);
    } else if (rotation !== 0) {
      // Rotation only
      const sin = Math.abs(Math.sin(rad)), cos = Math.abs(Math.cos(rad));
      const rw = Math.ceil(nw * cos + nh * sin), rh = Math.ceil(nw * sin + nh * cos);
      const canvas = document.createElement('canvas');
      canvas.width = rw;
      canvas.height = rh;
      const ctx = canvas.getContext('2d')!;
      ctx.translate(rw / 2, rh / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -nw / 2, -nh / 2);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.90));
      finalFile = new File([blob], fileName.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
      finalPreview = canvas.toDataURL('image/jpeg', 0.90);
    } else {
      // No changes needed
      finalFile = new File([imageBlob], fileName.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
      finalPreview = dataUrl;
    }

    console.log(`[Scoresheet] Processed image: ${(finalFile.size / 1024).toFixed(0)} KB, rotation=${rotation}°`);
    scoresheetSetImage(finalFile, finalPreview, fileName);
    // Don't clear preparingImage here — let the useEffect below clear it when preview is set
    setAutoRun(true);
  }, [scoresheetSetImage]);

  // Load image from URL param (e.g. from admin panel "Process" link)
  const [searchParams, setSearchParams] = useSearchParams();
  const imageParamHandled = useRef(false);
  useEffect(() => {
    if (imageParamHandled.current) return;
    const imageUrl = searchParams.get('image');
    if (!imageUrl || preview) return;
    imageParamHandled.current = true;
    setSearchParams({}, { replace: true });
    (async () => {
      try {
        const res = await fetch(imageUrl);
        const blob = await res.blob();
        await processImage(blob, imageUrl.split('/').pop() || 'image.jpg');
      } catch {}
    })();
  }, [searchParams, setSearchParams, preview, processImage]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { file: compressed } = await compressImage(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
    await processImage(compressed, file.name);
  };


  // Sample loading state
  const [loadingSample, setLoadingSample] = useState(false);

  // Auto-run one read after crop confirm
  const [autoRun, setAutoRun] = useState(false);
  useEffect(() => {
    if (autoRun && scoresheet.imageFile) {
      setAutoRun(false);
      resetActiveModelBoard();
      scoresheetStartOneRead(selectedNotation);
    }
  }, [autoRun, scoresheet.imageFile, scoresheetStartOneRead, selectedNotation]);


  // Per-model board ply + source tracking
  const [modelBoardPlys, setModelBoardPlys] = useState<Record<string, { ply: number; source: 'gt' | 'read' | 'nav' }>>({});
  // Consensus overrides: user edits on top of the computed consensus
  const consensusOverrides = scoresheet.consensusOverrides;
  const [consensusPreviewFen, setConsensusPreviewFen] = useState<string | null>(null);
  const [metaOverrides, setMetaOverrides] = useState<Record<string, string>>({});

  const navigate = useNavigate();
  const handleBack = useCallback(() => {
    if (cropSrc) {
      // Demo screen → back to upload
      setCropSrc(null);
    } else if (preparingImage || preview) {
      // Processing/results → back to upload
      setPreparingImage(false);
      scoresheetClear();
    } else {
      // Upload screen → home
      navigate('/');
    }
  }, [cropSrc, preparingImage, preview, scoresheetClear, navigate]);

  const handleImageClick = useCallback(() => {
    setImageZoomLevel(window.innerWidth >= 768 ? 3 : 1);
  }, []);

  return (
    <PanelShell title={t('coaches.navScoresheets')} onBack={handleBack}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {cropSrc ? (
            /* ── First-time demo: simple preview + confirm ── */
            <div className="space-y-4">
              <p className="text-slate-200 text-lg text-center">
                {t('coaches.sampleDemoGreeting').replace('{name}', user?.name?.split(' ')[0] || '')}<br />{t('coaches.sampleDemoDescription')}<br />{t('coaches.sampleDemoAction')}
              </p>
              <div className="flex justify-center">
                <img
                  src={cropSrc}
                  alt={t('coaches.sampleDemoAlt')}
                  className="rounded-lg max-h-[50vh] max-w-sm"
                />
              </div>
              <div className="flex justify-center">
                <button
                  onClick={async () => {

                    const res = await fetch(cropSrc!);
                    const blob = await res.blob();
                    setCropSrc(null);
                    await processImage(blob, cropFileName || 'sample_scoresheet.jpeg');
                  }}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Check className="w-4 h-4" />
                  {t('coaches.cropConfirm')}
                </button>
              </div>
            </div>
          ) : !preview && !preparingImage && !loadingSample ? (
            <div className="space-y-3">
              <div className="flex justify-center">
                <select
                  value={selectedNotation}
                  onChange={e => setSelectedNotation(e.target.value)}
                  className="bg-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 border border-slate-600 focus:outline-none focus:border-blue-500"
                >
                  <option value="" disabled>{t('coaches.pickNotation')}</option>
                  <option value="english">English</option>
                  <option value="french">French</option>
                  <option value="armenian">Armenian</option>
                </select>
              </div>
              <div className={selectedNotation ? '' : 'opacity-40 pointer-events-none'}>
              <UploadBox
                onClick={() => fileInputRef.current?.click()}
                icon={<ImageIcon className="w-10 h-10 text-slate-400" />}
                title={t('coaches.uploadPrompt')}
              />
              </div>
              {!hasHadSuccess && (<>
                <div className="flex items-center gap-3 max-w-lg mx-auto">
                  <div className="flex-1 h-px bg-slate-600" />
                  <span className="text-slate-500 text-xs uppercase tracking-wider">{t('coaches.or')}</span>
                  <div className="flex-1 h-px bg-slate-600" />
                </div>
                <UploadBox
                  onClick={() => {
                    if (!selectedNotation) return;
                    setLoadingSample(true);
                    fetch('/sample_scoresheet.jpeg')
                      .then(r => r.blob())
                      .then(blob => {
                        const file = new File([blob], 'sample_scoresheet.jpeg', { type: 'image/jpeg' });
                        scoresheetSetImage(file, URL.createObjectURL(blob), file.name);
                        setLoadingSample(false);
                        setAutoRun(true);
                      });
                  }}
                  icon={<FileText className="w-10 h-10 text-slate-400" />}
                  title={t('coaches.trySample')}
                />
              </>)}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Error */}
              {error && (
                <div className="text-center py-4 space-y-3">
                  <p className="text-red-400">{error}</p>
                  <button
                    onClick={() => { setPreparingImage(false); scoresheetClear(); }}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors"
                  >
                    {t('coaches.previous')}
                  </button>
                </div>
              )}

              {/* Processing progress bar */}
              {(preparingImage || models.length > 0) && (() => {
                const finishedCount = models.filter(m => !!(modelResults[m.id]?.result || modelResults[m.id]?.error)).length;
                const allDone = !preparingImage && models.length > 0 && finishedCount === models.length;
                // 0-25% = preparing image, 25-100% = model results (each model = 25%)
                const modelPct = models.length > 0 ? Math.round((finishedCount / models.length) * 75) : 0;
                const pct = preparingImage ? 0 : 25 + modelPct;
                const maxAvg = Math.round(Math.max(...models.map(m => m.avg_elapsed || 0)) * 1.3) + 5; // +5s for auto-crop phase
                return (
                  <div className="flex justify-center">
                    <div className="relative bg-slate-700/40 rounded-xl p-4 min-w-[300px] max-w-[400px] w-full">
                        <button
                          onClick={() => scoresheetClear()}
                          className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-600/80 hover:bg-red-600 text-slate-300 text-xs transition-colors"
                        >
                          <X className="w-3 h-3" />
                          {allDone ? t('coaches.startFresh') : t('coaches.stopProcessing')}
                        </button>
                      <div className="flex items-center mb-1.5">
                        <span className="text-sm text-slate-300 inline-flex items-center gap-1.5">
                          {!allDone && <Clock className="w-3.5 h-3.5 animate-spin" />}
                          {t('coaches.processing')}
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
                      <div className="text-center mt-0.5">
                        <span className="text-xs text-slate-400">
                          {liveGlobalElapsed}s{!allDone && maxAvg > 0 ? <> / ~{maxAvg}s <span className="inline-block w-0 overflow-visible whitespace-nowrap">(estimated)</span></> : ''}
                        </span>
                      </div>
                      {preparingImage ? (
                        <p className="text-center text-blue-400 text-sm mt-2 animate-pulse">{t('coaches.autoCropping')}</p>
                      ) : !allDone ? (
                        <div className="text-center mt-2">
                          <p className="text-blue-400 text-sm">{t('coaches.waitProcessing')}</p>
                        </div>
                      ) : unresolvedCountRef.current > 0 ? (
                        <div className="text-center text-emerald-500 text-sm mt-2">
                          <p>{t('coaches.processingDone1')}</p>
                          <p>{unresolvedCountRef.current === 1 ? t('coaches.processingDone2_one') : t('coaches.processingDone2_other').replace('{count}', String(unresolvedCountRef.current))}</p>
                          <p>{t('coaches.processingDone3')}</p>
                          <p>{t('coaches.processingDone4')} {t('coaches.processingDone5')}</p>
                        </div>
                      ) : (
                        <p className="text-center text-emerald-500 text-sm mt-2">{t('coaches.allMovesVerified')}</p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Results: consensus + individual reads */}
              {preview && models.length > 0 && (() => {
                // Total moves across all models (for stable table layout)
                const totalModelMoves = Math.max(0, ...models.map(m => modelResults[m.id]?.result?.moves?.length || 0));
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
                    let voteDetails: Record<string, { candidate: string; votes: number; downstreamIllegals: number; chosen: boolean; models: string[]; confidenceByModel: Record<string, string> }[]>;

                    /** Test a candidate move for legality, handling en passant shorthand and disambiguation.
                     *  Returns the resolved SAN if legal, or null if illegal. */
                    const tryMove = (chess: InstanceType<typeof Chess>, candidate: string): string | null => {
                      const ep = resolvePawnCapture(chess, candidate);
                      if (ep) return ep;
                      try { chess.move(candidate); chess.undo(); return candidate; } catch {}
                      // Try disambiguation
                      const pm = candidate.match(/^([KQRBN])/);
                      const dm = candidate.match(/([a-h][1-8])$/);
                      if (pm && dm) {
                        const ambig = chess.moves().find(m => m.startsWith(pm[1]) && m.includes(dm[1]));
                        if (ambig) { try { chess.move(ambig); chess.undo(); return ambig; } catch {} }
                      }
                      return null;
                    };

                    /** Pick the best move from model candidates at the current board position.
                     *  Filters illegal candidates, picks highest-voted legal one.
                     *  Returns null if no candidate is legal. */
                    const pickBestMove = (chess: InstanceType<typeof Chess>, modelVals: string[]): { move: string; legal: true } | { move: string; legal: false } | null => {
                      if (modelVals.length === 0) return null;
                      // Group by normalized form, count votes
                      const votes: Record<string, { count: number; originals: Record<string, number> }> = {};
                      for (const v of modelVals) {
                        const norm = v.replace(/[+#x]/g, '');
                        if (!votes[norm]) votes[norm] = { count: 0, originals: {} };
                        votes[norm].count++;
                        votes[norm].originals[v] = (votes[norm].originals[v] || 0) + 1;
                      }
                      // Test each candidate for legality, pick highest-voted legal one
                      const candidates = Object.entries(votes).map(([, { count, originals }]) => {
                        const orig = Object.entries(originals).sort((a, b) => b[1] - a[1])[0][0];
                        const resolved = tryMove(chess, orig);
                        return { orig, resolved, count, legal: resolved !== null };
                      });
                      const legalCandidates = candidates.filter(c => c.legal).sort((a, b) => b.count - a.count);
                      if (legalCandidates.length > 0) return { move: legalCandidates[0].resolved!, legal: true };
                      // No legal candidate — return highest-voted illegal for display, marked illegal
                      const best = candidates.sort((a, b) => b.count - a.count)[0];
                      return best ? { move: best.orig, legal: false } : null;
                    };

                    if (allModelMoves.length === 1) {
                      consensusMoves = allModelMoves[0].map((m, i) => ({ ...m, number: i + 1 }));
                      voteDetails = {};
                    } else if (allModelMoves.length === 0) {
                      consensusMoves = [];
                      voteDetails = {};
                    } else {

                    const maxLen = allModelMoves.length > 0 ? Math.max(...allModelMoves.map(mv => mv.length)) : 0;

                    const runConsensus = () => {
                      const result: Move[] = [];
                      const details: Record<string, { candidate: string; votes: number; downstreamIllegals: number; chosen: boolean; models: string[]; confidenceByModel: Record<string, string> }[]> = {};
                      const passChess = new Chess();
                      let stopped = false;

                      for (let i = 0; i < maxLen && !stopped; i++) {
                        const move: Move = { number: i + 1, white: '' };
                        for (const color of ['white', 'black'] as const) {
                          if (stopped) break;
                          const modelVals: string[] = [];
                          const votersByCandidate: Record<string, string[]> = {};
                          const confidenceByModel: Record<string, string> = {};
                          for (let mi = 0; mi < allModelMoves.length; mi++) {
                            const moveObj = allModelMoves[mi][i];
                            const val = moveObj?.[color];
                            if (val) {
                              const normalized = val.replace(/[+#x]/g, '');
                              modelVals.push(val);
                              if (!votersByCandidate[normalized]) votersByCandidate[normalized] = [];
                              votersByCandidate[normalized].push(modelNames[mi]);
                              const conf = moveObj?.[`${color}_confidence`];
                              if (conf) confidenceByModel[modelNames[mi]] = conf;
                            }
                          }
                          if (modelVals.length === 0) continue;

                          const detailKey = `${i + 1}-${color}`;

                          const picked = pickBestMove(passChess, modelVals);
                          if (!picked) { console.warn(`[Consensus] Move ${i+1} ${color}: pickBestMove returned null — skipping without stopping!`); continue; }

                          // Build vote details for display
                          const voteMap: Record<string, number> = {};
                          for (const v of modelVals) { const n = v.replace(/[+#x]/g, ''); voteMap[n] = (voteMap[n] || 0) + 1; }
                          const pickedNorm = picked.move.replace(/[+#x]/g, '');
                          details[detailKey] = Object.entries(voteMap).map(([c, v]) => ({
                            candidate: c, votes: v, downstreamIllegals: 0, chosen: c === pickedNorm,
                            models: votersByCandidate[c] || [], confidenceByModel,
                          }));

                          move[color] = picked.move;
                          if (picked.legal) {
                            let advanced = false;
                            try { passChess.move(picked.move); advanced = true; } catch {}
                            if (advanced) {
                              move[`${color}_legal`] = true;
                            } else {
                              move[`${color}_legal`] = false;
                              move[`${color}_reason`] = 'No legal option — correct an earlier move';
                              stopped = true;
                              console.warn(`[Consensus] STOPPED at move ${i+1} ${color}: tryMove said ${picked.move} was legal but passChess.move() failed`);
                            }
                          } else {
                            move[`${color}_legal`] = false;
                            move[`${color}_reason`] = 'No legal option — correct an earlier move';
                            stopped = true;
                            console.log(`[Consensus] STOPPED at move ${i+1} ${color}: ${picked.move} is illegal`);
                          }
                        }
                        result.push(move);
                      }
                      return { moves: result, details };
                    };

                    const consensus = runConsensus();
                    consensusMoves = consensus.moves;
                    voteDetails = consensus.details;

                    } // end else (>= 2 models)

                    // Merge time data from model results (pick first available for each move)
                    for (let i = 0; i < consensusMoves.length; i++) {
                      for (const color of ['white', 'black'] as const) {
                        const timeKey = `${color}_time` as const;
                        for (const modelMv of allModelMoves) {
                          const t = modelMv[i]?.[timeKey];
                          if (t != null) { consensusMoves[i][timeKey] = t; break; }
                        }
                      }
                    }

                    // Remove trailing empty moves
                    while (consensusMoves.length > 0 && !consensusMoves[consensusMoves.length - 1].white && !consensusMoves[consensusMoves.length - 1].black) {
                      consensusMoves.pop();
                    }
                    if (consensusMoves.length === 0) return (
                      <>
                        {/* Desktop skeleton */}
                        <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr] md:gap-4 md:px-4">
                          <div className="flex justify-end items-center">
                            <ScoreSheetImage preview={preview} onImageClick={handleImageClick} fileName={fileName || undefined} zoomed />
                          </div>
                          <div className="self-start">
                            <AnalyzingPlaceholder minWidth="min-w-[540px]" />
                          </div>
                          <div className="flex flex-col items-center justify-center gap-3 max-w-[400px]">
                            <ModelBoard moves={[]} autoActivate={false} disableDrag />
                          </div>
                        </div>
                        {/* Mobile skeleton */}
                        <div className="md:hidden flex flex-col items-center gap-3 px-2">
                          <img src={preview} alt="Scoresheet" className="max-h-[200px] rounded-xl object-contain cursor-pointer" onClick={handleImageClick} />
                          <AnalyzingPlaceholder minWidth="min-w-[320px]" />
                          <ModelBoard moves={[]} autoActivate={false} disableDrag compact />
                        </div>
                      </>
                    );
                    // Validate legality with chess.js, auto-resolve ambiguities
                    const valChess = new Chess();
                    for (let ci = 0; ci < consensusMoves.length; ci++) {
                      const cm = consensusMoves[ci];
                      for (const color of ['white', 'black'] as const) {
                        const san = cm[color];
                        if (!san) continue;
                        try { valChess.move(san); cm[`${color}_legal`] = true; }
                        catch {
                          cm[`${color}_legal`] = false;
                          const fen = valChess.fen().split(' ');
                          fen[1] = fen[1] === 'w' ? 'b' : 'w';
                          fen[3] = '-'; // clear en-passant square to keep FEN valid
                          try { valChess.load(fen.join(' ')); } catch {}
                        }
                      }
                    }


                    // Build consensus meta (player names + result) from model results
                    const consensusMeta: { white?: string; black?: string; result?: string; date?: string; event?: string; notation?: string } = {};
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
                      const rawDate = pick(results.map(r => r!.date));
                      if (rawDate) {
                        // Try to parse and format as DD/MM/YYYY
                        const m = rawDate.match(/(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})/);
                        if (m) {
                          const y = m[3].length === 2 ? '20' + m[3] : m[3];
                          consensusMeta.date = `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${y}`;
                        } else {
                          consensusMeta.date = rawDate;
                        }
                      }
                      consensusMeta.event = pick(results.map(r => r!.event));
                      consensusMeta.notation = pick(results.map(r => r!.notation));
                    }
                    // Apply user meta edits
                    if (metaOverrides.white !== undefined) consensusMeta.white = metaOverrides.white;
                    if (metaOverrides.black !== undefined) consensusMeta.black = metaOverrides.black;
                    if (metaOverrides.result !== undefined) consensusMeta.result = metaOverrides.result;
                    if (metaOverrides.date !== undefined) consensusMeta.date = metaOverrides.date;
                    if (metaOverrides.event !== undefined) consensusMeta.event = metaOverrides.event;

                    // Apply overrides on top of computed consensus
                    const displayConsensusMoves = consensusOverrides ?? consensusMoves;

                    // Remove disagreements where all dissenters are illegal at the current consensus board position
                    {
                      const filterChess = new Chess();
                      const filterFens: string[] = [];
                      for (let fi = 0; fi < displayConsensusMoves.length; fi++) {
                        filterFens.push(filterChess.fen());
                        const cm = displayConsensusMoves[fi];
                        if (cm) {
                          for (const col of ['white', 'black'] as const) {
                            const san = cm[col];
                            if (!san) continue;
                            try { filterChess.move(san); } catch {
                              const f = filterChess.fen().split(' '); f[1] = f[1] === 'w' ? 'b' : 'w'; f[3] = '-'; try { filterChess.load(f.join(' ')); } catch {}
                            }
                          }
                        }
                      }
                      for (const key of [...modelDisagreements]) {
                        const [numStr, colorStr] = key.split('-');
                        const idx = parseInt(numStr) - 1;
                        const cLegal = displayConsensusMoves[idx]?.[`${colorStr}_legal` as 'white_legal' | 'black_legal'];
                        if (cLegal === false) continue;
                        if (!filterFens[idx]) continue;
                        const allDissentersIllegal = allModelMovesForDisagreement.every(modelMoves => {
                          const mv = modelMoves[idx]?.[colorStr as 'white' | 'black'];
                          if (!mv) return true;
                          const cMove = displayConsensusMoves[idx]?.[colorStr as 'white' | 'black'];
                          if (mv.replace(/[+#x]/g, '') === cMove?.replace(/[+#x]/g, '')) return true;
                          try {
                            const testCh = new Chess(filterFens[idx]);
                            if (colorStr === 'black' && displayConsensusMoves[idx]?.white) { try { testCh.move(displayConsensusMoves[idx].white); } catch {} }
                            const ep = resolvePawnCapture(testCh, mv);
                            testCh.move(ep || mv);
                            return false;
                          } catch { return true; }
                        });
                        if (allDissentersIllegal) modelDisagreements.delete(key);
                      }
                    }

                    const handleConsensusEditSave = (_readIdx: number, confirmed: Move[], _corrKey: string) => {
                      rerunConsensusAfterEdit(confirmed);
                    };
                    // Re-run consensus for non-confirmed moves after a user edit
                    const rerunConsensusAfterEdit = (current: Move[]) => {
                      const ch = new Chess();
                      let stopped = false;
                      const totalLen = Math.max(current.length, ...allModelMoves.map(mv => mv.length));
                      // Extend current to cover all model moves
                      while (current.length < totalLen) {
                        current.push({ number: current.length + 1, white: '' } as Move);
                      }
                      for (const cm of current) {
                        for (const col of ['white', 'black'] as const) {
                          if (stopped) {
                            delete cm[col];
                            delete cm[`${col}_legal`];
                            delete cm[`${col}_reason`];
                            continue;
                          }

                          if (cm[`${col}_confirmed`]) {
                            // Confirmed move — play it
                            const san = cm[col];
                            if (!san) continue;
                            const resolved = tryMove(ch, san);
                            if (resolved) {
                              cm[col] = resolved;
                              cm[`${col}_legal`] = true;
                              ch.move(resolved);
                            } else {
                              cm[`${col}_legal`] = false;
                              stopped = true;
                            }
                          } else {
                            // Non-confirmed move — re-pick using shared logic
                            const modelVals = allModelMoves.map(mv => mv[cm.number - 1]?.[col]).filter(Boolean) as string[];
                            if (modelVals.length === 0) continue;
                            const picked = pickBestMove(ch, modelVals);
                            if (picked && picked.legal) {
                              cm[col] = picked.move;
                              cm[`${col}_legal`] = true;
                              delete cm[`${col}_reason`];
                              try { ch.move(picked.move); } catch {}
                            } else {
                              if (picked) cm[col] = picked.move;
                              cm[`${col}_legal`] = false;
                              cm[`${col}_reason`] = 'No legal option — correct an earlier move';
                              stopped = true;
                            }
                          }
                        }
                      }
                      // Trim trailing empty moves
                      while (current.length > 0 && !current[current.length - 1].white && !current[current.length - 1].black) {
                        current.pop();
                      }
                      scoresheetSetOverrides([...current]);
                    };

                    const handleConfirmMove = (moveNumber: number, color: 'white' | 'black') => {
                      const current = consensusOverrides || [...consensusMoves.map(m => ({ ...m }))];
                      const idx = moveNumber - 1;
                      if (current[idx]) {
                        delete current[idx][`${color}_reason`];
                        current[idx][`${color}_confirmed`] = true;
                      }
                      rerunConsensusAfterEdit(current);
                    };
                    const handleConsensusBoardPly = (ply: number) => {
                      const currentTargetPly = voteState
                        ? (voteState.color === 'white' ? voteState.moveIdx * 2 + 1 : voteState.moveIdx * 2 + 2)
                        : 0;
                      if (ply === currentTargetPly) return;
                      const clampedPly = Math.max(ply, 1);
                      setModelBoardPlys(prev => ({ ...prev, [consensusId]: { ply: clampedPly, source: 'nav' as const } }));
                      setConsensusPreviewFen(null);
                      setUserPickedMove(null);
                      // Update edit panel to match current ply
                      if (voteState) {
                        const moveIdx = Math.floor((clampedPly - 1) / 2);
                        const color = (clampedPly % 2 === 1 ? 'white' : 'black') as 'white' | 'black';
                        voteState.goToMove(moveIdx + 1, color, clampedPly);
                        setVoteState(prev => prev ? { ...prev, moveIdx, color } : prev);
                      }
                    };
                    const deselectConsensus = () => {
                      setModelBoardPlys(p => { const rest = { ...p }; delete rest[consensusId]; return rest; });
                    };
                    // Compute unresolved moves for review bar
                    const hasIssues = allModelsFinished && (modelDisagreements.size > 0 || displayConsensusMoves.some(m => m.white_reason || m.black_reason) || displayConsensusMoves.some(m => m.white_legal === false || m.black_legal === false));
                    const hasConfirmedMoves = displayConsensusMoves.some(m => m.white_confirmed || m.black_confirmed);
                    const unresolvedPlies: number[] = [];
                    if (allModelsFinished) {
                      displayConsensusMoves.forEach((m, idx) => {
                        const d = m.white && (modelDisagreements.has(`${m.number}-white`) || !!m.white_reason || m.white_legal === false || m.white_confidence === 'low');
                        const dBlack = m.black && (modelDisagreements.has(`${m.number}-black`) || !!m.black_reason || m.black_legal === false || m.black_confidence === 'low');
                        if (d && !m.white_confirmed) unresolvedPlies.push(idx * 2 + 1);
                        if (dBlack && !m.black_confirmed) unresolvedPlies.push(idx * 2 + 2);
                      });
                    }
                    const allVerified = (hasIssues || hasConfirmedMoves) && unresolvedPlies.length === 0;
                    unresolvedCountRef.current = unresolvedPlies.length;
                    if (allVerified && !prevAllVerifiedRef.current) {
                      if (!getCoachesPrefs().scoresheet_success) { saveCoachesPrefs({ scoresheet_success: true }); setHasHadSuccess(true); }
                    }
                    prevAllVerifiedRef.current = allVerified;
                    // --- Shared helpers for desktop + mobile edit panels ---
                    const getLastConfirmed = () => {
                      let last: { idx: number; color: 'white' | 'black' } | null = null;
                      displayConsensusMoves.forEach((m, i) => {
                        if (m.white_confirmed) last = { idx: i, color: 'white' };
                        if (m.black_confirmed) last = { idx: i, color: 'black' };
                      });
                      return last as { idx: number; color: 'white' | 'black' } | null;
                    };

                    const handleRevert = (lastConfirmed: { idx: number; color: 'white' | 'black' }) => {
                      const current = consensusOverrides || [...displayConsensusMoves.map(m => ({ ...m }))];
                      if (current[lastConfirmed.idx]) {
                        delete current[lastConfirmed.idx][`${lastConfirmed.color}_confirmed`];
                      }
                      rerunConsensusAfterEdit(current);
                      setUserPickedMove(null);
                      if (voteState) {
                        voteState.setEditValue('');
                        const ply = lastConfirmed.color === 'white' ? lastConfirmed.idx * 2 + 1 : lastConfirmed.idx * 2 + 2;
                        voteState.goToMove(lastConfirmed.idx + 1, lastConfirmed.color, ply);
                      }
                    };

                    const renderRevertButton = () => {
                      const lastConfirmed = getLastConfirmed();
                      return (
                        <button
                          disabled={!lastConfirmed}
                          onClick={() => { if (lastConfirmed) handleRevert(lastConfirmed); }}
                          className={`text-sm px-4 py-1.5 rounded-lg transition-colors ${lastConfirmed ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
                        >
                          {t('coaches.revertChange')}
                        </button>
                      );
                    };

                    const renderConfirmRevertButtons = () => {
                      if (!voteState) return (
                        <div className="flex flex-col items-center gap-2">
                          <button disabled className="text-sm px-6 py-1.5 rounded-lg bg-slate-700 text-slate-500 cursor-not-allowed">{t('coaches.confirmMove')}</button>
                          {renderRevertButton()}
                        </div>
                      );
                      const moveIdx = voteState.moveIdx;
                      const colorStr = voteState.color;
                      const moveObj = displayConsensusMoves[moveIdx];
                      if (!moveObj) return null;
                      const displayMove = toNotation(moveObj[colorStr] || '—', consensusMeta.notation);
                      const advanceToNextMove = () => {
                        if (colorStr === 'white' && moveObj.black) {
                          const nextColor = 'black' as const;
                          const nextPly = moveIdx * 2 + 2;
                          voteState.goToMove(moveIdx + 1, nextColor, nextPly);
                          setVoteState(prev => prev ? { ...prev, moveIdx, color: nextColor } : prev);
                        } else if (moveIdx + 1 < displayConsensusMoves.length) {
                          const nextIdx = moveIdx + 1;
                          const nextPly = nextIdx * 2 + 1;
                          voteState.goToMove(nextIdx + 1, 'white', nextPly);
                          setVoteState(prev => prev ? { ...prev, moveIdx: nextIdx, color: 'white' } : prev);
                        } else {
                          voteState.clearSelection();
                        }
                      };
                      return (
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex justify-center">
                          {(() => {
                            const confirmSan = userPickedMove || moveObj[colorStr] || '';
                            const confirmDisplay = toNotation(confirmSan, consensusMeta.notation);
                            const isOverride = userPickedMove && userPickedMove.replace(/[+#]/g, '') !== displayMove.replace(/[+#]/g, '');
                            const isIllegal = !userPickedMove && moveObj[`${colorStr}_legal` as const] === false;
                            return (
                              <button
                                disabled={isIllegal}
                                onClick={() => {
                                  if (isIllegal) return;
                                  if (isOverride) {
                                    const current = consensusOverrides || [...displayConsensusMoves.map(m => ({ ...m }))];
                                    if (current[moveIdx]) {
                                      current[moveIdx][colorStr] = userPickedMove!;
                                      current[moveIdx][`${colorStr}_confirmed`] = true;
                                      delete current[moveIdx][`${colorStr}_reason`];
                                    }
                                    rerunConsensusAfterEdit(current);
                                  } else {
                                    handleConfirmMove(moveIdx + 1, colorStr);
                                  }
                                  setUserPickedMove(null);
                                  advanceToNextMove();
                                }}
                                className={isIllegal
                                  ? "text-sm px-6 py-1.5 rounded-lg bg-slate-700 text-slate-500 cursor-not-allowed"
                                  : "bg-emerald-700 hover:bg-emerald-600 text-white text-sm px-6 py-1.5 rounded-lg transition-colors"
                                }
                              >
                                {t('coaches.confirmMove')} {confirmDisplay}
                              </button>
                            );
                          })()}
                          </div>
                          {renderRevertButton()}
                        </div>
                      );
                    };

                    const renderVerifiedBanner = () => (
                      <div className="inline-flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 rounded-lg px-4 py-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center animate-[scaleIn_0.3s_ease-out]">
                          <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                        </span>
                        <span className="text-sm text-emerald-300 font-medium">{t('coaches.verificationComplete')}</span>
                      </div>
                    );

                    const renderEditPanel = (className?: string) => {
                      if (allModelsFinished && allVerified) {
                        return (
                          <div className={`flex flex-col items-center justify-center gap-2 py-2 animate-[fadeIn_0.4s_ease-out] ${className || 'w-full'}`}>
                            {renderVerifiedBanner()}
                          </div>
                        );
                      }
                      return null;
                    };
                    // --- End shared helpers ---

                    // --- Shared computed values (DRY: used by both desktop & mobile) ---
                    const disagreementsMap = (() => {
                      const m = new Map<number, { white: boolean; black: boolean }>();
                      modelDisagreements.forEach(key => {
                        const [numStr, color] = key.split('-');
                        const num = parseInt(numStr);
                        const existing = m.get(num) || { white: false, black: false };
                        existing[color as 'white' | 'black'] = true;
                        m.set(num, existing);
                      });
                      return m;
                    })();

                    const movesPanelLabel = !allModelsFinished || analyzing ? `${t('coaches.processing')}...` : t('coaches.consensus');
                    const isLoading = !allModelsFinished || analyzing;
                    const sharedVoteDetails = allModelsFinished && !analyzing ? voteDetails : undefined;
                    const sharedEditSave = allModelsFinished && !analyzing ? (confirmed: Move[], corrKey: string) => handleConsensusEditSave(0, confirmed, corrKey) : undefined;
                    const handleMoveClick = (movesArr: Move[], ply: number) => {
                      setModelBoardPlys(p => ({ ...p, [consensusId]: { ply, source: 'read' as const } }));
                      const moveIdx = Math.floor((ply - 1) / 2);
                      const color = ply % 2 === 1 ? 'white' : 'black';
                      const san = movesArr[moveIdx]?.[color];
                      if (san) playMoveSound(san.includes('x'));
                    };
                    const boardTargetPly = voteState && allModelsFinished ? (voteState.color === 'white' ? voteState.moveIdx * 2 + 1 : voteState.moveIdx * 2 + 2) : undefined;
                    const handleDragSetMove = voteState ? (san: string) => {
                      if (!san) { voteState.setEditValue(''); setUserPickedMove(null); return; }
                      setUserPickedMove(san);
                      voteState.setEditValue(san);
                    } : undefined;
                    const showTryOwn = allVerified && (wasFirstTimer.current || !hasHadSuccess);

                    const renderMovesPanel = () => (
                      <MovesPanel
                        label={movesPanelLabel}
                        moves={displayConsensusMoves}
                        disagreements={disagreementsMap}
                        loading={isLoading}
                        meta={consensusMeta}
                        onMetaChange={(field, value) => setMetaOverrides(prev => ({ ...prev, [field]: value }))}
                        onEditSave={sharedEditSave}
                        originalMoves={consensusOverrides ? consensusMoves : undefined}
                        onMoveClick={handleMoveClick}
                        activePly={modelBoardPlys[consensusId]?.ply}
                        voteDetails={sharedVoteDetails}
                        onVoteStateChange={handleVoteStateChange}
                        totalMoves={totalModelMoves}
                      />
                    );

                    const renderBoard = (opts?: { compact?: boolean }) => (
                      <ModelBoard
                        moves={hasResults ? displayConsensusMoves : []}
                        externalPly={hasResults ? (modelBoardPlys[consensusId]?.ply || 0) : 0}
                        onPlyChange={hasResults ? handleConsensusBoardPly : () => {}}
                        disableDrag={!voteState || !allModelsFinished}
                        disableNav
                        autoActivate={false}
                        previewFen={consensusPreviewFen}
                        targetPly={boardTargetPly}
                        onDragSetMove={handleDragSetMove}
                        highlightedPlies={hasResults && allModelsFinished ? unresolvedPlies : undefined}
                        compact={opts?.compact}
                      />
                    );

                    const renderExportButtons = (className?: string) => allVerified ? (
                      <div className={`bg-slate-700/50 rounded-xl overflow-hidden mt-2 animate-[borderPulse_1.5s_ease-in-out_3] border border-emerald-500/30 ${className || 'w-full'}`}>
                        <ChesscomAnalysisButton moves={displayConsensusMoves} meta={consensusMeta} hasIllegalMoves={false} onIllegalClick={() => {}} />
                        <LichessStudyButton moves={displayConsensusMoves} meta={consensusMeta} fileName={fileName} hasIllegalMoves={false} onIllegalClick={() => {}} />
                      </div>
                    ) : null;

                    const renderTryOwnButton = (className?: string) => showTryOwn ? (
                      <button
                        onClick={() => scoresheetClear()}
                        className={`mt-3 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors ${className || 'w-full'}`}
                      >
                        {t('coaches.tryOwnScoresheet')}
                      </button>
                    ) : null;

                    return (<>
                        {/* Desktop layout */}
                        <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr] md:gap-4 md:px-4" onClick={consensusReady ? deselectConsensus : undefined}>
                          <div className="flex justify-end items-center" onClick={e => e.stopPropagation()}>
                            <ScoreSheetImage preview={preview} onImageClick={handleImageClick} fileName={fileName || undefined} zoomed />
                          </div>
                          <div className="self-start" onClick={e => e.stopPropagation()}>
                            {!hasResults || consensusMoves.length === 0
                              ? <AnalyzingPlaceholder minWidth="min-w-[540px]" />
                              : renderMovesPanel()
                            }
                            {renderEditPanel()}
                            {renderExportButtons()}
                            {renderTryOwnButton()}
                          </div>
                          <div className="flex flex-col items-center justify-center gap-3 max-w-[400px]" onClick={e => e.stopPropagation()}>
                            {renderBoard()}
                            {renderConfirmRevertButtons()}
                          </div>
                        </div>
                        {/* Mobile layout */}
                        <div className="md:hidden flex flex-col items-center gap-3 px-2">
                          <img src={preview} alt="Scoresheet" className="max-h-[200px] rounded-xl object-contain cursor-pointer" onClick={handleImageClick} />
                          {!hasResults || consensusMoves.length === 0
                            ? <AnalyzingPlaceholder minWidth="min-w-[320px]" />
                            : (<>
                              {renderMovesPanel()}
                              <div className="w-full max-w-[400px]">{renderBoard({ compact: true })}</div>
                              {renderConfirmRevertButtons()}
                              {renderEditPanel('w-full max-w-[400px]')}
                              {renderExportButtons('w-full max-w-[400px]')}
                              {renderTryOwnButton('w-full max-w-[400px]')}
                            </>)
                          }
                        </div>
                    {/* Combined debug table — admin only */}
                    {user?.is_admin && allModelsFinished && (() => {
                      const finishedModels = models.filter(m => modelResults[m.id]?.result?.moves?.length);
                      if (finishedModels.length === 0) return null;
                      const maxMoves = Math.max(...finishedModels.map(m => modelResults[m.id]!.result!.moves.length), displayConsensusMoves.length);
                      // Build board FENs from consensus for per-model legality checks
                      const debugFens: string[] = [];
                      const debugChess = new Chess();
                      for (let di = 0; di < maxMoves; di++) {
                        debugFens.push(debugChess.fen());
                        const cm = displayConsensusMoves[di];
                        if (cm) {
                          for (const col of ['white', 'black'] as const) {
                            const san = cm[col];
                            if (!san) continue;
                            try { debugChess.move(san); } catch {
                              const f = debugChess.fen().split(' '); f[1] = f[1] === 'w' ? 'b' : 'w'; f[3] = '-'; try { debugChess.load(f.join(' ')); } catch {}
                            }
                          }
                        }
                      }
                      type VoteDetail = { candidate: string; votes: number; downstreamIllegals: number; chosen: boolean; models: string[]; confidenceByModel: Record<string, string> };
                      return (
                        <div className="mt-6 px-2">
                          <p className="text-slate-400 text-sm font-medium text-center mb-2">Consensus debug</p>
                          <div className="bg-slate-700/50 rounded-xl overflow-x-auto">
                            <table className="w-full text-xs font-mono">
                              <thead className="bg-slate-700 sticky top-0">
                                <tr className="border-b border-slate-600">
                                  <th className="px-1 py-1 text-slate-400 text-center w-6">#</th>
                                  <th className="px-1 py-1 text-slate-400 text-center">Col</th>
                                  {finishedModels.map(m => {
                                    const mr = modelResults[m.id]!;
                                    return (
                                      <th key={m.id} className="px-1 py-1 text-slate-400 text-center border-l border-slate-600/50">
                                        <div>{m.name}</div>
                                        <div className="text-slate-500 font-normal">{m.id.replace('-preview', '')} · {mr.elapsed}s · {mr.tier} · <span className="capitalize">{mr.result!.notation || '?'}</span></div>
                                      </th>
                                    );
                                  })}
                                  <th className="px-1 py-1 text-slate-400 text-center border-l border-slate-500">Consensus</th>
                                  <th className="px-1 py-1 text-slate-400 text-center border-l border-slate-500">Legal</th>
                                  <th className="px-1 py-1 text-slate-400 text-center border-l border-slate-500">Votes</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-b border-slate-600/50 bg-slate-700/30">
                                  <td colSpan={2} className="px-1 py-0.5 text-slate-500 text-center text-[10px]">Notation</td>
                                  {finishedModels.map(m => {
                                    const n = modelResults[m.id]!.result!.notation || '?';
                                    return <td key={m.id} className="px-1 py-0.5 text-center border-l border-slate-600/50 text-slate-300 capitalize">{n}</td>;
                                  })}
                                  <td colSpan={3} className="px-1 py-0.5 text-center border-l border-slate-500 text-slate-200 font-semibold capitalize">{consensusMeta.notation || '?'}</td>
                                </tr>
                                {Array.from({ length: maxMoves }, (_, i) => {
                                  const consensusMove = displayConsensusMoves[i];
                                  const notation = consensusMeta.notation;
                                  return (['white', 'black'] as const).map(color => {
                                    const key = `${i + 1}-${color}`;
                                    const details: VoteDetail[] | undefined = voteDetails?.[key];
                                    const cMove = consensusMove?.[color];
                                    const legal = consensusMove?.[`${color}_legal` as const];
                                    const reason = consensusMove?.[`${color}_reason` as const];
                                    const ply = color === 'white' ? i * 2 + 1 : i * 2 + 2;
                                    const isUnresolved = unresolvedPlies.includes(ply);
                                    return (
                                      <tr key={key} className={`border-b border-slate-600/20 ${color === 'black' ? 'border-b-slate-600/50' : ''} ${isUnresolved ? 'bg-yellow-500/10' : ''}`}>
                                        {color === 'white' && <td className="px-1 py-0.5 text-slate-500 text-center" rowSpan={2}>{i + 1}</td>}
                                        <td className={`px-1 py-0.5 text-center ${color === 'white' ? 'text-slate-300' : 'text-slate-500'}`}>{color === 'white' ? 'W' : 'B'}</td>
                                        {finishedModels.map(m => {
                                          const mr = modelResults[m.id]!;
                                          const mv = mr.result!.moves[i]?.[color] || '';
                                          const modelNotation = mr.result!.notation;
                                          const conf = mr.result!.moves[i]?.[`${color}_confidence`];
                                          const time = mr.result!.moves[i]?.[`${color}_time`];
                                          // Test this model's move against current consensus board position
                                          let mvLegal: boolean | null = null;
                                          if (mv && debugFens[i]) {
                                            try {
                                              const testCh = new Chess(debugFens[i]);
                                              // Advance to the right color if testing black — play white's consensus move first
                                              if (color === 'black' && consensusMove?.white) { try { testCh.move(consensusMove.white); } catch {} }
                                              const epSan = resolvePawnCapture(testCh, mv);
                                              testCh.move(epSan || mv);
                                              mvLegal = true;
                                            } catch { mvLegal = false; }
                                          }
                                          return (
                                            <td key={m.id} className={`px-1 py-0.5 text-center border-l border-slate-600/50 ${mvLegal === false ? 'text-red-400' : 'text-slate-300'}`}>
                                              {toNotation(mv, modelNotation)}
                                              {time != null && <span className="text-slate-500"> ({time})</span>}
                                              {conf && conf !== 'high' && <span className={`ml-0.5 ${conf === 'low' ? 'text-red-400' : 'text-yellow-600'}`}>[{conf[0]}]</span>}
                                            </td>
                                          );
                                        })}
                                        <td className="px-1 py-0.5 text-center border-l border-slate-500 text-slate-200 font-semibold">
                                          {cMove ? toNotation(cMove, notation) : ''}
                                        </td>
                                        <td className={`px-1 py-0.5 text-center border-l border-slate-500 ${legal === false ? 'text-red-400' : legal === true ? 'text-green-400' : 'text-slate-600'}`}>
                                          {legal === true ? '✓' : legal === false ? '✗' : ''}
                                          {reason && <span className="text-red-400/70 ml-0.5" title={reason}>!</span>}
                                        </td>
                                        <td className="px-1 py-0.5 text-center border-l border-slate-500 text-slate-500">
                                          {details && details.length > 1 && details.map((d: VoteDetail) => (
                                            <span key={d.candidate} className={`${d.candidate === cMove?.replace(/[+#x]/g, '') ? 'text-slate-200 font-semibold' : 'text-slate-500'} mr-1`}>
                                              {toNotation(d.candidate, notation)}:{d.votes}{d.downstreamIllegals > 0 ? `(${d.downstreamIllegals}⚠)` : ''}
                                            </span>
                                          ))}
                                        </td>
                                      </tr>
                                    );
                                  });
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}
                    </>);
                  })()}
                    </div>
                  </div>

                </div>
                );
              })()}
            </div>
          )}

      {/* Fullscreen image modal */}
      {imageZoomLevel > 0 && preview && (
        <div
          onClick={() => setImageZoomLevel(0)}
          className="fixed inset-0 md:left-56 2xl:left-64 z-50 bg-slate-900/60 backdrop-blur-[2px] cursor-zoom-out overflow-auto p-4"
        >
          <div className="flex flex-col items-center gap-2">
            <img
              src={preview}
              alt="Scoresheet"
              onClick={(e) => e.stopPropagation()}
              className="max-w-none rounded-xl object-contain cursor-default"
            />
          </div>
        </div>
      )}
    </PanelShell>
  );
}

function AnalyzingPlaceholder({ minWidth }: { minWidth: string }) {
  const { t } = useLanguage();
  return (
    <div className={`bg-slate-700/50 rounded-xl overflow-hidden ${minWidth}`}>
      <div className="flex items-center justify-center gap-2 text-slate-400 animate-pulse-sync py-12">
        <Clock className="w-4 h-4 animate-spin" />
        <span className="text-sm">{t('coaches.analyzing')}</span>
      </div>
    </div>
  );
}

function ScoreSheetImage({ preview, onImageClick, fileName, zoomed }: { preview: string; onImageClick: () => void; fileName?: string; zoomed?: boolean }) {
  if (zoomed) {
    return (
      <div className="flex flex-col items-center">
        <div className="overflow-auto rounded-xl max-h-[80vh] max-w-[400px] border border-slate-600/30">
          <img
            src={preview}
            alt="Scoresheet"
            className="w-full cursor-pointer hover:opacity-90 transition-opacity"
            onClick={onImageClick}
          />
        </div>
        {fileName && <span className="text-slate-100 text-sm mt-2 truncate max-w-full">{fileName}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center">
      <div className="relative overflow-hidden rounded-xl">
        <img
          src={preview}
          alt="Scoresheet"
          className="object-cover object-top cursor-pointer hover:opacity-90 transition-opacity max-w-[320px] max-h-[600px]"
          onClick={onImageClick}
        />
      </div>
      {fileName && <span className="text-slate-100 text-sm mt-2 truncate max-w-full">{fileName}</span>}
    </div>
  );
}
