import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { RefreshCw } from 'lucide-react';
import { MppMatchDetail } from './MppMatchDetail';
import { MppPageTitle } from './MppPageTitle';
import { TeamCrest } from './TeamCrest';
import { useLanguage } from '../../contexts/LanguageContext';
import { localeFor, countryName } from './mppLocale';
import type { MppMatch, MppMatches as MppMatchesData, MppTeam } from './types';

type TFn = (key: string) => string;

// Matches tab: every match of the owner's competition whose two teams are known,
// in one chronological scroll. Played matches show the score, upcoming ones show
// the MPP cotes (1 / N / 2 reward points). No day-by-day clicking.
type Filter = 'all' | 'upcoming' | 'played';

const FILTERS: { key: Filter; labelKey: string }[] = [
  { key: 'all', labelKey: 'mpp.matches.filter.all' },
  { key: 'upcoming', labelKey: 'mpp.matches.filter.upcoming' },
  { key: 'played', labelKey: 'mpp.matches.filter.played' },
];

// Module-level cache so revisiting the tab is instant. Without it the component
// remounts empty on every navigation and shows the full "reads every fixture"
// loader again; instead we keep the last result and only refetch when stale.
let cachedMatches: MppMatchesData | null = null;
let cachedAt = 0;
const FRESH_MS = 90_000;

