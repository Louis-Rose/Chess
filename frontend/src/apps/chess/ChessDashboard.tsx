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

interface RapidStats {
  username: string;
  total: number;
  months: MonthCount[];
  after_results: AfterResult[];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${MONTH_NAMES[Number(m) - 1]} '${y.slice(2)}`;
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
  const afterResults = data?.after_results ?? [];

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

            {/* Win rate after the previous game's result */}
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
              <h2 className="text-sm font-medium text-slate-300 mb-1">Win rate after the previous game</h2>
              <p className="text-xs text-slate-500 mb-4">
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
    </div>
  );
}
