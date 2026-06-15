import { useEffect, useState } from 'react';
import axios from 'axios';
import { X } from 'lucide-react';
import { MUSCLE_ORDER, MUSCLE_LEAVES, groupExercises, sortLabels, type Exercise } from './programData';
import { MusclePicker } from './MusclePicker';
import { fitRequest } from './fitAuth';

// Days since the exercise was last done, keyed by base name (min across its
// variants) — mirrors buildRecency's baseOf grouping. Drives the recency line.
const baseOf = (leaf: string) => {
  const i = leaf.indexOf(' — ');
  return i === -1 ? leaf : leaf.slice(0, i);
};

// Full-screen "Ajouter un exercice" picker, shared by the new-session flow
// (FitSession) and the session editor (FitSessionDetail). Same UI as the
// Programme exercise step: per-muscle cards with expandable variants and a
// green halo on the exercises already in the session. Tapping a leaf/variant
// adds it (onPick); it only lists the program's still-valid exercises.

export function FitExercisePicker({ program, onPick, onClose }: {
  program: Record<string, string[]>;
  onPick: (leaf: string) => void;
  onClose: () => void;
}) {
  // One expanded variant group at a time across the whole picker (accordion).
  const [openName, setOpenName] = useState<string | null>(null);
  // Days since each base exercise was last done, shown under the English name.
  const [recency, setRecency] = useState<Record<string, number>>({});
  useEffect(() => {
    fitRequest(() => axios.get<{ exercises: { exercise: string; days: number }[] }>('/api/fit/last-done'))
      .then(res => {
        const byBase: Record<string, number> = {};
        for (const e of res.data.exercises ?? []) {
          const b = baseOf(e.exercise);
          if (byBase[b] == null || e.days < byBase[b]) byBase[b] = e.days;
        }
        setRecency(byBase);
      })
      .catch(() => { /* no recency line */ });
  }, []);
  // Nothing is pre-highlighted: the picker only adds exercises, so showing the
  // ones already in the session as "selected" was misleading.
  const selected: string[] = [];
  const groups = MUSCLE_ORDER
    .map(name => {
      const leaves = sortLabels((program[name] ?? []).filter(ex => MUSCLE_LEAVES[name]?.has(ex)));
      const exercises: Exercise[] = groupExercises(leaves).map(g =>
        g.variants.length === 0 ? g.name : { name: g.name, variants: [g.variants] });
      return { name, exercises };
    })
    .filter(g => g.exercises.length > 0);

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-slate-900 text-slate-100">
      <header className="relative flex items-center justify-center border-b border-slate-800 px-5 py-4">
        <h2 className="text-lg font-semibold">Ajouter un exercice</h2>
        <button type="button" onClick={onClose} aria-label="Fermer" className="absolute right-5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 active:text-white">
          <X className="h-6 w-6" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {groups.length === 0 ? (
          <p className="mt-8 text-center text-sm text-slate-400">
            Aucun exercice disponible. Ajoute-en dans ton programme.
          </p>
        ) : (
          <div className="mx-auto flex w-full max-w-[22rem] flex-col gap-6">
            {groups.map(g => (
              <section key={g.name}>
                <h3 className="text-center text-xs uppercase tracking-wide text-white">{g.name}</h3>
                <div className="mt-2">
                  <MusclePicker
                    exercises={g.exercises}
                    ariaLabel={`Exercices ${g.name}`}
                    selected={selected}
                    onToggle={onPick}
                    openName={openName}
                    onOpenChange={setOpenName}
                    recency={recency}
                  />
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
