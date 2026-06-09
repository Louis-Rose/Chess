import { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { formatSessionDate } from './format';
import { FitSetList, type DisplaySet } from './FitSetList';
import { FitSessionDetail } from './FitSessionDetail';

// Every time the user did a given (base) exercise, newest first — each session
// shown as a date + its set list, like a slimmed-down séance card. Tapping one
// opens the full session, scrolled to this exercise. Reached from Dernière fois.

interface HistorySession { session_id: number; date: string | null; sets: DisplaySet[]; }

export function FitExerciseHistory({ base, onBack }: { base: string; onBack: () => void }) {
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    fitRequest(() => axios.get<{ sessions: HistorySession[] }>('/api/fit/exercise-history', { params: { base } }))
      .then(res => setSessions(res.data.sessions ?? []))
      .catch(() => { /* show empty */ })
      .finally(() => setLoading(false));
  }, [base]);

  if (open != null) return <FitSessionDetail sessionId={open} focusBase={base} onBack={() => setOpen(null)} />;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={onBack}
        className="self-start inline-flex items-center gap-1.5 py-1 text-xs text-slate-300 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Précédent</span>
      </button>

      <h1 className="mt-4 text-center text-2xl font-semibold">{base}</h1>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="mt-10 text-center text-sm text-slate-400">Jamais fait pour le moment.</p>
      ) : (
        <div className="mx-auto mt-8 flex w-full max-w-[22rem] flex-col gap-4">
          {sessions.map(s => (
            <button
              key={s.session_id}
              type="button"
              onClick={() => setOpen(s.session_id)}
              className="relative flex flex-col items-center rounded-2xl border border-slate-800 bg-slate-800/30 px-4 py-4 text-center transition-colors active:bg-slate-800/60"
            >
              <p className="font-medium capitalize text-slate-100">{formatSessionDate(s.date)}</p>
              <FitSetList sets={s.sets} />
              <ChevronRight className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
