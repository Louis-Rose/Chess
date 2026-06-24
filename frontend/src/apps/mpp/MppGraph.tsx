import { useEffect, useState } from 'react';
import axios from 'axios';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MppHistory } from './types';

// Distinct colours for the other players; the owner's own line is always
// emerald and thicker, so it never collides with these.
const COLORS = [
  '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6',
  '#eab308', '#f97316', '#8b5cf6', '#06b6d4', '#84cc16', '#f43f5e',
];
const ME_COLOR = '#10b981';

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

// Points-over-time for one league, one line per player. MPP exposes no
// historical standings, so the series starts the first day this was opened and
// grows by one point per day. Embedded inside each league card.
export function MppGraph({ challengeId }: { challengeId: string }) {
  const [history, setHistory] = useState<MppHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    axios
      .get<MppHistory>('/api/mpp/history', { params: { challengeId } })
      .then((r) => active && setHistory(r.data))
      .catch(() => active && setError('Could not load the history.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [challengeId]);

  if (loading && !history) {
    return <p className="px-5 py-6 text-sm text-slate-500">Loading progression...</p>;
  }
  if (error) {
    return <p className="px-5 py-6 text-sm text-amber-300">{error}</p>;
  }
  if (!history || !history.users.length) {
    return <p className="px-5 py-6 text-sm text-slate-500">No progression data yet.</p>;
  }

  return (
    <div className="p-4">
      <h3 className="mb-3 px-1 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Progression
      </h3>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history.rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={fmtDate}
              tick={{ fill: '#e2e8f0', fontSize: 12 }}
              axisLine={{ stroke: '#334155' }}
              tickLine={{ stroke: '#334155' }}
            />
            <YAxis
              tick={{ fill: '#e2e8f0', fontSize: 12 }}
              axisLine={{ stroke: '#334155' }}
              tickLine={{ stroke: '#334155' }}
              width={52}
              tickFormatter={(v) => (v as number).toLocaleString('fr-FR')}
            />
            <Tooltip
              contentStyle={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: 8,
                color: '#e2e8f0',
                fontSize: 12,
              }}
              labelStyle={{ color: '#94a3b8' }}
              labelFormatter={(v) => fmtDate(v as string)}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: '#e2e8f0' }} />
            {history.users.map((u, i) => {
              const isMe = u.id === history.me_user_id;
              return (
                <Line
                  key={u.id}
                  type="monotone"
                  dataKey={u.id}
                  name={u.name}
                  stroke={isMe ? ME_COLOR : COLORS[i % COLORS.length]}
                  strokeWidth={isMe ? 3 : 1.5}
                  dot={{ r: 2 }}
                  connectNulls
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {history.rows.length <= 1 && (
        <p className="mt-3 text-center text-xs text-slate-500">
          Today is the first recorded day. The chart fills in one point per day from here.
        </p>
      )}
    </div>
  );
}
