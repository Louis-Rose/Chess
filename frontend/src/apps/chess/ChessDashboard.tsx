import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, ScatterChart, Scatter, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { AppHeader } from '../../components/AppHeader';

interface MonthCount {
  month: string; // 'YYYY-MM'
  count: number;
}

interface AfterResult {
  after: 'win' | 'draw' | 'loss';
  games: number;
  win_rate: number | null; // draws count as half a win; null when no games
}

const AFTER_LABEL: Record<AfterResult['after'], string> = {
  win: 'After a win',
  draw: 'After a draw',
  loss: 'After a loss',
};

function afterColor(winRate: number): string {
  if (winRate > 50) return 'text-emerald-400';
  if (winRate < 50) return 'text-red-400';
  return 'text-slate-300';
}

interface GameRecord {
  win: number;
  draw: number;
  loss: number;
}

interface GameIndexBar {
  index: number; // 1 = first game of the day, 2 = second, ...
  win: number;
  draw: number;
  loss: number;
  total: number;
}

type ResultKey = 'win' | 'draw' | 'loss';
const SEG: Record<ResultKey, { label: string; bar: string; text: string; dot: string }> = {
  win: { label: 'Won', bar: 'bg-emerald-500', text: 'text-emerald-400', dot: '#10b981' },
  draw: { label: 'Drawn', bar: 'bg-slate-400', text: 'text-slate-300', dot: '#94a3b8' },
  loss: { label: 'Lost', bar: 'bg-red-500', text: 'text-red-400', dot: '#ef4444' },
};
const SEG_KEYS: ResultKey[] = ['win', 'draw', 'loss'];

interface WaitPoint {
  wait: number; // minutes waited before this game (since the previous same-day game)
  result: ResultKey;
}

// Wait charts: bin waits into `binMin`-minute columns (the last column is the
// 90+ overflow) and report the win rate (draws count as half) of each column.
const WAIT_MAX_MIN = 90;

interface WaitRate {
  x: number; // column centre on the minutes axis (overflow sits at 105)
  rate: number; // win rate %, draws as half a win
  total: number; // games in the column
  ci: number; // 95% CI half-width in pp (worst-case p=0.5: 98/√n)
  pAbove: number; // probability the true rate is above 50% (flat prior, normal approx)
}

// Standard normal CDF via the Abramowitz-Stegun erf approximation.
function normCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

function buildWaitRates(points: WaitPoint[], binMin: number): WaitRate[] {
  const nBins = WAIT_MAX_MIN / binMin; // index nBins == 90+ overflow column
  const agg = Array.from({ length: nBins + 1 }, () => ({ score: 0, total: 0 }));
  for (const p of points) {
    const b = Math.min(Math.floor(Math.max(0, p.wait) / binMin), nBins);
    agg[b].total += 1;
    agg[b].score += p.result === 'win' ? 1 : p.result === 'draw' ? 0.5 : 0;
  }
  const out: WaitRate[] = [];
  agg.forEach((a, b) => {
    if (!a.total) return;
    const rate = (a.score / a.total) * 100;
    const ci = 98 / Math.sqrt(a.total);
    const se = ci / 1.96; // pp
    out.push({
      x: b * binMin + binMin / 2,
      rate,
      total: a.total,
      ci,
      pAbove: normCdf((rate - 50) / se),
    });
  });
  return out;
}

// Only colour (green/red) a result we're ≥80% sure is above/below 50%;
// otherwise grey it out as "direction unknown".
const WAIT_CONFIDENCE = 0.8;
function waitRateColor(rate: number, pAbove: number): string {
  if (Math.max(pAbove, 1 - pAbove) < WAIT_CONFIDENCE) return SEG.draw.dot;
  return rate > 50 ? SEG.win.dot : rate < 50 ? SEG.loss.dot : SEG.draw.dot;
}

// Renders each column's win rate (with its 95% CI) at its win-rate height.
function WaitRateLabel({ cx, cy, payload }: { cx?: number; cy?: number; payload?: WaitRate }) {
  if (cx == null || cy == null || !payload) return null;
  const confident = Math.max(payload.pAbove, 1 - payload.pAbove) >= WAIT_CONFIDENCE;
  const text = `${payload.rate.toFixed(0)}% (±${payload.ci.toFixed(0)})`;
  return (
    <text x={cx} y={cy} dy={4} textAnchor="middle" fontSize={12} fontFamily="ui-monospace, monospace" fill={waitRateColor(payload.rate, payload.pAbove)}>
      {confident ? text : `(${text})`}
    </text>
  );
}

function WaitRateTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: WaitRate }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const above = d.rate >= 50;
  const pSide = above ? d.pAbove : 1 - d.pAbove;
  const color = pSide < WAIT_CONFIDENCE ? SEG.draw.text : d.rate > 50 ? SEG.win.text : d.rate < 50 ? SEG.loss.text : SEG.draw.text;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs">
      <div className={color}>{d.rate.toFixed(1)}% ± {d.ci.toFixed(1)} pp</div>
      <div className="text-slate-500">{d.total} {d.total === 1 ? 'game' : 'games'} (95% CI)</div>
      <div className="text-slate-400 mt-1">{(pSide * 100).toFixed(0)}% chance {above ? 'above' : 'below'} 50%</div>
    </div>
  );
}

// Win rate vs. wait time, binned into `binMin`-minute columns with a 90+
// overflow. `heading`/`lead`/`axisLabel` adapt it to all games or a subset.
function WaitRateChart({ heading, axisLabel, points, binMin }: {
  heading: string; axisLabel: string; points: WaitPoint[]; binMin: number;
}) {
  const rates = buildWaitRates(points, binMin);
  const overflowX = WAIT_MAX_MIN + binMin / 2;
  const ticks: number[] = [];
  for (let v = 0; v <= WAIT_MAX_MIN; v += binMin) ticks.push(v);
  ticks.push(overflowX);
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
      <h2 className="text-lg font-semibold text-slate-200 text-center mb-4">
        {heading} (N={points.length}): does waiting help?
      </h2>
      <div className="[&_*:focus]:outline-none">
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart margin={{ top: 8, right: 24, bottom: 28, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, WAIT_MAX_MIN + binMin]}
              ticks={ticks}
              tickFormatter={(v) => (v >= overflowX ? '90+' : `${v}`)}
              tick={{ fill: '#e2e8f0', fontSize: 12 }}
              label={{ value: axisLabel, position: 'insideBottom', offset: -14, fill: '#94a3b8', fontSize: 12 }}
            />
            <YAxis
              type="number"
              dataKey="rate"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fill: '#e2e8f0', fontSize: 12 }}
            />
            <ReferenceLine y={50} stroke="#64748b" strokeDasharray="3 3" />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<WaitRateTooltip />} />
            <Scatter data={rates} shape={<WaitRateLabel />} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

interface RapidStats {
  username: string;
  total: number;
  record: GameRecord;
  months: MonthCount[];
  by_game_index: GameIndexBar[];
  after_results: AfterResult[];
  game_waits: WaitPoint[];
  after_win_waits: WaitPoint[];
  after_loss_waits: WaitPoint[];
}

const MONTH_NAMES_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthLabelFull(month: string): string {
  const [y, m] = month.split('-');
  return `${MONTH_NAMES_FULL[Number(m) - 1]} '${y.slice(2)}`;
}

