import { useState } from 'react';
import { X } from 'lucide-react';
import { MUSCLE_ORDER, MUSCLE_LEAVES, groupExercises, sortLabels, type Exercise } from './programData';
import { MusclePicker } from './MusclePicker';

// Full-screen "Ajouter un exercice" picker, shared by the new-session flow
// (FitSession) and the session editor (FitSessionDetail). Same UI as the
// Programme exercise step: per-muscle cards with expandable variants and a
// green halo on the exercises already in the session. Tapping a leaf/variant
// adds it (onPick); it only lists the program's still-valid exercises.

export function FitExercisePicker({ program, added, onPick, onClose }: {
  program: Record<string, string[]>;
  added: Set<string>;
  onPick: (leaf: string) => void;
  onClose: () => void;
}) {
  // One expanded variant group at a time across the whole picker (accordion).
  const [openName, setOpenName] = useState<string | null>(null);
  const selected = [...added];
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
                <h3 className="text-center text-xs uppercase tracking-wide text-slate-500">{g.name}</h3>
                <div className="mt-2">
                  <MusclePicker
                    exercises={g.exercises}
                    ariaLabel={`Exercices ${g.name}`}
                    selected={selected}
                    onToggle={onPick}
                    openName={openName}
                    onOpenChange={setOpenName}
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
