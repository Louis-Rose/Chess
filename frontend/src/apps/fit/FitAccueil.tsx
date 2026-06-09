import { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitSession } from './FitSession';

// Accueil tab: start a new workout, with year-to-date totals above the button.

interface YearStats {
  sessions_this_year: number;
  work_sets_this_year: number;
}

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
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col items-center justify-center gap-10 px-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] text-center">
      {stats && (
        <div className="flex w-full max-w-[20rem] gap-3">
          <Stat value={stats.sessions_this_year} label={`séance${stats.sessions_this_year > 1 ? 's' : ''} en ${year}`} />
          <Stat value={stats.work_sets_this_year} label={`série${stats.work_sets_this_year > 1 ? 's' : ''} de travail`} />
        </div>
      )}

      <button
        type="button"
        onClick={() => setInSession(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-4 text-lg font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-500"
      >
        <Plus className="h-5 w-5" />
        Nouvelle séance
      </button>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center rounded-2xl border border-slate-800 bg-slate-800/30 px-3 py-4">
      <span className="text-3xl font-semibold text-emerald-400 tabular-nums">{value}</span>
      <span className="mt-1 text-xs text-slate-400">{label}</span>
    </div>
  );
}