export function ChessDashboard() {
  const [data, setData] = useState<RapidStats | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tip, setTip] = useState<{ x: number; y: number; key: ResultKey; pct: number; total: number } | null>(null);

  useEffect(() => {
    axios.get<RapidStats>('/api/chess/rapid-stats')
      .then(r => setData(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const monthData = (data?.months ?? []).map(m => ({ ...m, label: monthLabelFull(m.month) }));
  const byGameIndex = data?.by_game_index ?? [];
  const afterResults = data?.after_results ?? [];

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 font-sans p-6">
      <div className="max-w-5xl mx-auto">
        <AppHeader title="Chess" />
        <p className="text-slate-400 text-sm mb-6">
          Rapid games on chess.com
          {data && <> for <a
            href={`https://www.chess.com/member/${data.username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-200 font-mono hover:text-emerald-400 hover:underline transition-colors"
          >{data.username}</a>.</>}
        </p>

        {loading && (
          <div className="h-64 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 text-center text-slate-400 text-sm">
            Could not load games from chess.com. Try again later.
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-6">
            {/* Overall record */}
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <div className="text-center mb-5">
                <div className="text-3xl font-semibold text-slate-100">{data.total}</div>
                <div className="text-xs text-slate-500 mt-0.5">games total</div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <RecordStat label="Won" count={data.record.win} total={data.total} color="text-emerald-400" />
                <RecordStat label="Drawn" count={data.record.draw} total={data.total} color="text-slate-300" />
                <RecordStat label="Lost" count={data.record.loss} total={data.total} color="text-red-400" />
              </div>
            </div>

            {/* Games per month */}
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <h2 className="text-lg font-semibold text-slate-200 text-center mb-4">Games per month</h2>
              <div className="[&_*:focus]:outline-none">
                <ResponsiveContainer width="100%" height={380}>
                  <BarChart data={monthData} margin={{ top: 4, right: 8, bottom: 24, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#e2e8f0', fontSize: 11 }}
                      angle={-45}
                      textAnchor="end"
                      height={90}
                      interval={0}
                    />
                    <YAxis tick={{ fill: '#e2e8f0', fontSize: 12 }} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: '#334155', opacity: 0.3 }}
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                      labelStyle={{ color: '#e2e8f0' }}
                      labelFormatter={(_label, payload) => {
                        const month = payload?.[0]?.payload?.month;
                        return month ? monthLabelFull(month) : _label;
                      }}
                      formatter={(value) => [`${value} games`, 'Rapid']}
                    />
                    <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Result split by game number within the day */}
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <h2 className="text-lg font-semibold text-slate-200 text-center mb-1">Results by game number in the day</h2>
              <p className="text-xs text-slate-500 text-center mb-4">
                Each bar is the Nth game played in a day (day runs 3 AM to 3 AM Paris time), split into wins, draws and losses. Hover a segment for its share and game count.
              </p>
              <div className="relative">
                <div className="space-y-1.5">
                  {byGameIndex.map((b) => (
                    <div key={b.index} className="flex items-center gap-2">
                      <span className="w-6 shrink-0 text-right text-xs font-mono text-slate-500">{b.index}</span>
                      <div className="flex h-5 flex-1 overflow-hidden rounded">
                        {SEG_KEYS.map((k) => b[k] > 0 && (
                          <div
                            key={k}
                            className={`${SEG[k].bar} h-full cursor-default transition-opacity hover:opacity-80`}
                            style={{ width: `${(b[k] / b.total) * 100}%` }}
                            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, key: k, pct: (b[k] / b.total) * 100, total: b.total })}
                            onMouseLeave={() => setTip(null)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {/* 50% win-rate marker, aligned to the bar track (offset past the index label) */}
                <div
                  className="pointer-events-none absolute inset-y-0 w-1 -translate-x-1/2 rounded bg-slate-950"
                  style={{ left: 'calc(50% + 1rem)' }}
                />
              </div>
            </div>

            {/* Win rate after the previous game's result */}
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <h2 className="text-lg font-semibold text-slate-200 text-center mb-4">Win rate after the previous game</h2>
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="text-center text-slate-500 border-b border-slate-700">
                    <th className="w-1/3 py-2 font-medium">Previous game</th>
                    <th className="w-1/3 py-2 font-medium">Win rate</th>
                    <th className="w-1/3 py-2 font-medium">Games</th>
                  </tr>
                </thead>
                <tbody>
                  {afterResults.map((r) => (
                    <tr key={r.after} className="border-b border-slate-800 last:border-0 text-center">
                      <td className="py-2.5 text-slate-300">{AFTER_LABEL[r.after]}</td>
                      <td className={`py-2.5 font-mono ${r.win_rate == null ? 'text-slate-600' : afterColor(r.win_rate)}`}>
                        {r.win_rate == null ? '—' : `${r.win_rate}%`}
                      </td>
                      <td className="py-2.5 font-mono text-slate-400">{r.games}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <WaitRateChart
              heading="All games"
              axisLabel="Minutes waited before the game"
              points={data.game_waits}
              binMin={15}
            />
            <WaitRateChart
              heading="After a win"
              axisLabel="Minutes waited after the win"
              points={data.after_win_waits}
              binMin={15}
            />
            <WaitRateChart
              heading="After a loss"
              axisLabel="Minutes waited after the loss"
              points={data.after_loss_waits}
              binMin={15}
            />
          </div>
        )}
      </div>

      {tip && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs"
          style={{ left: tip.x + 12, top: tip.y + 12 }}
        >
          <div className={SEG[tip.key].text}>{SEG[tip.key].label} {tip.pct.toFixed(1)}%</div>
          <div className="text-slate-500">{tip.total} {tip.total === 1 ? 'game' : 'games'}</div>
        </div>
      )}
    </div>
  );
}

function RecordStat({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className={`text-2xl font-semibold ${color}`}>{count}</div>
      <div className="text-xs text-slate-500 mt-0.5">{label}</div>
      <div className={`text-sm font-mono mt-1 ${color}`}>{pct.toFixed(1)}%</div>
    </div>
  );
}
