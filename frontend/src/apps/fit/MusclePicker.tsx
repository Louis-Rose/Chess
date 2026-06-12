import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { variantId, exerciseSubtitle, type Exercise } from './programData';

// Exercise name plus its optional subtitle (English name / machine setting).
function ExLabel({ name }: { name: string }) {
  const subtitle = exerciseSubtitle(name);
  return (
    <span className="flex flex-col items-center">
      <span className="font-medium text-slate-100">{name}</span>
      {subtitle && <span className="mt-0.5 text-xs text-slate-400">{subtitle}</span>}
    </span>
  );
}

// The exercise multi-select for one list of exercises: leaf exercises plus
// expandable variant groups, with a green halo on the selected ones. Pure UI —
// the parent owns the selection list and reacts to onToggle. Shared by the
// program create wizard (FitExercises), the tabbed program editor
// (FitProgrammeEdit) and the in-session "Ajouter un exercice" picker
// (FitExercisePicker). Key it so its expand state resets when the list changes.

const cardBase = 'flex items-center justify-center rounded-xl border px-4 py-3.5 text-center transition-colors';
const cardOn = 'border-emerald-500 bg-emerald-500/10';
const cardOff = 'border-slate-700 bg-slate-800/50 active:bg-slate-800';

export function MusclePicker({ exercises, selected, onToggle, ariaLabel, openName, onOpenChange }: {
  exercises: Exercise[];
  selected: string[];
  onToggle: (id: string) => void;
  ariaLabel?: string;
  // When provided, the open variant group is controlled by the parent so only
  // one is open across several MusclePickers (accordion). Otherwise it's local
  // and multiple groups can be open at once.
  openName?: string | null;
  onOpenChange?: (name: string | null) => void;
}) {
  const [localOpen, setLocalOpen] = useState<Record<string, boolean>>({});
  const controlled = onOpenChange != null;
  const isExpanded = (name: string) => controlled ? openName === name : (localOpen[name] ?? false);
  const toggleOpen = (name: string, expanded: boolean) => {
    if (controlled) onOpenChange!(expanded ? null : name);
    else setLocalOpen(prev => ({ ...prev, [name]: !expanded }));
  };

  return (
    <div className="mx-auto flex w-full max-w-[18rem] flex-col gap-3" role="group" aria-label={ariaLabel}>
      {exercises.map(ex => {
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
              <ExLabel name={ex} />
            </button>
          );
        }

        // Group with variants — expands to reveal its sub-options (rows).
        const anySelected = ex.variants.flat().some(v => selected.includes(variantId(ex.name, v)));
        // Collapsed by default; the user taps to reveal the variants.
        const expanded = isExpanded(ex.name);
        return (
          <div key={ex.name} className="flex flex-col gap-3">
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => toggleOpen(ex.name, expanded)}
              className={`relative ${cardBase} ${anySelected ? cardOn : cardOff}`}
            >
              <ExLabel name={ex.name} />
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
