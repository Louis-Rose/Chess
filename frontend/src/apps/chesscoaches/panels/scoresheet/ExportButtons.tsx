import { useState, useRef, useCallback } from 'react';
import { Clock, Check, ExternalLink, Key } from 'lucide-react';
import { useLanguage } from '../../../../contexts/LanguageContext';
import { getCoachesPrefs, saveCoachesPrefs } from '../../contexts/CoachesDataContext';
import { normalizeMoves, buildPgn } from './utils';
import type { ScoresheetMove as Move } from '../../contexts/CoachesDataContext';
import type { ConsensusMeta } from './types';

export function ChesscomAnalysisButton({ moves, meta, hasIllegalMoves, onIllegalClick }: {
  moves: Move[];
  meta?: ConsensusMeta;
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

const LICHESS_TOKEN_URL = 'https://lichess.org/account/oauth/token/create?scopes[]=study:write&description=LUMNA';

export function LichessStudyButton({ moves, meta, fileName, hasIllegalMoves, onIllegalClick, fen, chapterName: customChapterName }: {
  moves?: Move[];
  meta?: ConsensusMeta;
  fileName?: string | null;
  hasIllegalMoves?: boolean;
  onIllegalClick?: () => void;
  fen?: string;
  chapterName?: string;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [needsToken, setNeedsToken] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [savingToken, setSavingToken] = useState(false);
  const [studies, setStudies] = useState<{ id: string; name: string }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [success, setSuccess] = useState<{ studyId: string; studyName: string } | null>(null);
  const [error, setError] = useState('');
  const [lichessUsername, setLichessUsername] = useState('');
  const tokenInputRef = useRef<HTMLInputElement>(null);

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

  const handleOpen = async () => {
    if (hasIllegalMoves) { onIllegalClick?.(); return; }
    setSuccess(null);
    setError('');
    setOpen(true);

    // Check if user has a token
    try {
      const res = await fetch('/api/coaches/lichess/token', { credentials: 'include' });
      const json = await res.json();
      if (json.has_token) {
        // Has token — get username from prefs and fetch studies
        const prefs = getCoachesPrefs();
        if (prefs.lichess_username) {
          setLichessUsername(prefs.lichess_username);
          setNeedsToken(false);
          fetchStudies(prefs.lichess_username);
        } else {
          // Token exists but no username cached — shouldn't happen, re-prompt
          setNeedsToken(true);
        }
      } else {
        setNeedsToken(true);
        setTimeout(() => tokenInputRef.current?.focus(), 50);
      }
    } catch {
      setNeedsToken(true);
    }
  };

  const handleSaveToken = async () => {
    const trimmed = tokenInput.trim();
    if (!trimmed) return;
    setSavingToken(true);
    setError('');
    try {
      const res = await fetch('/api/coaches/lichess/token', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      // Token validated — save username and fetch studies
      const username = json.username;
      saveCoachesPrefs({ lichess_username: username });
      setLichessUsername(username);
      setNeedsToken(false);
      setTokenInput('');
      fetchStudies(username);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSavingToken(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await fetch('/api/coaches/lichess/token', { method: 'DELETE', credentials: 'include' });
    } catch { /* ignore */ }
    saveCoachesPrefs({ lichess_username: null });
    setLichessUsername('');
    setStudies(null);
    setNeedsToken(true);
    setTokenInput('');
    setTimeout(() => tokenInputRef.current?.focus(), 50);
  };

  const handleSelectStudy = async (study: { id: string; name: string }) => {
    setImporting(true);
    setError('');
    const pgn = fen
      ? `[FEN "${fen}"]\n\n*`
      : buildPgn(moves || [], meta);
    const chapterName = customChapterName || fileName?.replace(/\.[^.]+$/, '') || [meta?.white, meta?.black].filter(Boolean).join(' vs ') || 'Scoresheet';
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
    setNeedsToken(false);
    setSuccess(null);
    setImporting(false);
    setTokenInput('');
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
            ) : needsToken ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <Key className="w-4 h-4 text-slate-400" />
                  <div className="text-slate-200 text-sm font-medium">{t('coaches.lichess.tokenPrompt')}</div>
                </div>
                <div className="text-slate-500 text-xs mb-3">{t('coaches.lichess.tokenHint')}</div>
                <a
                  href={LICHESS_TOKEN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 w-full mb-3 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs py-2 rounded-lg transition-colors border border-slate-600"
                >
                  {t('coaches.lichess.generateToken')} <ExternalLink className="w-3 h-3" />
                </a>
                <input
                  ref={tokenInputRef}
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveToken()}
                  placeholder={t('coaches.lichess.tokenPlaceholder')}
                  className="w-full bg-slate-700 text-slate-100 text-sm px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none font-mono text-xs"
                  type="password"
                />
                {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleSaveToken}
                    disabled={savingToken || !tokenInput.trim()}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {savingToken ? t('coaches.lichess.verifying') : t('coaches.lichess.connect')}
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
                    onClick={handleDisconnect}
                    className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {lichessUsername} · {t('coaches.lichess.disconnect')}
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
