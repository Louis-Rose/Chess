import { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitSession } from './FitSession';

// Accueil tab: start a new workout, with year-to-date totals above the button.

interface YearStats {
  sessions_this_year: number;
  work_sets_this_year: number;
  avg_sessions_per_week: number | null;
  avg_work_sets_per_session: number | null;
  hours_since_last_session: number | null;
}

// One decimal, French comma (e.g. 2.6 -> "2,6"); em dash when no data yet.
const fr1 = (n: number | null) => (n == null ? '—' : n.toFixed(1).replace('.', ','));

export function FitAccueil() {
  const [inSession, setInSession] = useState(false);
  const [stats, setStats] = useState<YearStats | null>(null);

  useEffect(() => {
    if (inSession) return;
    fitRequest(() => axios.get<YearStats>('/api/fit/stats'))
      .then(res => setStats(res.data))
      .catch(() => { /* hide stats */ });
  }, [inSession]);

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
              <Stat value={fr1(stats.avg_work_sets_per_session)} label="Séries / séance" />
            </div>
          </div>
          {stats.hours_since_last_session != null && (
            <div className="mt-4 rounded-2xl border border-slate-700 p-4">
              <div className="flex gap-4">
                <div className="w-1/2">
                  <Stat value={stats.hours_since_last_session} label="Heures depuis la dernière séance" />
                </div>
              </div>
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
        Nouvelle séance
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
