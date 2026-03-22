// Scoresheet reader page — reads scoresheets with Gemini, supports iterative correction

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Upload, ImageIcon, Clock, BookOpen, Copy, Check, Download, Play, RotateCcw, Square } from 'lucide-react';
import { PanelShell } from '../components/PanelShell';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useCoachesData } from '../contexts/CoachesDataContext';
import type { ScoresheetMove as Move, ScoresheetReadEntry as ReadEntry } from '../contexts/CoachesDataContext';

// Ground truth for known scoresheets — keyed by filename stem (without extension)
const GROUND_TRUTHS: Record<string, { white_player: string; black_player: string; result: string; moves: Move[] }> = {
  '2024_WCC_DING_GUKESH_14': {
    white_player: 'Ding Liren',
    black_player: 'D. Gukesh',
    result: '0-1',
    moves: [
      { number: 1, white: 'Nf3', black: 'd5' }, { number: 2, white: 'g3', black: 'c5' },
      { number: 3, white: 'Bg2', black: 'Nc6' }, { number: 4, white: 'd4', black: 'e6' },
      { number: 5, white: 'O-O', black: 'cd4' }, { number: 6, white: 'Nd4', black: 'Nge7' },
      { number: 7, white: 'c4', black: 'Nd4' }, { number: 8, white: 'Qd4', black: 'Nc6' },
      { number: 9, white: 'Qd1', black: 'd4' }, { number: 10, white: 'e3', black: 'Bc5' },
      { number: 11, white: 'ed4', black: 'Bd4' }, { number: 12, white: 'Nc3', black: 'O-O' },
      { number: 13, white: 'Nb5', black: 'Bb6' }, { number: 14, white: 'b3', black: 'a6' },
      { number: 15, white: 'Nc3', black: 'Bd4' }, { number: 16, white: 'Bb2', black: 'e5' },
      { number: 17, white: 'Qd2', black: 'Be6' }, { number: 18, white: 'Nd5', black: 'b5' },
      { number: 19, white: 'cb5', black: 'ab5' }, { number: 20, white: 'Nf4', black: 'ef4' },
      { number: 21, white: 'Bc6', black: 'Bb2' }, { number: 22, white: 'Qb2', black: 'Rb8' },
      { number: 23, white: 'Rfd1', black: 'Qb6' }, { number: 24, white: 'Bf3', black: 'fg3' },
      { number: 25, white: 'hg3', black: 'b4' }, { number: 26, white: 'a4', black: 'ba3' },
      { number: 27, white: 'Ra3', black: 'g6' }, { number: 28, white: 'Qd4', black: 'Qb5' },
      { number: 29, white: 'b4', black: 'Qb4' }, { number: 30, white: 'Qb4', black: 'Rb4' },
      { number: 31, white: 'Ra8', black: 'Ra8' }, { number: 32, white: 'Ba8', black: 'g5' },
      { number: 33, white: 'Bd5', black: 'Bf5' }, { number: 34, white: 'Rc1', black: 'Kg7' },
      { number: 35, white: 'Rc7', black: 'Bg6' }, { number: 36, white: 'Rc4', black: 'Rb1+' },
      { number: 37, white: 'Kg2', black: 'Re1' }, { number: 38, white: 'Rb4', black: 'h5' },
      { number: 39, white: 'Ra4', black: 'Re5' }, { number: 40, white: 'Bf3', black: 'Kh6' },
      { number: 41, white: 'Kg1', black: 'Re6' }, { number: 42, white: 'Rc4', black: 'g4' },
      { number: 43, white: 'Bd5', black: 'Rd6' }, { number: 44, white: 'Bb7', black: 'Kg5' },
      { number: 45, white: 'f3', black: 'f5' }, { number: 46, white: 'fg4', black: 'hg4' },
      { number: 47, white: 'Rb4', black: 'Bf7' }, { number: 48, white: 'Kf2', black: 'Rd2+' },
      { number: 49, white: 'Kg1', black: 'Kf6' }, { number: 50, white: 'Rb6+', black: 'Kg5' },
      { number: 51, white: 'Rb4', black: 'Be6' }, { number: 52, white: 'Ra4', black: 'Rb2' },
      { number: 53, white: 'Ba8', black: 'Kf6' }, { number: 54, white: 'Rf4', black: 'Ke5' },
      { number: 55, white: 'Rf2', black: 'Rf2' }, { number: 56, white: 'Kf2', black: 'Bd5' },
      { number: 57, white: 'Bd5', black: 'Kd5' }, { number: 58, white: 'Ke3', black: 'Ke5' },
    ],
  },
};

