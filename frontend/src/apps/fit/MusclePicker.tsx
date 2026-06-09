import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { MUSCLES, variantId } from './programData';

// The exercise multi-select for a single muscle group: leaf exercises plus
// expandable variant groups. Pure UI — the parent owns the selection list and
// reacts to onToggle. Shared by the create wizard (FitExercises) and the
// tabbed program editor (FitProgrammeEdit). Key it by muscle name so its
// expand state resets when the muscle changes.

type Muscle = (typeof MUSCLES)[number];

const cardBase = 'flex items-center justify-center rounded-xl border px-4 py-3.5 text-center transition-colors';
const cardOn = 'border-emerald-500 bg-emerald-500/10';
const cardOff = 'border-slate-700 bg-slate-800/50 active:bg-slate-800';

export function MusclePicker({ muscle, selected, onToggle }: {
  muscle: Muscle;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
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
              onClick={() => onToggle(ex)}
              className={`${cardBase} ${isActive ? cardOn : cardOff}`}
            >
              <span className="font-medium text-slate-100">{ex}</span>
            </button>
          );
        }

        // Group with variants — expands to reveal its sub-options (rows).
        const anySelected = ex.variants.flat().some(v => selected.includes(variantId(ex.name, v)));
        const expanded = open[ex.name] ?? anySelected;
        return (
          <div key={ex.name} className="flex flex-col gap-3">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setOpen(prev => ({ ...prev, [ex.name]: !expanded }))}
              className={`relative ${cardBase} ${anySelected ? cardOn : cardOff}`}
            >
              <span className="font-medium text-slate-100">{ex.name}</span>
              {expanded
                ? <ChevronUp className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                : <ChevronDown className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />}
            </button>

            {expanded && (
              <div className="flex flex-col gap-2">
                {ex.variants.map((row, ri) => (
                  <div key={ri} className={`grid gap-2 ${row.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    {row.map(v => {
                      const id = variantId(ex.name, v);
                      const vActive = selected.includes(id);
                      return (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={vActive}
                          onClick={() => onToggle(id)}
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
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
