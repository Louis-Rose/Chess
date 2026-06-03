import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from 'recharts';

// Monthly FIDE rapid rating since January 2026, one value per month. A null means
// the player had no FIDE rating that month and is drawn on the UNRATED baseline
// (UNRATED_Y). The VM can't reach ratings.fide.com, so these come from a manual
// lookup. To refresh, ask Claude to re-run the FIDE history lookup; to add a
// month, push a value onto MONTHS and every player's `rapid` array.
const MONTHS = ['January 2026', 'February 2026', 'March 2026', 'April 2026', 'May 2026', 'June 2026'];
const UNRATED_Y = 1400; // unrated months sit here (the FIDE 1400 floor), labelled "UNRATED"

const ROSTER: { name: string; fideId: string; rapid: (number | null)[] }[] = [
  { name: 'Jia, David',       fideId: '20630034',  rapid: [null, null, null, 1858, 1852, 1852] },
  { name: 'Houdard, Clément', fideId: '576014835', rapid: [null, null, null, 1649, 1649, 1642] },
  { name: 'Courau, Eloi',     fideId: '560003928', rapid: [1565, 1565, 1588, 1608, 1611, 1611] },
  { name: 'Tallec, Gauthier', fideId: '576029000', rapid: [null, null, null, null, 1541, 1541] },
  { name: 'Iwandza, Joel',    fideId: '560098708', rapid: [null, null, 1636, 1586, 1497, 1497] },
  { name: 'Dupont, Rémi',     fideId: '576007308', rapid: [null, null, null, 1460, 1460, 1460] },
  { name: 'Santini, Lauren',  fideId: '560003979', rapid: [null, 1416, null, null, null, 1433] },
  { name: 'Rose, Louis',      fideId: '560015160', rapid: [null, null, null, null, null, 1409] },
  { name: 'Teboul, Raphael',  fideId: '560080809', rapid: [null, null, null, null, null, null] },
  { name: 'Cleon, Thomas',    fideId: '560003910', rapid: [1420, 1420, null, 1409, 1457, 1439] },
];

// One distinct color per player, keyed by FIDE ID so the chart line, the end
// label, and the table dot always match.
const PALETTE = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7',
                 '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#eab308'];
const COLOR = Object.fromEntries(ROSTER.map((p, i) => [p.fideId, PALETTE[i % PALETTE.length]]));

// Latest real rating (most recent non-null month), or null if never rated.
function currentRating(rapid: (number | null)[]): number | null {
  for (let i = rapid.length - 1; i >= 0; i--) if (rapid[i] != null) return rapid[i];
  return null;
}

const players = ROSTER.map(p => ({ ...p, color: COLOR[p.fideId], current: currentRating(p.rapid) }));

// One row per month; unrated months fall to the UNRATED baseline.
const chartData = MONTHS.map((month, i) => {
  const row: Record<string, number | string> = { month };
  for (const p of players) row[p.name] = p.rapid[i] ?? UNRATED_Y;
  return row;
});

// Y axis: from the UNRATED baseline, one tick every 100 up to just above the top.
const topRating = Math.max(...ROSTER.flatMap(p => p.rapid.filter((r): r is number => r != null)));
const yMax = Math.ceil(topRating / 100) * 100;
const yTicks = Array.from({ length: (yMax - UNRATED_Y) / 100 + 1 }, (_, i) => UNRATED_Y + i * 100);

const lastIndex = MONTHS.length - 1;

// Names are stored "Surname, First"; the chart labels show just the first name.
const firstName = (name: string) => name.split(',')[1]?.trim() ?? name;

// Nudge overlapping labels apart: each colliding cluster is spread symmetrically
// around its own centre by MIN_LABEL_GAP, and two clusters merge only when they
// would otherwise overlap — so a label moves just enough and never onto another.
const MIN_LABEL_GAP = 14;

function deCollide<T extends { y: number }>(items: T[]): T[] {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  type Group = { desired: number[]; items: T[] };
  const centre = (g: Group) => g.desired.reduce((s, v) => s + v, 0) / g.desired.length;
  const groups: Group[] = [];
  for (const it of sorted) {
    let g: Group = { desired: [it.y], items: [it] };
    while (groups.length) {
      const prev = groups[groups.length - 1];
      const prevBottom = centre(prev) + (prev.items.length - 1) * MIN_LABEL_GAP / 2;
      const gTop = centre(g) - (g.items.length - 1) * MIN_LABEL_GAP / 2;
      if (gTop < prevBottom + MIN_LABEL_GAP) {
        g = { desired: [...prev.desired, ...g.desired], items: [...prev.items, ...g.items] };
        groups.pop();
      } else break;
    }
    groups.push(g);
  }
  const out: T[] = [];
  for (const g of groups) {
    const start = centre(g) - (g.items.length - 1) * MIN_LABEL_GAP / 2;
    g.items.forEach((it, i) => out.push({ ...it, y: start + i * MIN_LABEL_GAP }));
  }
  return out;
}

