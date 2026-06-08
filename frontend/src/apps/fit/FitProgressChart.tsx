// Minimal responsive SVG line chart for an exercise's progression. Kept
// dependency-free (no recharts) so the fit bundle stays small.

export interface ChartPoint { label: string; value: number; }

export function FitProgressChart({ points, unit }: { points: ChartPoint[]; unit: string }) {
  if (points.length === 0) return null;

  const W = 320, H = 190, padL = 38, padR = 14, padT = 16, padB = 30;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  const values = points.map(p => p.value);
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;

  const x = (i: number) => (points.length === 1 ? padL + innerW / 2 : padL + (i / (points.length - 1)) * innerW);
  const y = (v: number) => padT + (1 - (v - min) / span) * innerH;

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.value)}`).join(' ');
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Progression">
      {/* y bounds */}
      {[max, min].map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
          <text x={padL - 6} y={y(v) + 4} textAnchor="end" className="fill-slate-500 text-[10px]">{fmt(v)}</text>
        </g>
      ))}

      {points.length > 1 && <path d={line} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}

      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r="3.5" className="fill-emerald-400" />
      ))}

      {/* first & last date labels */}
      <text x={padL} y={H - 8} textAnchor="start" className="fill-slate-500 text-[10px]">{points[0].label}</text>
      {points.length > 1 && (
        <text x={W - padR} y={H - 8} textAnchor="end" className="fill-slate-500 text-[10px]">{points[points.length - 1].label}</text>
      )}

      <text x={W - padR} y={padT - 4} textAnchor="end" className="fill-slate-500 text-[10px]">{unit}</text>
    </svg>
  );
}
