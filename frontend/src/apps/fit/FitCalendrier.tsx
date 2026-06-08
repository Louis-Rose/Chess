import { useEffect, useState } from 'react';
import axios from 'axios';
import { ChevronRight, Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitSessionDetail } from './FitSessionDetail';
import { formatSessionDate } from './format';

// Calendrier tab: the history of past sessions, newest first. Tap one to see
// its detail.

interface SessionSummary {
  id: number;
  started_at: string | null;
  ended_at: string | null;
  set_count: number;
  exercise_count: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

export function FitCalendrier() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    fitRequest(() => axios.get<{ sessions: SessionSummary[] }>('/api/fit/sessions'))
      .then(res => setSessions(res.data.sessions ?? []))
      .catch(() => { /* show empty */ })
      .finally(() => setLoading(false));
  }, []);

  if (selected != null) return <FitSessionDetail sessionId={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <h1 className="text-center text-2xl font-semibold">Calendrier</h1>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="mt-10 text-center text-sm text-slate-400">Aucune séance enregistrée pour le moment.</p>
      ) : (
        <div className="mx-auto mt-8 flex w-full max-w-[22rem] flex-col gap-3">
          {sessions.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelected(s.id)}
              className="relative flex flex-col items-center rounded-2xl border border-slate-800 bg-slate-800/30 px-4 py-4 text-center transition-colors active:bg-slate-800/60"
            >
              <span className="font-medium capitalize text-slate-100">{formatSessionDate(s.started_at)}</span>
              <span className="mt-0.5 text-sm text-slate-400">
                {plural(s.exercise_count, 'exercice')} - {plural(s.set_count, 'série')}
              </span>
              <ChevronRight className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
