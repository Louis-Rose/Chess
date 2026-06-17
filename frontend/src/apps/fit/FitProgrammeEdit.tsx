import { Fragment, useEffect, useState, type ReactNode } from 'react';
import axios from 'axios';
import { Loader2, Trash2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { MusclePicker } from './MusclePicker';
import { FitBackButton } from './FitBackButton';
import { MUSCLES, SPLITS, type FitProgram } from './programData';

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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const base = `/api/fit/programs/${program.id}`;

  useEffect(() => {
    fitRequest(() => axios.get<{ selections: Record<string, string[]> }>(`${base}/exercises`))
      .then(res => setSelections(res.data.selections ?? {}))
      .catch(() => { /* start empty */ })
      .finally(() => setLoading(false));
  }, [base]);

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

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    try {
      await fitRequest(() => axios.delete(base));
      onBack();   // back to the list, which refetches
    } catch {
      setDeleting(false);   // keep the editor open on failure
    }
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
              (() => {
                const muscle = MUSCLES.find(m => m.name === active)!;
                return (
                  <MusclePicker
                    key={muscle.name}
                    exercises={muscle.exercises}
                    ariaLabel={`Exercices ${muscle.name}`}
                    selected={selections[muscle.name] ?? []}
                    onToggle={id => toggleExercise(muscle.name, id)}
                  />
                );
              })()
            )}
          </div>
        </div>
      </div>

      {confirmingDelete ? (
        <div className="mt-12 flex flex-col items-center gap-3">
          <p className="text-sm text-slate-300">Supprimer ce programme ?</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors active:bg-slate-800"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={deleting}
              className="rounded-lg bg-red-600/90 px-3 py-1.5 text-xs font-semibold text-white transition-colors active:bg-red-600 disabled:opacity-60"
            >
              Supprimer
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-12 flex justify-center">
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors active:bg-red-950/50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Supprimer le programme
          </button>
        </div>
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