// Chart plot geometry — must match the ResponsiveContainer height + LineChart
// margins + XAxis height set below. Used to place labels in the same pixel space.
const CHART_HEIGHT = 560;
const PLOT_TOP = 8;                          // LineChart top margin
const PLOT_BOTTOM = CHART_HEIGHT - 8 - 70;   // minus bottom margin and XAxis height
const yPixel = (v: number) => PLOT_TOP + (yMax - v) / (yMax - UNRATED_Y) * (PLOT_BOTTOM - PLOT_TOP);

// Vertical offset per player so overlapping end labels separate. recharts gives
// the exact point y at render; we add this de-collision delta on top.
const labelOffset: Record<string, number> = Object.fromEntries(
  deCollide(players.map(p => {
    const y0 = yPixel(p.rapid[lastIndex] ?? UNRATED_Y);
    return { fideId: p.fideId, y0, y: y0 };
  })).map(pl => [pl.fideId, pl.y - pl.y0]),
);

function endLabel(text: string, color: string, offset: number, fontSize: number, dx: number) {
  return (props: any) => {
    if (props.index !== lastIndex) return null;
    return (
      <text x={Number(props.x) + dx} y={Number(props.y) + offset} dy={4} fill={color} fontSize={fontSize}>
        {text}
      </text>
    );
  };
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return mobile;
}

const ranked = [...players].sort((a, b) => (b.current ?? -1) - (a.current ?? -1));

export function FideDashboard() {
  const isMobile = useIsMobile();
  // On mobile, label with just the first name (no elo) to save horizontal room.
  const rightMargin = isMobile ? 62 : 116;
  const labelFont = isMobile ? 10 : 12;
  const labelDx = isMobile ? 5 : 8;
  const axisFont = isMobile ? 11 : 12;

  // Render "UNRATED" smaller than the numeric ticks so it fits the y-axis width.
  const renderYTick = ({ x, y, payload }: any) => {
    const unrated = payload.value === UNRATED_Y;
    return (
      <text x={x} y={y} dy={4} textAnchor="end" fill="#e2e8f0" fontSize={unrated ? 9 : axisFont}>
        {unrated ? 'UNRATED' : payload.value}
      </text>
    );
  };

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 font-sans p-3 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-center justify-center gap-3 mb-1">
          <Trophy className="w-7 h-7 text-emerald-400" />
          <h1 className="text-2xl font-semibold">Blitz Crew Fide Rankings</h1>
        </header>
        <p className="text-slate-400 text-sm mb-6 text-center">Players ranked by their FIDE rapid rating.</p>

        <div className="mb-8 rounded-lg border border-slate-700 bg-slate-800/50 p-3 sm:p-4">
          <h2 className="text-sm font-medium text-slate-300 mb-1">Rapid rating since January 2026</h2>
          <p className="text-xs text-slate-500 mb-4">Months with no FIDE rating are shown on the UNRATED baseline.</p>
          <div className="[&_*:focus]:outline-none">
            <ResponsiveContainer width="100%" height={560}>
              <LineChart data={chartData} margin={{ top: 8, right: rightMargin, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: '#e2e8f0', fontSize: axisFont }}
                  angle={-35}
                  textAnchor="end"
                  height={70}
                  interval={0}
                />
                <YAxis
                  tick={renderYTick}
                  domain={[UNRATED_Y, yMax]}
                  ticks={yTicks}
                  width={56}
                />
                {players.map(p => (
                  <Line
                    key={p.fideId}
                    type="linear"
                    dataKey={p.name}
                    stroke={p.color}
                    strokeWidth={2}
                    dot={{ r: 2.5, fill: p.color, stroke: p.color }}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                    label={endLabel(
                      isMobile ? firstName(p.name) : `${firstName(p.name)} (${p.current ?? 'Unrated'})`,
                      p.color, labelOffset[p.fideId], labelFont, labelDx,
                    )}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-700">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-800 text-slate-300 text-xs uppercase tracking-wide">
                <th className="text-center py-2.5 px-3 font-medium w-14">Rank</th>
                <th className="text-left py-2.5 px-3 font-medium">Player</th>
                <th className="text-left py-2.5 px-3 font-medium">FIDE ID</th>
                <th className="text-right py-2.5 px-3 font-medium">Rating</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((row, i) => (
                <tr key={row.fideId} className="border-t border-slate-700/70 hover:bg-slate-800/40">
                  <td className="py-2.5 px-3 text-center font-mono text-slate-300">#{i + 1}</td>
                  <td className="py-2.5 px-3">
                    <a
                      href={`https://ratings.fide.com/profile/${row.fideId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-slate-100 hover:text-emerald-400 transition-colors"
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                      {row.name}
                    </a>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-400 text-sm">{row.fideId}</td>
                  <td className="py-2.5 px-3 text-right font-mono">
                    {row.current != null
                      ? <span className="text-slate-100">{row.current}</span>
                      : <span className="text-slate-500">Not rated</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
