// Body heatmap — front + back silhouettes with muscle-group regions
// colored by most-recent work recency. Click a region to filter by that
// muscle group.

interface MuscleStats {
  minDaysSince: number | null; // null = no data or all archived
}

interface Props {
  stats: Record<string, MuscleStats>;
  selected: string;
  onSelect: (muscle: string) => void;
}

// Same thresholds as the exercise cards — hex values for SVG fill
function color(minDays: number | null): string {
  if (minDays === null) return '#334155';   // slate-700 — no data
  if (minDays <= 3)  return '#10b981';       // emerald-500
  if (minDays <= 7)  return '#84cc16';       // lime-500
  if (minDays <= 14) return '#f59e0b';       // amber-500
  return '#ef4444';                          // red-500
}

const BODY_STROKE = '#475569';  // slate-600
const BODY_FILL   = '#1e293b';  // slate-800

export function BodyHeatmap({ stats, selected, onSelect }: Props) {
  const region = (muscle: string) => ({
    fill: color(stats[muscle]?.minDaysSince ?? null),
    stroke: selected === muscle ? '#f1f5f9' : BODY_STROKE,
    strokeWidth: selected === muscle ? 1.5 : 0.75,
    style: { cursor: 'pointer' as const, transition: 'opacity 120ms' },
    onClick: () => onSelect(selected === muscle ? 'ALL' : muscle),
  });

  const label = (muscle: string) => {
    const d = stats[muscle]?.minDaysSince;
    if (d === null || d === undefined) return '—';
    return `${d}d`;
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
          Recency by body part
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <LegendSwatch color="#10b981" label="≤3d" />
          <LegendSwatch color="#84cc16" label="≤7d" />
          <LegendSwatch color="#f59e0b" label="≤14d" />
          <LegendSwatch color="#ef4444" label=">14d" />
          <LegendSwatch color="#334155" label="—" />
        </div>
      </div>

      <svg viewBox="0 0 420 340" className="w-full h-auto max-h-[360px]" role="img" aria-label="Body recency heatmap">
        {/* ─────── FRONT VIEW (centered x≈105) ─────── */}
        <g>
          <text x="105" y="14" textAnchor="middle" fill="#64748b" fontSize="10" fontWeight="600">FRONT</text>

          {/* head */}
          <circle cx="105" cy="40" r="18" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.75" />
          {/* neck */}
          <rect x="98" y="56" width="14" height="10" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.75" />
          {/* torso outline */}
          <path d="M 70 66 Q 60 70 58 90 L 62 150 Q 65 170 76 176 L 134 176 Q 145 170 148 150 L 152 90 Q 150 70 140 66 Z"
                fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.75" />
          {/* hips */}
          <path d="M 76 176 L 72 200 L 138 200 L 134 176 Z" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.75" />
          {/* forearms + hands (not tracked) */}
          <path d="M 42 110 Q 38 130 40 160 L 48 160 Q 50 130 50 110 Z" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.75" />
          <path d="M 168 110 Q 172 130 170 160 L 162 160 Q 160 130 160 110 Z" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.75" />
          {/* calves (not tracked separately) */}
          <path d="M 78 260 Q 76 285 82 310 L 98 310 Q 96 285 96 260 Z" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.75" />
          <path d="M 114 260 Q 114 285 112 310 L 128 310 Q 134 285 132 260 Z" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.75" />

          {/* SHOULDERS — front deltoids */}
          <ellipse cx="65" cy="78" rx="13" ry="14" {...region('SHOULDERS')} />
          <ellipse cx="145" cy="78" rx="13" ry="14" {...region('SHOULDERS')} />

          {/* CHEST — pectorals */}
          <path d="M 78 80 Q 105 72 105 108 L 82 108 Q 75 95 78 80 Z" {...region('CHEST')} />
          <path d="M 132 80 Q 105 72 105 108 L 128 108 Q 135 95 132 80 Z" {...region('CHEST')} />

          {/* BICEPS */}
          <ellipse cx="52" cy="100" rx="9" ry="18" {...region('BICEPS')} />
          <ellipse cx="158" cy="100" rx="9" ry="18" {...region('BICEPS')} />

          {/* ABS */}
          <rect x="90" y="112" width="30" height="52" rx="4" {...region('ABS')} />

          {/* LEGS — quads */}
          <path d="M 76 200 Q 72 230 80 258 L 102 258 Q 104 230 100 200 Z" {...region('LEGS')} />
          <path d="M 134 200 Q 138 230 130 258 L 108 258 Q 106 230 110 200 Z" {...region('LEGS')} />

          {/* front labels */}
          <text x="105" y="95" textAnchor="middle" fill="#0f172a" fontSize="7" fontWeight="700" pointerEvents="none">{label('CHEST')}</text>
          <text x="105" y="140" textAnchor="middle" fill="#0f172a" fontSize="7" fontWeight="700" pointerEvents="none">{label('ABS')}</text>
          <text x="65" y="82" textAnchor="middle" fill="#0f172a" fontSize="7" fontWeight="700" pointerEvents="none">{label('SHOULDERS')}</text>
          <text x="52" y="104" textAnchor="middle" fill="#0f172a" fontSize="7" fontWeight="700" pointerEvents="none">{label('BICEPS')}</text>
          <text x="90" y="232" textAnchor="middle" fill="#0f172a" fontSize="7" fontWeight="700" pointerEvents="none">{label('LEGS')}</text>
        </g>

        {/* ─────── BACK VIEW (centered x≈315) ─────── */}
        <g>
          <text x="315" y="14" textAnchor="middle" fill="#64748b" fontSize="10" fontWeight="600">BACK</text>

          {/* head */}
          <circle cx="315" cy="40" r="18" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.75" />
          {/* neck */}
          <rect x="308" y="56" width="14" height="10" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.75" />
          {/* torso outline */}
          <path d="M 280 66 Q 270 70 268 90 L 272 150 Q 275 170 286 176 L 344 176 Q 355 170 358 150 L 362 90 Q 360 70 350 66 Z"
                fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.75" />
          {/* hips */}
          <path d="M 286 176 L 282 200 L 348 200 L 344 176 Z" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.75" />
          {/* forearms */}
          <path d="M 252 110 Q 248 130 250 160 L 258 160 Q 260 130 260 110 Z" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.75" />
          <path d="M 378 110 Q 382 130 380 160 L 372 160 Q 370 130 370 110 Z" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.75" />
          {/* calves */}
          <path d="M 288 260 Q 286 285 292 310 L 308 310 Q 306 285 306 260 Z" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.75" />
          <path d="M 324 260 Q 324 285 322 310 L 338 310 Q 344 285 342 260 Z" fill={BODY_FILL} stroke={BODY_STROKE} strokeWidth="0.75" />

          {/* SHOULDERS — back deltoids */}
          <ellipse cx="275" cy="78" rx="13" ry="14" {...region('SHOULDERS')} />
          <ellipse cx="355" cy="78" rx="13" ry="14" {...region('SHOULDERS')} />

          {/* BACK — traps + lats */}
          <path d="M 290 74 Q 315 68 340 74 L 345 170 Q 315 175 285 170 Z" {...region('BACK')} />

          {/* TRICEPS */}
          <ellipse cx="262" cy="100" rx="9" ry="18" {...region('TRICEPS')} />
          <ellipse cx="368" cy="100" rx="9" ry="18" {...region('TRICEPS')} />

          {/* LEGS — hamstrings */}
          <path d="M 286 200 Q 282 230 290 258 L 312 258 Q 314 230 310 200 Z" {...region('LEGS')} />
          <path d="M 344 200 Q 348 230 340 258 L 318 258 Q 316 230 320 200 Z" {...region('LEGS')} />

          {/* back labels */}
          <text x="315" y="122" textAnchor="middle" fill="#0f172a" fontSize="7" fontWeight="700" pointerEvents="none">{label('BACK')}</text>
          <text x="275" y="82" textAnchor="middle" fill="#0f172a" fontSize="7" fontWeight="700" pointerEvents="none">{label('SHOULDERS')}</text>
          <text x="262" y="104" textAnchor="middle" fill="#0f172a" fontSize="7" fontWeight="700" pointerEvents="none">{label('TRICEPS')}</text>
          <text x="300" y="232" textAnchor="middle" fill="#0f172a" fontSize="7" fontWeight="700" pointerEvents="none">{label('LEGS')}</text>
        </g>
      </svg>
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
