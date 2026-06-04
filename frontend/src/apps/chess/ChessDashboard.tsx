import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Crown } from 'lucide-react';

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
const SEG: Record<ResultKey, { label: string; bar: string; text: string }> = {
  win: { label: 'Won', bar: 'bg-emerald-500', text: 'text-emerald-400' },
  draw: { label: 'Drawn', bar: 'bg-slate-400', text: 'text-slate-300' },
  loss: { label: 'Lost', bar: 'bg-red-500', text: 'text-red-400' },
};
const SEG_KEYS: ResultKey[] = ['win', 'draw', 'loss'];

interface RapidStats {
  username: string;
  total: number;
  record: GameRecord;
  months: MonthCount[];
  by_game_index: GameIndexBar[];
  after_results: AfterResult[];
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
        <header className="flex items-center justify-center gap-3 mb-1">
          <Crown className="w-7 h-7 text-emerald-400" />
          <h1 className="text-2xl font-semibold">Chess</h1>
        </header>
        <p className="text-slate-400 text-sm mb-6 text-center">
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
                  className="pointer-events-none absolute inset-y-0 border-l border-dashed border-slate-400"
                  style={{ left: 'calc(50% + 1rem)' }}
                />
              </div>
            </div>

            {/* Win rate after the previous game's result */}
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <h2 className="text-lg font-semibold text-slate-200 text-center mb-1">Win rate after the previous game</h2>
              <p className="text-xs text-slate-500 text-center mb-4">
                Win rate of a game grouped by the result of the game right before it. Only counts games that follow another game on the same day, where a day runs 3 AM to 3 AM Paris time. Draws count as half a win.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-700">
                    <th className="py-2 font-medium">Previous game</th>
                    <th className="py-2 font-medium text-right">Win rate</th>
                    <th className="py-2 font-medium text-right">Games</th>
                  </tr>
                </thead>
                <tbody>
                  {afterResults.map((r) => (
                    <tr key={r.after} className="border-b border-slate-800 last:border-0">
                      <td className="py-2.5 text-slate-300">{AFTER_LABEL[r.after]}</td>
                      <td className={`py-2.5 text-right font-mono ${r.win_rate == null ? 'text-slate-600' : afterColor(r.win_rate)}`}>
                        {r.win_rate == null ? '—' : `${r.win_rate}%`}
                      </td>
                      <td className="py-2.5 text-right font-mono text-slate-400">{r.games}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
