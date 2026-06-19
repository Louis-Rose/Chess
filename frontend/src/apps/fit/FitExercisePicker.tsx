import { useEffect, useState } from 'react';
import axios from 'axios';
import { ChevronRight } from 'lucide-react';
import { MUSCLE_ORDER, isValidLeaf, sessionLeaves, sortLabels } from './programData';
import { MusclePicker } from './MusclePicker';
import { FitChrono } from './FitChrono';
import { FitHeader } from './FitHeader';
import { FitScreenHeader } from './FitScreenHeader';
import { fitRequest } from './fitAuth';
import { useCustomExercises } from './useCustomExercises';
import { validatedLeaves } from './validatedExercises';

// Full-screen "Ajouter un exercice" picker. Two modes:
//  - Sequential (live session): only the current muscle group (`group`) is
//    offered; a "Groupe suivant" button walks forward through the program order.
//  - Free (editing a past session): every program muscle is listed, in order.
// Each program variant is its own card (single tap adds it via onPick); only
// still-valid exercises are shown.

export function FitExercisePicker({ program, muscleOrder, group, nextGroup, onNextGroup, onPick, onClose }: {
  program: Record<string, string[]>;
  // The program's chosen muscle order (from the "Ordre" step).
  muscleOrder?: string[];
  // Sequential mode: the only muscle group whose exercises can be added now.
  group?: string;
  // The next group's name (shown on the "Groupe suivant" button), or null on the last.
  nextGroup?: string | null;
  onNextGroup?: () => void;
  onPick: (leaf: string) => void;
  onClose: () => void;
}) {
  useCustomExercises();   // warm the custom catalogue so custom leaves stay valid
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
  // Sequential mode shows just the current group; free mode shows all, in the
  // program's chosen order (fallback anatomical).
  const base = muscleOrder && muscleOrder.length > 0 ? muscleOrder : MUSCLE_ORDER;
  const names = group != null ? [group] : base;
  const groups = names
    .map(name => ({
      name,
      // Each configured exercise is its own card. A variant exercise's rows are
      // independent settings, so one pick per row (Rowing assis: equipment +
      // grip) becomes a single combined card, not one card per leaf.
      exercises: sessionLeaves(sortLabels((program[name] ?? []).filter(ex => isValidLeaf(name, ex)))),
    }))
    .filter(g => g.exercises.length > 0);

  const sequential = group != null;

  return (
    <div className="fixed inset-x-0 top-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 flex flex-col bg-slate-900 text-slate-100">
      {/* Covers the app's header + sticky chrono, but stops above the bottom nav
          (which stays visible and tappable), so show them here too, then lay out
          the back button and title below them. */}
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

        {/* Walk to the next muscle group (forward only). */}
        {sequential && nextGroup && (
          <button
            type="button"
            onClick={onNextGroup}
            className="mx-auto mt-8 flex w-full max-w-[22rem] items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors active:bg-emerald-500"
          >
            Groupe suivant : {nextGroup}
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
