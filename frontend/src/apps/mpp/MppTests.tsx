import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { RefreshCw, X } from 'lucide-react';
import type { MppCoteCell, MppTests } from './types';

// "Tests" tab: a matches-by-fetches table. Rows are the watched fixtures; each
// column is one re-fetch round, holding that match's cotes (1/N/2) and the
// prono split in a single cell. A column can be removed with one click.

const asUtc = (iso: string) => (iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);

const fmtFetch = (iso: string) =>
  new Date(asUtc(iso)).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

const fmtKickoff = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleString('en-GB', {
        weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      });
};

const triple = (a: number | null, b: number | null, c: number | null, suffix = '') =>
  [a, b, c].map((v) => (v == null ? '.' : `${v}${suffix}`)).join(' · ');

const pct = (v: number | null) => (v == null ? null : Math.round(v * 100));

export function MppTests() {
  const [data, setData] = useState<MppTests | null>(null);
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

  const removeColumn = useCallback((batchAt: string) => {
    axios
      .delete<MppTests>('/api/mpp/tests/batch', { params: { batchAt } })
      .then((r) => setData(r.data))
      .catch(() => setError('delete_failed'));
  }, []);

  // Load stored history; if nothing has ever been fetched, fetch once now.
  useEffect(() => {
    let active = true;
    axios
      .get<MppTests>('/api/mpp/tests')
      .then((r) => {
        if (!active) return;
        setData(r.data);
        if (r.data.columns.length === 0) refetch();
      })
      .catch(() => active && setError('load_failed'));
    return () => {
      active = false;
    };
  }, [refetch]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Tests</h1>
          <p className="text-sm text-slate-400">
            Each cell: cotes (1 · N · 2) then probabilities. Re-fetch to add a column.
          </p>
        </div>
        <button
          onClick={refetch}
          disabled={fetching}
          className="flex items-center gap-2 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${fetching ? 'animate-spin' : ''}`} />
          {fetching ? 'Fetching.' : 'Re-fetch now'}
        </button>
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
        <Table data={data} onRemove={removeColumn} />
      )}
    </div>
  );
}

function Table({ data, onRemove }: { data: MppTests; onRemove: (b: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border border-slate-700 text-center text-sm">
        <thead>
          <tr>
            <th className="border border-slate-700 bg-slate-800/60 px-3 py-2 text-center font-medium text-slate-300">
              Match
            </th>
            {data.columns.map((c) => (
              <th
                key={c}
                className="border border-slate-700 bg-slate-800/60 px-3 py-2 font-medium text-slate-300"
              >
                <div className="flex items-center justify-center gap-1.5">
                  <span>{fmtFetch(c)}</span>
                  <button
                    onClick={() => onRemove(c)}
                    title="Remove this fetch"
                    className="rounded p-0.5 text-slate-500 transition-colors hover:bg-red-500/15 hover:text-red-400"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.matches.map((m) => (
            <tr key={m.match_id}>
              <td className="border border-slate-700 px-3 py-2 align-middle">
                <div className="font-semibold text-slate-100">
                  {m.home ?? '?'} <span className="text-slate-500">vs</span> {m.away ?? '?'}
                </div>
                {fmtKickoff(m.date) && (
                  <div className="text-xs text-slate-500">{fmtKickoff(m.date)}</div>
                )}
              </td>
              {data.columns.map((c) => (
                <td key={c} className="border border-slate-700 px-3 py-2 align-middle">
                  <Cell cell={m.cells[c]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ cell }: { cell: MppCoteCell | undefined }) {
  if (!cell) return <span className="text-slate-600">.</span>;
  const { cote, prono } = cell;
  return (
    <div className="space-y-0.5">
      <div className="font-mono text-slate-100">{triple(cote.home, cote.draw, cote.away)}</div>
      <div className="font-mono text-xs text-slate-400">
        {triple(pct(prono.home), pct(prono.draw), pct(prono.away), '%')}
      </div>
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
