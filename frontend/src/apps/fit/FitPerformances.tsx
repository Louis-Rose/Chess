import { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { leafLabel, muscleOf, MUSCLE_ORDER, sortLabels } from './programData';
import { formatShortDate } from './format';
import { FitProgressChart, type ChartPoint } from './FitProgressChart';

// Performances tab: one entry per exercise the user has worked. Tap an
// exercise to see its progression graph (top working set per session).

interface Point { date: string | null; weight: number | null; reps: number; }
interface ExercisePerf { exercise: string; points: Point[]; }

export function FitPerformances() {
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

function PerformanceDetail({ perf, onBack }: { perf: ExercisePerf; onBack: () => void }) {
  // Y = total working reps per session. Each point is tagged with the session's
  // working weight; a step up to a heavier weight is highlighted.
  let prevWeight: number | null = null;
  const chartPoints: ChartPoint[] = perf.points.map(p => {
    const up = p.weight != null && prevWeight != null && p.weight > prevWeight;
    if (p.weight != null) prevWeight = p.weight;
    return {
      label: formatShortDate(p.date),
      value: p.reps,
      tag: p.weight != null ? `${p.weight} kg` : undefined,
      highlight: up,
    };
  });

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

      <h1 className="mt-4 text-center text-2xl font-semibold">{leafLabel(perf.exercise)}</h1>

      <div className="mx-auto mt-8 w-full max-w-[22rem] rounded-2xl border border-slate-800 bg-slate-800/30 px-4 py-5">
        <FitProgressChart points={chartPoints} unit="reps" />
        <p className="mt-3 text-center text-xs text-slate-500">
          Répétitions totales de travail par séance. Le poids est indiqué à chaque point.
        </p>
      </div>
    </div>
  );
}
