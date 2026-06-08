import { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { leafLabel } from './programData';
import { formatSessionDate, formatSet } from './format';

// Read-only view of a past session (reached from the Calendrier history):
// its date and the logged sets, grouped by exercise in workout order.

interface SetRow { id: number; exercise: string; weight: number | null; reps: number; warmup: boolean; }
interface Session { id: number; started_at: string | null; ended_at: string | null; sets: SetRow[]; }

function groupByExercise(sets: SetRow[]): { exercise: string; sets: SetRow[] }[] {
  const groups: { exercise: string; sets: SetRow[] }[] = [];
  const idx = new Map<string, number>();
  for (const s of sets) {
    if (!idx.has(s.exercise)) { idx.set(s.exercise, groups.length); groups.push({ exercise: s.exercise, sets: [] }); }
    groups[idx.get(s.exercise)!].sets.push(s);
  }
  return groups;
}

export function FitSessionDetail({ sessionId, onBack }: { sessionId: number; onBack: () => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fitRequest(() => axios.get<Session>(`/api/fit/sessions/${sessionId}`))
      .then(res => setSession(res.data))
      .catch(() => { /* show empty */ })
      .finally(() => setLoading(false));
  }, [sessionId]);

  const groups = session ? groupByExercise(session.sets) : [];

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={onBack}
        className="self-start inline-flex items-center gap-2 py-1 text-slate-300 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-5 w-5" />
        <span>Précédent</span>
      </button>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <>
          <h1 className="mt-4 text-center text-2xl font-semibold capitalize">
            {formatSessionDate(session?.started_at ?? null)}
          </h1>

          <div className="mx-auto mt-8 flex w-full max-w-[22rem] flex-col gap-4">
            {groups.map(g => (
              <div key={g.exercise} className="rounded-2xl border border-slate-800 bg-slate-800/30 px-4 py-4">
                <p className="font-medium text-slate-100">{leafLabel(g.exercise)}</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {(() => {
                    let workIdx = 0;
                    return g.sets.map(s => {
                      const num = s.warmup ? null : ++workIdx;
                      return (
                        <li key={s.id} className={`text-sm ${s.warmup ? 'text-slate-400' : 'text-slate-200'}`}>
                          <span className="text-slate-500">{num != null ? `${num}.` : '·'}</span>{' '}
                          {formatSet(s.weight, s.reps, s.warmup)}
                        </li>
                      );
                    });
                  })()}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
