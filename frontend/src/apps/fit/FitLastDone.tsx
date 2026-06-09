import { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { leafLabel, muscleOf, MUSCLE_ORDER, sortLabels } from './programData';

// Days-since-last-done for each exercise currently in the program, grouped by
// muscle. Opened from the "Jours depuis la dernière séance" card on Accueil.

const label = (d: number | undefined) => {
  if (d == null) return 'Jamais';
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return 'Hier';
  return `${d} j`;
};

export function FitLastDone({ onBack }: { onBack: () => void }) {
  const [days, setDays] = useState<Record<string, number>>({});
  const [programLeaves, setProgramLeaves] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fitRequest(() => axios.get<{ exercises: { exercise: string; days: number }[] }>('/api/fit/last-done')),
      fitRequest(() => axios.get<{ selections: Record<string, string[]> }>('/api/fit/exercises')),
    ])
      .then(([ld, ex]) => {
        const map: Record<string, number> = {};
        for (const e of ld.data.exercises ?? []) map[e.exercise] = e.days;
        setDays(map);
        const leaves: string[] = [];
        for (const arr of Object.values(ex.data.selections ?? {})) leaves.push(...arr);
        setProgramLeaves(leaves);
      })
      .catch(() => { /* show empty */ })
      .finally(() => setLoading(false));
  }, []);

  const byMuscle = new Map<string, string[]>();
  for (const leaf of programLeaves) {
    const m = muscleOf(leaf);
    if (!m) continue;
    if (!byMuscle.has(m)) byMuscle.set(m, []);
    byMuscle.get(m)!.push(leaf);
  }
  const groups = MUSCLE_ORDER
    .filter(m => byMuscle.has(m))
    .map(m => ({ name: m, leaves: sortLabels(byMuscle.get(m)!) }));

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

      <h1 className="mt-4 text-center text-2xl font-semibold">Dernière fois</h1>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : groups.length === 0 ? (
        <p className="mt-10 text-center text-sm text-slate-400">Aucun exercice dans le programme.</p>
      ) : (
        <div className="mx-auto mt-8 flex w-full max-w-[22rem] flex-col gap-6">
          {groups.map(g => (
            <section key={g.name}>
              <h2 className="text-center text-xs uppercase tracking-wide text-slate-500">{g.name}</h2>
              <div className="mt-2 flex flex-col gap-2">
                {g.leaves.map(leaf => (
                  <div
                    key={leaf}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3"
                  >
                    <span className="min-w-0 text-slate-100">{leafLabel(leaf)}</span>
                    <span className="shrink-0 text-sm tabular-nums text-slate-300">{label(days[leaf])}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
