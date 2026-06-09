import { MUSCLE_ORDER, MUSCLE_LEAVES, muscleContribution } from './programData';

// Horizontal bar chart of weighted working volume per muscle group, assuming
// each selected exercise is performed once (workSets working sets each). Each
// working set adds 1 to every primary muscle group and 0.5 to every secondary.
// Bars are in anatomical (MUSCLE_ORDER) order; widths are relative to the max.

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function FitVolumeBars({ selections, workSets }: {
  selections: Record<string, string[]>;
  workSets: number;
}) {
  const volume: Record<string, number> = {};
  for (const [muscle, leaves] of Object.entries(selections)) {
    for (const leaf of leaves) {
      if (!MUSCLE_LEAVES[muscle]?.has(leaf)) continue;   // skip orphaned picks
      const { primary, secondary } = muscleContribution(leaf);
      for (const m of primary) volume[m] = (volume[m] ?? 0) + workSets;
      for (const m of secondary) volume[m] = (volume[m] ?? 0) + workSets * 0.5;
    }
  }

  const rows = MUSCLE_ORDER.filter(m => (volume[m] ?? 0) > 0);
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map(m => volume[m]));

  return (
    <div className="flex flex-col gap-2">
      {rows.map(m => (
        <div key={m} className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-right text-xs leading-tight text-slate-400">{m}</span>
          <div className="min-w-0 flex-1">
            <div
              className="h-5 rounded bg-emerald-500/80"
              style={{ width: `${Math.max(4, (volume[m] / max) * 100)}%` }}
            />
          </div>
          <span className="w-7 shrink-0 text-xs tabular-nums text-slate-300">{fmt(volume[m])}</span>
        </div>
      ))}
    </div>
  );
}
