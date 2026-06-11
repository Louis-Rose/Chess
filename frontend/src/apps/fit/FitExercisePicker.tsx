import { X } from 'lucide-react';
import { MUSCLE_ORDER, MUSCLE_LEAVES, leafLabel, sortLabels } from './programData';

// Full-screen "Ajouter un exercice" picker, shared by the new-session flow
// (FitSession) and the session editor (FitSessionDetail). Lists the program's
// still-valid leaves, grouped by muscle, minus the ones already added.

export function FitExercisePicker({ program, added, onPick, onClose }: {
  program: Record<string, string[]>;
  added: Set<string>;
  onPick: (leaf: string) => void;
  onClose: () => void;
}) {
  const groups = MUSCLE_ORDER
    .map(name => ({
      name,
      leaves: sortLabels((program[name] ?? []).filter(ex => MUSCLE_LEAVES[name]?.has(ex) && !added.has(ex))),
    }))
    .filter(g => g.leaves.length > 0);

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
                <div className="mt-2 flex flex-col gap-2">
                  {g.leaves.map(leaf => (
                    <button
                      key={leaf}
                      type="button"
                      onClick={() => onPick(leaf)}
                      className="rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-center font-medium text-slate-100 transition-colors active:bg-slate-800"
                    >
                      {leafLabel(leaf)}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