export function MppMatches() {
  const { t, language } = useLanguage();
  const loc = localeFor(language);
  const [data, setData] = useState<MppMatchesData | null>(cachedMatches);
  const [loading, setLoading] = useState(cachedMatches === null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    axios
      .get<MppMatchesData>('/api/mpp/matches')
      .then((r) => {
        cachedMatches = r.data;
        cachedAt = Date.now();
        setData(r.data);
      })
      .catch((e) => {
        const code = e?.response?.data?.error;
        setError(
          code === 'token_expired'
            ? t('mpp.matches.error.tokenExpired')
            : t('mpp.matches.error.generic'),
        );
      })
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    // Show the cache instantly; only hit the network when it's stale. A manual
    // Refresh always refetches.
    if (cachedMatches && Date.now() - cachedAt < FRESH_MS) return;
    fetchData();
  }, [fetchData]);

  const filtered = useMemo(() => {
    const all = data?.matches ?? [];
    if (filter === 'upcoming') return all.filter((m) => m.status !== 'final');
    if (filter === 'played') return all.filter((m) => m.status === 'final');
    return all;
  }, [data, filter]);

  const groups = useMemo(() => groupByDate(filtered, t, loc), [filtered, t, loc]);

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
      <div className="space-y-1">
        <MppPageTitle
          action={
            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {t('mpp.matches.refresh')}
            </button>
          }
        />
        {data && (
          <p className="text-center text-xs text-slate-500">
            {filtered.length} {t('mpp.matches.of')} {data.matches.length}{' '}
            {t('mpp.matches.withKnownTeams')}
          </p>
        )}
      </div>

      <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-800/40 p-1">
        {FILTERS.map(({ key, labelKey }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === key
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-10 text-center text-slate-400">
          {t('mpp.matches.loading')}
        </div>
      ) : groups.length ? (
        <div className="space-y-6">
          {groups.map(({ label, matches }) => (
            <div key={label} className="space-y-2">
              <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label}
              </h3>
              <div className="space-y-2">
                {matches.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    onSelect={() => setSelectedId(m.id)}
                    t={t}
                    loc={loc}
                    language={language}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : data ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-10 text-center text-slate-400">
          {filter === 'upcoming'
            ? t('mpp.matches.empty.upcoming')
            : filter === 'played'
              ? t('mpp.matches.empty.played')
              : t('mpp.matches.empty.all')}
        </div>
      ) : null}

      {selectedId && (
        <MppMatchDetail matchId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}

function MatchCard({
  match: m,
  onSelect,
  t,
  loc,
  language,
}: {
  match: MppMatch;
  onSelect: () => void;
  t: TFn;
  loc: string;
  language: string;
}) {
  const played = m.status !== 'upcoming';
  return (
    <div
      onClick={onSelect}
      className="cursor-pointer rounded-2xl border border-slate-800 bg-slate-800/40 px-4 py-3 transition-colors hover:border-emerald-500/50 hover:bg-slate-800/70"
    >
      <div className="mb-2 flex items-center justify-center gap-2 text-[11px] text-slate-500">
        {m.game_week != null && <span>J{m.game_week}</span>}
        <span>.</span>
        <span>{formatTime(m.date, t, loc)}</span>
        {m.status === 'live' && (
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-bold uppercase text-emerald-400">
            {m.match_time || t('mpp.matches.live')}
          </span>
        )}
      </div>

      <div className="flex items-center justify-center gap-3">
        <TeamSide team={m.home} align="right" language={language} />
        <div className="shrink-0 px-2 text-center">
          {played ? (
            <span className="font-mono text-lg font-bold text-slate-100">
              {m.home.score ?? 0} - {m.away.score ?? 0}
            </span>
          ) : (
            <span className="text-sm font-medium text-slate-500">{t('mpp.matches.vs')}</span>
          )}
        </div>
        <TeamSide team={m.away} align="left" language={language} />
      </div>

      {(m.cote || hasProno(m)) && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-slate-800 pt-3 text-xs">
          {m.cote && (
            <div className="flex items-center gap-2">
              <span className="text-slate-500">{t('mpp.matches.cote')}</span>
              <Cote label="1" value={m.cote.home} />
              <Cote label="N" value={m.cote.draw} />
              <Cote label="2" value={m.cote.away} />
            </div>
          )}
          {hasProno(m) && (
            <div className="flex items-center gap-2">
              <span className="text-slate-500">{t('mpp.matches.myProno')}</span>
              <span className="rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-1 font-mono font-semibold text-sky-300">
                {m.prono!.home ?? '-'} - {m.prono!.away ?? '-'}
              </span>
              {m.prono!.cote != null && (
                <span className="text-slate-500">
                  {t('mpp.matches.myCote')}{' '}
                  <span className="font-semibold text-slate-300">{m.prono!.cote}</span>
                </span>
              )}
              {played && m.prono!.points != null && (
                <span className="font-semibold text-amber-300">+{m.prono!.points} pts</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function hasProno(m: MppMatch): boolean {
  return m.prono != null && (m.prono.home != null || m.prono.away != null);
}

function TeamSide({
  team,
  align,
  language,
}: {
  team: MppTeam;
  align: 'left' | 'right';
  language: string;
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 ${
        align === 'right' ? 'flex-row-reverse text-right' : 'text-left'
      }`}
    >
      <TeamCrest src={team.crest} className="h-7 w-7" />
      <span className="truncate text-sm font-semibold text-slate-100">
        {countryName(team.name, language)}
      </span>
    </div>
  );
}

function Cote({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/60 px-2 py-1">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono font-semibold text-emerald-300">{value}</span>
    </span>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function groupByDate(
  matches: MppMatch[],
  t: TFn,
  loc: string,
): { label: string; matches: MppMatch[] }[] {
  const groups: { label: string; matches: MppMatch[] }[] = [];
  let current: { label: string; matches: MppMatch[] } | null = null;
  for (const m of matches) {
    const label = formatDay(m.date, t, loc);
    if (!current || current.label !== label) {
      current = { label, matches: [] };
      groups.push(current);
    }
    current.matches.push(m);
  }
  return groups;
}

function formatDay(iso: string | null, t: TFn, loc: string): string {
  if (!iso) return t('mpp.matches.dateTbc');
  return new Date(iso).toLocaleDateString(loc, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatTime(iso: string | null, t: TFn, loc: string): string {
  if (!iso) return t('mpp.matches.tbc');
  return new Date(iso).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
}
