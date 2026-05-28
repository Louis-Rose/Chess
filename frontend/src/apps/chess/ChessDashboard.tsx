import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, Cell, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { Crown } from 'lucide-react';

interface MonthCount {
  month: string; // 'YYYY-MM'
  count: number;
}

interface Day {
  date: string; // 'YYYY-MM-DD'
  games: number;
  avg_elo: number;
}

interface Regression {
  n: number;
  slope: number;
  intercept: number;
  r: number;
  r2: number;
  stderr: number;
  p_value: number;
  significant: boolean;
}

interface Streak {
  streak: number; // negative = losses before, positive = wins before, 0 = after a draw
  games: number;
  win_rate: number;
}

const STREAK_COLORS = { win: '#10b981', loss: '#ef4444', even: '#94a3b8' };
const STREAK_TEXT = { win: 'text-emerald-400', loss: 'text-red-400', even: 'text-slate-300' };

function streakState(winRate: number): 'win' | 'loss' | 'even' {
  if (winRate > 50) return 'win';
  if (winRate < 50) return 'loss';
  return 'even';
}

interface RapidStats {
  username: string;
  total: number;
  months: MonthCount[];
  days: Day[];
  regression: Regression | null;
  streaks: Streak[];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${MONTH_NAMES[Number(m) - 1]} '${y.slice(2)}`;
}

function formatP(p: number): string {
  if (p < 0.001) return '< 0.001';
  return p.toFixed(3);
}

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Day }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs">
      <div className="text-slate-300 font-medium mb-1">{d.date}</div>
      <div className="text-slate-400">{d.games} games</div>
      <div className="text-slate-400">avg {d.avg_elo > 0 ? '+' : ''}{d.avg_elo} elo/game</div>
    </div>
  );
}

function streakDescription(s: number): string {
  if (s === 0) return 'After a draw';
  const n = Math.abs(s);
  return s < 0 ? `After ${n} ${n === 1 ? 'loss' : 'losses'}` : `After ${n} ${n === 1 ? 'win' : 'wins'}`;
}

function StreakTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Streak }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs">
      <div className="text-slate-300 font-medium mb-1">{streakDescription(d.streak)}</div>
      <div className={STREAK_TEXT[streakState(d.win_rate)]}>{d.win_rate}% win rate</div>
      <div className="text-slate-500">{d.games} games</div>
    </div>
  );
}

