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
import type { MppData, MppHistory } from './types';

// Distinct colours for the other players; the owner's own line is always
// emerald and thicker, so it never collides with these.
const COLORS = [
  '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6',
  '#eab308', '#f97316', '#8b5cf6', '#06b6d4', '#84cc16', '#f43f5e',
];
const ME_COLOR = '#10b981';

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

// Progression tab: points over time, one line per player. MPP exposes no
// historical standings, so the series starts the first day this was opened and
// grows by one point per day.
export function MppGraph() {
  const [contests, setContests] = useState<{ id: string; title: string }[]>([]);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [history, setHistory] = useState<MppHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios
      .get<MppData>('/api/mpp/data')
      .then((r) => {
        const cs = r.data.contests
          .filter((c) => c.id != null)
          .map((c) => ({ id: String(c.id), title: c.title ?? 'League' }));
        setContests(cs);
        setChallengeId(cs[0]?.id ?? null);
        if (!cs.length) setLoading(false);
      })
      .catch(() => {
        setError('Could not load your leagues.');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!challengeId) return;
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

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-100">Progression</h2>
        {contests.length > 1 && (
          <select
            value={challengeId ?? ''}
            onChange={(e) => setChallengeId(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm text-slate-200"
          >
            {contests.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {error}
        </div>
      )}

      {loading && !history ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-10 text-center text-slate-400">
          Loading progression...
        </div>
      ) : history && history.users.length ? (
        <>
          <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4">
            <div className="h-96 w-full">
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
          </div>
          {history.rows.length <= 1 && (
            <p className="text-center text-sm text-slate-500">
              Today is the first recorded day. The chart fills in one point per day from here.
            </p>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-10 text-center text-slate-400">
          No data yet.
        </div>
      )}
    </div>
  );
}
