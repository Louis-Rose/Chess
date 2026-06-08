import { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { leafLabel, muscleContribution, MUSCLE_ORDER } from './programData';
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

// Weighted work volume per muscle group, in catalogue order. Each working
// (non-warmup) set counts 1 for the exercise's primary group(s) and 0.5 for
// each secondary group. Totals are multiples of 0.5.
function workVolume(sets: SetRow[]): { muscle: string; sets: number }[] {
  const counts = new Map<string, number>();
  for (const s of sets) {
    if (s.warmup) continue;
    const c = muscleContribution(s.exercise);
    for (const m of c.primary) counts.set(m, (counts.get(m) ?? 0) + 1);
    for (const m of c.secondary) counts.set(m, (counts.get(m) ?? 0) + 0.5);
  }
  return MUSCLE_ORDER.filter(m => counts.has(m)).map(m => ({ muscle: m, sets: counts.get(m)! }));
}

// "4", "2.5" — drop the trailing .0 for whole numbers.
const fmtVolume = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

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
  const volume = session ? workVolume(session.sets) : [];

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

          {volume.length > 0 && (
            <div className="mx-auto mt-8 flex w-full max-w-[22rem] flex-col items-center rounded-2xl border border-slate-800 bg-slate-800/30 px-4 py-4 text-center">
              <p className="text-xs uppercase tracking-wide text-slate-500">Volume de travail</p>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-slate-200">
                {volume.map(v => (
                  <li key={v.muscle}>{v.muscle} - {fmtVolume(v.sets)} série{v.sets > 1 ? 's' : ''}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mx-auto mt-4 flex w-full max-w-[22rem] flex-col gap-4">
            {groups.map(g => (
              <div key={g.exercise} className="flex flex-col items-center rounded-2xl border border-slate-800 bg-slate-800/30 px-4 py-4 text-center">
                <p className="font-medium text-slate-100">{leafLabel(g.exercise)}</p>
                <ul className="mt-2 flex w-44 flex-col gap-1.5">
                  {g.sets.map(s => (
                    <li key={s.id} className={`text-sm ${s.warmup ? 'text-slate-400' : 'text-slate-200'}`}>
                      {s.weight != null ? (
                        // 3-column grid keeps the "×" on the card's centerline
                        <span className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-x-1.5">
                          <span className="text-right">{s.warmup ? '(' : ''}{s.reps}</span>
                          <span>×</span>
                          <span className="text-left">{s.weight} kg{s.warmup ? ')' : ''}</span>
                        </span>
                      ) : (
                        formatSet(s.weight, s.reps, s.warmup)
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