export function ChessDashboard() {
  const [data, setData] = useState<RapidStats | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get<RapidStats>('/api/chess/rapid-stats')
      .then(r => setData(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const monthData = (data?.months ?? []).map(m => ({ ...m, label: monthLabel(m.month) }));
  const days = data?.days ?? [];
  const reg = data?.regression ?? null;
  const streakData = (data?.streaks ?? []).map(s => ({ ...s, label: `${s.streak > 0 ? '+' : ''}${s.streak}` }));

  const regSegment = ((): [{ x: number; y: number }, { x: number; y: number }] | null => {
    if (!reg || days.length === 0) return null;
    const xs = days.map(d => d.games);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    return [
      { x: minX, y: reg.slope * minX + reg.intercept },
      { x: maxX, y: reg.slope * maxX + reg.intercept },
    ];
  })();

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 font-sans p-6">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center gap-3 mb-1">
          <Crown className="w-7 h-7 text-emerald-400" />
          <h1 className="text-2xl font-semibold">Chess</h1>
        </header>
        <p className="text-slate-400 text-sm mb-6">
          Rapid games on chess.com
          {data && <> for <span className="text-slate-200 font-mono">{data.username}</span>. {data.total} games total.</>}
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
            {/* Games per month */}
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <h2 className="text-sm font-medium text-slate-300 mb-4">Games per month</h2>
              <div className="[&_*:focus]:outline-none">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={monthData} margin={{ top: 4, right: 8, bottom: 24, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#e2e8f0', fontSize: 11 }}
                      angle={-45}
                      textAnchor="end"
                      height={50}
                      interval={0}
                    />
                    <YAxis tick={{ fill: '#e2e8f0', fontSize: 12 }} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: '#334155', opacity: 0.3 }}
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                      labelStyle={{ color: '#e2e8f0' }}
                      formatter={(value) => [`${value} games`, 'Rapid']}
                    />
                    <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Volume vs. average per-game elo change */}
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <h2 className="text-sm font-medium text-slate-300 mb-1">Does playing more lead to more elo?</h2>
              <p className="text-xs text-slate-500 mb-4">
                Each point is a day with 3+ rapid games: games played that day vs. the average elo change per game that day.
              </p>
              <div className="[&_*:focus]:outline-none">
                <ResponsiveContainer width="100%" height={340}>
                  <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      type="number"
                      dataKey="games"
                      name="Games"
                      tick={{ fill: '#e2e8f0', fontSize: 12 }}
                      label={{ value: 'Games played that day', position: 'insideBottom', offset: -14, fill: '#94a3b8', fontSize: 12 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="avg_elo"
                      name="Avg elo/game"
                      tick={{ fill: '#e2e8f0', fontSize: 12 }}
                      label={{ value: 'Avg elo per game', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }}
                    />
                    <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                    {regSegment && <ReferenceLine segment={regSegment} stroke="#38bdf8" strokeWidth={2} />}
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<ScatterTooltip />} />
                    <Scatter data={days} fill="#10b981" fillOpacity={0.55} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              {reg ? (
                <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                  <h3 className="text-xs font-medium text-slate-300 mb-3">Linear regression</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm font-mono">
                    <Stat label="Slope" value={`${reg.slope > 0 ? '+' : ''}${reg.slope} elo/game`} />
                    <Stat label="Std. error" value={`±${reg.stderr}`} />
                    <Stat label="Intercept" value={`${reg.intercept}`} />
                    <Stat label="Correlation r" value={`${reg.r}`} />
                    <Stat label="R²" value={`${reg.r2}`} />
                    <Stat label="p-value" value={formatP(reg.p_value)} />
                    <Stat label="Days (n)" value={`${reg.n}`} />
                  </div>
                  <p className={`mt-3 text-sm ${reg.significant ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {reg.significant
                      ? `Statistically significant (p ${formatP(reg.p_value)} < 0.05). On average, each additional game in a day is associated with a ${reg.slope > 0 ? 'gain' : 'loss'} of ${Math.abs(reg.slope)} elo per game. But R² = ${reg.r2}, so daily volume explains only ${(reg.r2 * 100).toFixed(1)}% of the variation.`
                      : `Not statistically significant (p ${formatP(reg.p_value)} ≥ 0.05). No reliable relationship between how many games you play in a day and your average elo change per game.`}
                  </p>
                </div>
              ) : (
                <div className="mt-4 text-sm text-slate-500">Not enough data for a regression.</div>
              )}
            </div>

            {/* Win rate after a win/loss streak */}
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <h2 className="text-sm font-medium text-slate-300 mb-1">Win rate after a streak</h2>
              <p className="text-xs text-slate-500 mb-4">
                Win rate of the next game after consecutive losses (left) or wins (right). Green is winning, red is losing, gray is even. Bars fade when based on few games.
              </p>
              <div className="[&_*:focus]:outline-none">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={streakData} margin={{ top: 4, right: 8, bottom: 24, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#e2e8f0', fontSize: 11 }}
                      interval={0}
                      label={{ value: 'Streak before the game', position: 'insideBottom', offset: -14, fill: '#94a3b8', fontSize: 12 }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tick={{ fill: '#e2e8f0', fontSize: 12 }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <ReferenceLine y={50} stroke="#64748b" strokeDasharray="3 3" />
                    <Tooltip cursor={{ fill: '#334155', opacity: 0.3 }} content={<StreakTooltip />} />
                    <Bar dataKey="win_rate" radius={[3, 3, 0, 0]}>
                      {streakData.map((d) => (
                        <Cell
                          key={d.streak}
                          fill={STREAK_COLORS[streakState(d.win_rate)]}
                          fillOpacity={Math.max(0.3, Math.min(1, d.games / 40))}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-slate-500 font-sans">{label}</span>
      <span className="text-slate-100">{value}</span>
    </div>
  );
}
