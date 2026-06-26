import { useEffect, useState } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';
import { TeamCrest } from './TeamCrest';
import { useLanguage } from '../../contexts/LanguageContext';
import { countryName } from './mppLocale';
import type { MppMatchDetail as Detail } from './types';

type TFn = (key: string) => string;

// The "avant-match" detail behind a match click: the MPP prono split
// (Stats Prono MPP) and the best-rated players. Lazy-loaded per match.
export function MppMatchDetail({ matchId, onClose }: { matchId: string; onClose: () => void }) {
  const { t, language } = useLanguage();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    setDetail(null);
    setError(false);
    axios
      .get<Detail>(`/api/mpp/match/${matchId}`)
      .then((r) => active && setDetail(r.data))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [matchId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {detail?.game_week != null ? `J${detail.game_week}` : t('mpp.detail.match')}
            {detail?.stadium ? ` . ${detail.stadium}` : ''}
          </span>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? (
          <p className="py-8 text-center text-sm text-amber-300">{t('mpp.detail.couldNotLoad')}</p>
        ) : !detail ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-500" />
          </div>
        ) : (
          <Body detail={detail} t={t} language={language} />
        )}
      </div>
    </div>
  );
}

function Body({ detail, t, language }: { detail: Detail; t: TFn; language: string }) {
  const played = detail.status !== 'upcoming';
  const homePct = Math.round((detail.bets?.home ?? 0) * 100);
  const drawPct = Math.round((detail.bets?.draw ?? 0) * 100);
  const awayPct = Math.round((detail.bets?.away ?? 0) * 100);
  const homeName = countryName(detail.home.name, language);
  const awayName = countryName(detail.away.name, language);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-center gap-4">
        <TeamHead name={homeName} crest={detail.home.crest} />
        <div className="shrink-0 text-center">
          {played ? (
            <span className="font-mono text-2xl font-bold text-slate-100">
              {detail.home.score ?? 0} - {detail.away.score ?? 0}
            </span>
          ) : (
            <span className="text-sm font-medium text-slate-500">{t('mpp.detail.vs')}</span>
          )}
        </div>
        <TeamHead name={awayName} crest={detail.away.crest} />
      </div>

      {/* Stats Prono MPP */}
      {detail.bets && (
        <Card title={t('mpp.detail.statsPronoMpp')}>
          <div className="flex items-start justify-around">
            <Ring pct={homePct} label={`${homePct}%`} sub={`${t('mpp.detail.win')} ${homeName}`} />
            <Ring pct={drawPct} label={`${drawPct}%`} sub={t('mpp.detail.draw')} />
            <Ring pct={awayPct} label={`${awayPct}%`} sub={`${t('mpp.detail.win')} ${awayName}`} />
          </div>
          {detail.cote && (
            <p className="mt-3 text-center text-xs text-slate-500">
              {t('mpp.detail.cote')} 1 <b className="text-emerald-300">{detail.cote.home}</b> . N{' '}
              <b className="text-emerald-300">{detail.cote.draw}</b> . 2{' '}
              <b className="text-emerald-300">{detail.cote.away}</b>
            </p>
          )}
        </Card>
      )}

      {/* Best players */}
      {detail.best_players.length > 0 && (
        <Card title={t('mpp.detail.bestPlayers')}>
          <div className="flex flex-wrap justify-center gap-4">
            {detail.best_players.map((p, i) => (
              <Ring
                key={i}
                pct={(p.rating / 10) * 100}
                label={p.rating.toFixed(1).replace(/\.0$/, '')}
                sub={`${p.name}${p.position ? ` . ${p.position}` : ''}`}
              />
            ))}
          </div>
        </Card>
      )}

      {!detail.bets && detail.best_players.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-500">
          {t('mpp.detail.noStats')}
        </p>
      )}
    </div>
  );
}

function TeamHead({ name, crest }: { name: string | null; crest: string | null }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <TeamCrest src={crest} className="h-12 w-12" />
      <span className="truncate text-center text-sm font-semibold text-slate-100">{name}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4">
      <h3 className="mb-3 text-center text-sm font-semibold uppercase tracking-wide text-amber-400">
        {title}
      </h3>
      {children}
    </div>
  );
}

const RING_COLOR = '#f59e0b';

function Ring({ pct, label, sub, size = 72 }: { pct: number; label: string; sub?: string; size?: number }) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = (Math.max(0, Math.min(100, pct)) / 100) * c;
  const mid = size / 2;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={mid} cy={mid} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke} />
          <circle
            cx={mid}
            cy={mid}
            r={r}
            fill="none"
            stroke={RING_COLOR}
            strokeWidth={stroke}
            strokeDasharray={`${arc} ${c}`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-100">
          {label}
        </span>
      </div>
      {sub && <span className="max-w-[5.5rem] truncate text-center text-[11px] text-slate-400">{sub}</span>}
    </div>
  );
}
