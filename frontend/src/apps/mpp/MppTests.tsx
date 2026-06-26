import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RefreshCw } from 'lucide-react';
import type { MppCoteSnapshot, MppTestMatch, MppTests } from './types';

// "Tests" tab: re-fetch a few watched fixtures' cotes (1/N/2 reward points) and
// prono split on demand and keep the full history, so we can watch them drift.
type Metric = 'cote' | 'prono';

const SERIES = [
  { key: 'home', label: '1', color: '#10b981' },
  { key: 'draw', label: 'N', color: '#f59e0b' },
  { key: 'away', label: '2', color: '#3b82f6' },
] as const;

const fmtTime = (iso: string) => {
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
};

const fmtDate = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
};

const pct = (v: number | null) => (v == null ? null : Math.round(v * 100));

export function MppTests() {
  const [data, setData] = useState<MppTests | null>(null);
  const [metric, setMetric] = useState<Metric>('cote');
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setFetching(true);
    setError(null);
    axios
      .post<MppTests>('/api/mpp/tests/fetch')
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.data?.error || 'fetch_failed'))
      .finally(() => setFetching(false));
  }, []);

  // Load stored history; if nothing has ever been fetched, fetch once now.
  useEffect(() => {
    let active = true;
    axios
      .get<MppTests>('/api/mpp/tests')
      .then((r) => {
        if (!active) return;
        setData(r.data);
        const empty = r.data.matches.every((m) => m.snapshots.length === 0);
        if (r.data.matches.length === 0 || empty) refetch();
      })
      .catch(() => active && setError('load_failed'));
    return () => {
      active = false;
    };
  }, [refetch]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Tests</h1>
          <p className="text-sm text-slate-400">
            Do the cotes and probabilities move over time? Re-fetch to add a point.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Toggle metric={metric} onChange={setMetric} />
          <button
            onClick={refetch}
            disabled={fetching}
            className="flex items-center gap-2 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} />
            {fetching ? 'Fetching.' : 'Re-fetch now'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          {error === 'token_expired'
            ? 'Your MPP token expired. Reconnect from the Connect screen.'
            : 'Could not reach MPP. Try again in a moment.'}
        </p>
      )}

      {data === null ? (
        <Spinner />
      ) : data.matches.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">
          No watched matches resolved yet. Hit Re-fetch to find them.
        </p>
      ) : (
        <div className="space-y-5">
          {data.matches.map((m) => (
            <MatchCard key={m.match_id} match={m} metric={metric} />
          ))}
        </div>
      )}
    </div>
  );
}

function Toggle({ metric, onChange }: { metric: Metric; onChange: (m: Metric) => void }) {
  const opts: { key: Metric; label: string }[] = [
    { key: 'cote', label: 'Cotes' },
    { key: 'prono', label: 'Probabilities' },
  ];
  return (
    <div className="flex rounded-lg border border-slate-700 p-0.5 text-sm">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`rounded-md px-3 py-1 font-medium transition-colors ${
            metric === o.key ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function MatchCard({ match, metric }: { match: MppTestMatch; metric: Metric }) {
  const date = fmtDate(match.date);
  const rows = [...match.snapshots].reverse(); // newest first in the table
  const value = (s: MppCoteSnapshot, key: 'home' | 'draw' | 'away') =>
    metric === 'cote' ? s.cote[key] : pct(s.prono[key]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-slate-100">
          {match.home ?? '?'} <span className="text-slate-500">vs</span> {match.away ?? '?'}
        </h2>
        <span className="text-xs text-slate-500">
          {date}
          {match.status && match.status !== 'upcoming' ? ` . ${match.status}` : ''}
          {` . ${match.snapshots.length} fetch${match.snapshots.length === 1 ? '' : 'es'}`}
        </span>
      </div>

      <Chart match={match} metric={metric} />

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-1.5 pr-3 font-medium">Fetched</th>
              {SERIES.map((s) => (
                <th key={s.key} className="py-1.5 pr-3 text-right font-medium">
                  {metric === 'cote' ? 'Cote ' : 'P '}
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={i} className="border-t border-slate-800/70 text-slate-200">
                <td className="py-1.5 pr-3 text-slate-400">{fmtTime(s.fetched_at)}</td>
                {SERIES.map((ser) => {
                  const v = value(s, ser.key);
                  return (
                    <td key={ser.key} className="py-1.5 pr-3 text-right font-mono">
                      {v == null ? '.' : metric === 'prono' ? `${v}%` : v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Chart({ match, metric }: { match: MppTestMatch; metric: Metric }) {
  if (match.snapshots.length < 2) {
    return (
      <p className="py-4 text-center text-xs text-slate-500">
        One data point so far. Re-fetch later to see movement.
      </p>
    );
  }
  const chartData = match.snapshots.map((s) => ({
    t: fmtTime(s.fetched_at),
    home: metric === 'cote' ? s.cote.home : pct(s.prono.home),
    draw: metric === 'cote' ? s.cote.draw : pct(s.prono.draw),
    away: metric === 'cote' ? s.cote.away : pct(s.prono.away),
  }));

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 11 }} stroke="#334155" />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 11 }}
            stroke="#334155"
            domain={['auto', 'auto']}
            unit={metric === 'prono' ? '%' : ''}
          />
          <Tooltip
            contentStyle={{
              background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12,
            }}
            labelStyle={{ color: '#94a3b8' }}
          />
          {SERIES.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex h-40 items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-500" />
    </div>
  );
}
