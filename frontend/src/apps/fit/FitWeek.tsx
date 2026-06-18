import { Check } from 'lucide-react';
import { splitLabel } from './programData';
import { weekDays, type WeekDay } from './splitDays';

// Start-of-week split picker and the per-week plan, both driven by splitDays.
// A program can carry several splits; at the first session of the week the user
// picks which one applies (FitWeekSplitPicker). The chosen split then lays out
// the week's sessions, shown done/à venir on the Calendrier (FitWeekPlan).

// Full-screen overlay shown before a fresh session when the week's split hasn't
// been chosen yet and there's more than one option. Each option previews its
// session breakdown.
export function FitWeekSplitPicker({ options, bodyPartOrder, onChoose }: {
  options: { key: string; label: string }[];
  bodyPartOrder: string[];
  onChoose: (key: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-slate-900 text-slate-100">
      <div className="flex flex-1 flex-col justify-center overflow-y-auto px-5 py-10">
        <div className="mx-auto flex w-full max-w-[22rem] flex-col">
          <h2 className="text-center text-xl font-semibold">Quel split cette semaine ?</h2>

          <div className="mt-12 flex flex-col gap-4">
            {options.map(o => {
              const days = weekDays(o.key, bodyPartOrder);
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => onChoose(o.key)}
                  className="rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3.5 text-left transition-colors active:bg-slate-800"
                >
                  <span className="block font-semibold text-slate-100">{o.label}</span>
                  {days.length > 0 && (
                    <span className="mt-1 block text-sm text-slate-400">
                      {days.map(d => d.label).join(' · ')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// The week's planned sessions for the Calendrier: the chosen split's days, the
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
