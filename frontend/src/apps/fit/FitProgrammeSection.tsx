import { useMemo, type ReactNode } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { MusclePicker } from './MusclePicker';
import { FitCustomExerciseForm, newCustomDraft, editCustomDraft } from './FitCustomExercises';
import { MUSCLES, SPLITS, exercisesForMuscle } from './programData';
import type { ProgramEditor } from './useProgramEditor';

// One program section's body (the controls under the heading), shared by the
// rail editor (FitProgrammeEdit) and the guided create wizard
// (FitProgrammeWizard). `section` is 'name' | 'split' | 'sets' or a muscle name;
// all editing goes through the `editor` hook so the two views stay identical.
// Keep the working-sets range / name length in sync with fit.py.
export const WORK_SETS_OPTIONS = [2, 3, 4, 5, 6];
const NAME_MAX = 60;

// Section keys, in order: name, split, sets, then one per muscle.
export const SECTION_KEYS = ['name', 'split', 'sets', ...MUSCLES.map(m => m.name)];

export function FitProgrammeSection({ section, editor }: {
  section: string;
  editor: ProgramEditor;
}) {
  const {
    loading, name, setName, saveName, split, chooseSplit, workSets, chooseSets,
    selections, toggleExercise, customExercises, customDraft, setCustomDraft,
    onCustomSaved, deleteCustom, unilateral, saveUnilateral,
  } = editor;

  // Custom exercises of this muscle get an edit pencil + swipe-to-delete.
  const editableNames = useMemo(
    () => new Set(customExercises.filter(c => c.muscle === section).map(c => c.name)),
    [customExercises, section]
  );

  function openEditCustom(exName: string) {
    const c = customExercises.find(x => x.muscle === section && x.name === exName);
    if (c) setCustomDraft(editCustomDraft(c));
  }

  if (section === 'name')
    return (
      <input
        type="text"
        value={name}
        maxLength={NAME_MAX}
        onChange={e => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        aria-label="Nom du programme"
        className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-center text-lg font-semibold text-slate-100 outline-none transition-colors focus:border-emerald-500"
      />
    );

  if (loading)
    return (
      <div className="flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );

  if (section === 'split')
    return (
      <div className="flex flex-col gap-2.5">
        {SPLITS.map(({ key, label }) => (
          <Choice key={key} active={key === split} onClick={() => chooseSplit(key)}>{label}</Choice>
        ))}
      </div>
    );

  if (section === 'sets')
    return (
      <div className="grid grid-cols-5 gap-2">
        {WORK_SETS_OPTIONS.map(n => (
          <Choice key={n} active={n === workSets} onClick={() => chooseSets(n)}>{n}</Choice>
        ))}
      </div>
    );

  // A muscle section: its exercise multi-select plus a "Créer un exercice" button.
  return (
    <>
      <MusclePicker
        key={section}
        exercises={exercisesForMuscle(section)}
        ariaLabel={`Exercices ${section}`}
        selected={selections[section] ?? []}
        onToggle={id => toggleExercise(section, id)}
        editableNames={editableNames}
        onEdit={openEditCustom}
        onDelete={exName => deleteCustom(section, exName)}
        unilateralNames={unilateral}
        onToggleUnilateral={base => saveUnilateral(base, !unilateral.has(base))}
      />
      <button
        type="button"
        onClick={() => setCustomDraft(newCustomDraft(section))}
        className="mx-auto mt-8 inline-flex w-full max-w-[18rem] items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors active:bg-slate-800/60"
      >
        <Plus className="h-4 w-4" />
        Créer un exercice
      </button>

      {customDraft && (
        <FitCustomExerciseForm
          muscle={section}
          draft={customDraft}
          onClose={() => setCustomDraft(null)}
          onSaved={onCustomSaved}
        />
      )}
    </>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex items-center justify-center rounded-xl border px-3 py-3 text-center text-sm font-medium transition-colors ${
        active
          ? 'border-emerald-500 bg-emerald-500/10 text-slate-100'
          : 'border-slate-700 bg-slate-800/50 text-slate-200 active:bg-slate-800'
      }`}
    >
      {children}
    </button>
  );
}
