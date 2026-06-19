import { useEffect, useState } from 'react';
import axios from 'axios';
import { ChevronRight } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitSessionDetail } from './FitSessionDetail';
import { FitExerciseRecency, buildRecency, type RecencyGroup } from './FitExerciseRecency';
import { validatedLeaves } from './validatedExercises';
import { setCustomExercises, type CustomExercise } from './programData';

// Accueil tab: year-to-date totals and recency cards. Sessions are launched and
// resumed from the Calendrier.

interface YearStats {
  sessions_this_year: number;
  work_sets_this_year: number;
  weight_lifted_this_year: number;
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
  const [viewingLast, setViewingLast] = useState(false);
  const [viewingRecency, setViewingRecency] = useState(false);
  const [stats, setStats] = useState<YearStats | null>(null);
  const [lastSessionId, setLastSessionId] = useState<number | null>(null);
  const [avgDays, setAvgDays] = useState<number | null>(null);
  const [recencyGroups, setRecencyGroups] = useState<RecencyGroup[]>([]);

  useEffect(() => {
    fitRequest(() => axios.get<YearStats>('/api/fit/stats'))
      .then(res => setStats(res.data))
      .catch(() => { /* hide stats */ });
    // Most recent finished session, to open from the "days since" card.
    fitRequest(() => axios.get<{ sessions: { id: number }[] }>('/api/fit/sessions'))
      .then(res => setLastSessionId(res.data.sessions?.[0]?.id ?? null))
      .catch(() => setLastSessionId(null));
    // Per-exercise recency: average days since each exercise, and the breakdown.
    Promise.all([
      fitRequest(() => axios.get<{ exercises: { exercise: string; days: number }[] }>('/api/fit/last-done')),
      fitRequest(() => axios.get<{ selections: Record<string, string[]> }>('/api/fit/exercises')),
      fitRequest(() => axios.get<{ exercises: CustomExercise[] }>('/api/fit/custom-exercises')),
    ])
      .then(([ld, ex, custom]) => {
        // Warm the custom catalogue first so custom leaves aren't dropped as
        // orphans when buildRecency filters to valid leaves.
        setCustomExercises(custom.data.exercises ?? []);
        // Exercises validated in the ongoing session count as done today (0
        // days), before the session is finished and reaches /last-done.
        const today = validatedLeaves().map(exercise => ({ exercise, days: 0 }));
        const { avgDays: avg, groups } = buildRecency([...(ld.data.exercises ?? []), ...today], ex.data.selections ?? {});
        setAvgDays(avg);
        setRecencyGroups(groups);
      })
      .catch(() => { setAvgDays(null); setRecencyGroups([]); });
  }, []);

  if (viewingLast && lastSessionId != null) {
    return <FitSessionDetail sessionId={lastSessionId} onBack={() => setViewingLast(false)} />;
  }

  if (viewingRecency) {
    return <FitExerciseRecency groups={recencyGroups} onBack={() => setViewingRecency(false)} />;
  }

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
              <Stat wide value={`${Math.round((stats.weight_lifted_this_year ?? 0) / 1000).toLocaleString('fr-FR')} t`} label="Poids soulevé" />
            </div>
          </div>
          {stats.days_since_last_session != null && (
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-slate-700 p-4">
              <button
                type="button"
                onClick={() => setViewingLast(true)}
                className="relative block rounded-2xl border border-slate-700 bg-slate-800/30 px-3 py-5 text-center transition-colors active:bg-slate-800/60"
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
                  className="relative block rounded-2xl border border-slate-700 bg-slate-800/30 px-3 py-5 text-center transition-colors active:bg-slate-800/60"
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
    </div>
  );
}

function Stat({ value, label, wide }: { value: number | string; label: string; wide?: boolean }) {
  return (
    <div className={`flex flex-1 flex-col items-center rounded-2xl border border-slate-700 bg-slate-800/30 px-3 py-5 ${wide ? 'col-span-2' : ''}`}>
      <span className="text-base font-medium text-white">{label}</span>
      <span className="mt-1 text-4xl font-semibold text-emerald-400 tabular-nums">{value}</span>
    </div>
  );
}
