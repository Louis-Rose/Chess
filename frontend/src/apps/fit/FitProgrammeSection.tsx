import { Fragment, useMemo, type ReactNode } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { MusclePicker } from './MusclePicker';
import { FitCustomExerciseForm, newCustomDraft, editCustomDraft } from './FitCustomExercises';
import { MUSCLES, SPLITS, exercisesForMuscle, type Split } from './programData';
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

// "Quels exercices pour <le dos / les épaules> ?" — only Dos is singular.
const musclePhrase = (m: string) => (m === 'Dos' ? 'le dos' : `les ${m.toLowerCase()}`);

// The guiding question shown as each section's heading — shared by the create
// wizard and the rail editor of an existing program.
export const sectionQuestion = (section: string) =>
  section === 'name' ? 'Comment veux-tu nommer ce programme ?'
    : section === 'split' ? 'Quel split veux-tu suivre ?'
    : section === 'sets' ? 'Combien de séries de travail par exercice ?'
    : `Quels exercices pour ${musclePhrase(section)} ?`;

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
        {SPLITS.map(s => (
          <Fragment key={s.key}>
            <Choice active={s.key === split} onClick={() => chooseSplit(s.key)}>{s.label}</Choice>
            {s.key === split && <SplitDefinition split={s} />}
          </Fragment>
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

// The breakdown of the selected split, shown right under it: one line per
// session ("Séance N : …"), or a free-form note when there is no fixed cycle.
function SplitDefinition({ split }: { split: Split }) {
  return (
    <div className="-mt-0.5 rounded-lg bg-slate-800/40 px-3.5 py-2.5 text-left text-sm">
      {split.note ? (
        <p className="text-slate-300">{split.note}</p>
      ) : (
        <>
          {split.example && <p className="mb-1 text-xs text-slate-400">Par exemple :</p>}
          {/* Long breakdowns (e.g. Body part) spread over two columns to stay compact. */}
          <ul className={(split.sessions?.length ?? 0) >= 4 ? 'grid grid-cols-2 gap-x-3 gap-y-0.5' : 'flex flex-col gap-0.5'}>
            {split.sessions?.map((s, i) => (
              <li key={i} className="text-slate-300">
                <span className="font-medium text-slate-100">Séance {i + 1}</span> : {s}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
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
