// Body heatmap — anatomical front/back views from `react-body-highlighter`.
// Each muscle region is filled by recency bucket (≤3d / ≤7d / ≤14d / >14d).
// Click a region to filter the list by the mapped muscle group.

import Model from 'react-body-highlighter';
import type { IExerciseData, Muscle, IMuscleStats } from 'react-body-highlighter';

interface MuscleStats {
  minDaysSince: number | null;
}

interface Props {
  stats: Record<string, MuscleStats>;
  selected: string;
  onSelect: (muscle: string) => void;
}

// Our groups → library muscle names
const GROUP_TO_MUSCLES: Record<string, Muscle[]> = {
  SHOULDERS: ['front-deltoids', 'back-deltoids'],
  CHEST:     ['chest'],
  BACK:      ['upper-back', 'lower-back', 'trapezius'],
  BICEPS:    ['biceps'],
  TRICEPS:   ['triceps'],
  ABS:       ['abs', 'obliques'],
  LEGS:      ['quadriceps', 'hamstring', 'gluteal', 'calves'],
};

// Reverse lookup: library muscle → our group
const MUSCLE_TO_GROUP: Record<string, string> = Object.fromEntries(
  Object.entries(GROUP_TO_MUSCLES).flatMap(([g, ms]) => ms.map(m => [m, g]))
);

// Recency bucket → frequency count (1-indexed for the library)
// 1 = green (≤2d), 2 = yellow (3-5d), 3 = orange (6-7d), 4 = red (>7d)
const HIGHLIGHT_COLORS = ['#10b981', '#eab308', '#f97316', '#ef4444'];
const BODY_COLOR = '#334155';          // slate-700 — no data
const SELECTED_OUTLINE = '#f8fafc';    // slate-50

function bucket(days: number | null): number {
  if (days === null) return 0;
  if (days <= 2) return 1;
  if (days <= 5) return 2;
  if (days <= 7) return 3;
  return 4;
}

export function BodyHeatmap({ stats, selected, onSelect }: Props) {
  // Build one "exercise" entry per repetition needed to push each group's
  // muscles into their recency bucket. react-body-highlighter colors by how
  // many times a muscle appears in `data`.
  const data: IExerciseData[] = [];
  for (const [group, muscles] of Object.entries(GROUP_TO_MUSCLES)) {
    const b = bucket(stats[group]?.minDaysSince ?? null);
    for (let i = 0; i < b; i++) {
      data.push({ name: `${group}-${i}`, muscles });
    }
  }

  const handleClick = (stat: IMuscleStats) => {
    const group = MUSCLE_TO_GROUP[stat.muscle];
    if (!group) return;
    onSelect(selected === group ? 'ALL' : group);
  };

  const selectedMuscles = GROUP_TO_MUSCLES[selected] ?? [];
  const selectedCss = selectedMuscles
    .map(m => `[data-name="${m}"]{stroke:${SELECTED_OUTLINE};stroke-width:1.5}`)
    .join('');

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
          Recency by body part
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <LegendSwatch color={HIGHLIGHT_COLORS[0]} label="≤2d" />
          <LegendSwatch color={HIGHLIGHT_COLORS[1]} label="3-5d" />
          <LegendSwatch color={HIGHLIGHT_COLORS[2]} label="6-7d" />
          <LegendSwatch color={HIGHLIGHT_COLORS[3]} label=">7d" />
          <LegendSwatch color={BODY_COLOR} label="—" />
        </div>
      </div>

      {selectedCss && <style>{selectedCss}</style>}

      <div className="flex items-start justify-center gap-4 flex-wrap">
        <div className="flex flex-col items-center">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Front</div>
          <Model
            data={data}
            type="anterior"
            bodyColor={BODY_COLOR}
            highlightedColors={HIGHLIGHT_COLORS}
            onClick={handleClick}
            style={{ width: '160px', padding: 0 }}
          />
        </div>
        <div className="flex flex-col items-center">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Back</div>
          <Model
            data={data}
            type="posterior"
            bodyColor={BODY_COLOR}
            highlightedColors={HIGHLIGHT_COLORS}
            onClick={handleClick}
            style={{ width: '160px', padding: 0 }}
          />
        </div>
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      <span>{label}</span>
    </div>
  );
}
