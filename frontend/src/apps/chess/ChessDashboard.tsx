import { useEffect, useState } from 'react';
import axios from 'axios';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Crown } from 'lucide-react';

interface MonthCount {
  month: string; // 'YYYY-MM'
  count: number;
}

interface RapidByMonth {
  username: string;
  total: number;
  months: MonthCount[];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${MONTH_NAMES[Number(m) - 1]} '${y.slice(2)}`;
}

export function ChessDashboard() {
  const [data, setData] = useState<RapidByMonth | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get<RapidByMonth>('/api/chess/rapid-by-month')
      .then(r => setData(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const chartData = (data?.months ?? []).map(m => ({ ...m, label: monthLabel(m.month) }));

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 font-sans p-6">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center gap-3 mb-1">
          <Crown className="w-7 h-7 text-emerald-400" />
          <h1 className="text-2xl font-semibold">Chess</h1>
        </header>
        <p className="text-slate-400 text-sm mb-6">
          Rapid games on chess.com
          {data && <> — <span className="text-slate-200 font-mono">{data.username}</span>, {data.total} games total</>}
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

        {!loading && !error && chartData.length === 0 && (
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-6 text-center text-slate-400 text-sm">
            No rapid games found.
          </div>
        )}

        {!loading && !error && chartData.length > 0 && (
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
            <h2 className="text-sm font-medium text-slate-300 mb-4">Games per month</h2>
            <div className="[&_*:focus]:outline-none">
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 24, left: -8 }}>
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
        )}
      </div>
    </div>
  );
}
