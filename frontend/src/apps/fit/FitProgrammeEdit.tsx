import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import axios from 'axios';
import { Loader2, Plus } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { MusclePicker } from './MusclePicker';
import { FitBackButton } from './FitBackButton';
import { FitCustomExerciseForm, newCustomDraft, editCustomDraft, type CustomDraft } from './FitCustomExercises';
import { useCustomExercises } from './useCustomExercises';
import { MUSCLES, SPLITS, exercisesForMuscle, variantId, type CustomExercise, type FitProgram } from './programData';

// Editing one program. A left rail of sections (Nom, Split, Séries, then one per
// muscle) lets the user jump to and edit any part at will — this is also how a
// freshly created (empty) program is filled in. Every change saves immediately
// to the program-scoped endpoints.
// Keep the working-sets range / name length in sync with fit.py.
const WORK_SETS_OPTIONS = [2, 3, 4, 5, 6];
const NAME_MAX = 60;

export function FitProgrammeEdit({ program, onBack }: { program: FitProgram; onBack: () => void }) {
  const [active, setActive] = useState('name');   // 'name' | 'split' | 'sets' | a muscle name
  const [name, setName] = useState(program.name);
  const [split, setSplit] = useState<string | null>(program.split);
  const [workSets, setWorkSets] = useState<number | null>(program.work_sets);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const { customExercises, reloadCustom } = useCustomExercises();
  const [customDraft, setCustomDraft] = useState<CustomDraft | null>(null);

  const base = `/api/fit/programs/${program.id}`;

  const loadSelections = useCallback(() => {
    return fitRequest(() => axios.get<{ selections: Record<string, string[]> }>(`${base}/exercises`))
      .then(res => setSelections(res.data.selections ?? {}))
      .catch(() => { /* start empty */ })
      .finally(() => setLoading(false));
  }, [base]);

  useEffect(() => { loadSelections(); }, [loadSelections]);

  // Custom exercises of the active muscle get an edit pencil in the picker.
  const editableNames = useMemo(
    () => new Set(customExercises.filter(c => c.muscle === active).map(c => c.name)),
    [customExercises, active]
  );

  function openEditCustom(name: string) {
    const c = customExercises.find(x => x.muscle === active && x.name === name);
    if (c) setCustomDraft(editCustomDraft(c));
  }

  // A newly created exercise is selected into the program by default (all its
  // variant leaves, or its bare name when it has none).
  function autoSelectCustom(saved: CustomExercise) {
    const leaves = saved.variants.length ? saved.variants.map(v => variantId(saved.name, v)) : [saved.name];
    setSelections(prev => {
      const next = Array.from(new Set([...(prev[saved.muscle] ?? []), ...leaves]));
      fitRequest(() => axios.put(`${base}/exercises`, { muscle: saved.muscle, exercises: next })).catch(() => {});
      return { ...prev, [saved.muscle]: next };
    });
  }

  function onCustomSaved(saved: CustomExercise, wasNew: boolean) {
    setCustomDraft(null);
    reloadCustom();
    if (wasNew) autoSelectCustom(saved);
    else loadSelections();   // a rename remaps stored leaves server-side
  }

  // Swipe-left delete on a custom exercise card (catalogue exercises aren't
  // deletable, so they never get this).
  async function deleteCustom(name: string) {
    const c = customExercises.find(x => x.muscle === active && x.name === name);
    if (!c) return;
    try {
      await fitRequest(() => axios.delete(`/api/fit/custom-exercises/${c.id}`));
      reloadCustom();
      loadSelections();      // it was dropped from the program server-side
    } catch { /* keep shown */ }
  }

  function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === program.name) return;
    fitRequest(() => axios.put(base, { name: trimmed })).catch(() => {});
  }

  function chooseSplit(s: string) {
    setSplit(s);
    fitRequest(() => axios.put(base, { split: s })).catch(() => {});
  }

  function chooseSets(n: number) {
    setWorkSets(n);
    fitRequest(() => axios.put(base, { work_sets: n })).catch(() => {});
  }

  function toggleExercise(muscle: string, id: string) {
    setSelections(prev => {
      const cur = prev[muscle] ?? [];
      const next = cur.includes(id) ? cur.filter(e => e !== id) : [...cur, id];
      fitRequest(() => axios.put(`${base}/exercises`, { muscle, exercises: next })).catch(() => {});
      return { ...prev, [muscle]: next };
    });
  }

  // Name + split + working sets first, then one entry per muscle. Rail labels are
  // shortened to keep it narrow; the full name still shows as the section
  // heading. A thin separator is drawn between every entry.
  const sections = [
    { key: 'name', label: 'Nom' },
    { key: 'split', label: 'Split' },
    { key: 'sets', label: 'Séries' },
    ...MUSCLES.map(m => ({ key: m.name, label: m.name === 'Ischio-jambiers' ? 'Ischios' : m.name })),
  ];

  const heading = active === 'split' ? 'Training split'
    : active === 'sets' ? 'Séries de travail'
    : active;

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <FitBackButton onClick={onBack} />

      <div className="mt-4 flex gap-2">
        <nav className="flex w-24 shrink-0 flex-col gap-1 self-start rounded-xl border border-slate-700 bg-slate-800/20 p-1.5" aria-label="Sections du programme">
          {sections.map((s, i) => (
            <Fragment key={s.key}>
              {i > 0 && <div className="my-1 h-px bg-slate-800" />}
              <button
                type="button"
                onClick={() => setActive(s.key)}
                aria-current={active === s.key ? 'true' : undefined}
                className={`rounded-lg px-1.5 py-2 text-left text-[13px] leading-tight transition-colors ${
                  active === s.key
                    ? 'bg-emerald-500/10 font-medium text-emerald-300'
                    : 'text-slate-400 active:bg-slate-800/60'
                }`}
              >
                {s.label}
              </button>
            </Fragment>
          ))}
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Heading pinned at the top; the body fills and centers below it.
              On the Nom section the heading itself is the editable name field. */}
          {active === 'name' ? (
            <input
              type="text"
              value={name}
              maxLength={NAME_MAX}
              onChange={e => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              aria-label="Nom du programme"
              className="mt-12 w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-center text-lg font-semibold text-slate-100 outline-none transition-colors focus:border-emerald-500"
            />
          ) : (
            <h2 className="mt-12 text-center text-lg font-semibold text-slate-100">{heading}</h2>
          )}
          <div className="flex flex-1 flex-col justify-center pt-2">
            {active === 'name' ? null : loading ? (
              <div className="flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
              </div>
            ) : active === 'split' ? (
              <div className="flex flex-col gap-2.5">
                {SPLITS.map(({ key, label }) => (
                  <Choice key={key} active={key === split} onClick={() => chooseSplit(key)}>{label}</Choice>
                ))}
              </div>
            ) : active === 'sets' ? (
              <div className="grid grid-cols-5 gap-2">
                {WORK_SETS_OPTIONS.map(n => (
                  <Choice key={n} active={n === workSets} onClick={() => chooseSets(n)}>{n}</Choice>
                ))}
              </div>
            ) : (
              <>
                <MusclePicker
                  key={active}
                  exercises={exercisesForMuscle(active)}
                  ariaLabel={`Exercices ${active}`}
                  selected={selections[active] ?? []}
                  onToggle={id => toggleExercise(active, id)}
                  editableNames={editableNames}
                  onEdit={openEditCustom}
                  onDelete={deleteCustom}
                />
                <button
                  type="button"
                  onClick={() => setCustomDraft(newCustomDraft(active))}
                  className="mx-auto mt-8 inline-flex w-full max-w-[18rem] items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors active:bg-slate-800/60"
                >
                  <Plus className="h-4 w-4" />
                  Créer un exercice
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {customDraft && (
        <FitCustomExerciseForm
          muscle={active}
          draft={customDraft}
          onClose={() => setCustomDraft(null)}
          onSaved={onCustomSaved}
        />
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
