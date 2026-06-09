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

  // Split + working sets first, then one entry per muscle. Rail labels are
  // shortened to keep it narrow; the full name still shows as the section
  // heading. A thin separator is drawn between every entry.
  const sections = [
    { key: 'split', label: 'Split' },
    { key: 'sets', label: 'Séries' },
    ...MUSCLES.map(m => ({ key: m.name, label: m.name === 'Ischio-jambiers' ? 'Ischios' : m.name })),
  ];

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 py-1 text-xs text-slate-300 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Précédent</span>
      </button>

      <div className="mt-4 flex gap-2">
        <nav className="flex w-24 shrink-0 flex-col gap-1 self-start rounded-xl border border-slate-800 bg-slate-800/20 p-1.5" aria-label="Sections du programme">
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
          {/* Heading pinned at the top; the body fills and centers below it. */}
          <h2 className="mt-8 text-center text-lg font-semibold text-slate-100">
            {active === 'split' ? 'Training split' : active === 'sets' ? 'Séries de travail' : active}
          </h2>
          <div className="flex flex-1 flex-col justify-center pt-2">
            {loading ? (
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
                    muscle={muscle}
                    selected={selections[muscle.name] ?? []}
                    onToggle={id => toggleExercise(muscle.name, id)}
                  />
                );
              })()
            )}
          </div>
        </div>
      </div>
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