function getGroundTruth(filename: string | null): typeof GROUND_TRUTHS[string] | null {
  if (!filename) return null;
  const stem = filename.replace(/\.[^.]+$/, '');
  return GROUND_TRUTHS[stem] || null;
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

function downloadPgn(moves: Move[], sourceFileName?: string | null, meta?: { white?: string; black?: string; result?: string }) {
  const pgn = buildPgn(moves, meta);
  const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sourceFileName ? sourceFileName.replace(/\.[^.]+$/, '.pgn') : 'scoresheet.pgn';
  a.click();
  URL.revokeObjectURL(url);
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
    scoresheetHandleEditSave, scoresheetClear,
  } = useCoachesData();

  const { preview, fileName, error, modelResults, reReads, models, autoRunning, startTime, analyzing, azureResult } = scoresheet;

  const groundTruth = useMemo(() => getGroundTruth(fileName), [fileName]);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => scoresheetSetImage(file, reader.result as string, file.name);
    reader.readAsDataURL(file);
  };

  const startOneRead = scoresheetStartOneRead;
  const startMultipleReads = () => groundTruth && scoresheetStartMultipleReads(groundTruth.moves);
  const stopMultipleReads = scoresheetStopMultipleReads;

  return (
    <PanelShell title={t('coaches.navScoresheets')}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {!preview ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-600 rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-blue-500 transition-colors max-w-lg mx-auto"
            >
              <ImageIcon className="w-12 h-12 text-slate-500" />
              <span className="text-slate-300 font-medium">{t('coaches.uploadPrompt')}</span>
              <span className="text-slate-500 text-sm">{t('coaches.uploadHint')}</span>
            </button>
          ) : (
            <div className="space-y-4">
              {/* Replace + preview */}
              <div className="flex justify-center">
                <button
                  onClick={() => { scoresheetClear(); fileInputRef.current?.click(); }}
                  className="bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  {t('coaches.replaceImage')}
                </button>
              </div>
              <img
                src={preview}
                alt="Scoresheet"
                className="rounded-xl max-h-80 mx-auto cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setShowImageModal(true)}
              />

              {/* Run buttons */}
              {!analyzing && models.length === 0 && !autoRunning && (
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

              {/* Error */}
              {error && (
                <p className="text-red-400 text-center py-4">{error}</p>
              )}

              {/* Analyzing spinner — visible until all models have returned */}
              {analyzing && (
                <div className="flex items-center justify-center gap-2 text-slate-400 animate-pulse py-4">
                  <Clock className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Analyzing scoresheet...</span>
                </div>
              )}

              {/* Model results — one section per model */}
              {(models.length > 0 || (analyzing && groundTruth)) && (
                <div className="space-y-6">
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

                    return (
                      <div key={m.id}>
                        <h2 className="text-sm font-medium text-slate-300 mb-2 px-1">{mr?.name || m.name}</h2>
                        <div className="flex flex-wrap gap-3 items-start">
                          {groundTruth && <GroundTruthPanel groundTruth={groundTruth} fileName={fileName} />}
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
                              />
                            ))
                          )}
                        </div>
                        {/* Summary: runs & total time */}
                        {mr && allReads.length > 0 && !allReads.some(r => r.rereading) && (
                          <div className="text-xs text-slate-400 mt-1 px-1">
                            {allReads.length} {allReads.length === 1 ? 'run' : 'runs'} — {allReads.reduce((sum, r) => sum + (r.elapsed || 0), 0)}s total
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Azure Document Intelligence section */}
              {azureResult && (
                <>
                  <div className="border-t border-slate-600 my-4" />
                  <h2 className="text-sm font-medium text-slate-300 mb-2 px-1">Azure Document Intelligence</h2>
                  {azureResult.loading ? (
                    <div className="flex items-center justify-center gap-2 text-slate-400 animate-pulse py-4">
                      <Clock className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Analyzing with Azure DI...</span>
                    </div>
                  ) : azureResult.error ? (
                    <p className="text-red-400 text-center py-3 text-xs px-2">{azureResult.error}</p>
                  ) : azureResult.rawTables && azureResult.rawTables.length > 0 ? (
                    <div className="flex flex-wrap gap-3 items-start">
                      {groundTruth && <GroundTruthPanel groundTruth={groundTruth} fileName={fileName} />}
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

function GroundTruthPanel({ groundTruth, fileName }: { groundTruth: { white_player: string; black_player: string; result: string; moves: Move[] }; fileName?: string | null }) {
  const [validatedMoves, setValidatedMoves] = useState<Move[]>(groundTruth.moves);

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

  return (
    <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-xl overflow-hidden self-start">
      <div className="px-2 py-2 border-b border-emerald-700/50 flex items-center gap-1.5">
        <BookOpen className="w-3 h-3 text-emerald-400" />
        <span className="text-emerald-300 font-medium text-xs">Ground Truth</span>
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

      <table className="w-full text-xs">
        <thead className="bg-emerald-900/40">
          <tr className="border-b border-emerald-700/50">
            <th className="px-1.5 py-1 text-slate-400 font-medium text-center w-6">#</th>
            <th className="px-1.5 py-1 text-slate-400 font-medium text-center">White</th>
            <th className="px-1.5 py-1 text-slate-400 font-medium text-center">Black</th>
          </tr>
        </thead>
        <tbody>
          {validatedMoves.map((move) => (
            <tr key={move.number} className="border-b border-emerald-700/20 last:border-0">
              <td className="px-1.5 py-0.5 text-slate-500 text-center font-mono">{move.number}</td>
              <td className="px-1.5 py-0.5 font-mono text-slate-100 text-center">
                <span className="inline-flex items-center gap-1">
                  {move.white}
                  {move.white_legal === true && <span className="text-green-400 text-[9px]">&#10003;</span>}
                  {move.white_legal === false && <span className="text-red-400 text-[9px]">&#10007;</span>}
                </span>
              </td>
              <td className="px-1.5 py-0.5 font-mono text-slate-100 text-center">
                <span className="inline-flex items-center gap-1">
                  {move.black || ''}
                  {move.black_legal === true && <span className="text-green-400 text-[9px]">&#10003;</span>}
                  {move.black_legal === false && <span className="text-red-400 text-[9px]">&#10007;</span>}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-2 py-1.5 border-t border-emerald-700/50 text-center space-y-0.5 flex flex-col items-center justify-center">
        <div>
          <span className="text-xs font-medium text-green-400">100% accuracy</span>
        </div>
        <div className="text-[10px] text-emerald-400/40">{'\u00A0'}</div>
        <div className="text-[10px] text-emerald-400/40">{'\u00A0'}</div>
      </div>
      <button
        onClick={() => downloadPgn(validatedMoves, fileName, { white: groundTruth.white_player, black: groundTruth.black_player, result: groundTruth.result })}
        className="w-full px-2 py-2.5 border-t border-emerald-700/50 text-center text-xs text-emerald-400 hover:bg-emerald-800/30 transition-colors flex items-center justify-center gap-1.5"
      >
        <Download className="w-3 h-3" /> Download PGN
      </button>
      <CopyPgnButton
        moves={validatedMoves}
        meta={{ white: groundTruth.white_player, black: groundTruth.black_player, result: groundTruth.result }}
        variant="ground-truth"
      />
    </div>
  );
}

function CopyPgnButton({ moves, meta, variant }: {
  moves: Move[];
  meta?: { white?: string; black?: string; result?: string };
  variant: 'ground-truth' | 'model';
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const handleCopy = async () => {
    const pgn = buildPgn(moves, meta);
    try {
      await navigator.clipboard.writeText(pgn);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = pgn;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setCopied(true);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const isGt = variant === 'ground-truth';
  return (
    <button
      onClick={handleCopy}
      className={`w-full px-2 py-2.5 border-t text-center text-xs transition-colors flex items-center justify-center gap-1.5 ${
        isGt
          ? 'border-emerald-700/50 text-emerald-400 hover:bg-emerald-800/30'
          : 'border-slate-600/50 text-slate-400 hover:bg-slate-600/40 hover:text-slate-200'
      }`}
    >
      {copied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy PGN</>}
    </button>
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
    <div className="bg-slate-700/50 rounded-xl overflow-hidden self-start">
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

function MovesPanel({ label, moves, groundTruthMoves, disagreements, elapsed, warnings, error, meta, fileName, rereading, corrections, onEditSave }: {
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
    <div className="bg-slate-700/50 rounded-xl overflow-hidden self-start min-w-[200px]">
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
      {moves.length > 0 && (
        <table className="w-full text-xs">
          <thead className="bg-slate-700">
            <tr className="border-b border-slate-600">
              <th className="px-1.5 py-1 text-slate-400 font-medium text-center w-6">#</th>
              <th className="px-1.5 py-1 text-slate-400 font-medium text-center">White</th>
              <th className="px-1.5 py-1 text-slate-400 font-medium text-center">Black</th>
            </tr>
          </thead>
          <tbody>
            {moves.map((move, idx) => {
              const d = disagreements.get(move.number);
              return (
                <tr key={move.number} className="border-b border-slate-600/30 last:border-0">
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
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
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
        <button
          onClick={() => downloadPgn(moves, fileName, meta)}
          className="w-full px-2 py-2.5 border-t border-slate-600/50 text-center text-xs text-slate-400 hover:bg-slate-600/40 hover:text-slate-200 transition-colors flex items-center justify-center gap-1.5"
        >
          <Download className="w-3 h-3" /> Download PGN
        </button>
        <CopyPgnButton moves={moves} meta={meta} variant="model" />
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
