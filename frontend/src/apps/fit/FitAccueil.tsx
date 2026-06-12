import { useEffect, useState } from 'react';
import axios from 'axios';
import { ChevronRight, Plus } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitSession } from './FitSession';
import { FitSessionDetail } from './FitSessionDetail';
import { FitExerciseRecency, buildRecency, type RecencyGroup } from './FitExerciseRecency';
import { hasResumableNav } from './fitSessionNav';

// Accueil tab: start a new workout, with year-to-date totals above the button.

interface YearStats {
  sessions_this_year: number;
  work_sets_this_year: number;
  avg_sessions_per_week: number | null;
  avg_exercises_per_session: number | null;
  days_since_last_session: number | null;
}

// One decimal with a dot separator (e.g. "2.6"); em dash when no data yet.
// Coerce with Number() so a stringified value (e.g. a JSON-serialized Decimal)
// can't blow up .toFixed and take the page down.
const fr1 = (n: number | string | null) => {
  if (n == null) return '—';
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(1) : '—';
};

export function FitAccueil() {
  const [inSession, setInSession] = useState(false);
  const [viewingLast, setViewingLast] = useState(false);
  const [viewingRecency, setViewingRecency] = useState(false);
  const [stats, setStats] = useState<YearStats | null>(null);
  const [hasActive, setHasActive] = useState(false);
  const [lastSessionId, setLastSessionId] = useState<number | null>(null);
  const [avgDays, setAvgDays] = useState<number | null>(null);
  const [recencyGroups, setRecencyGroups] = useState<RecencyGroup[]>([]);

  useEffect(() => {
    if (inSession) return;
    fitRequest(() => axios.get<YearStats>('/api/fit/stats'))
      .then(res => setStats(res.data))
      .catch(() => { /* hide stats */ });
    // An in-progress session persists until finished; offer to resume it. It's
    // resumable either when sets are logged (backend) or when the user left
    // mid-exercise before logging any (persisted client-side nav spot).
    fitRequest(() => axios.get<{ active: unknown | null }>('/api/fit/sessions/active'))
      .then(res => setHasActive(res.data.active != null || hasResumableNav()))
      .catch(() => setHasActive(hasResumableNav()));
    // Most recent finished session, to open from the "days since" card.
    fitRequest(() => axios.get<{ sessions: { id: number }[] }>('/api/fit/sessions'))
      .then(res => setLastSessionId(res.data.sessions?.[0]?.id ?? null))
      .catch(() => setLastSessionId(null));
    // Per-exercise recency: average days since each exercise, and the breakdown.
    Promise.all([
      fitRequest(() => axios.get<{ exercises: { exercise: string; days: number }[] }>('/api/fit/last-done')),
      fitRequest(() => axios.get<{ selections: Record<string, string[]> }>('/api/fit/exercises')),
    ])
      .then(([ld, ex]) => {
        const { avgDays: avg, groups } = buildRecency(ld.data.exercises ?? [], ex.data.selections ?? {});
        setAvgDays(avg);
        setRecencyGroups(groups);
      })
      .catch(() => { setAvgDays(null); setRecencyGroups([]); });
  }, [inSession]);

  if (viewingLast && lastSessionId != null) {
    return <FitSessionDetail sessionId={lastSessionId} onBack={() => setViewingLast(false)} />;
  }

  if (viewingRecency) {
    return <FitExerciseRecency groups={recencyGroups} onBack={() => setViewingRecency(false)} />;
  }

  if (inSession) return <FitSession onDone={() => setInSession(false)} />;

  const year = new Date().getFullYear();

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col items-center px-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] text-center">
      {stats && (
        <div className="mt-6 w-full max-w-[24rem]">
          <div className="rounded-2xl border border-slate-700 p-4">
            <h2 className="text-lg font-semibold text-white">{year}</h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <Stat value={stats.sessions_this_year} label="Séances" />
              <Stat value={stats.work_sets_this_year} label="Séries de travail" />
              <Stat value={fr1(stats.avg_sessions_per_week)} label="Séances / semaine" />
              <Stat value={fr1(stats.avg_exercises_per_session)} label="Exercices / séance" />
            </div>
          </div>
          {stats.days_since_last_session != null && (
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-slate-700 p-4">
              <button
                type="button"
                onClick={() => setViewingLast(true)}
                className="relative block rounded-2xl border border-slate-800 bg-slate-800/30 px-3 py-5 text-center transition-colors active:bg-slate-800/60"
              >
                <span className="block text-base font-medium text-white">Jours depuis la dernière séance</span>
                <span className="mt-1 block text-4xl font-semibold tabular-nums text-emerald-400">
                  {stats.days_since_last_session}
                </span>
                <ChevronRight className="absolute bottom-2 right-2 h-5 w-5 text-slate-500" />
              </button>
              {avgDays != null && (
                <button
                  type="button"
                  onClick={() => setViewingRecency(true)}
                  className="relative block rounded-2xl border border-slate-800 bg-slate-800/30 px-3 py-5 text-center transition-colors active:bg-slate-800/60"
                >
                  <span className="block text-base font-medium text-white">Jours moyens depuis chaque exercice</span>
                  <span className="mt-1 block text-4xl font-semibold tabular-nums text-emerald-400">
                    {avgDays}
                  </span>
                  <ChevronRight className="absolute bottom-2 right-2 h-5 w-5 text-slate-500" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setInSession(true)}
        className="my-auto inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-4 text-lg font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-500"
      >
        <Plus className="h-5 w-5" />
        {hasActive ? 'Reprendre la séance' : 'Nouvelle séance'}
      </button>
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-2xl border border-slate-800 bg-slate-800/30 px-3 py-5">
      <span className="text-base font-medium text-white">{label}</span>
      <span className="mt-1 text-4xl font-semibold text-emerald-400 tabular-nums">{value}</span>
    </div>
  );
}
