import { useEffect, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { leafLabel, exerciseSubtitle } from './programData';
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
  workWeight?: number | null;                             // persisted working weight, pre-fills new working sets
  onWorkWeightChange?: (weight: number | null) => void;   // persist an edit to it
  onValidate?: () => void;                                // shows a "Valider l'exercice" button inside the card
}

export function FitSessionExercise({ exercise, sets, onAddSet, onUpdateSet, onDeleteSet, workWeight, onWorkWeightChange, onValidate }: Props) {
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [warmup, setWarmup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);  // set being edited, else adding a new one
  const [adding, setAdding] = useState(false);                      // add form opened via "Ajouter une série"
  const [workWeightStr, setWorkWeightStr] = useState(workWeight != null ? String(workWeight) : '');

  // Reflect the persisted value once it loads / changes (it's the source of truth).
  useEffect(() => {
    setWorkWeightStr(workWeight != null ? String(workWeight) : '');
  }, [workWeight, exercise]);

  function persistWorkWeight() {
    const v = workWeightStr.trim() === '' ? null : parseFloat(workWeightStr);
    onWorkWeightChange?.(v != null && Number.isFinite(v) ? v : null);
  }

  // The input form is only shown on demand: tapping "Ajouter une série" (add)
  // or tapping a logged set (edit). Otherwise just the button is visible.
  const formVisible = adding || editingId != null;

  const repsNum = parseInt(reps, 10);
  const weightNum = weight.trim() === '' ? null : parseFloat(weight.replace(',', '.'));
  const valid = Number.isFinite(repsNum) && repsNum > 0 && (weightNum === null || Number.isFinite(weightNum));

  function openAdd() {
    setEditingId(null);
    // Default to échauffement until a working set has been logged for this
    // exercise, then default to travail. Only pre-fill the working weight when
    // the default is a working set.
    const defaultWarmup = !sets.some(s => !s.warmup);
    setWarmup(defaultWarmup);
    setWeight(defaultWarmup ? '' : workWeightStr);
    setReps('');
    setAdding(true);
  }

  // Pick the set type. On a new set, switching to Travail pre-fills the working
  // weight and switching to Échauffement clears it; on an edit, keep the entered
  // weight untouched.
  function pickSetType(isWarmup: boolean) {
    setWarmup(isWarmup);
    if (editingId == null) setWeight(isWarmup ? '' : workWeightStr);
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
    <div className="rounded-2xl border border-slate-700 bg-slate-800/30 px-4 py-4">
      <p className="text-center font-medium text-slate-100">{leafLabel(exercise)}</p>
      {exerciseSubtitle(exercise.split(' — ')[0]) && (
        <p className="text-center text-xs text-slate-400">{exerciseSubtitle(exercise.split(' — ')[0])}</p>
      )}

      <div className="mt-2 flex items-center justify-center gap-2 text-sm">
        <label htmlFor={`ww-${exercise}`} className="text-white">Poids de travail</label>
        <input
          id={`ww-${exercise}`}
          value={workWeightStr}
          onChange={e => setWorkWeightStr(e.target.value.replace(',', '.'))}
          onBlur={persistWorkWeight}
          inputMode="decimal"
          placeholder="—"
          className="w-16 rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1 text-center text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
        />
        <span className="text-white">kg</span>
      </div>

      {sets.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {sets.map(s => {
            const num = s.warmup ? null : ++workIdx;
            const isEditing = editingId === s.id;
            return (
              <li key={s.id} className="flex items-center justify-between gap-2 text-sm text-slate-200">
                <button
                  type="button"
                  onClick={() => isEditing ? reset() : startEdit(s)}
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
        <div className="relative mt-3 rounded-xl border border-slate-700 bg-slate-900/40 px-3 pb-3 pt-7">
          <button
            type="button"
            onClick={reset}
            aria-label={editingId != null ? 'Annuler la modification' : 'Annuler'}
            className="absolute right-2 top-2 text-slate-500 transition-colors active:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="mx-auto grid w-64 grid-cols-2 rounded-lg border border-slate-700 p-0.5 text-sm">
            {([[true, 'Échauffement'], [false, 'Travail']] as const).map(([w, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => pickSetType(w)}
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
                onChange={e => setWeight(e.target.value.replace(',', '.'))}
                inputMode="decimal"
                className={`mt-1 ${inputClass}`}
              />
            </label>
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
        </div>
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

      {onValidate && (
        <>
          {/* Separator so the validate button isn't tapped by accident. */}
          <div className="-mx-4 mt-5 border-t border-slate-700" />
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={onValidate}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors active:bg-emerald-500"
            >
              Terminer l'exercice
            </button>
          </div>
        </>
      )}
    </div>
  );
}
