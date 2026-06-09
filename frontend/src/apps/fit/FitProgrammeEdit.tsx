import { Fragment, useEffect, useState, type ReactNode } from 'react';
import axios from 'axios';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { MusclePicker } from './MusclePicker';
import { MUSCLES, SPLITS } from './programData';

// Editing an existing program. Instead of a linear wizard, a left rail of
// sections (Split, Séries de travail, then one per muscle) lets the user jump
// to and edit any part at will. Every change saves immediately.
// Keep the working-sets range in sync with WORK_SETS_MIN/MAX in fit.py.
const WORK_SETS_OPTIONS = [2, 3, 4, 5, 6];

interface Props {
  split: string;
  workSets: number | null;
  onSplitChange: (s: string) => void;
  onWorkSetsChange: (n: number) => void;
  onBack: () => void;
}

export function FitProgrammeEdit({ split, workSets, onSplitChange, onWorkSetsChange, onBack }: Props) {
  const [active, setActive] = useState('split');   // 'split' | 'sets' | a muscle name
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fitRequest(() => axios.get<{ selections: Record<string, string[]> }>('/api/fit/exercises'))
      .then(res => setSelections(res.data.selections ?? {}))
      .catch(() => { /* start empty */ })
      .finally(() => setLoading(false));
  }, []);

  function chooseSplit(s: string) {
    onSplitChange(s);
    fitRequest(() => axios.put('/api/fit/profile', { split: s })).catch(() => {});
  }

  function chooseSets(n: number) {
    onWorkSetsChange(n);
    fitRequest(() => axios.put('/api/fit/profile', { work_sets: n })).catch(() => {});
  }

  function toggleExercise(muscle: string, id: string) {
    setSelections(prev => {
      const cur = prev[muscle] ?? [];
      const next = cur.includes(id) ? cur.filter(e => e !== id) : [...cur, id];
      fitRequest(() => axios.put('/api/fit/exercises', { muscle, exercises: next })).catch(() => {});
      return { ...prev, [muscle]: next };
    });
  }

  // Split + working sets first, then one entry per muscle (a divider sits
  // before the muscle list).
  const sections = [
    { key: 'split', label: 'Split' },
    { key: 'sets', label: 'Séries de travail' },
    ...MUSCLES.map(m => ({ key: m.name, label: m.name })),
  ];

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 py-1 text-slate-300 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-5 w-5" />
        <span>Précédent</span>
      </button>

      <div className="mt-4 flex gap-3">
        <nav className="flex w-28 shrink-0 flex-col gap-1" aria-label="Sections du programme">
          {sections.map((s, i) => (
            <Fragment key={s.key}>
              {i === 2 && <div className="my-1 h-px bg-slate-800" />}
              <button
                type="button"
                onClick={() => setActive(s.key)}
                aria-current={active === s.key ? 'true' : undefined}
                className={`rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
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

        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="flex justify-center pt-6">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : active === 'split' ? (
            <Section title="Split">
              <div className="flex flex-col gap-2.5">
                {SPLITS.map(({ key, label }) => (
                  <Choice key={key} active={key === split} onClick={() => chooseSplit(key)}>{label}</Choice>
                ))}
              </div>
            </Section>
          ) : active === 'sets' ? (
            <Section title="Séries de travail">
              <div className="grid grid-cols-5 gap-2">
                {WORK_SETS_OPTIONS.map(n => (
                  <Choice key={n} active={n === workSets} onClick={() => chooseSets(n)}>{n}</Choice>
                ))}
              </div>
            </Section>
          ) : (
            <Section title={active}>
              {(() => {
                const muscle = MUSCLES.find(m => m.name === active)!;
                return (
                  <MusclePicker
                    key={muscle.name}
                    muscle={muscle}
                    selected={selections[muscle.name] ?? []}
                    onToggle={id => toggleExercise(muscle.name, id)}
                  />
                );
              })()}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
      <div className="mt-4">{children}</div>
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
