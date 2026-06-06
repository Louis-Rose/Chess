import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { leafLabel } from './programData';

// One exercise card inside a session: its logged sets plus an inline form to
// add the next set (poids + répétitions). Weight is optional (bodyweight).

export interface LoggedSet {
  id: number;
  weight: number | null;
  reps: number;
}

interface Props {
  exercise: string;                                       // stored leaf
  sets: LoggedSet[];
  onAddSet: (weight: number | null, reps: number) => Promise<void>;
  onDeleteSet: (setId: number) => void;
}

export function FitSessionExercise({ exercise, sets, onAddSet, onDeleteSet }: Props) {
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [saving, setSaving] = useState(false);

  const repsNum = parseInt(reps, 10);
  const weightNum = weight.trim() === '' ? null : parseFloat(weight.replace(',', '.'));
  const valid = Number.isFinite(repsNum) && repsNum > 0 && (weightNum === null || Number.isFinite(weightNum));

  async function add() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onAddSet(weightNum, repsNum);
      setWeight('');
      setReps('');
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-center text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none';

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-800/30 px-4 py-4">
      <p className="font-medium text-slate-100">{leafLabel(exercise)}</p>

      {sets.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {sets.map((s, i) => (
            <li key={s.id} className="flex items-center justify-between text-sm text-slate-200">
              <span>
                <span className="text-slate-500">{i + 1}.</span>{' '}
                {s.weight != null ? `${s.weight} kg × ${s.reps}` : `${s.reps} reps`}
              </span>
              <button
                type="button"
                onClick={() => onDeleteSet(s.id)}
                aria-label="Supprimer la série"
                className="rounded p-1 text-slate-500 transition-colors active:text-red-400"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-end gap-2">
        <label className="flex-1 text-xs text-slate-500">
          Poids (kg)
          <input
            value={weight}
            onChange={e => setWeight(e.target.value)}
            inputMode="decimal"
            placeholder="—"
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="flex-1 text-xs text-slate-500">
          Reps
          <input
            value={reps}
            onChange={e => setReps(e.target.value)}
            inputMode="numeric"
            placeholder="—"
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <button
          type="button"
          onClick={add}
          disabled={!valid || saving}
          aria-label="Ajouter la série"
          className="mb-px flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white transition-colors active:bg-emerald-500 disabled:opacity-40"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
