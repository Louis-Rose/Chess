import { MUSCLE_ORDER, muscleContribution } from './programData';
import { weekDays } from './splitDays';

// Weekly training volume the program assigns to each muscle, as a horizontal bar
// per muscle group. Per selected exercise, the work-set count adds 1 to each of
// its primary muscles and 0.5 to each secondary (muscleContribution); that
// "per-passage" volume is then multiplied by how many times the split trains the
// muscle in the week. Reference lines at 10 and 20 sets/week mark the usual
// hypertrophy range. Shown in the program editor's "Volume" section.

const REF_LINES = [10, 20];
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

// Track sits between the label column (left) and the value column (right);
// the reference lines span exactly that band so they line up across all bars.
const TRACK_LEFT = '5rem';     // label 4.5rem + gap 0.5rem
const TRACK_RIGHT = '2.75rem'; // value 2.25rem + gap 0.5rem

export function FitVolumeGraph({ selections, workSets, split, bodyPartOrder }: {
  selections: Record<string, string[]>;
  workSets: number | null;
  split: string | null;
  bodyPartOrder: string[];
}) {
  if (!workSets)
    return (
      <p className="text-center text-sm text-slate-400">
        Choisis un nombre de séries pour voir le volume hebdomadaire.
      </p>
    );

  // Per-passage volume from the selected exercises (primary 1, secondary 0.5).
  const leaves = Array.from(new Set(Object.values(selections).flat()));
  const base: Record<string, number> = {};
  for (const leaf of leaves) {
    const { primary, secondary } = muscleContribution(leaf);
    for (const m of primary) base[m] = (base[m] ?? 0) + workSets;
    for (const m of secondary) base[m] = (base[m] ?? 0) + workSets * 0.5;
  }

  // Weekly frequency per muscle from the split (how many of the week's sessions
  // train it). No split → counted once (per-passage volume).
  const days = weekDays(split, bodyPartOrder);
  const freq = (m: string) => (days.length ? days.filter(d => d.muscles.includes(m)).length : 1);

  const vol: Record<string, number> = {};
  for (const m of MUSCLE_ORDER) vol[m] = (base[m] ?? 0) * freq(m);
  const max = Math.max(20, ...MUSCLE_ORDER.map(m => vol[m]));

  return (
    <div className="mx-auto w-full max-w-[22rem]">
      <h3 className="text-center text-base font-semibold uppercase tracking-wide text-white">
        Volume hebdomadaire
      </h3>

      <div className="relative mt-4 pt-4">
        {/* Reference lines at 10 and 20 sets, spanning every bar. */}
        <div className="pointer-events-none absolute bottom-0 top-4" style={{ left: TRACK_LEFT, right: TRACK_RIGHT }}>
          {REF_LINES.map(n => (
            <div key={n} className="absolute inset-y-0 w-px bg-slate-600" style={{ left: `${(n / max) * 100}%` }}>
              <span className="absolute -top-4 -translate-x-1/2 text-[10px] text-slate-500">{n}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          {MUSCLE_ORDER.map(m => {
            const v = vol[m];
            return (
              <div key={m} className="flex items-center gap-2">
                <span className="w-[4.5rem] shrink-0 truncate text-right text-[11px] text-slate-400" title={m}>{m}</span>
                <div className="relative h-4 flex-1 rounded bg-slate-800/60">
                  <div className="h-full rounded bg-emerald-500/80" style={{ width: `${(v / max) * 100}%` }} />
                </div>
                <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-slate-300">{v > 0 ? fmt(v) : ''}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
