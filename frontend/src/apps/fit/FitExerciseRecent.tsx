import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { formatSessionDate } from './format';
import { isSignedExercise } from './programData';
import { FitSetList, type DisplaySet } from './FitSetList';

// Read-only "Dernières séances" panel shown under the exercise editor: the past
// sessions in which this exact exercise leaf was logged (date + set list),
// newest first, scrollable. Matched on the exact leaf, so each variant shows
// only its own history. The current session is excluded (its sets are already
// in the editor above).

interface HistorySession { session_id: number; number?: number | null; date: string | null; sets: DisplaySet[]; }

export function FitExerciseRecent({ exercise, excludeSessionId }: { exercise: string; excludeSessionId?: number | null }) {
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fitRequest(() => axios.get<{ sessions: HistorySession[] }>('/api/fit/exercise-history', { params: { exercise } }))
      .then(res => setSessions(res.data.sessions ?? []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [exercise]);

  const past = sessions.filter(s => s.session_id !== excludeSessionId);

  return (
    <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-800/20 px-4 py-3">
      <p className="text-center text-sm uppercase tracking-wide text-white">Dernières séances</p>
      <div className="mt-2 h-px w-full bg-slate-700" />

      {loading ? (
        <div className="mt-3 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
        </div>
      ) : past.length === 0 ? (
        <p className="mt-3 text-center text-sm text-slate-400">Jamais fait pour le moment.</p>
      ) : (
        <div className="mt-2 flex max-h-[22rem] flex-col gap-3 overflow-y-auto pr-1">
          {past.map(s => (
            <div
              key={s.session_id}
              className="flex flex-col items-center rounded-xl border border-slate-700 bg-slate-800/30 px-3 py-2 text-center"
            >
              <p className="text-sm font-medium capitalize text-white">
                {s.number != null ? `Séance ${s.number} (${formatSessionDate(s.date)})` : formatSessionDate(s.date)}
              </p>
              <FitSetList sets={s.sets} signed={isSignedExercise(exercise)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
