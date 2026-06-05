import { useState } from 'react';

// Second step of the Programme flow: for each muscle group, pick the exercises
// done (multi-select), or skip it. Selections are local-only for now (the
// "Exercice 1/2/3" labels are placeholders until real exercises are defined).

const MUSCLES = [
  'Pectoraux', 'Épaules', 'Dos', 'Biceps', 'Triceps', 'Avant-bras',
  'Abdominaux', 'Quadriceps', 'Fessiers', 'Ischio-jambiers', 'Mollets',
];

const EXERCISES = ['Exercice 1', 'Exercice 2', 'Exercice 3'];

export function FitExercises({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [selections, setSelections] = useState<Record<string, string[]>>({});

  const muscle = MUSCLES[index];
  const selected = selections[muscle] ?? [];

  function toggle(ex: string) {
    setSelections(prev => {
      const cur = prev[muscle] ?? [];
      const next = cur.includes(ex) ? cur.filter(e => e !== ex) : [...cur, ex];
      return { ...prev, [muscle]: next };
    });
  }

  function next() {
    if (index < MUSCLES.length - 1) setIndex(index + 1);
    else onDone();
  }

  function skip() {
    setSelections(prev => {
      const n = { ...prev };
      delete n[muscle];
      return n;
    });
    next();
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-8">
      <h1 className="text-center text-2xl font-semibold">{muscle}</h1>
      <p className="mt-1 text-center text-xs text-slate-500">{index + 1} / {MUSCLES.length}</p>

      <div className="flex flex-1 flex-col justify-center pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <p className="text-center text-lg text-white">Quels exercices fais-tu ?</p>

        <div className="mt-9 mx-auto flex w-full max-w-[16rem] flex-col gap-3" role="group" aria-label={`Exercices ${muscle}`}>
          {EXERCISES.map(ex => {
            const isActive = selected.includes(ex);
            return (
              <button
                key={ex}
                type="button"
                aria-pressed={isActive}
                onClick={() => toggle(ex)}
                className={`flex items-center justify-center rounded-xl border px-4 py-3.5 text-center transition-colors ${
                  isActive
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-700 bg-slate-800/50 active:bg-slate-800'
                }`}
              >
                <span className="font-medium text-slate-100">{ex}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={next}
          className="mt-9 mx-auto w-full max-w-[16rem] rounded-xl bg-emerald-600 px-4 py-3.5 font-semibold text-white transition-colors hover:bg-emerald-500"
        >
          Suivant
        </button>
        <button
          type="button"
          onClick={skip}
          className="mt-3 text-center text-sm text-slate-400 transition-colors hover:text-slate-200"
        >
          Passer
        </button>
      </div>
    </div>
  );
}
