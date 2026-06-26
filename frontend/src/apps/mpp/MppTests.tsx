import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { RefreshCw, X } from 'lucide-react';
import type { MppCoteCell, MppTestMatch, MppTests } from './types';

// "Tests" tab: a matches-by-fetches table. Rows are the watched fixtures; each
// column is one re-fetch round. Every cell is a small 1/N/2 table showing the
// cotes and the prono split. A column is removed via a confirm modal.

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

const num = (v: number | null, suffix = '') => (v == null ? '.' : `${v}${suffix}`);
const pct = (v: number | null) => (v == null ? null : Math.round(v * 100));

export function MppTests() {
  const [data, setData] = useState<MppTests | null>(null);
  const [fetching, setFetching] = useState(false);
  const [pending, setPending] = useState<string | null>(null); // batch_at to delete
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
      .catch(() => setError('delete_failed'))
      .finally(() => setPending(null));
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
      <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div />
        <h1 className="text-center text-lg font-semibold text-slate-100">Tests</h1>
        <div className="flex justify-end">
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
        <Table data={data} onAskRemove={setPending} />
      )}

      {pending && (
        <ConfirmModal
          label={fmtFetch(pending)}
          onCancel={() => setPending(null)}
          onConfirm={() => removeColumn(pending)}
        />
      )}
    </div>
  );
}

function Table({ data, onAskRemove }: { data: MppTests; onAskRemove: (b: string) => void }) {
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
                className="relative border border-slate-700 bg-slate-800/60 px-8 py-2 font-medium text-slate-300"
              >
                {fmtFetch(c)}
                <button
                  onClick={() => onAskRemove(c)}
                  title="Remove this fetch"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-red-500 transition-colors hover:bg-red-500/15 hover:text-red-400"
                >
                  <X className="h-4 w-4" />
                </button>
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
                <td key={c} className="border border-slate-700 px-2 py-2 align-middle">
                  <Cell match={m} cell={m.cells[c]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ match, cell }: { match: MppTestMatch; cell: MppCoteCell | undefined }) {
  if (!cell) return <span className="text-slate-600">.</span>;
  const { cote, prono } = cell;
  return (
    <table className="mx-auto border-collapse text-center">
      <tbody>
        <tr className="text-[11px] text-slate-400">
          <Td>{match.home ?? '1'}</Td>
          <Td>N</Td>
          <Td>{match.away ?? '2'}</Td>
        </tr>
        <tr className="font-mono text-slate-100">
          <Td>{num(cote.home)}</Td>
          <Td>{num(cote.draw)}</Td>
          <Td>{num(cote.away)}</Td>
        </tr>
        <tr className="font-mono text-[11px] text-slate-400">
          <Td>{num(pct(prono.home), '%')}</Td>
          <Td>{num(pct(prono.draw), '%')}</Td>
          <Td>{num(pct(prono.away), '%')}</Td>
        </tr>
      </tbody>
    </table>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border border-slate-700/70 px-2 py-0.5">{children}</td>;
}

function ConfirmModal({
  label, onCancel, onConfirm,
}: { label: string; onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-100">Remove this fetch?</h2>
        <p className="mt-1.5 text-sm text-slate-400">
          The column from <span className="text-slate-200">{label}</span> will be deleted for all
          matches. This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-500/90 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
          >
            Remove
          </button>
        </div>
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
