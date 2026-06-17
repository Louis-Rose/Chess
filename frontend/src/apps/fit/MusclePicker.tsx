import { useState } from 'react';
import { ChevronDown, ChevronUp, Pencil } from 'lucide-react';
import { variantId, exerciseEnglish, type Exercise } from './programData';

// A small "edit" pencil overlaid on a custom-exercise card (left side). A span,
// not a button, so it can live inside the card's <button> without nesting; taps
// are stopped from toggling the card.
function EditPencil({ onEdit }: { onEdit: () => void }) {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label="Modifier l'exercice"
      onPointerDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); onEdit(); }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onEdit(); } }}
      className="absolute left-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 active:bg-slate-800"
    >
      <Pencil className="h-4 w-4" />
    </span>
  );
}

// "il y a 3 jours" style label for the days since an exercise was last done.
const recencyLabel = (d: number) =>
  d === 0 ? "aujourd'hui" : d === 1 ? 'hier' : `il y a ${d} jours`;

// Exercise name plus its English name (machine settings are shown only inside
// the exercise, not in the picker). When `days` is provided, an extra line
// shows how long since the exercise was last done. A stored leaf
// "<base> — <variant>" shows the variant on its own line under the base name
// (same size, white, in parentheses) — used by the in-session picker, which
// offers each program variant as its own card instead of an expandable group.
function ExLabel({ name, days }: { name: string; days?: number | null }) {
  const i = name.indexOf(' — ');
  const base = i === -1 ? name : name.slice(0, i);
  const variant = i === -1 ? '' : name.slice(i + 3);
  const en = exerciseEnglish(base);
  return (
    <span className="flex flex-col items-center">
      <span className="font-medium text-slate-100">{base}</span>
      {variant && <span className="font-medium text-slate-100">({variant})</span>}
      {en && <span className="mt-0.5 text-xs text-slate-400">{en}</span>}
      {days != null && <span className="mt-0.5 text-xs text-emerald-400/80">{recencyLabel(days)}</span>}
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

export function MusclePicker({ exercises, selected, onToggle, ariaLabel, openName, onOpenChange, recency, editableNames, onEdit }: {
  exercises: Exercise[];
  selected: string[];
  onToggle: (id: string) => void;
  ariaLabel?: string;
  // Base names that are custom exercises: when set (with onEdit), those cards
  // show an edit pencil. Used only in the program editor, not the session picker.
  editableNames?: Set<string>;
  onEdit?: (name: string) => void;
  // When provided, the open variant group is controlled by the parent so only
  // one is open across several MusclePickers (accordion). Otherwise it's local
  // and multiple groups can be open at once.
  openName?: string | null;
  onOpenChange?: (name: string | null) => void;
  // Optional days-since-last-done per base exercise name; shows a recency line
  // under the English name (used by the in-session "Ajouter un exercice" picker).
  recency?: Record<string, number>;
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
          const editable = editableNames?.has(ex) && onEdit;
          return (
            <button
              key={ex}
              type="button"
              aria-pressed={isActive}
              onClick={() => onToggle(ex)}
              className={`relative ${cardBase} ${isActive ? cardOn : cardOff}`}
            >
              {editable && <EditPencil onEdit={() => onEdit!(ex)} />}
              <ExLabel name={ex} days={recency?.[ex]} />
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
              {editableNames?.has(ex.name) && onEdit && <EditPencil onEdit={() => onEdit(ex.name)} />}
              <ExLabel name={ex.name} days={recency?.[ex.name]} />
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
