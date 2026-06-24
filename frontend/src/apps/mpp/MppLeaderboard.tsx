import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { RefreshCw, Trophy } from 'lucide-react';
import { MppStandingsPanel } from './MppStandings';
import { MppGraph } from './MppGraph';
import type { MppContest, MppData } from './types';

// Leaderboard tab: the owner's MPP leagues as cards, each showing its full
// ranking (the MPP "Classement") and a points-over-time progression chart.
export function MppLeaderboard() {
  const [data, setData] = useState<MppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    axios
      .get<MppData>('/api/mpp/data')
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

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-8 sm:px-6">
      <div className="relative flex items-center justify-center">
        <h2 className="text-xl font-bold uppercase tracking-wide text-slate-100">League</h2>
        <button
          onClick={fetchData}
          disabled={loading}
          className="absolute right-0 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-50"
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
          Loading your leagues...
        </div>
      ) : data && data.contests.length ? (
        <div className="space-y-3">
          {data.contests.map((c, i) => (
            <ContestCard key={c.id ?? i} contest={c} />
          ))}
        </div>
      ) : data ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-10 text-center text-slate-400">
          No leagues found on your MPP account yet.
        </div>
      ) : null}
    </div>
  );
}

function ContestCard({ contest: c }: { contest: MppContest }) {
  const challengeId = c.id != null ? String(c.id) : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-800/40">
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {c.image_url ? (
            <img src={c.image_url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
          ) : (
            <Trophy className="h-6 w-6 shrink-0 text-emerald-400" strokeWidth={1.5} />
          )}
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate font-semibold text-slate-100">
              {c.title ?? 'League'}
              {c.is_live && (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
                  Live
                </span>
              )}
            </p>
            <p className="text-xs text-slate-500">
              {c.participants != null && `${c.participants} players`}
              {c.participants != null && c.season != null && ' . '}
              {c.season != null && `Season ${c.season}`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-6 text-right">
          {c.ranking != null && (
            <Stat
              label="Rank"
              value={c.participants != null ? `#${c.ranking}/${c.participants}` : `#${c.ranking}`}
            />
          )}
          {c.points != null && <Stat label="Points" value={c.points} />}
        </div>
      </div>
      {challengeId && (
        <>
          <div className="border-t border-slate-800">
            <MppStandingsPanel challengeId={challengeId} />
          </div>
          <div className="border-t border-slate-800">
            <MppGraph challengeId={challengeId} />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-lg font-bold text-slate-100">{value}</p>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}
