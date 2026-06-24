import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { RefreshCw } from 'lucide-react';
import type { MppMatch, MppMatches as MppMatchesData, MppTeam } from './types';

// Matches tab: every match of the owner's competition whose two teams are known,
// in one chronological scroll. Played matches show the score, upcoming ones show
// the MPP cotes (1 / N / 2 reward points). No day-by-day clicking.
export function MppMatches() {
  const [data, setData] = useState<MppMatchesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    axios
      .get<MppMatchesData>('/api/mpp/matches')
      .then((r) => setData(r.data))
      .catch((e) => {
        const code = e?.response?.data?.error;
        setError(
          code === 'token_expired'
            ? 'Your MPP session expired. Reconnect with a fresh token.'
            : 'Could not reach MPP. Try again in a moment.',
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const groups = useMemo(() => groupByDate(data?.matches ?? []), [data]);

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Matches</h2>
          {data && (
            <p className="text-xs text-slate-500">
              {data.matches.length} matches with known teams
            </p>
          )}
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-10 text-center text-slate-400">
          Loading matches... the first load reads every fixture, so give it a few seconds.
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
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : data ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-10 text-center text-slate-400">
          No matches with known teams yet.
        </div>
      ) : null}
    </div>
  );
}

function MatchCard({ match: m }: { match: MppMatch }) {
  const played = m.status !== 'upcoming';
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-800/40 px-4 py-3">
      <div className="mb-2 flex items-center justify-center gap-2 text-[11px] text-slate-500">
        {m.game_week != null && <span>J{m.game_week}</span>}
        <span>.</span>
        <span>{formatTime(m.date)}</span>
        {m.status === 'live' && (
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-bold uppercase text-emerald-400">
            {m.match_time || 'Live'}
          </span>
        )}
      </div>

      <div className="flex items-center justify-center gap-3">
        <TeamSide team={m.home} align="right" />
        <div className="shrink-0 px-2 text-center">
          {played ? (
            <span className="font-mono text-lg font-bold text-slate-100">
              {m.home.score ?? 0} - {m.away.score ?? 0}
            </span>
          ) : (
            <span className="text-sm font-medium text-slate-500">vs</span>
          )}
        </div>
        <TeamSide team={m.away} align="left" />
      </div>

      {m.cote && (
        <div className="mt-3 flex items-center justify-center gap-2 border-t border-slate-800 pt-3 text-xs">
          <span className="mr-1 text-slate-500">Cote</span>
          <Cote label="1" value={m.cote.home} />
          <Cote label="N" value={m.cote.draw} />
          <Cote label="2" value={m.cote.away} />
        </div>
      )}
    </div>
  );
}

function TeamSide({ team, align }: { team: MppTeam; align: 'left' | 'right' }) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 ${
        align === 'right' ? 'flex-row-reverse text-right' : 'text-left'
      }`}
    >
      <img src={team.crest} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
      <span className="truncate text-sm font-semibold text-slate-100">{team.name}</span>
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

function groupByDate(matches: MppMatch[]): { label: string; matches: MppMatch[] }[] {
  const groups: { label: string; matches: MppMatch[] }[] = [];
  let current: { label: string; matches: MppMatch[] } | null = null;
  for (const m of matches) {
    const label = formatDay(m.date);
    if (!current || current.label !== label) {
      current = { label, matches: [] };
      groups.push(current);
    }
    current.matches.push(m);
  }
  return groups;
}

function formatDay(iso: string | null): string {
  if (!iso) return 'Date to be confirmed';
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return 'TBC';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
