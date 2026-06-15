import { useEffect, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { leafLabel, exerciseEnglish, exerciseSettingsValue } from './programData';
import { formatSet } from './format';

// One exercise card inside a session: its logged sets plus a form to add the
// next set (poids + répétitions). Weight is optional (bodyweight). Each set is
// either a warmup (échauffement) or a working set (travail); warmup sets are
// shown in parentheses and don't count in the set numbering.
// Instead of choosing the type per set, the user walks a guided sequence at one
// spot — "Commencer l'échauffement" → "Fin de l'échauffement" → "Terminer
// l'exercice" — each step unlocked by the previous. Sets logged before the
// warmup ends are warmups; after, they're working sets.
// Tapping a logged set loads it into the same form to edit it in place (its
// type is kept as-is).

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
  setting?: string | null;                                // persisted machine-setting override (per base)
  onSettingChange?: (setting: string | null) => void;     // persist an edit to it
  onValidate?: () => void;                                // shows a "Valider l'exercice" button inside the card
}

export function FitSessionExercise({ exercise, sets, onAddSet, onUpdateSet, onDeleteSet, workWeight, onWorkWeightChange, setting, onSettingChange, onValidate }: Props) {
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  // Guided sequence. Resume at the right step: working sets → warmup done;
  // warmup sets only → warming up; nothing logged → not started.
  type Phase = 'start' | 'warmup' | 'work';
  const [phase, setPhase] = useState<Phase>(
    sets.some(s => !s.warmup) ? 'work' : sets.some(s => s.warmup) ? 'warmup' : 'start',
  );
  const warmupMode = phase !== 'work';   // sets are warmups until the warmup ends
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);  // set being edited, else adding a new one
  const [adding, setAdding] = useState(false);                      // add form opened via "Ajouter une série"
  const [workWeightStr, setWorkWeightStr] = useState(workWeight != null ? String(workWeight) : '');

  const baseName = exercise.split(' — ')[0];
  const defaultSetting = exerciseSettingsValue(baseName);
  const showSettings = defaultSetting !== '' || (setting != null && setting !== '');
  const [settingStr, setSettingStr] = useState(setting ?? defaultSetting);

  // Reflect the persisted values once they load / change (they're the source of truth).
  useEffect(() => {
    setWorkWeightStr(workWeight != null ? String(workWeight) : '');
  }, [workWeight, exercise]);
  useEffect(() => {
    setSettingStr(setting ?? defaultSetting);
  }, [setting, defaultSetting, exercise]);

  function persistWorkWeight() {
    const v = workWeightStr.trim() === '' ? null : parseFloat(workWeightStr);
    onWorkWeightChange?.(v != null && Number.isFinite(v) ? v : null);
  }

  // Store the setting only when it differs from the catalogue default; clearing
  // (or matching the default) falls back to the default.
  function persistSetting() {
    const v = settingStr.trim();
    onSettingChange?.(v === '' || v === defaultSetting ? null : v);
  }

  // The input form is only shown on demand: tapping "Ajouter une série" (add)
  // or tapping a logged set (edit). Otherwise just the button is visible.
  const formVisible = adding || editingId != null;

  const repsNum = parseInt(reps, 10);
  const weightNum = weight.trim() === '' ? null : parseFloat(weight.replace(',', '.'));
  const valid = Number.isFinite(repsNum) && repsNum > 0 && (weightNum === null || Number.isFinite(weightNum));

  function openAdd() {
    setEditingId(null);
    // Pre-fill the working weight only for a working set (warmup starts empty).
    setWeight(warmupMode ? '' : workWeightStr);
    setReps('');
    setAdding(true);
  }

  // Walk the sequence forward: start → warmup → work. Ending the warmup flips a
  // new set's pre-filled weight to the working weight.
  function advancePhase() {
    if (phase === 'start') setPhase('warmup');
    else if (phase === 'warmup') {
      setPhase('work');
      if (adding && editingId == null) setWeight(workWeightStr);
    }
  }

  function startEdit(s: LoggedSet) {
    setAdding(false);
    setEditingId(s.id);
    setReps(String(s.reps));
    setWeight(s.weight == null ? '' : String(s.weight));
  }

  function reset() {
    setEditingId(null);
    setAdding(false);
    setWeight('');
    setReps('');
  }

  async function submit() {
    if (!valid || saving) return;
    // Editing keeps the set's own type; a new set inherits the warmup phase.
    const isWarmup = editingId != null
      ? (sets.find(s => s.id === editingId)?.warmup ?? false)
      : warmupMode;
    setSaving(true);
    try {
      if (editingId != null) await onUpdateSet(editingId, weightNum, repsNum, isWarmup);
      else await onAddSet(weightNum, repsNum, isWarmup);
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

  const english = exerciseEnglish(baseName);
  // Smaller boxes than the set-entry inputs; the value text matches the label size.
  const fieldInput = 'rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1 text-center text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none';

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800/30 px-4 py-4">
      <p className="text-center font-medium text-slate-100">{leafLabel(exercise)}</p>
      {english && <p className="text-center text-xs text-slate-400">{english}</p>}

      <div className="mt-4 flex flex-col items-center gap-2 text-sm">
        {showSettings && (
          <div className="flex items-center justify-center gap-2">
            <label htmlFor={`set-${exercise}`} className="text-white">Réglages</label>
            <input
              id={`set-${exercise}`}
              value={settingStr}
              onChange={e => setSettingStr(e.target.value)}
              onBlur={persistSetting}
              placeholder="—"
              className={`w-16 ${fieldInput}`}
            />
          </div>
        )}
        <div className="flex items-center justify-center gap-2">
          <label htmlFor={`ww-${exercise}`} className="text-white">Poids de travail</label>
          <input
            id={`ww-${exercise}`}
            value={workWeightStr}
            onChange={e => setWorkWeightStr(e.target.value.replace(',', '.'))}
            onBlur={persistWorkWeight}
            inputMode="decimal"
            placeholder="—"
            className={`w-14 ${fieldInput}`}
          />
          <span className="text-white">kg</span>
        </div>
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
          <p className="text-center text-xs font-medium text-slate-400">
            {(editingId != null ? (sets.find(s => s.id === editingId)?.warmup ?? false) : warmupMode)
              ? 'Échauffement' : 'Série de travail'}
          </p>

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
        <div className="mt-3 flex flex-col items-center gap-3">
          {/* Logging sets only opens once the warmup has been started. */}
          {phase !== 'start' && (
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-sm font-medium text-slate-100 transition-colors active:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Ajouter une série
            </button>
          )}

          {/* One slot, three steps: start → end warmup → finish. Each step is
              only offered once the previous one has been tapped, set off by a
              separator and sharing the same neutral style. */}
          {(phase !== 'work' || onValidate) && (
            <>
              <div className="mt-1 h-px w-full bg-slate-700" />
              <button
                type="button"
                onClick={phase === 'work' ? onValidate : advancePhase}
                className="rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-sm font-medium text-slate-100 transition-colors active:bg-slate-800"
              >
                {phase === 'start'
                  ? "Commencer l'échauffement"
                  : phase === 'warmup'
                    ? "Fin de l'échauffement"
                    : "Terminer l'exercice"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
