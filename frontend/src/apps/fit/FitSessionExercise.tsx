import { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { leafLabel } from './programData';
import { formatSet } from './format';

// One exercise card inside a session: its logged sets plus a form to add the
// next set (poids + répétitions). Weight is optional (bodyweight). Each set is
// either a warmup (échauffement) or a working set (travail); warmup sets are
// shown in parentheses and don't count in the set numbering.
// Tapping a logged set loads it into the same form to edit it in place.

export interface LoggedSet {
  id: number;
  weight: number | null;
  reps: number;
  warmup: boolean;
}

interface Props {
  exercise: string;                                       // stored leaf
  sets: LoggedSet[];
  onAddSet: (weight: number | null, reps: number, warmup: boolean) => Promise<void>;
  onUpdateSet: (setId: number, weight: number | null, reps: number, warmup: boolean) => Promise<void>;
  onDeleteSet: (setId: number) => void;
}

export function FitSessionExercise({ exercise, sets, onAddSet, onUpdateSet, onDeleteSet }: Props) {
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [warmup, setWarmup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);  // set being edited, else adding a new one
  const [adding, setAdding] = useState(false);                      // add form opened via "Ajouter une série"

  // The input form is only shown on demand: tapping "Ajouter une série" (add)
  // or tapping a logged set (edit). Otherwise just the button is visible.
  const formVisible = adding || editingId != null;

  const repsNum = parseInt(reps, 10);
  const weightNum = weight.trim() === '' ? null : parseFloat(weight.replace(',', '.'));
  const valid = Number.isFinite(repsNum) && repsNum > 0 && (weightNum === null || Number.isFinite(weightNum));

  function openAdd() {
    setEditingId(null);
    setWeight('');
    setReps('');
    setWarmup(false);
    setAdding(true);
  }

  function startEdit(s: LoggedSet) {
    setAdding(false);
    setEditingId(s.id);
    setReps(String(s.reps));
    setWeight(s.weight == null ? '' : String(s.weight));
    setWarmup(s.warmup);
  }

  function reset() {
    setEditingId(null);
    setAdding(false);
    setWeight('');
    setReps('');
  }

  async function submit() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      if (editingId != null) await onUpdateSet(editingId, weightNum, repsNum, warmup);
      else await onAddSet(weightNum, repsNum, warmup);
      reset();
    } catch {
      /* cancelled (or failed): keep the entered values so the user can retry */
    } finally {
      setSaving(false);
    }
  }

  // text-base (16px) is required on the inputs: iOS Safari auto-zooms any
  // focused input whose font-size is under 16px.
  const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-center text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none';

  let workIdx = 0;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-800/30 px-4 py-4">
      <p className="text-center font-medium text-slate-100">{leafLabel(exercise)}</p>

      {sets.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {sets.map(s => {
            const num = s.warmup ? null : ++workIdx;
            const isEditing = editingId === s.id;
            return (
              <li key={s.id} className="flex items-center justify-between gap-2 text-sm text-slate-200">
                <button
                  type="button"
                  onClick={() => startEdit(s)}
                  className={`flex-1 text-left transition-colors ${isEditing ? 'text-emerald-400' : s.warmup ? 'text-slate-400' : ''}`}
                >
                  <span className="text-slate-500">{num != null ? `${num}.` : '·'}</span>{' '}
                  {formatSet(s.weight, s.reps, s.warmup)}
                </button>
                <button
                  type="button"
                  onClick={() => { if (editingId === s.id) reset(); onDeleteSet(s.id); }}
                  aria-label="Supprimer la série"
                  className="rounded p-1 text-slate-500 transition-colors active:text-red-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {formVisible ? (
        <>
          <div className="mx-auto mt-3 grid w-64 grid-cols-2 rounded-lg border border-slate-700 p-0.5 text-sm">
            {([[true, 'Échauffement'], [false, 'Travail']] as const).map(([w, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => setWarmup(w)}
                className={`rounded-md py-1.5 font-medium transition-colors ${
                  warmup === w ? 'bg-emerald-600 text-white' : 'text-slate-400 active:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-end gap-2">
            <label className="flex-1 text-center text-xs text-slate-100">
              Répétitions
              <input
                value={reps}
                onChange={e => setReps(e.target.value)}
                inputMode="numeric"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="flex-1 text-center text-xs text-slate-100">
              Poids (kg)
              <input
                value={weight}
                onChange={e => setWeight(e.target.value)}
                inputMode="decimal"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            {editingId != null && (
              <button
                type="button"
                onClick={reset}
                aria-label="Annuler la modification"
                className="mb-px flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-300 transition-colors active:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={!valid || saving}
              aria-label={editingId != null ? 'Valider la modification' : 'Ajouter la série'}
              className="mb-px flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white transition-colors active:bg-emerald-500 disabled:opacity-40"
            >
              {editingId != null ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
            </button>
          </div>
        </>
      ) : (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-sm font-medium text-slate-100 transition-colors active:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Ajouter une série
          </button>
        </div>
      )}
    </div>
  );
}
