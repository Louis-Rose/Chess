import { useEffect, useState } from 'react';
import axios from 'axios';
import { ChevronRight, Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { leafLabel, muscleOf, MUSCLE_ORDER, sortLabels } from './programData';
import { FitBackButton } from './FitBackButton';
import { useCustomExercises } from './useCustomExercises';

// Suivi tab: one entry per exercise the user has worked. Tap an exercise to see
// its tracking table — one row per working weight (heaviest on top), one column
// per session (most recent on the right), each cell the working reps done at that
// weight that session.

interface WeightReps { weight: number | null; reps: number; }
interface SessionPerf { date: string | null; weights: WeightReps[]; }
interface ExercisePerf { exercise: string; sessions: SessionPerf[]; }

export function FitPerformances() {
  useCustomExercises();   // so muscleOf groups custom exercises correctly
  const [exercises, setExercises] = useState<ExercisePerf[]>([]);
  const [programLeaves, setProgramLeaves] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    // Show only exercises currently in the program, so fetch both the logged
    // performances and the program's selected exercises.
    Promise.all([
      fitRequest(() => axios.get<{ exercises: ExercisePerf[] }>('/api/fit/performances')),
      fitRequest(() => axios.get<{ selections: Record<string, string[]> }>('/api/fit/exercises')),
    ])
      .then(([perfRes, exRes]) => {
        setExercises(perfRes.data.exercises ?? []);
        const leaves = new Set<string>();
        for (const arr of Object.values(exRes.data.selections ?? {})) for (const l of arr) leaves.add(l);
        setProgramLeaves(leaves);
      })
      .catch(() => { /* show empty */ })
      .finally(() => setLoading(false));
  }, []);

  const current = selected != null ? exercises.find(e => e.exercise === selected) ?? null : null;
  if (current) return <PerformanceDetail perf={current} onBack={() => setSelected(null)} />;

  // Group worked exercises by muscle, in catalogue order, sorted within.
  // Only exercises currently in the program are shown.
  const byMuscle = new Map<string, string[]>();
  for (const e of exercises) {
    if (!programLeaves.has(e.exercise)) continue;
    const m = muscleOf(e.exercise);
    if (!m) continue;
    if (!byMuscle.has(m)) byMuscle.set(m, []);
    byMuscle.get(m)!.push(e.exercise);
  }
  const groups = MUSCLE_ORDER
    .filter(m => byMuscle.has(m))
    .map(m => ({ name: m, leaves: sortLabels(byMuscle.get(m)!) }));

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <h1 className="text-center text-2xl font-semibold">Suivi</h1>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : groups.length === 0 ? (
        <p className="mt-10 text-center text-sm text-slate-400">Aucune performance enregistrée pour le moment.</p>
      ) : (
        <div className="mx-auto mt-8 flex w-full max-w-[22rem] flex-col gap-6">
          {groups.map(g => (
            <section key={g.name}>
              <h2 className="text-center text-xs uppercase tracking-wide text-slate-500">{g.name}</h2>
              <div className="mt-2 flex flex-col gap-2">
                {g.leaves.map(leaf => (
                  <button
                    key={leaf}
                    type="button"
                    onClick={() => setSelected(leaf)}
                    className="relative rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-center font-medium text-slate-100 transition-colors active:bg-slate-800"
                  >
                    {leafLabel(leaf)}
                    <ChevronRight className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

const weightLabel = (w: number | null) => (w == null ? 'PdC' : String(w));

// Compact day/month (e.g. "12/6") so it fits a small uniform cell.
const cellDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()}/${d.getMonth() + 1}`;
};

function PerformanceDetail({ perf, onBack }: { perf: ExercisePerf; onBack: () => void }) {
  // Rows = the distinct working weights, heaviest first (bodyweight last).
  const weights = Array.from(new Set(perf.sessions.flatMap(s => s.weights.map(w => w.weight))))
    .sort((a, b) => (a == null ? 1 : b == null ? -1 : b - a));

  // Per weight, only the sessions that used it, most recent first — so the first
  // data column is always filled and older entries extend to the right.
  const entriesFor = (w: number | null) =>
    perf.sessions
      .flatMap(s => {
        const hit = s.weights.find(x => x.weight === w);
        return hit ? [{ date: s.date, reps: hit.reps }] : [];
      })
      .reverse();

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <FitBackButton onClick={onBack} />

      <h1 className="mt-4 text-center text-2xl font-semibold">{leafLabel(perf.exercise)}</h1>

      <div className="mt-8 overflow-x-auto">
        <table className="border-separate border-spacing-0 border-l border-t border-slate-700">
          <tbody>
            {weights.map(w => (
              <tr key={String(w)}>
                <th className="sticky left-0 z-10 h-12 w-14 border-b border-r border-slate-700 bg-slate-800 text-sm font-semibold text-slate-200">
                  {weightLabel(w)}
                </th>
                {entriesFor(w).map((e, i) => (
                  <td key={i} className="h-12 w-14 overflow-hidden border-b border-r border-slate-700 bg-slate-900 text-center align-middle">
                    <div className="text-sm tabular-nums text-slate-100">{e.reps}</div>
                    <div className="whitespace-nowrap text-[10px] text-slate-500">{cellDate(e.date)}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
