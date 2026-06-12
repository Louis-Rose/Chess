import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { groupExercises, MUSCLE_LEAVES, MUSCLE_ORDER, sortLabels } from './programData';
import { FitExerciseRecent } from './FitExerciseRecent';
import { FitBackButton } from './FitBackButton';

// Per-exercise recency: for each program exercise (grouped by muscle, by base),
// the calendar days since it was last done. Reached from the "Jours moyens
// depuis un exercice" card on Accueil. Display-only.

interface RecencyEntry { name: string; variants: string[]; days: number | null }
export interface RecencyGroup { name: string; entries: RecencyEntry[] }

const baseOf = (leaf: string) => {
  const i = leaf.indexOf(' — ');
  return i === -1 ? leaf : leaf.slice(0, i);
};

// Build the muscle-grouped recency list from the last-done leaves and the
// program selections, plus the average days over exercises already done.
export function buildRecency(
  lastDone: { exercise: string; days: number }[],
  selections: Record<string, string[]>,
): { avgDays: number | null; groups: RecencyGroup[] } {
  const byBase: Record<string, number> = {};
  for (const e of lastDone) {
    const b = baseOf(e.exercise);
    if (byBase[b] == null || e.days < byBase[b]) byBase[b] = e.days;
  }
  const groups = MUSCLE_ORDER
    .map(m => {
      const valid = (selections[m] ?? []).filter(l => MUSCLE_LEAVES[m]?.has(l));
      const entries = groupExercises(sortLabels(valid)).map(g => ({ ...g, days: byBase[g.name] ?? null }));
      return { name: m, entries };
    })
    .filter(g => g.entries.length > 0);

  const done = groups.flatMap(g => g.entries).map(e => e.days).filter((d): d is number => d != null);
  const avgDays = done.length ? Math.round(done.reduce((a, b) => a + b, 0) / done.length) : null;
  return { avgDays, groups };
}

const daysLabel = (d: number | null) => {
  if (d == null) return 'Jamais';
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return 'Hier';
  return `${d} jours`;
};

export function FitExerciseRecency({ groups, onBack }: { groups: RecencyGroup[]; onBack: () => void }) {
  const [open, setOpen] = useState<string | null>(null);   // expanded exercise (base name)
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <FitBackButton onClick={onBack} />

      <h1 className="mt-4 text-center text-2xl font-semibold">Jours par exercice</h1>

      {groups.length === 0 ? (
        <p className="mt-10 text-center text-sm text-slate-400">Aucun exercice dans le programme.</p>
      ) : (
        <div className="mx-auto mt-8 flex w-full max-w-[22rem] flex-col gap-6">
          {groups.map(g => (
            <section key={g.name}>
              <h2 className="text-center text-xs uppercase tracking-wide text-slate-500">{g.name}</h2>
              <div className="mt-2 flex flex-col gap-2">
                {g.entries.map(entry => {
                  const label = (
                    <>
                      <div className="min-w-0 flex-1 text-center">
                        <div className="truncate text-slate-100">{entry.name}</div>
                        {entry.variants.length > 0 && (
                          <div className="truncate text-sm text-slate-400">({entry.variants.join(', ')})</div>
                        )}
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-sm tabular-nums text-slate-300">
                        {daysLabel(entry.days)}
                      </span>
                    </>
                  );
                  const cls = 'flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3';
                  // Done exercises expand to their past sessions; never-done are inert.
                  if (entry.days == null) return <div key={entry.name} className={cls}>{label}</div>;
                  const isOpen = open === entry.name;
                  return (
                    <div key={entry.name} className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : entry.name)}
                        className={`${cls} w-full transition-colors active:bg-slate-800`}
                      >
                        {label}
                        {isOpen
                          ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" />
                          : <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />}
                      </button>
                      {isOpen && <FitExerciseRecent exercise={entry.name} />}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
