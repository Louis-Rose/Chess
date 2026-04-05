// Scoresheet reader page — reads scoresheets with Gemini, supports iterative correction

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ImageIcon, FileText, Clock, Check, ExternalLink, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import { PanelShell } from '../components/PanelShell';
import { ImageZoomModal } from '../components/ImageZoomModal';
import { UploadBox } from '../components/UploadBox';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useCoachesData, getCoachesPrefs, saveCoachesPrefs } from '../contexts/CoachesDataContext';
import { compressImage } from '../utils/compressImage';
import { BoardPreview } from '../components/BoardPreview';
import { playMoveSound } from '../components/Chessboard';
import { pieceImageUrl } from '../utils/pieces';
import { Chess } from 'chess.js';
import type { ScoresheetMove as Move } from '../contexts/CoachesDataContext';

/** Try to resolve shorthand en passant like 'ef' to 'exf6' */
function resolveEnPassant(chess: InstanceType<typeof Chess>, san: string): string | null {
  if (san.length !== 2 || !('abcdefgh'.includes(san[0])) || !('abcdefgh'.includes(san[1]))) return null;
  if (Math.abs(san.charCodeAt(0) - san.charCodeAt(1)) !== 1) return null;
  for (const move of chess.moves({ verbose: true })) {
    if (move.flags.includes('e') && move.san[0] === san[0] && move.to[0] === san[1]) {
      return move.san;
    }
  }
  return null;
}

const NOTATION_MAPS: Record<string, Record<string, string>> = {
  french: { R: 'T', B: 'F', Q: 'D', N: 'C', K: 'R' },
  armenian: { R: 'ն', B: 'փ', Q: 'թ', N: 'Ձ', K: 'Ա' },
};
function toNotation(san: string, notation?: string): string {
  if (!san || !notation || notation === 'english') return san;
  const map = NOTATION_MAPS[notation];
  if (!map) return san;
  if (san[0] in map) return map[san[0]] + san.slice(1);
  return san;
}

