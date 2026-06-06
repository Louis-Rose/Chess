import { useEffect, useState } from 'react';
import axios from 'axios';
import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitShell } from './FitShell';
import { MUSCLES, variantId } from './programData';

// Second step of the Programme flow: for each muscle group, pick the exercises
// done (multi-select). Persisted per-muscle via /api/fit/exercises on "Suivant".

export function FitExercises({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [index, setIndex] = useState(0);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fitRequest(() => axios.get<{ selections: Record<string, string[]> }>('/api/fit/exercises'))
      .then(res => setSelections(res.data.selections ?? {}))
      .catch(() => { /* start empty */ })
      .finally(() => setLoading(false));
  }, []);

  const muscle = MUSCLES[index];
  const selected = selections[muscle.name] ?? [];

  function toggle(id: string) {
    setSelections(prev => {
      const cur = prev[muscle.name] ?? [];
      const next = cur.includes(id) ? cur.filter(e => e !== id) : [...cur, id];
      return { ...prev, [muscle.name]: next };
    });
  }

  function next() {
    fitRequest(() => axios.put('/api/fit/exercises', { muscle: muscle.name, exercises: selected })).catch(() => {});
    if (index < MUSCLES.length - 1) setIndex(index + 1);
    else onDone();
  }

  function back() {
    if (index > 0) setIndex(index - 1);
    else onBack();
  }

  const cardBase = 'flex items-center justify-center rounded-xl border px-4 py-3.5 text-center transition-colors';
  const cardOn = 'border-emerald-500 bg-emerald-500/10';
  const cardOff = 'border-slate-700 bg-slate-800/50 active:bg-slate-800';

  return (
    <FitShell
      title={muscle.name}
      counter={`${index + 1} / ${MUSCLES.length}`}
      question="Quels exercices fais-tu ?"
      onBack={back}
      footer={!loading ? (
        <button
          type="button"
          onClick={next}
          className="mb-8 w-full max-w-[12rem] rounded-xl bg-emerald-600 px-4 py-3.5 font-semibold text-white transition-colors hover:bg-emerald-500"
        >
          Suivant
        </button>
      ) : undefined}
    >
      {loading ? (
        <div className="flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-[18rem] flex-col gap-3" role="group" aria-label={`Exercices ${muscle.name}`}>
          {muscle.exercises.map(ex => {
            // Leaf exercise.
            if (typeof ex === 'string') {
              const isActive = selected.includes(ex);
              return (
                <button
                  key={ex}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => toggle(ex)}
                  className={`${cardBase} ${isActive ? cardOn : cardOff}`}
                >
                  <span className="font-medium text-slate-100">{ex}</span>
                </button>
              );
            }

            // Group with variants — expands to reveal its sub-options.
            const anySelected = ex.variants.some(v => selected.includes(variantId(ex.name, v)));
            const key = `${muscle.name}:${ex.name}`;
            const expanded = open[key] ?? anySelected;
            return (
              <div key={ex.name} className="flex flex-col gap-3">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(prev => ({ ...prev, [key]: !expanded }))}
                  className={`relative ${cardBase} ${anySelected ? cardOn : cardOff}`}
                >
                  <span className="font-medium text-slate-100">{ex.name}</span>
                  {expanded
                    ? <ChevronUp className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    : <ChevronDown className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />}
                </button>

                {expanded && (
                  <div className="grid grid-cols-3 gap-2">
                    {ex.variants.map(v => {
                      const id = variantId(ex.name, v);
                      const vActive = selected.includes(id);
                      return (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={vActive}
                          onClick={() => toggle(id)}
                          className={`rounded-lg border px-1.5 py-2 text-center text-xs leading-tight transition-colors ${
                            vActive
                              ? 'border-emerald-500 bg-emerald-500/10 text-slate-100'
                              : 'border-slate-700 bg-slate-800/50 text-slate-300 active:bg-slate-800'
                          }`}
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </FitShell>
  );
}
