import { useEffect, useState } from 'react';
import axios from 'axios';
import { MUSCLE_ORDER, isValidLeaf, sortLabels } from './programData';
import { MusclePicker } from './MusclePicker';
import { FitChrono } from './FitChrono';
import { FitHeader } from './FitHeader';
import { FitScreenHeader } from './FitScreenHeader';
import { fitRequest } from './fitAuth';
import { useCustomExercises } from './useCustomExercises';
import { validatedLeaves } from './validatedExercises';

// Full-screen "Ajouter un exercice" picker, shared by the new-session flow
// (FitSession) and the session editor (FitSessionDetail). Unlike the Programme
// exercise step, there's no variant chooser: each program variant is offered as
// its own card (the variant shown under the base name), so a single tap adds it
// (onPick). It only lists the program's still-valid exercises.

export function FitExercisePicker({ program, muscles, muscleOrder, onPick, onClose }: {
  program: Record<string, string[]>;
  // When set (the week's split day), only these muscle groups are shown, with a
  // toggle to reveal all the program's muscles instead.
  muscles?: string[];
  // The program's chosen muscle order (from the "Ordre" step).
  muscleOrder?: string[];
  onPick: (leaf: string) => void;
  onClose: () => void;
}) {
  useCustomExercises();   // warm the custom catalogue so custom leaves stay valid
  const [showAll, setShowAll] = useState(false);
  const dayFilter = muscles && muscles.length > 0 && !showAll ? new Set(muscles) : null;
  // Days since each exercise (per stored leaf) was last done, shown on its card.
  const [recency, setRecency] = useState<Record<string, number>>({});
  useEffect(() => {
    fitRequest(() => axios.get<{ exercises: { exercise: string; days: number }[] }>('/api/fit/last-done'))
      .then(res => {
        const byLeaf: Record<string, number> = {};
        for (const e of res.data.exercises ?? []) byLeaf[e.exercise] = e.days;
        // Exercises validated in the ongoing session show as done today (0).
        for (const leaf of validatedLeaves()) byLeaf[leaf] = 0;
        setRecency(byLeaf);
      })
      .catch(() => { /* no recency line */ });
  }, []);
  // Nothing is pre-highlighted: the picker only adds exercises, so showing the
  // ones already in the session as "selected" was misleading.
  const selected: string[] = [];
  // The program's chosen muscle order (fallback anatomical), as set in the
  // "Ordre" step — used as-is.
  const base = muscleOrder && muscleOrder.length > 0 ? muscleOrder : MUSCLE_ORDER;
  const groups = base
    .filter(name => !dayFilter || dayFilter.has(name))
    .map(name => ({
      name,
      // Each valid program leaf is its own card (variants included), sorted so
      // variants of the same exercise sit next to each other.
      exercises: sortLabels((program[name] ?? []).filter(ex => isValidLeaf(name, ex))),
    }))
    .filter(g => g.exercises.length > 0);

  return (
    <div className="fixed inset-0 z-20 flex flex-col bg-slate-900 text-slate-100">
      {/* The picker covers the app's header + sticky chrono, so show them here
          too, then lay out the back button and title below them. */}
      <FitHeader />
      <FitChrono />
      <FitScreenHeader title="Ajouter un exercice" onBack={onClose} />

      <div className="flex-1 overflow-y-auto px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-5">
        {groups.length === 0 ? (
          <p className="mt-8 text-center text-sm text-slate-400">
            Aucun exercice disponible. Ajoute-en dans ton programme.
          </p>
        ) : (
          <div className="mx-auto flex w-full max-w-[22rem] flex-col gap-6">
            {muscles && muscles.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(v => !v)}
                className="mx-auto rounded-full border border-slate-700 px-4 py-1.5 text-xs font-medium text-slate-300 transition-colors active:bg-slate-800"
              >
                {showAll ? 'Filtrer sur la séance du jour' : 'Voir tous les muscles'}
              </button>
            )}
            {groups.map(g => (
              <section key={g.name}>
                <h3 className="text-center text-xs uppercase tracking-wide text-white">{g.name}</h3>
                <div className="mt-2">
                  <MusclePicker
                    exercises={g.exercises}
                    ariaLabel={`Exercices ${g.name}`}
                    selected={selected}
                    onToggle={onPick}
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
