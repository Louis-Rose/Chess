import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Loader2, Plus, X } from 'lucide-react';
import { MusclePicker } from './MusclePicker';
import { FitCustomExerciseForm, newCustomDraft, editCustomDraft } from './FitCustomExercises';
import { MUSCLES, SPLITS, REP_CATEGORIES, REP_GOAL_OPTIONS, exercisesForMuscle, type Priorities, type Split } from './programData';
import { FitPriorityZones } from './FitPriorityZones';
import { FitVolumeGraph } from './FitVolumeGraph';
import type { ProgramEditor } from './useProgramEditor';

// One program section's body (the controls under the heading), shared by the
// rail editor (FitProgrammeEdit) and the guided create wizard
// (FitProgrammeWizard). `section` is 'name' | 'split' | 'sets' or a muscle name;
// all editing goes through the `editor` hook so the two views stay identical.
// Keep the working-sets range / name length in sync with fit.py.
export const WORK_SETS_OPTIONS = [2, 3, 4, 5, 6];
const NAME_MAX = 60;

// Section keys, in order: name, split, priority, sets, then one per muscle. When
// the program includes a Body part split, a 'bodypart' step (the day order) is
// inserted right after 'split'.
export const sectionKeysFor = (splits: string[]) => {
  const base = ['name', 'split', 'priority', 'order', 'sets', 'reps', ...MUSCLES.map(m => m.name)];
  if (!splits.includes('body_part')) return base;
  const i = base.indexOf('split');
  return [...base.slice(0, i + 1), 'bodypart', ...base.slice(i + 1)];
};

// "Quels exercices pour les épaules / les dorsaux ?" — every muscle group reads
// naturally with a plural article.
const musclePhrase = (m: string) => `les ${m.toLowerCase()}`;

// The guiding question shown as each section's heading — shared by the create
// wizard and the rail editor of an existing program.
export const sectionQuestion = (section: string) =>
  section === 'name' ? 'Comment veux-tu nommer ce programme ?'
    : section === 'split' ? 'Quel(s) split(s) veux-tu suivre ? (choix multiples possibles)'
    : section === 'priority' ? 'Quels muscles veux-tu prioriser (points faibles) ou non (points forts) ?'
    : section === 'order' ? 'Dans quel ordre veux-tu faire tes exercices ?'
    : section === 'bodypart' ? 'Dans quel ordre veux-tu enchaîner tes séances ? (un groupe musculaire par séance)'
    : section === 'sets' ? 'Combien de séries de travail par exercice ?'
    : section === 'reps' ? 'Combien de répétitions vises-tu par série ?'
    : `Quels exercices pour ${musclePhrase(section)} ?`;

export function FitProgrammeSection({ section, editor }: {
  section: string;
  editor: ProgramEditor;
}) {
  const {
    loading, name, setName, saveName, splits, toggleSplit, workSets, chooseSets,
    priorities, setPriority,
    orderedMuscles, reorderMuscles,
    bodyPartOrder, addBodyPartDay, removeBodyPartDay, moveBodyPartDay,
    repGoals, setRepGoal,
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
            <Choice active={splits.includes(s.key)} onClick={() => toggleSplit(s.key)}>{s.label}</Choice>
            {splits.includes(s.key) && <SplitDefinition split={s} />}
          </Fragment>
        ))}
      </div>
    );

  if (section === 'priority')
    return <FitPriorityZones priorities={priorities} setPriority={setPriority} />;

  if (section === 'order')
    return <MuscleOrderSection order={orderedMuscles()} priorities={priorities} onReorder={reorderMuscles} />;

  if (section === 'bodypart')
    return (
      <BodyPartOrderSection
        order={bodyPartOrder}
        onAdd={addBodyPartDay}
        onRemove={removeBodyPartDay}
        onMove={moveBodyPartDay}
      />
    );

  if (section === 'reps')
    return (
      <div className="flex flex-col gap-6">
        {REP_CATEGORIES.map(c => (
          <div key={c.key}>
            <p className="text-center text-sm font-medium text-slate-200">{c.label}</p>
            {c.hint && <p className="mb-2 text-center text-xs text-slate-500">{c.hint}</p>}
            <div className={`grid grid-cols-3 gap-2 ${c.hint ? '' : 'mt-2'}`}>
              {REP_GOAL_OPTIONS[c.key].map(n => (
                <Choice key={n} active={repGoals[c.key] === n} onClick={() => setRepGoal(c.key, n)}>{n}</Choice>
              ))}
            </div>
          </div>
        ))}
      </div>
    );

  if (section === 'sets')
    return (
      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-5 gap-2">
          {WORK_SETS_OPTIONS.map(n => (
            <Choice key={n} active={n === workSets} onClick={() => chooseSets(n)}>{n}</Choice>
          ))}
        </div>
        {/* Volume graph below the choices, once the program has exercises. */}
        {Object.values(selections).some(a => a.length > 0) && (
          <>
            <div className="h-px w-full bg-slate-700" />
            <FitVolumeGraph selections={selections} workSets={workSets} splits={splits} bodyPartOrder={bodyPartOrder} />
          </>
        )}
      </div>
    );

  // A muscle section: its exercise multi-select plus an "Ajouter un exercice" button.
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
        Ajouter un exercice
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

