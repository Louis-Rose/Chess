import { useEffect, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { leafLabel, exerciseEnglish, exerciseSettingsValue } from './programData';
import { ExerciseMuscles } from './FitExerciseMuscles';
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

// The warmup is a fixed number of sets, after which the exercise moves to its
// working sets on its own. Each warmup set is pre-filled from the working
// weight: a fraction of it (rounded to the kg) and a suggested rep count
// (10-15 reps light, then 8-10 heavier). All stay editable.
const WARMUP_SETS = 2;
const WARMUP_PCT = [0.33, 0.66];
const WARMUP_REPS = [12, 9];

// Pull-ups warm up with assistance (negative weight = aide), not a fraction of
// the working weight. Fixed: 14.5 kg of help, then 4.5 kg.
const TRACTIONS_WARMUP_ASSIST = [-14.5, -4.5];

export interface LoggedSet {
  id: number;
  weight: number | null;
  reps: number;
  reps_right: number | null;   // right-side reps of a unilateral set, else null
  warmup: boolean;
}

interface Props {
  exercise: string;                                       // stored leaf
  sets: LoggedSet[];
  onAddSet: (weight: number | null, reps: number, warmup: boolean, repsRight: number | null) => Promise<void>;
  onUpdateSet: (setId: number, weight: number | null, reps: number, warmup: boolean, repsRight: number | null) => Promise<void>;
  onDeleteSet: (setId: number) => void;
  workWeight?: number | null;                             // persisted working weight, pre-fills new working sets
  onWorkWeightChange?: (weight: number | null) => void;   // persist an edit to it
  setting?: string | null;                                // persisted machine-setting override (per base)
  onSettingChange?: (setting: string | null) => void;     // persist an edit to it
  unilateral?: boolean;                                   // set in the program: log reps per side (Gauche / Droite), shared weight
  repGoal?: number | null;                                // target reps/working set; reaching it on average cues a weight increase
  onValidate?: () => void;                                // shows a "Valider l'exercice" button inside the card
}

export function FitSessionExercise({ exercise, sets, onAddSet, onUpdateSet, onDeleteSet, workWeight, onWorkWeightChange, setting, onSettingChange, unilateral, repGoal, onValidate }: Props) {
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');           // left side when unilateral
  const [repsRight, setRepsRight] = useState(''); // right side, unilateral only
  // Guided sequence. The warmup is always exactly WARMUP_SETS sets, then it moves
  // on to the working sets automatically (no "end warmup" step). Resume at the
  // right step: any working set, or the warmup already complete → work; some
  // warmup logged → warming up; nothing → not started.
  type Phase = 'start' | 'warmup' | 'work';
  const [phase, setPhase] = useState<Phase>(
    sets.some(s => !s.warmup) || sets.filter(s => s.warmup).length >= WARMUP_SETS ? 'work'
      : sets.some(s => s.warmup) ? 'warmup' : 'start',
  );
  const warmupMode = phase !== 'work';   // sets are warmups until the warmup ends
  const hasWork = sets.some(s => !s.warmup);
  // Can't finish the exercise before a working set is in.
  const stepDisabled = phase === 'work' && !hasWork;
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);  // set being edited, else adding a new one
  const [adding, setAdding] = useState(false);                      // add form opened via "Ajouter une série"
  const [workWeightStr, setWorkWeightStr] = useState(workWeight != null ? String(workWeight) : '');

  const baseName = exercise.split(' — ')[0];
  // Only assistance-based exercises (negative weight = aide) get the sign toggle.
  const showSign = baseName === 'Tractions';
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
  const repsRightNum = parseInt(repsRight, 10);
  const weightNum = weight.trim() === '' ? null : parseFloat(weight.replace(',', '.'));
  const valid = Number.isFinite(repsNum) && repsNum > 0
    && (!unilateral || (Number.isFinite(repsRightNum) && repsRightNum > 0))
    && (weightNum === null || Number.isFinite(weightNum));

  // Negative weight = assistance (aide), positive = added load (lest). The sign
  // toggle flips it, since the mobile number pad has no minus key.
  const negative = weight.trim().startsWith('-');
  function flipSign() {
    setWeight(w => {
      const t = w.trim();
      if (t === '' || t === '-') return t === '-' ? '' : '-';
      return t.startsWith('-') ? t.slice(1) : `-${t}`;
    });
  }

  function openAdd() {
    setEditingId(null);
    if (warmupMode) {
      // Pre-fill the warmup set from the working weight: set 1 ≈ 33%, set 2 ≈ 66%
      // (rounded to the kg), with a suggested rep count. Both stay editable.
      // Pull-ups are a special case: fixed assistance (negative) per warmup set.
      const idx = Math.min(sets.filter(s => s.warmup).length, WARMUP_SETS - 1);
      const wwBasis = workWeightStr.trim() !== '' ? parseFloat(workWeightStr.replace(',', '.')) : (workWeight ?? NaN);
      const w = baseName === 'Tractions'
        ? TRACTIONS_WARMUP_ASSIST[idx]
        : Number.isFinite(wwBasis) ? Math.round(wwBasis * WARMUP_PCT[idx]) : null;
      const reps = String(WARMUP_REPS[idx]);
      setWeight(w != null ? String(w) : '');
      setReps(reps);
      setRepsRight(unilateral ? reps : '');
    } else {
      // A working set pre-fills the working weight.
      setWeight(workWeightStr);
      setReps('');
      setRepsRight('');
    }
    setAdding(true);
  }

  // Start the warmup. (Warmup → work happens on its own after WARMUP_SETS sets.)
  function advancePhase() {
    if (phase === 'start') setPhase('warmup');
  }

  function startEdit(s: LoggedSet) {
    setAdding(false);
    setEditingId(s.id);
    setReps(String(s.reps));
    setRepsRight(s.reps_right == null ? '' : String(s.reps_right));
    setWeight(s.weight == null ? '' : String(s.weight));
  }

  function reset() {
    setEditingId(null);
    setAdding(false);
    setWeight('');
    setReps('');
    setRepsRight('');
  }

  async function submit() {
    if (!valid || saving) return;
    // Editing keeps the set's own type; a new set inherits the warmup phase.
    const isWarmup = editingId != null
      ? (sets.find(s => s.id === editingId)?.warmup ?? false)
      : warmupMode;
    const rr = unilateral ? repsRightNum : null;
    setSaving(true);
    try {
      if (editingId != null) await onUpdateSet(editingId, weightNum, repsNum, isWarmup, rr);
      else await onAddSet(weightNum, repsNum, isWarmup, rr);
      reset();
      // The warmup is exactly WARMUP_SETS sets: once they're in, move to working.
      if (editingId == null && isWarmup && sets.filter(s => s.warmup).length + 1 >= WARMUP_SETS) {
        setPhase('work');
      }
    } catch {
      /* cancelled (or failed): keep the entered values so the user can retry */
    } finally {
      setSaving(false);
    }
  }

  // text-base (16px) is required on the inputs: iOS Safari auto-zooms any
  // focused input whose font-size is under 16px.
  const inputClass = 'w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2 text-center text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none';

  // The weight input, its label centered over the field. Assistance-based
  // exercises (showSign) get a +/- toggle to its left — the mobile number pad
  // has no minus key — and the label reads "Aide" while the value is negative.
  const weightInput = (
    <label className="flex-1 text-center text-xs text-slate-100">
      {negative ? 'Aide (kg)' : 'Poids (kg)'}
      <input
        value={weight}
        onChange={e => setWeight(e.target.value.replace(',', '.'))}
        inputMode="decimal"
        className={`mt-1 ${inputClass}`}
      />
    </label>
  );
  const weightField = showSign ? (
    <div className="flex flex-1 items-end gap-1">
      <button
        type="button"
        onClick={flipSign}
        aria-label="Inverser le signe : aide (−) ou lest (+)"
        className="mb-px flex h-[42px] w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/60 text-sm font-semibold text-slate-300 transition-colors active:bg-slate-800"
      >
        +/−
      </button>
      {weightInput}
    </div>
  ) : weightInput;

  // The logged sets, split into the two table columns; at least 3 rows so
  // there's always room to fill in (extends past 3 as needed). Same bordered
  // table as the past-session view (FitSetList), but each cell is tappable to
  // edit that set.
  const warmupSets = sets.filter(s => s.warmup);
  const workSets = sets.filter(s => !s.warmup);
  const setRows = Math.max(3, warmupSets.length, workSets.length);

  // Progression cue: average the working sets' reps (per side when unilateral);
  // once the average reaches the goal, it's time to add weight.
  const repAvg = workSets.length
    ? workSets.reduce((sum, s) => sum + (s.reps_right != null ? (s.reps + s.reps_right) / 2 : s.reps), 0) / workSets.length
    : null;
  const repAvgStr = repAvg == null ? '' : Number.isInteger(repAvg) ? String(repAvg) : repAvg.toFixed(1);
  const goalReached = repGoal != null && repAvg != null && repAvg >= repGoal;
  const cell = 'border border-slate-700 text-center';

  const english = exerciseEnglish(baseName);
  // Smaller boxes than the set-entry inputs; the value text matches the label size.
  const fieldInput = 'rounded-lg border border-slate-700 bg-slate-800/60 px-2 py-1 text-center text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none';

  // One table cell: a tappable set, or an empty "—" placeholder.
  function SetCell({ s, dim }: { s: LoggedSet | undefined; dim?: boolean }) {
    if (!s) return <td className={`${cell} px-2 py-1 text-slate-600`}>—</td>;
    const isEditing = editingId === s.id;
    return (
      <td className={cell}>
        <button
          type="button"
          onClick={() => (isEditing ? reset() : startEdit(s))}
          className={`w-full px-2 py-1 transition-colors active:bg-slate-800 ${
            isEditing ? 'text-emerald-400' : dim ? 'text-slate-400' : 'font-medium text-slate-100'
          }`}
        >
          {formatSet(s.weight, s.reps, false, s.reps_right)}
        </button>
      </td>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800/30 px-4 py-4">
      <p className="text-center font-medium text-slate-100">{leafLabel(exercise)}</p>
      {english && <p className="text-center text-xs text-slate-400">{english}</p>}
      <ExerciseMuscles leaf={exercise} />

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

      {/* Separates the exercise's settings from its sets and logging actions. */}
      <div className="mt-4 h-px w-full bg-slate-700" />

      <table className="mt-3 w-full table-fixed border-collapse text-sm">
        <thead>
          <tr>
            <th className={`${cell} w-1/2 px-2 py-1 text-xs font-normal uppercase tracking-wide text-slate-500`}>Échauffement</th>
            <th className={`${cell} w-1/2 px-2 py-1 text-xs font-normal uppercase tracking-wide text-white`}>Travail</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: setRows }, (_, i) => (
            <tr key={i}>
              <SetCell s={warmupSets[i]} dim />
              <SetCell s={workSets[i]} />
            </tr>
          ))}
        </tbody>
      </table>

      {repGoal != null && repAvg != null && (
        <p className="mt-3 text-center text-xs">
          {goalReached ? (
            <span className="font-medium text-emerald-400">Objectif atteint ({repAvgStr} de moyenne). Passe au poids supérieur.</span>
          ) : (
            <span className="text-slate-400">Objectif : {repGoal} reps. Moyenne actuelle : {repAvgStr}.</span>
          )}
        </p>
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
          {editingId != null && (
            <button
              type="button"
              onClick={() => { const id = editingId; reset(); onDeleteSet(id); }}
              aria-label="Supprimer la série"
              className="absolute left-2 top-2 text-slate-500 transition-colors active:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <p className="text-center text-xs font-medium text-slate-400">
            {(editingId != null ? (sets.find(s => s.id === editingId)?.warmup ?? false) : warmupMode)
              ? 'Échauffement' : 'Série de travail'}
          </p>

          {unilateral ? (
            // Per-side: Gauche / Droite reps on one row, then the shared weight.
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex items-end gap-2">
                <label className="flex-1 text-center text-xs text-slate-100">
                  Gauche
                  <input value={reps} onChange={e => setReps(e.target.value)} inputMode="numeric" className={`mt-1 ${inputClass}`} />
                </label>
                <label className="flex-1 text-center text-xs text-slate-100">
                  Droite
                  <input value={repsRight} onChange={e => setRepsRight(e.target.value)} inputMode="numeric" className={`mt-1 ${inputClass}`} />
                </label>
              </div>
              <div className="flex items-end gap-2">
                {weightField}
                <button
                  type="button"
                  onClick={submit}
                  disabled={!valid || saving}
                  aria-label={editingId != null ? 'Valider la modification' : 'Ajouter la série'}
                  className="mb-px flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white transition-colors active:bg-emerald-500 disabled:opacity-40"
                >
                  <Check className="h-5 w-5" />
                </button>
              </div>
            </div>
          ) : (
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
              {weightField}
              <button
                type="button"
                onClick={submit}
                disabled={!valid || saving}
                aria-label={editingId != null ? 'Valider la modification' : 'Ajouter la série'}
                className="mb-px flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white transition-colors active:bg-emerald-500 disabled:opacity-40"
              >
                <Check className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-4">
          {/* Two steps only: start the warmup, then finish the exercise. The
              warmup ends on its own after WARMUP_SETS sets; finishing is gated on
              a working set being logged. */}
          {(phase === 'start' || (phase === 'work' && onValidate)) && (
            <>
              <div className="h-px w-full bg-slate-700" />
              <button
                type="button"
                onClick={phase === 'work' ? onValidate : advancePhase}
                disabled={stepDisabled}
                className="rounded-xl border border-slate-700 bg-slate-800/50 px-3.5 py-1.5 text-xs font-medium text-slate-100 transition-colors active:bg-slate-800 disabled:opacity-40 disabled:active:bg-slate-800/50"
              >
                {phase === 'start' ? "Commencer l'échauffement" : "Terminer l'exercice"}
              </button>
            </>
          )}

          {/* Always set off from the step button above. */}
          <div className="h-px w-full bg-slate-700" />

          {/* Below the step button; logging only opens once the warmup starts. */}
          <button
            type="button"
            onClick={openAdd}
            disabled={phase === 'start'}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-sm font-medium text-slate-100 transition-colors active:bg-slate-800 disabled:opacity-40 disabled:active:bg-slate-800/50"
          >
            <Plus className="h-4 w-4" />
            Ajouter une série
          </button>
        </div>
      )}
    </div>
  );
}
