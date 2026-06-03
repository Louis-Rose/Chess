import { Trophy } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// Monthly FIDE rapid rating since January 2026, one value per month. A null means
// the player had no FIDE rating that month; it's drawn as a grey dot at 1300, and
// a line is grey only on the segment that drops INTO an unrated month (a segment
// climbing out of unrated into a real rating stays the player's color). The VM
// can't reach ratings.fide.com, so these come from a manual lookup. To refresh,
// ask Claude to re-run the FIDE history lookup; to add a month, push a value onto
// MONTHS and every player's `rapid` array.
const MONTHS = ['January 2026', 'February 2026', 'March 2026', 'April 2026', 'May 2026', 'June 2026'];
const UNRATED_Y = 1400; // grey "unrated" markers sit here, at the FIDE 1400 floor
const GREY = '#64748b';

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

// A segment i->i+1 is coloured when it ends at a real rating; grey when it ends
// at an unrated month. Group consecutive coloured segments into "runs" so each
// run can be drawn as one player-coloured polyline over the grey underlay.
function colouredRuns(rapid: (number | null)[]): (number | null)[][] {
  const runs: Set<number>[] = [];
  let cur: Set<number> | null = null;
  for (let i = 0; i < rapid.length - 1; i++) {
    if (rapid[i + 1] != null) {            // segment ends at a rating -> coloured
      (cur ??= new Set()).add(i); cur.add(i + 1);
    } else if (cur) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  return runs.map(set => rapid.map((r, i) => (set.has(i) ? (r ?? UNRATED_Y) : null)));
}

const players = ROSTER.map(p => ({
  ...p,
  color: COLOR[p.fideId],
  runs: colouredRuns(p.rapid),
  current: currentRating(p.rapid),
}));

// One row per month. Keys per player: grey full path, grey dots (unrated only),
// coloured dots (rated only), and one key per coloured run.
const chartData = MONTHS.map((month, i) => {
  const row: Record<string, number | string | null> = { month };
  for (const p of players) {
    row[`${p.fideId}_gf`] = p.rapid[i] ?? UNRATED_Y;
    row[`${p.fideId}_gd`] = p.rapid[i] == null ? UNRATED_Y : null;
    row[p.name] = p.rapid[i];
    p.runs.forEach((run, k) => { row[`${p.fideId}_r${k}`] = run[i]; });
  }
  return row;
});

// Y axis: from the 1300 unrated row, one tick every 100 up to just above the top.
const topRating = Math.max(...ROSTER.flatMap(p => p.rapid.filter((r): r is number => r != null)));
const yMax = Math.ceil(topRating / 100) * 100;
const yTicks = Array.from({ length: (yMax - UNRATED_Y) / 100 + 1 }, (_, i) => UNRATED_Y + i * 100);

const lastIndex = MONTHS.length - 1;

// Player name drawn just to the right of their final point.
function endLabel(name: string, color: string) {
  return (props: any) => {
    if (props.index !== lastIndex || props.value == null) return null;
    return (
      <text x={Number(props.x) + 8} y={props.y} dy={4} fill={color} fontSize={12}>
        {name}
      </text>
    );
  };
}

function ChartTooltip({ active, label }: { active?: boolean; label?: string }) {
  if (!active || label == null) return null;
  const i = MONTHS.indexOf(label);
  if (i < 0) return null;
  const rows = players
    .map(p => ({ name: p.name, color: p.color, rating: p.rapid[i] }))
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs">
      <div className="text-slate-300 font-medium mb-1">{label}</div>
      {rows.map(r => (
        <div key={r.name} style={{ color: r.rating != null ? r.color : GREY }}>
          {r.name}: {r.rating ?? 'Unrated'}
        </div>
      ))}
    </div>
  );
}

const ranked = [...players].sort((a, b) => (b.current ?? -1) - (a.current ?? -1));

export function FideDashboard() {
  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 font-sans p-6">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-center justify-center gap-3 mb-1">
          <Trophy className="w-7 h-7 text-emerald-400" />
          <h1 className="text-2xl font-semibold">Blitz Crew Fide Rankings</h1>
        </header>
        <p className="text-slate-400 text-sm mb-6 text-center">Players ranked by their FIDE rapid rating.</p>

        <div className="mb-8 rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <h2 className="text-sm font-medium text-slate-300 mb-1">Rapid rating since January 2026</h2>
          <p className="text-xs text-slate-500 mb-4">
            Months with no FIDE rating sit at 1400 (grey dot); a line turns grey only as it drops into one.
          </p>
          <div className="[&_*:focus]:outline-none">
            <ResponsiveContainer width="100%" height={560}>
              <LineChart data={chartData} margin={{ top: 8, right: 132, bottom: 8, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: '#e2e8f0', fontSize: 12 }}
                  angle={-35}
                  textAnchor="end"
                  height={70}
                  interval={0}
                />
                <YAxis
                  tick={{ fill: '#e2e8f0', fontSize: 12 }}
                  domain={[UNRATED_Y, yMax]}
                  ticks={yTicks}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip />} />

                {/* Grey underlay: full path, drawn under everything. */}
                {players.map(p => (
                  <Line key={`${p.fideId}-gf`} type="linear" dataKey={`${p.fideId}_gf`}
                    stroke={GREY} strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />
                ))}
                {/* Grey dots at the unrated months (and the end label when the last month is unrated). */}
                {players.map(p => (
                  <Line key={`${p.fideId}-gd`} type="linear" dataKey={`${p.fideId}_gd`}
                    stroke={GREY} strokeWidth={0} connectNulls={false}
                    dot={{ r: 2, fill: GREY, stroke: GREY }} activeDot={false} isAnimationActive={false}
                    label={endLabel(p.name, GREY)} />
                ))}
                {/* Coloured runs: rated-to-rated and out-of-unrated segments. */}
                {players.flatMap(p => p.runs.map((_, k) => (
                  <Line key={`${p.fideId}-r${k}`} type="linear" dataKey={`${p.fideId}_r${k}`}
                    stroke={p.color} strokeWidth={2} dot={false} activeDot={false}
                    connectNulls={false} isAnimationActive={false} />
                )))}
                {/* Coloured dots at the rated months (and the end label when the last month is rated). */}
                {players.map(p => (
                  <Line key={`${p.fideId}-cd`} type="linear" dataKey={p.name}
                    stroke={p.color} strokeWidth={0} connectNulls={false}
                    dot={{ r: 2.5, fill: p.color, stroke: p.color }} activeDot={{ r: 4 }}
                    isAnimationActive={false} label={endLabel(p.name, p.color)} />
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
