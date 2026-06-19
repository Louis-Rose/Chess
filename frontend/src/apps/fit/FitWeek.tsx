import { Check } from 'lucide-react';
import { splitLabel } from './programData';
import { weekDays, type WeekDay } from './splitDays';

// The per-week plan for the Calendrier, driven by splitDays: the active
// program's split lays out the week's sessions, shown done/à venir.

// The week's planned sessions for the Calendrier: the split's days, the
// first `doneThisWeek` marked done and the rest "à venir". Returns null when
// there's no plan (no split chosen, or none with a fixed/known layout).
export function FitWeekPlan({ split, bodyPartOrder, doneThisWeek }: {
  split: string | null;
  bodyPartOrder: string[];
  doneThisWeek: number;
}) {
  const days: WeekDay[] = weekDays(split, bodyPartOrder);
  if (!split || days.length === 0) return null;

  return (
    <div className="mx-auto mt-6 w-full max-w-[22rem]">
      <h2 className="text-center text-xs uppercase tracking-wide text-slate-500">
        Cette semaine · {splitLabel(split)}
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {days.map((d, i) => {
          const done = i < doneThisWeek;
          return (
            <li
              key={i}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                done ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/30'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  done ? 'border-emerald-500 bg-emerald-500 text-slate-900' : 'border-slate-600 text-transparent'
                }`}
              >
                <Check className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 text-sm">
                <span className="font-medium text-slate-400">Séance {i + 1}</span>
                <span className="mx-1.5 text-slate-600">·</span>
                <span className="text-slate-100">{d.label}</span>
              </span>
              {!done && <span className="text-xs text-slate-500">à venir</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
