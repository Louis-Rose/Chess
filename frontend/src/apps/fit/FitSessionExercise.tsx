import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { leafLabel } from './programData';
import { formatSet } from './format';

// One exercise card inside a session: its logged sets plus an inline form to
// add the next set (poids + répétitions). Weight is optional (bodyweight).
// Each set is either a warmup (échauffement) or a working set (travail);
// warmup sets are shown in parentheses and don't count in the set numbering.

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
  onDeleteSet: (setId: number) => void;
}

export function FitSessionExercise({ exercise, sets, onAddSet, onDeleteSet }: Props) {
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [warmup, setWarmup] = useState(false);
  const [saving, setSaving] = useState(false);

  const repsNum = parseInt(reps, 10);
  const weightNum = weight.trim() === '' ? null : parseFloat(weight.replace(',', '.'));
  const valid = Number.isFinite(repsNum) && repsNum > 0 && (weightNum === null || Number.isFinite(weightNum));

  async function add() {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onAddSet(weightNum, repsNum, warmup);
      setWeight('');
      setReps('');
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
      <p className="font-medium text-slate-100">{leafLabel(exercise)}</p>

      {sets.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {sets.map(s => {
            const num = s.warmup ? null : ++workIdx;
            return (
              <li key={s.id} className="flex items-center justify-between text-sm text-slate-200">
                <span className={s.warmup ? 'text-slate-400' : undefined}>
                  <span className="text-slate-500">{num != null ? `${num}.` : '·'}</span>{' '}
                  {formatSet(s.weight, s.reps, s.warmup)}
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
            );
          })}
        </ul>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {([[false, 'Travail'], [true, 'Échauffement']] as const).map(([w, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => setWarmup(w)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              warmup === w
                ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300'
                : 'border-slate-700 bg-slate-800/40 text-slate-400 active:bg-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-end gap-2">
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
