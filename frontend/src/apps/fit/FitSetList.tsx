import { formatSet } from './format';

// The set list shown inside an exercise card: one line per set, "reps × weight"
// with the "×" kept on the card centerline; warmups dimmed and parenthesized.
// Shared by FitSessionDetail and FitExerciseRecent.

export interface DisplaySet { reps: number; weight: number | null; warmup: boolean; }

export function FitSetList({ sets }: { sets: DisplaySet[] }) {
  return (
    <ul className="mt-2 flex w-44 flex-col gap-1.5">
      {sets.map((s, i) => (
        <li key={i} className={`text-sm ${s.warmup ? 'text-slate-400' : 'text-slate-200'}`}>
          {s.weight != null ? (
            <span className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-x-1.5">
              <span className="text-right">{s.warmup ? '(' : ''}{s.reps}</span>
              <span>×</span>
              <span className="text-left">{s.weight} kg{s.warmup ? ')' : ''}</span>
            </span>
          ) : (
            formatSet(s.weight, s.reps, s.warmup)
          )}
        </li>
      ))}
    </ul>
  );
}