/** Replay moves on a board and return copies with correct +/# annotations only (keeps original move text). */
function normalizeMoves(moves: Move[]): Move[] {
  const chess = new Chess();
  return moves.map(m => {
    const out: Move = { ...m };
    for (const color of ['white', 'black'] as const) {
      const san = m[color];
      if (!san) continue;
      try {
        const move = chess.move(san);
        if (move) {
          // Keep original text but fix check/checkmate suffix
          const base = san.replace(/[+#]/g, '');
          const suffix = move.san.endsWith('#') ? '#' : move.san.endsWith('+') ? '+' : '';
          out[color] = base + suffix;
        }
      } catch {
        // illegal move — keep original text
      }
    }
    return out;
  });
}

function buildPgn(moves: Move[], meta?: { white?: string; black?: string; result?: string; date?: string; event?: string; notation?: string }): string {
  const headers = [
    meta?.event ? `[Event "${meta.event}"]` : null,
    meta?.date ? `[Date "${meta.date}"]` : null,
    `[White "${meta?.white || '?'}"]`,
    `[Black "${meta?.black || '?'}"]`,
    `[Result "${meta?.result || '*'}"]`,
  ].filter(Boolean).join('\n');
  const normalized = normalizeMoves(moves);
  const moveText = normalized.map(m =>
    `${m.number}. ${m.white}${m.black ? ' ' + m.black : ''}`
  ).join(' ');
  return `${headers}\n\n${moveText} ${meta?.result || '*'}\n`;
}


export function ScoresheetReadPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileEditRef = useRef<HTMLDivElement>(null);
  const mobileExportRef = useRef<HTMLDivElement>(null);
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
  const [showExampleModal, setShowExampleModal] = useState(false);
  const closeModal = useCallback(() => { setImageZoomLevel(0); setShowExampleModal(false); }, []);
  useEffect(() => {
    if (!imageZoomLevel && !showExampleModal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [imageZoomLevel, showExampleModal, closeModal]);


  const [voteState, setVoteState] = useState<{ setEditValue: (san: string) => void; moveIdx: number; color: 'white' | 'black'; goToMove: (moveNumber: number, color: 'white' | 'black', ply: number) => void; clearSelection: () => void } | null>(null);
  const [userPickedMove, setUserPickedMove] = useState<string | null>(null);
  const unresolvedCountRef = useRef(0);
  const handleVoteStateChange = useCallback((s: { setEditValue: (san: string) => void; moveIdx: number; color: 'white' | 'black'; goToMove: (moveNumber: number, color: 'white' | 'black', ply: number) => void; clearSelection: () => void } | null) => {
    setVoteState(prev => {
      if (prev && s && prev.moveIdx === s.moveIdx && prev.color === s.color) return s;
      setUserPickedMove(null);
      return s;
    });
  }, []);


  useEffect(() => {
    if (!preview) return;
  }, [preview]);

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
    const t0 = preparingStartTime.current || startTime;
    if (!t0) { setLiveGlobalElapsed(0); return; }
    const running = preparingImage || analyzing;
    setLiveGlobalElapsed(Math.round((Date.now() - t0) / 1000));
    if (!running) return;
    const id = setInterval(() => setLiveGlobalElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
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
      activeModelBoardId = 0;
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
                  <option value="" disabled>Pick a Notation</option>
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

              {/* Old model status table removed — see git history (commit 6309c734) */}

              {/* Re-analyze button — hidden for now */}

              {/* Results: consensus + individual reads */}
              {preview && models.length > 0 && (() => {
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
                          const originalForms: Record<string, Record<string, number>> = {}; // normalized → { original → count }
                          for (let mi = 0; mi < allModelMoves.length; mi++) {
                            const moveObj = allModelMoves[mi][i];
                            const val = moveObj?.[color];
                            if (val) {
                              const normalized = val.replace(/[+#x]/g, '');
                              votes[normalized] = (votes[normalized] || 0) + 1;
                              if (!votersByCandidate[normalized]) votersByCandidate[normalized] = [];
                              votersByCandidate[normalized].push(modelNames[mi]);
                              if (!originalForms[normalized]) originalForms[normalized] = {};
                              originalForms[normalized][val] = (originalForms[normalized][val] || 0) + 1;
                              const conf = moveObj?.[`${color}_confidence` as 'white_confidence' | 'black_confidence'];
                              if (conf) confidenceByModel[modelNames[mi]] = conf;
                            }
                          }
                          // Pick the most common original form for each normalized candidate
                          const bestOriginal = (normalized: string) => {
                            const forms = originalForms[normalized];
                            if (!forms) return normalized;
                            return Object.entries(forms).sort((a, b) => b[1] - a[1])[0][0];
                          };
                          const candidates = Object.entries(votes).sort((a, b) => b[1] - a[1]);
                          if (candidates.length === 0) continue;

                          const detailKey = `${i + 1}-${color}`;
                          if (candidates.length === 1) {
                            (move as any)[color] = bestOriginal(candidates[0][0]);
                            details[detailKey] = [{ candidate: candidates[0][0], votes: candidates[0][1], downstreamIllegals: 0, chosen: true, models: votersByCandidate[candidates[0][0]] || [], confidenceByModel }];
                            try { passChess.move(candidates[0][0]); } catch {
                              // If ambiguous, pick disambiguation with fewest downstream illegals
                              const pm = candidates[0][0].match(/^([KQRBN])/);
                              const dm = candidates[0][0].match(/([a-h][1-8])$/);
                              if (pm && dm) {
                                const ambigMoves = passChess.moves().filter(m => m.startsWith(pm[1]) && m.includes(dm[1]));
                                if (ambigMoves.length > 1) {
                                  let bestAm = ambigMoves[0];
                                  let bestAmIll = Infinity;
                                  for (const am of ambigMoves) {
                                    const simA = new Chess(passChess.fen());
                                    let ill = 0;
                                    try { simA.move(am); } catch { continue; }
                                    for (let j = i + 1; j < maxLen; j++) {
                                      for (const c of ['white', 'black'] as const) {
                                        const s = downstreamRef[j]?.[c];
                                        if (!s) continue;
                                        try { simA.move(s); } catch { ill++; }
                                      }
                                    }
                                    if (ill < bestAmIll) { bestAmIll = ill; bestAm = am; }
                                  }
                                  try { passChess.move(bestAm); } catch { /* give up */ }
                                } else if (ambigMoves.length === 1) {
                                  try { passChess.move(ambigMoves[0]); } catch { /* give up */ }
                                }
                              }
                            }
                          } else {
                            let bestCandidate = candidates[0][0];
                            let bestIllegals = Infinity;
                            let bestVotes = candidates[0][1];
                            const dets: { candidate: string; votes: number; downstreamIllegals: number; chosen: boolean; models: string[]; confidenceByModel: Record<string, string> }[] = [];

                            for (const [candidate, voteCount] of candidates) {
                              const simChess = new Chess(passChess.fen());
                              let illegals = 0;
                              let skipDownstream = false;
                              try { simChess.move(candidate); } catch {
                                // Check if it's ambiguous (multiple legal moves match piece+destination)
                                const pieceM = candidate.match(/^([KQRBN])/);
                                const destM = candidate.match(/([a-h][1-8])$/);
                                const ambigMoves = pieceM && destM ? simChess.moves().filter(m => m.startsWith(pieceM[1]) && m.includes(destM[1])) : [];
                                if (ambigMoves.length > 1) {
                                  // Ambiguous — pick disambiguation with fewest downstream illegals
                                  let bestAmbig = ambigMoves[0];
                                  let bestAmbigIll = Infinity;
                                  for (const am of ambigMoves) {
                                    const simA = new Chess(simChess.fen());
                                    let ill = 0;
                                    try { simA.move(am); } catch { ill += 100; }
                                    if (ill === 0) {
                                      for (let j = i + 1; j < maxLen; j++) {
                                        for (const c of ['white', 'black'] as const) {
                                          const s = downstreamRef[j]?.[c];
                                          if (!s) continue;
                                          try { simA.move(s); } catch { ill++; }
                                        }
                                      }
                                    }
                                    if (ill < bestAmbigIll) { bestAmbigIll = ill; bestAmbig = am; }
                                  }
                                  try { simChess.move(bestAmbig); } catch { skipDownstream = true; }
                                } else { illegals += 100; }
                              }

                              if (illegals === 0 && !skipDownstream) {
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
                              // Prefer more votes, unless downstream illegals difference is significant (3+)
                              const illegalsDelta = bestIllegals - illegals;
                              if ((illegalsDelta >= 3) || (illegalsDelta > -3 && voteCount > bestVotes)) {
                                bestIllegals = illegals;
                                bestCandidate = candidate;
                                bestVotes = voteCount;
                              }
                            }

                            const allIllegal = dets.every(d => d.downstreamIllegals >= 100);
                            if (allIllegal) {
                              details[detailKey] = dets;
                              (move as any)[color] = bestOriginal(candidates[0][0]);
                              (move as any)[`${color}_legal`] = false;
                              (move as any)[`${color}_reason`] = 'All options are illegal — please correct manually';
                              const fen = passChess.fen().split(' ');
                              fen[1] = fen[1] === 'w' ? 'b' : 'w';
                              fen[3] = '-'; // clear en-passant square to keep FEN valid
                              try { passChess.load(fen.join(' ')); } catch {}
                            } else {
                              for (const d of dets) { if (d.candidate === bestCandidate) d.chosen = true; }
                              details[detailKey] = dets;
                              (move as any)[color] = bestOriginal(bestCandidate);
                              try { passChess.move(bestCandidate); } catch {
                                // If ambiguous, pick best disambiguation to advance board
                                const pm = bestCandidate.match(/^([KQRBN])/);
                                const dm = bestCandidate.match(/([a-h][1-8])$/);
                                let advanced = false;
                                if (pm && dm) {
                                  const ambigMoves = passChess.moves().filter(m => m.startsWith(pm[1]) && m.includes(dm[1]));
                                  if (ambigMoves.length > 0) {
                                    try { passChess.move(ambigMoves[0]); advanced = true; } catch { /* */ }
                                  }
                                }
                                if (!advanced) {
                                  const fen = passChess.fen().split(' ');
                                  fen[1] = fen[1] === 'w' ? 'b' : 'w';
                                  fen[3] = '-';
                                  try { passChess.load(fen.join(' ')); } catch {}
                                }
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
                        const origForms: Record<string, Record<string, number>> = {};
                        for (const modelMv of allModelMoves) {
                          const val = modelMv[i]?.[color];
                          if (val) {
                            const normalized = val.replace(/[+#x]/g, '');
                            votes[normalized] = (votes[normalized] || 0) + 1;
                            if (!origForms[normalized]) origForms[normalized] = {};
                            origForms[normalized][val] = (origForms[normalized][val] || 0) + 1;
                          }
                        }
                        const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1]);
                        if (sorted.length > 0) {
                          const forms = origForms[sorted[0][0]];
                          (mv as any)[color] = Object.entries(forms).sort((a, b) => b[1] - a[1])[0][0];
                        }
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

                    // Merge time data from model results (pick first available for each move)
                    for (let i = 0; i < consensusMoves.length; i++) {
                      for (const color of ['white', 'black'] as const) {
                        const timeKey = `${color}_time` as const;
                        for (const modelMv of allModelMoves) {
                          const t = modelMv[i]?.[timeKey];
                          if (t != null) { (consensusMoves[i] as any)[timeKey] = t; break; }
                        }
                      }
                    }

                    // Remove trailing empty moves
                    while (consensusMoves.length > 0 && !consensusMoves[consensusMoves.length - 1].white && !consensusMoves[consensusMoves.length - 1].black) {
                      consensusMoves.pop();
                    }
                    if (consensusMoves.length === 0) return (
                      <>
                        {/* Desktop skeleton: image + processing placeholder + board */}
                        <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr] md:gap-4 md:px-4">
                          <div className="flex justify-end items-center">
                            <ScoreSheetImage preview={preview} onImageClick={() => setImageZoomLevel(window.innerWidth >= 768 ? 3 : 1)} fileName={fileName || undefined} zoomed />
                          </div>
                          <div className="self-start">
                            <div className="bg-slate-700/50 rounded-xl overflow-hidden min-w-[540px]">
                              <div className="flex items-center justify-center gap-2 text-slate-400 animate-pulse-sync py-12">
                                <Clock className="w-4 h-4 animate-spin" />
                                <span className="text-sm">{t('coaches.analyzing')}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-center justify-center gap-3 max-w-[400px]">
                            <ModelBoard moves={[]} autoActivate={false} disableDrag />
                          </div>
                        </div>
                        {/* Mobile skeleton: image + processing placeholder + board */}
                        <div className="md:hidden flex flex-col items-center gap-3 px-2">
                          <img src={preview} alt="Scoresheet" className="max-h-[200px] rounded-xl object-contain cursor-pointer" onClick={() => setImageZoomLevel(window.innerWidth >= 768 ? 3 : 1)} />
                          <div className="bg-slate-700/50 rounded-xl overflow-hidden min-w-[320px]">
                            <div className="flex items-center justify-center gap-2 text-slate-400 animate-pulse-sync py-12">
                              <Clock className="w-4 h-4 animate-spin" />
                              <span className="text-sm">{t('coaches.analyzing')}</span>
                            </div>
                          </div>
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
                        try { valChess.move(san); (cm as any)[`${color}_legal`] = true; }
                        catch {
                          (cm as any)[`${color}_legal`] = false;
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

                    // Apply overrides on top of computed consensus, then normalize +/# annotations
                    const rawConsensusMoves = consensusOverrides || consensusMoves;
                    const displayConsensusMoves = rawConsensusMoves;

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
                            const ep = resolveEnPassant(testCh, mv);
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
                      // Replay confirmed moves to get the correct board position
                      const ch = new Chess();
                      for (const cm of current) {
                        for (const col of ['white', 'black'] as const) {
                          const san = cm[col];
                          if (!san) continue;
                          if ((cm as any)[`${col}_confirmed`]) {
                            // Confirmed move — play it, try disambiguation if needed
                            try { ch.move(san); (cm as any)[`${col}_legal`] = true; }
                            catch {
                              const pm = san.match(/^([KQRBN])/);
                              const dm = san.match(/([a-h][1-8])$/);
                              if (pm && dm) {
                                const disambig = ch.moves().find(m => m.startsWith(pm[1]) && m.includes(dm[1]));
                                if (disambig) { try { ch.move(disambig); (cm as any)[`${col}_legal`] = true; } catch { (cm as any)[`${col}_legal`] = false; } }
                                else { (cm as any)[`${col}_legal`] = false; }
                              } else {
                                (cm as any)[`${col}_legal`] = false;
                              }
                              if ((cm as any)[`${col}_legal`] === false) {
                                const f = ch.fen().split(' '); f[1] = f[1] === 'w' ? 'b' : 'w'; f[3] = '-'; try { ch.load(f.join(' ')); } catch {}
                              }
                            }
                          } else {
                            // Non-confirmed move — re-pick from model votes using current position
                            const modelVals = allModelMoves.map(mv => mv[cm.number - 1]?.[col]).filter(Boolean) as string[];
                            if (modelVals.length > 0) {
                              // Group by normalized form, count votes
                              const votes: Record<string, { count: number; originals: Record<string, number> }> = {};
                              for (const v of modelVals) {
                                const norm = v.replace(/[+#x]/g, '');
                                if (!votes[norm]) votes[norm] = { count: 0, originals: {} };
                                votes[norm].count++;
                                votes[norm].originals[v] = (votes[norm].originals[v] || 0) + 1;
                              }
                              // Filter to only legal candidates, then pick by vote count
                              const candidates = Object.entries(votes).map(([, { count, originals }]) => {
                                const orig = Object.entries(originals).sort((a, b) => b[1] - a[1])[0][0];
                                const sim = new Chess(ch.fen());
                                const ep = resolveEnPassant(sim, orig);
                                let legal = false;
                                let resolved = ep || orig;
                                try { sim.move(resolved); legal = true; } catch {
                                  // Try disambiguation
                                  const pm = orig.match(/^([KQRBN])/);
                                  const dm = orig.match(/([a-h][1-8])$/);
                                  if (pm && dm) {
                                    const ambig = sim.moves().find(m => m.startsWith(pm[1]) && m.includes(dm[1]));
                                    if (ambig) { try { sim.move(ambig); legal = true; resolved = ambig; } catch {} }
                                  }
                                }
                                return { orig, resolved, count, legal };
                              });
                              const legalCandidates = candidates.filter(c => c.legal);
                              const best = (legalCandidates.length > 0 ? legalCandidates : candidates)
                                .sort((a, b) => b.count - a.count)[0];
                              if (best) cm[col] = best.resolved;
                            }
                            // Resolve shorthand en passant (e.g. 'ef' → 'exf6')
                            const epResolved = resolveEnPassant(ch, cm[col]!);
                            if (epResolved) cm[col] = epResolved;
                            // Validate
                            try { ch.move(cm[col]!); (cm as any)[`${col}_legal`] = true; }
                            catch {
                              (cm as any)[`${col}_legal`] = false;
                              const f = ch.fen().split(' '); f[1] = f[1] === 'w' ? 'b' : 'w'; f[3] = '-'; try { ch.load(f.join(' ')); } catch {}
                            }
                          }
                        }
                      }
                      scoresheetSetOverrides([...current]);
                    };

                    const handleConfirmMove = (moveNumber: number, color: 'white' | 'black') => {
                      const current = consensusOverrides || [...consensusMoves.map(m => ({ ...m }))];
                      const idx = moveNumber - 1;
                      if (current[idx]) {
                        delete (current[idx] as any)[`${color}_reason`];
                        (current[idx] as any)[`${color}_confirmed`] = true;
                      }
                      rerunConsensusAfterEdit(current);
                    };
                    const handleConsensusBoardPly = (ply: number) => {
                      // The board shows an arrow at targetPly (position at targetPly-1 + arrow).
                      // When the board emits targetPly, it's just catching up to the arrow — ignore it.
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
                    const hasConfirmedMoves = displayConsensusMoves.some(m => (m as any).white_confirmed || (m as any).black_confirmed);
                    const unresolvedPlies: number[] = [];
                    if (allModelsFinished) {
                      displayConsensusMoves.forEach((m, idx) => {
                        const d = modelDisagreements.has(`${m.number}-white`) || !!m.white_reason || m.white_legal === false || m.white_confidence === 'low';
                        const dBlack = modelDisagreements.has(`${m.number}-black`) || !!m.black_reason || m.black_legal === false || m.black_confidence === 'low';
                        if (d && !(m as any).white_confirmed) unresolvedPlies.push(idx * 2 + 1);
                        if (dBlack && m.black && !(m as any).black_confirmed) unresolvedPlies.push(idx * 2 + 2);
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
                        if ((m as any).white_confirmed) last = { idx: i, color: 'white' };
                        if ((m as any).black_confirmed) last = { idx: i, color: 'black' };
                      });
                      return last as { idx: number; color: 'white' | 'black' } | null;
                    };

                    const handleRevert = (lastConfirmed: { idx: number; color: 'white' | 'black' }) => {
                      const current = consensusOverrides || [...displayConsensusMoves.map(m => ({ ...m }))];
                      if (current[lastConfirmed.idx]) {
                        delete (current[lastConfirmed.idx] as any)[`${lastConfirmed.color}_confirmed`];
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
                                      (current[moveIdx] as any)[`${colorStr}_confirmed`] = true;
                                      delete (current[moveIdx] as any)[`${colorStr}_reason`];
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

                    return (<>
                        <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr] md:gap-4 md:px-4" onClick={consensusReady ? deselectConsensus : undefined}>
                          {/* Left: scoresheet image */}
                          <div className="flex justify-end items-center" onClick={e => e.stopPropagation()}>
                            <ScoreSheetImage preview={preview} onImageClick={() => setImageZoomLevel(window.innerWidth >= 768 ? 3 : 1)} fileName={fileName || undefined} zoomed />
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

                              loading={!allModelsFinished || analyzing}
                              meta={consensusMeta}
                              onMetaChange={(field, value) => setMetaOverrides(prev => ({ ...prev, [field]: value }))}
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

                              modelDisagreements={modelDisagreements}
                              voteDetails={allModelsFinished && !analyzing ? voteDetails : undefined}

                              onVoteStateChange={handleVoteStateChange}

                            />
                            )}
                            {/* Edit panel — under the moves table */}
                            {renderEditPanel()}
                            {/* Export buttons — only after verification */}
                            {allVerified && (
                            <div className="w-full bg-slate-700/50 rounded-xl overflow-hidden mt-2 animate-[borderPulse_1.5s_ease-in-out_3] border border-emerald-500/30">
                              <ChesscomAnalysisButton moves={displayConsensusMoves} meta={consensusMeta} hasIllegalMoves={false} onIllegalClick={() => {}} />
                              <LichessStudyButton moves={displayConsensusMoves} meta={consensusMeta} fileName={fileName} hasIllegalMoves={false} onIllegalClick={() => {}} />
                            </div>
                            )}
                            {allVerified && wasFirstTimer.current && (
                              <button
                                onClick={() => scoresheetClear()}
                                className="w-full mt-3 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                              >
                                {t('coaches.tryOwnScoresheet')}
                              </button>
                            )}
                          </div>
                          {/* Right: board */}
                          <div className="flex flex-col items-center justify-center gap-3 max-w-[400px]" onClick={e => e.stopPropagation()}>
                            <ModelBoard moves={hasResults ? displayConsensusMoves : []} externalPly={hasResults ? modelBoardPlys[consensusId]?.ply : 0} onPlyChange={hasResults ? handleConsensusBoardPly : () => {}} disableDrag={!voteState || !allModelsFinished} disableNav autoActivate={false} previewFen={consensusPreviewFen} targetPly={voteState && allModelsFinished ? (voteState.color === 'white' ? voteState.moveIdx * 2 + 1 : voteState.moveIdx * 2 + 2) : undefined} onDragSetMove={voteState ? (san) => {
                              if (!san) { voteState.setEditValue(''); setUserPickedMove(null); return; }
                              setUserPickedMove(san);
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
                            {renderConfirmRevertButtons()}
                          </div>
                        </div>
                        {/* Mobile: image above table */}
                        {/* Mobile layout: image → table → board → edit panel */}
                        <div className="md:hidden flex flex-col items-center gap-3 px-2">
                          <img src={preview} alt="Scoresheet" className="max-h-[200px] rounded-xl object-contain cursor-pointer" onClick={() => setImageZoomLevel(window.innerWidth >= 768 ? 3 : 1)} />
                          {!hasResults || consensusMoves.length === 0 ? (
                            <div className="bg-slate-700/50 rounded-xl overflow-hidden min-w-[320px]">
                              <div className="flex items-center justify-center gap-2 text-slate-400 animate-pulse-sync py-12">
                                <Clock className="w-4 h-4 animate-spin" />
                                <span className="text-sm">{t('coaches.analyzing')}</span>
                              </div>
                            </div>
                          ) : (<>
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

                              loading={!allModelsFinished || analyzing}
                              meta={consensusMeta}
                              onMetaChange={(field, value) => setMetaOverrides(prev => ({ ...prev, [field]: value }))}
                              onEditSave={allModelsFinished && !analyzing ? (confirmed, corrKey) => handleConsensusEditSave(0, confirmed, corrKey) : undefined}
                              onMoveClick={(movesArr, ply) => {
                                setModelBoardPlys(p => ({ ...p, [consensusId]: { ply, source: 'read' as const } }));
                                const moveIdx = Math.floor((ply - 1) / 2);
                                const color = ply % 2 === 1 ? 'white' : 'black';
                                const san = movesArr[moveIdx]?.[color];
                                if (san) playMoveSound(san.includes('x'));
                              }}
                              activePly={modelBoardPlys[consensusId]?.ply}

                              modelDisagreements={modelDisagreements}
                              voteDetails={allModelsFinished && !analyzing ? voteDetails : undefined}
                              onVoteStateChange={handleVoteStateChange}

                            />
                            {/* Mobile board */}
                            <div className="w-full max-w-[400px]">
                              <ModelBoard moves={displayConsensusMoves} externalPly={modelBoardPlys[consensusId]?.ply || 0} onPlyChange={handleConsensusBoardPly} disableDrag={!voteState || !allModelsFinished} disableNav autoActivate={false} previewFen={consensusPreviewFen} targetPly={voteState && allModelsFinished ? (voteState.color === 'white' ? voteState.moveIdx * 2 + 1 : voteState.moveIdx * 2 + 2) : undefined} onDragSetMove={voteState ? (san) => {
                                if (!san) { voteState.setEditValue(''); setUserPickedMove(null); return; }
                                setUserPickedMove(san);
                                voteState.setEditValue(san);
                              } : undefined} />
                            </div>
                            {/* Mobile confirm/revert buttons */}
                            {renderConfirmRevertButtons()}
                            {/* Mobile edit panel */}
                            {renderEditPanel('w-full max-w-[400px]')}
                            <div ref={mobileEditRef} />
                            {/* Mobile export buttons — only after verification */}
                            {allVerified && (
                            <div className="w-full max-w-[400px] bg-slate-700/50 rounded-xl overflow-hidden animate-[borderPulse_1.5s_ease-in-out_3] border border-emerald-500/30">
                              <ChesscomAnalysisButton moves={displayConsensusMoves} meta={consensusMeta} hasIllegalMoves={false} onIllegalClick={() => {}} />
                              <LichessStudyButton moves={displayConsensusMoves} meta={consensusMeta} fileName={fileName} hasIllegalMoves={false} onIllegalClick={() => {}} />
                            </div>
                            )}
                            {allVerified && !hasHadSuccess && (
                              <button
                                onClick={() => scoresheetClear()}
                                className="w-full max-w-[400px] mt-3 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                              >
                                {t('coaches.tryOwnScoresheet')}
                              </button>
                            )}
                            <div ref={mobileExportRef} />
                          </>)}
                        </div>
                    {/* Combined debug table — admin only */}
                    {user?.email === 'rose.louis.mail@gmail.com' && allModelsFinished && (() => {
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
                      type VoteDetail = { candidate: string; votes: number; downstreamIllegals: number; chosen: boolean; models: string[]; confidenceByModel: Record<string, string>; pass1Choice?: string };
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
                                  <th className="px-1 py-1 text-slate-400 text-center border-l border-slate-500">Pass1</th>
                                  <th className="px-1 py-1 text-slate-400 text-center border-l border-slate-500">Pass2</th>
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
                                  <td colSpan={4} className="px-1 py-0.5 text-center border-l border-slate-500 text-slate-200 font-semibold capitalize">{consensusMeta.notation || '?'}</td>
                                </tr>
                                {/* Compute board FENs for debug legality checks */}
                                {Array.from({ length: maxMoves }, (_, i) => {
                                  const consensusMove = displayConsensusMoves[i];
                                  const notation = consensusMeta.notation;
                                  return (['white', 'black'] as const).map(color => {
                                    const key = `${i + 1}-${color}`;
                                    const details: VoteDetail[] | undefined = voteDetails?.[key];
                                    const chosen = details?.find((d: VoteDetail) => d.chosen);
                                    const pass1 = chosen?.pass1Choice;
                                    const pass2 = chosen?.candidate;
                                    const cMove = consensusMove?.[color];
                                    const legal = consensusMove?.[`${color}_legal` as const];
                                    const reason = consensusMove?.[`${color}_reason` as const];
                                    // Only highlight if there's disagreement among legal moves
                                    const hasLegalDisagreement = legal !== false && finishedModels.some(m => {
                                      const mv = modelResults[m.id]!.result!.moves[i]?.[color];
                                      if (!mv || mv === cMove) return false;
                                      // Check if this dissenting move is legal
                                      if (!debugFens[i]) return true;
                                      try {
                                        const testCh = new Chess(debugFens[i]);
                                        if (color === 'black' && consensusMove?.white) { try { testCh.move(consensusMove.white); } catch {} }
                                        const ep = resolveEnPassant(testCh, mv);
                                        testCh.move(ep || mv);
                                        return true; // legal dissenter
                                      } catch { return false; } // illegal dissenter — ignore
                                    });
                                    return (
                                      <tr key={key} className={`border-b border-slate-600/20 ${color === 'black' ? 'border-b-slate-600/50' : ''} ${hasLegalDisagreement ? 'bg-yellow-500/10' : ''}`}>
                                        {color === 'white' && <td className="px-1 py-0.5 text-slate-500 text-center" rowSpan={2}>{i + 1}</td>}
                                        <td className={`px-1 py-0.5 text-center ${color === 'white' ? 'text-slate-300' : 'text-slate-500'}`}>{color === 'white' ? 'W' : 'B'}</td>
                                        {finishedModels.map(m => {
                                          const mr = modelResults[m.id]!;
                                          const mv = mr.result!.moves[i]?.[color] || '';
                                          const modelNotation = mr.result!.notation;
                                          const conf = mr.result!.moves[i]?.[`${color}_confidence` as 'white_confidence' | 'black_confidence'];
                                          const time = mr.result!.moves[i]?.[`${color}_time` as 'white_time' | 'black_time'];
                                          // Test this model's move against current consensus board position
                                          let mvLegal: boolean | null = null;
                                          if (mv && debugFens[i]) {
                                            try {
                                              const testCh = new Chess(debugFens[i]);
                                              // Advance to the right color if testing black — play white's consensus move first
                                              if (color === 'black' && consensusMove?.white) { try { testCh.move(consensusMove.white); } catch {} }
                                              const epSan = resolveEnPassant(testCh, mv);
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
                                        <td className={`px-1 py-0.5 text-center border-l border-slate-500 ${pass1 && pass1 !== pass2 ? 'text-orange-400' : 'text-slate-400'}`}>
                                          {pass1 ? toNotation(pass1, notation) : ''}
                                        </td>
                                        <td className="px-1 py-0.5 text-center border-l border-slate-500 text-slate-200 font-semibold">
                                          {pass2 ? toNotation(pass2, notation) : (cMove ? toNotation(cMove, notation) : '')}
                                        </td>
                                        <td className={`px-1 py-0.5 text-center border-l border-slate-500 ${legal === false ? 'text-red-400' : legal === true ? 'text-green-400' : 'text-slate-600'}`}>
                                          {legal === true ? '✓' : legal === false ? '✗' : ''}
                                          {reason && <span className="text-red-400/70 ml-0.5" title={reason}>!</span>}
                                        </td>
                                        <td className="px-1 py-0.5 text-center border-l border-slate-500 text-slate-500">
                                          {details && details.length > 1 && details.map((d: VoteDetail) => (
                                            <span key={d.candidate} className={`${d.chosen ? 'text-slate-200 font-semibold' : 'text-slate-500'} mr-1`}>
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

                  {/* Azure DI section — disabled, kept for future use */}

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

      {/* Example image modal */}
      {showExampleModal && (
        <ImageZoomModal
          src="/cropping_example.jpeg"
          alt="Cropping example"
          onClose={() => setShowExampleModal(false)}
        />
      )}
    </PanelShell>
  );
}

interface PlyEntry {
  fen: string;
  lastMove: { from: string; to: string } | null;
  illegal?: { moveNumber: number; color: 'white' | 'black'; san: string; reason?: string };
  san?: string;
  reason?: string;
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

// Track which ModelBoard instance is "active" (last interacted with)
let activeModelBoardId = 0;
let nextModelBoardId = 0;

function ModelBoard({ moves, externalPly, onPlyChange, disableDrag, disableNav, autoActivate, previewFen, highlightedPlies: _highlightedPlies, onDragSetMove, compact, targetPly }: { moves: Move[]; externalPly?: number; onPlyChange?: (ply: number) => void; disableDrag?: boolean; disableNav?: boolean; autoActivate?: boolean; previewFen?: string | null; highlightedPlies?: number[]; onDragSetMove?: (san: string) => void; compact?: boolean; targetPly?: number }) {
  const { t } = useLanguage();
  const [instanceId] = useState(() => ++nextModelBoardId);
  const [internalPly, setInternalPly] = useState(0);
  // Use externalPly directly when provided (controlled mode), fall back to internal state
  const ply = externalPly !== undefined ? externalPly : internalPly;
  const setPly = useCallback((p: number | ((prev: number) => number)) => {
    setInternalPly(p);
  }, []);

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
        const moveReason = m[`${color}_reason` as 'white_reason' | 'black_reason'];
        try {
          const move = chess.move(san);
          result.push({ fen: chess.fen(), lastMove: move ? { from: move.from, to: move.to } : null, san, reason: moveReason });
        } catch {
          const reason = moveReason;
          result.push({ fen: chess.fen(), lastMove: null, illegal: { moveNumber: m.number, color, san, reason }, san });
          // Flip turn so next move validates from the right side
          const fen = chess.fen().split(' ');
          fen[1] = fen[1] === 'w' ? 'b' : 'w';
          fen[3] = '-'; // clear en-passant square to keep FEN valid
          try { chess.load(fen.join(' ')); } catch {}
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
  const currentArrow: { from: string; to: string } | { from: string; to: string }[] | null = showArrow ? (() => {
    const entry = entries[safePly];
    // If the move failed (illegal/ambiguous), try to show possible arrows from the position
    if (!entry.lastMove && entry.san) {
      try {
        const ch = new Chess(entries[displayPly].fen);
        const san = entry.san;
        const pieceMatch = san.match(/^([KQRBN])/);
        const destMatch = san.match(/([a-h][1-8])/);
        if (pieceMatch && destMatch) {
          const piece = pieceMatch[1];
          const dest = destMatch[1];
          const candidates = ch.moves({ verbose: true }).filter(m => m.san.startsWith(piece) && m.to === dest);
          if (candidates.length >= 1) {
            const arrows = candidates.map(m => ({ from: m.from, to: m.to }));
            return arrows.length > 1 ? arrows : arrows[0];
          }
        }
      } catch { /* fall through */ }
    }
    if (entry.lastMove && entry.san) {
      // For castling, show both king and rook arrows
      const castleSan = entry.san.replace(/[+#]/g, '');
      if (castleSan === 'O-O' || castleSan === 'O-O-O') {
        const rank = entry.lastMove.from[1]; // '1' for white, '8' for black
        if (castleSan === 'O-O') {
          return [entry.lastMove, { from: `h${rank}`, to: `f${rank}` }];
        } else {
          return [entry.lastMove, { from: `a${rank}`, to: `d${rank}` }];
        }
      }
    }
    return entry.lastMove;
  })() : null;
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
  // When externalPly changes, exit any branch
  const prevExternalPly = useRef(externalPly);
  if (externalPly !== undefined && externalPly !== prevExternalPly.current) {
    if (inBranch) { setBranch(null); setBranchPly(0); }
    activeModelBoardId = instanceId;
  }
  prevExternalPly.current = externalPly;


  // Play sound for a given ply (called from navigation actions, not from effects)
  const playSoundForPly = useCallback((p: number) => {
    if (p > 0 && entries[p]?.san) playMoveSound(entries[p].san!.includes('x'));
  }, [entries]);

  const emitPly = useCallback((p: number) => {
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
      const newP = Math.max(0, safePly - 1);
      if (newP !== safePly) { playSoundForPly(safePly); setPly(newP); emitPly(newP); }
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
      const newP = Math.min(maxPly, safePly + 1);
      if (newP !== safePly) {
        playSoundForPly(newP);
        setPly(newP);
        emitPly(newP);
        if (showArrow && targetPly !== undefined && safePly === targetPly && entries[safePly]?.san && onDragSetMove) {
          onDragSetMove(entries[safePly].san!);
        }
      }
    }
  }, [branch, branchPly, inBranch, maxPly, safePly, playSoundForPly, emitPly, onDragSetMove, showArrow, entries, targetPly]);

  const goFirst = useCallback(() => {
    exitBranch();
    if (safePly !== 0) { playSoundForPly(safePly); setPly(0); emitPly(0); }
  }, [exitBranch, safePly, playSoundForPly, emitPly]);
  const goLast = useCallback(() => {
    exitBranch();
    if (safePly !== maxPly) { playSoundForPly(maxPly); setPly(maxPly); emitPly(maxPly); }
  }, [exitBranch, safePly, maxPly, playSoundForPly, emitPly]);

  // Handle user move (drag & drop)
  const handleUserMove = useCallback((from: string, to: string) => {
    // Detect reverse of last move (dragging piece back) → go previous
    // If in a 1-move branch (user already dragged), allow undoing or picking a different move
    if (inBranch && branch && branchPly === 1 && onDragSetMove) {
      // Check if dragging the piece back (reversing the branch move)
      const branchMove = (() => {
        try {
          const ch = new Chess(branch.fens[0]);
          const m = ch.move(branch.sans[0]);
          return m ? { from: m.from, to: m.to } : null;
        } catch { return null; }
      })();
      if (branchMove && from === branchMove.to && to === branchMove.from) {
        // Undo — exit branch, clear pick, go back to arrow view
        onDragSetMove('');
        exitBranch();
        return;
      }
      // Only allow replacement moves from the pre-branch position (same color)
      // Block moves of the opposing color (which would be valid from the current branch fen)
      exitBranch();
      try {
        const chess = new Chess(entries[displayPly].fen);
        const move = chess.move({ from, to, promotion: 'q' });
        if (!move) return;
        onDragSetMove(move.san);
        setBranch({ startPly: displayPly, fens: [entries[displayPly].fen, chess.fen()], sans: [move.san] });
        setBranchPly(1);
        playMoveSound(move.san.includes('x'));
      } catch { /* invalid move — likely wrong color */ }
      return;
    }
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

      // Check if matches the arrow move (displayed move) or next main-line move
      const nextMainPly = showArrow ? safePly : safePly + 1;
      if (!inBranch && nextMainPly <= maxPly && entries[nextMainPly]?.san === san) {
        if (onDragSetMove) onDragSetMove(san);
        if (showArrow) {
          // Show the result of the drag by creating a one-move branch
          setBranch({ startPly: displayPly, fens: [entries[displayPly].fen, newFen], sans: [san] });
          setBranchPly(1);
        } else {
          setPly(p => p + 1); emitPly(safePly + 1);
        }
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
        // In edit mode, block extending the branch (only allow replacement via the handler above)
        if (onDragSetMove) return;
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
  }, [currentFen, inBranch, branch, branchPly, safePly, maxPly, entries, onDragSetMove, goPrev, showArrow, displayPly]);

  // Activate this board on any click, then keyboard only responds to active board
  const activate = useCallback(() => { activeModelBoardId = instanceId; }, [instanceId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (disableNav) return;
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
  }, [instanceId, goPrev, goNext, goFirst, goLast, onDragSetMove, disableNav]);


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
      {!disableNav && <div className="relative flex justify-center gap-1.5 mt-1.5 w-full">
        {!compact && (
          <button onClick={goFirst} disabled={disableNav} className={`flex-1 max-w-[80px] py-1.5 rounded-lg transition-colors flex items-center justify-center ${disableNav ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
            <ChevronFirst className="w-5 h-5" />
          </button>
        )}
        {compact ? (
          <>
            <button onClick={goPrev} disabled={disableNav} className={`flex-1 py-1 2xl:py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1 text-xs 2xl:text-sm ${disableNav ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
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
            <button onClick={goNext} disabled={disableNav} className={`flex-1 py-1 2xl:py-2.5 rounded-lg transition-colors flex items-center justify-center gap-1 text-xs 2xl:text-sm ${disableNav ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <button onClick={goPrev} disabled={disableNav} className={`flex-1 max-w-[80px] py-1.5 rounded-lg transition-colors flex items-center justify-center ${disableNav ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={goNext} disabled={disableNav} className={`flex-1 max-w-[80px] py-1.5 rounded-lg transition-colors flex items-center justify-center ${disableNav ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}
        {!compact && (
          <button onClick={goLast} disabled={disableNav} className={`flex-1 max-w-[80px] py-1.5 rounded-lg transition-colors flex items-center justify-center ${disableNav ? 'bg-slate-700 text-slate-500 cursor-not-allowed' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}>
            <ChevronLast className="w-5 h-5" />
          </button>
        )}
      </div>}
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



function MovesPanel({ label, moves, disagreements, error, meta, onMetaChange, rereading, corrections, onEditSave, onReread, onMoveClick, activePly, onPreview, onClearPreview, originalMoves, voteDetails, showMoveInfo, loading, onVoteStateChange }: {
  label: string;
  moves: Move[];
  disagreements: Map<number, { white: boolean; black: boolean }>;
  error?: string;
  meta?: { white?: string; black?: string; result?: string; date?: string; event?: string; notation?: string };
  onMetaChange?: (field: string, value: string) => void;
  rereading?: boolean;
  corrections?: Set<string>;
  onEditSave?: (confirmed: Move[], correctionKey: string) => void;
  onReread?: () => void;
  onMoveClick?: (moves: Move[], ply: number) => void;
  activePly?: number;
  onPreview?: (moveIdx: number, color: 'white' | 'black', san: string) => void;
  onClearPreview?: () => void;

  modelDisagreements?: Set<string>;
  originalMoves?: Move[];
  voteDetails?: Record<string, { candidate: string; votes: number; downstreamIllegals: number; chosen: boolean; models: string[]; confidenceByModel: Record<string, string>; pass1Choice?: string }[]>;

  showMoveInfo?: boolean;
  loading?: boolean;
  onVoteStateChange?: (state: { setEditValue: (san: string) => void; moveIdx: number; color: 'white' | 'black'; goToMove: (moveNumber: number, color: 'white' | 'black', ply: number) => void; clearSelection: () => void } | null) => void;
}) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState<{ moveIdx: number; color: 'white' | 'black'; value: string } | null>(null);
  const [editFromVoteKey, setEditFromVoteKey] = useState<string | null>(null);
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
        goToMove: (moveNumber: number, color: 'white' | 'black', ply: number) => {
          setVoteInfoKey(`${moveNumber}-${color}`);
          onMoveClick?.(moves, ply);
        },
        clearSelection: () => { setVoteInfoKey(null); },
      });
    } else {
      onVoteStateChange(null);
    }
  }, [voteInfoKey, onVoteStateChange]);

  // Auto-select first move of the game when all models are done
  useEffect(() => {
    if (moves && moves.length > 0 && !loading && !voteInfoKey) {
      setVoteInfoKey('1-white');
      onMoveClick?.(moves, 1);
    }
  }, [moves, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const [moveInfoKey, setMoveInfoKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
      <div className="px-3 py-2.5 border-b border-slate-600 flex items-center justify-center">
        <span className="text-slate-100 font-medium text-sm">{label}</span>
      </div>


      {error && <p className="text-red-400 text-center py-3 text-xs px-2 break-words max-w-sm mx-auto">{error}</p>}

      {/* Game metadata */}
      {meta && (
        <div className="px-3 py-2 border-b border-slate-600/30 text-sm text-slate-300 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 w-28 text-right shrink-0">Player (White) :</span>
            <input value={meta.white || ''} onChange={e => onMetaChange?.('white', e.target.value)} className="flex-1 bg-transparent text-slate-100 border-b border-slate-600 focus:border-blue-500 outline-none px-1 py-0.5" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 w-28 text-right shrink-0">Player (Black) :</span>
            <input value={meta.black || ''} onChange={e => onMetaChange?.('black', e.target.value)} className="flex-1 bg-transparent text-slate-100 border-b border-slate-600 focus:border-blue-500 outline-none px-1 py-0.5" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 w-28 text-right shrink-0">Result :</span>
            <input value={meta.result || ''} onChange={e => onMetaChange?.('result', e.target.value)} className="flex-1 bg-transparent text-slate-100 font-semibold border-b border-slate-600 focus:border-blue-500 outline-none px-1 py-0.5" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 w-28 text-right shrink-0">Date :</span>
            <input value={meta.date || ''} onChange={e => onMetaChange?.('date', e.target.value)} placeholder="DD/MM/YYYY" className="flex-1 bg-transparent text-slate-100 border-b border-slate-600 focus:border-blue-500 outline-none px-1 py-0.5" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 w-28 text-right shrink-0">Event :</span>
            <input value={meta.event || ''} onChange={e => onMetaChange?.('event', e.target.value)} className="flex-1 bg-transparent text-slate-100 border-b border-slate-600 focus:border-blue-500 outline-none px-1 py-0.5" />
          </div>
        </div>
      )}



      {/* Moves table */}
      <div className={`${loading ? 'pointer-events-none' : ''}`}>
      {moves.length > 0 && (() => {
        const numCols = 2;
        const perCol = Math.ceil(moves.length / numCols);
        const columns = Array.from({ length: numCols }, (_, c) => moves.slice(c * perCol, (c + 1) * perCol));
        const rows = Math.max(...columns.map(col => col.length));
        const hasTime = moves.some(m => m.white_time != null || m.black_time != null);

        const renderHalf = (move: Move | undefined, idx: number, d: { white: boolean; black: boolean } | undefined) => {
          if (!move) return <><td className="px-3 py-1.5" /><td className="px-3 py-1.5" /><td className="px-3 py-1.5" /></>;
          return <>
            <td className="px-3 py-1.5 text-slate-500 text-center font-mono">{move.number}</td>
            <MoveCell
              value={toNotation(move.white, meta?.notation)}
              legal={move.white_legal}
              highlight={(d?.white || !!move.white_reason) && !(move as any).white_confirmed}
              corrected={corrections?.has(`${move.number}-white`)}
              active={activePly === idx * 2 + 1}
              reason={move.white_reason}
              confidence={move.white_confidence}
              time={move.white_time}
              hasTime={hasTime}
              onShowBoard={onMoveClick ? () => onMoveClick(moves, idx * 2 + 1) : undefined}
              onVoteInfo={voteDetails ? () => { setVoteInfoKey(`${move.number}-white`); setVoteEditValue(move.white || ''); onMoveClick?.(moves, idx * 2 + 1); } : undefined}
              onMoveInfo={showMoveInfo ? () => setMoveInfoKey(`${move.number}-white`) : undefined}
            />
            <MoveCell
              value={toNotation(move.black || '', meta?.notation)}
              legal={move.black_legal}
              corrected={corrections?.has(`${move.number}-black`)}
              highlight={(d?.black || !!move.black_reason) && !(move as any).black_confirmed}
              active={activePly === idx * 2 + 2}
              reason={move.black_reason}
              confidence={move.black_confidence}
              time={move.black_time}
              hasTime={hasTime}
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
                    <th className="px-3 py-2 text-slate-400 font-medium text-center">{hasTime ? 'White (⏱)' : 'White'}</th>
                    <th className="px-3 py-2 text-slate-400 font-medium text-center">{hasTime ? 'Black (⏱)' : 'Black'}</th>
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
                    if (!move && c > 0) return <React.Fragment key={c}><td className="px-3 py-1.5 border-l border-slate-600/30" /><td className="px-3 py-1.5" /><td className="px-3 py-1.5" /></React.Fragment>;
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
      </>)}
      </div>

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 md:left-56 2xl:left-64 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-[2px]"
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
          className="fixed inset-0 md:left-56 2xl:left-64 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[2px]"
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
            className="fixed inset-0 md:left-56 2xl:left-64 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[2px]"
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
  meta?: { white?: string; black?: string; result?: string; date?: string; event?: string; notation?: string };
  hasIllegalMoves?: boolean;
  onIllegalClick?: () => void;
}) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const handleClick = async () => {
    if (hasIllegalMoves) { onIllegalClick?.(); return; }
    const normalized = normalizeMoves(moves);
    const moveText = normalized.map(m =>
      `${m.number}. ${m.white}${m.black ? ' ' + m.black : ''}`
    ).join(' ');
    const pgn = `[White "${meta?.white || '?'}"]\n[Black "${meta?.black || '?'}"]\n[Result "${meta?.result || '*'}"]\n[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"]\n\n${moveText} ${meta?.result || '*'}`;
    if (copied) {
      // Second tap: open Chess.com
      window.open(`https://www.chess.com/analysis?pgn=${encodeURIComponent(pgn)}`, '_blank');
      setCopied(false);
      return;
    }
    // First tap: copy PGN to clipboard
    try { await navigator.clipboard.writeText(pgn); } catch { /* fallback */ }
    setCopied(true);
  };
  return (
    <button
      onClick={handleClick}
      className="w-full px-2 py-2.5 border-t border-slate-600/50 text-center text-sm text-slate-200 hover:bg-slate-600/40 transition-colors flex items-center justify-center gap-1.5"
    >
      {copied ? (
        <><ExternalLink className="w-3.5 h-3.5 text-emerald-400" /> {t('coaches.chesscom.pgnCopied')}</>
      ) : (
        <><ExternalLink className="w-3.5 h-3.5" /> {t('coaches.chesscom.copyPaste')}</>
      )}
    </button>
  );
}



function LichessStudyButton({ moves, meta, fileName, hasIllegalMoves, onIllegalClick }: {
  moves: Move[];
  meta?: { white?: string; black?: string; result?: string; date?: string; event?: string; notation?: string };
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
          className="fixed inset-0 md:left-56 2xl:left-64 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[2px]"
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

function MoveCell({ value, legal, highlight, corrected, active, confidence, time, hasTime, onShowBoard, onVoteInfo, onMoveInfo }: {
  value: string;
  legal?: boolean;
  highlight?: boolean;
  corrected?: boolean;
  active?: boolean;
  reason?: string;
  confidence?: 'high' | 'medium' | 'low';
  time?: number;
  hasTime?: boolean;
  onShowBoard?: () => void;
  onVoteInfo?: () => void;
  onMoveInfo?: () => void;
}) {
  const isLowConfidence = confidence === 'low';
  const isIllegal = legal === false;
  const bg = corrected ? 'bg-green-900/50 text-green-200' : (highlight || isIllegal || isLowConfidence) ? 'bg-yellow-500/50 text-yellow-100' : 'text-slate-100';
  const border = active ? 'outline outline-3 outline-blue-400 -outline-offset-1 animate-pulse' : '';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onMoveInfo) { onMoveInfo(); return; }
    if (onVoteInfo) { onVoteInfo(); return; }
    if (onShowBoard) onShowBoard();
  };

  return (
    <td
      className={`px-3 py-1.5 font-mono text-center cursor-pointer hover:bg-slate-600/50 ${bg} ${border}`}
      onClick={handleClick}
    >
      {hasTime ? (
        <span className="inline-flex items-center w-full">
          <span className="flex-1 text-center">{value}</span>
          <span className="flex-1 text-center">{time != null ? `(${time})` : ''}</span>
        </span>
      ) : (
        <span className="inline-flex items-center justify-center gap-1 w-full">
          {value}
        </span>
      )}
    </td>
  );
}