// Muscle execution order: a freely drag-reorderable list (grab the handle). The
// order is unconstrained; priority badges (point faible rouge / fort vert) are
// just hints for the advice above. Touch-friendly pointer drag (no library):
// the grip captures the pointer, rows swap as it crosses a row height.
const ROW_PX = 56;   // approximate row height incl. gap, for step detection

function MuscleOrderSection({ order, priorities, onReorder }: {
  order: string[];
  priorities: Priorities;
  onReorder: (next: string[]) => void;
}) {
  const [items, setItems] = useState<string[]>(order);
  const dragFrom = useRef<number | null>(null);
  const lastY = useRef(0);
  const [dragging, setDragging] = useState<number | null>(null);

  // Resync from outside when not mid-drag (e.g. exercises added/removed).
  useEffect(() => { if (dragFrom.current == null) setItems(order); }, [order]);

  function begin(e: React.PointerEvent, i: number) {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragFrom.current = i; lastY.current = e.clientY; setDragging(i);
  }
  function moveTo(e: React.PointerEvent) {
    const from = dragFrom.current;
    if (from == null) return;
    const steps = Math.trunc((e.clientY - lastY.current) / ROW_PX);
    if (steps === 0) return;
    const to = Math.max(0, Math.min(items.length - 1, from + steps));
    if (to === from) return;
    setItems(prev => { const n = [...prev]; const [m] = n.splice(from, 1); n.splice(to, 0, m); return n; });
    lastY.current += (to - from) * ROW_PX;
    dragFrom.current = to; setDragging(to);
  }
  function end() {
    if (dragFrom.current == null) return;
    dragFrom.current = null; setDragging(null);
    onReorder(items);
  }

  return (
    <div className="mx-auto flex w-full max-w-[20rem] flex-col gap-4">
      <p className="rounded-lg bg-slate-800/40 px-3.5 py-2.5 text-left text-sm text-slate-300">
        Conseil : Travaille tes points faibles en premier, et tes points forts en fin de séance.
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((m, i) => {
          const p = priorities[m];
          return (
            <li
              key={m}
              className={`flex items-center gap-2 rounded-xl border bg-slate-800/50 px-3 py-2.5 ${
                dragging === i ? 'border-emerald-500' : 'border-slate-700'
              }`}
            >
              <span className="flex-1 text-left text-sm text-slate-100">
                {m}
                {p === 'weak' && <span className="ml-2 text-xs text-red-300">point faible</span>}
                {p === 'strong' && <span className="ml-2 text-xs text-emerald-300">point fort</span>}
              </span>
              <span
                role="button"
                aria-label={`Déplacer ${m}`}
                onPointerDown={e => begin(e, i)}
                onPointerMove={moveTo}
                onPointerUp={end}
                onPointerCancel={end}
                style={{ touchAction: 'none' }}
                className="cursor-grab touch-none rounded-lg p-1 text-slate-400 active:bg-slate-800"
              >
                <GripVertical className="h-5 w-5" />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Body part day order: the user builds an ordered list of sessions, one muscle
// group per day. Tap a muscle below to append a day; reorder with the arrows or
// remove. This sequence drives the week plan and the per-session content filter.
function BodyPartOrderSection({ order, onAdd, onRemove, onMove }: {
  order: string[];
  onAdd: (muscle: string) => void;
  onRemove: (index: number) => void;
  onMove: (index: number, dir: -1 | 1) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[20rem] flex-col gap-4">
      {order.length === 0 ? (
        <p className="rounded-lg bg-slate-800/40 px-3.5 py-2.5 text-center text-sm text-slate-400">
          Ajoute des séances dans l'ordre voulu en touchant un muscle ci-dessous.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {order.map((m, i) => (
            <li key={i} className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-3 py-2.5">
              <span className="flex-1 text-left text-sm text-slate-100">
                <span className="font-medium text-slate-400">Séance {i + 1}</span> · {m}
              </span>
              <button type="button" aria-label="Monter" disabled={i === 0} onClick={() => onMove(i, -1)} className="rounded-lg p-1 text-slate-400 active:bg-slate-800 disabled:opacity-30">
                <ArrowUp className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Descendre" disabled={i === order.length - 1} onClick={() => onMove(i, 1)} className="rounded-lg p-1 text-slate-400 active:bg-slate-800 disabled:opacity-30">
                <ArrowDown className="h-4 w-4" />
              </button>
              <button type="button" aria-label="Retirer" onClick={() => onRemove(i)} className="rounded-lg p-1 text-slate-400 active:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {MUSCLES.map(m => (
          <button
            key={m.name}
            type="button"
            onClick={() => onAdd(m.name)}
            className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors active:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            {m.name}
          </button>
        ))}
      </div>
    </div>
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
