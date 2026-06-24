import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { ChevronDown, TrendingUp, X, Lock, Plus } from 'lucide-react';
import { type CorrelationResponse, averageCorrelation, cellColor } from '../shared';
import { PortfolioStats } from '../PortfolioStats';
import { ownedTickers } from '../holdings';
import type { Transaction } from '../types';

interface UniverseItem {
  ticker: string;
  name: string;
}

// Picker to add a company to the correlation list. Searches the shared universe;
// if the query isn't a known ticker, offers to add it as a new symbol (which the
// backend validates and folds into the universe permanently).
function CompanyAdder({
  universe,
  selected,
  onAdd,
  adding,
}: {
  universe: UniverseItem[];
  selected: string[];
  onAdd: (ticker: string) => void;
  adding: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const q = query.trim().toLowerCase();
  const filtered = (q
    ? universe.filter(
        ({ ticker, name }) =>
          ticker.toLowerCase().includes(q) || name.toLowerCase().includes(q),
      )
    : universe
  ).filter(({ ticker }) => !selectedSet.has(ticker));

  // Offer to add a free-typed symbol when it isn't already an exact known ticker.
  const upper = query.trim().toUpperCase();
  const canAddNew =
    upper.length > 0 &&
    !universe.some((u) => u.ticker === upper) &&
    !selectedSet.has(upper);

  const add = (ticker: string) => {
    onAdd(ticker);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative w-full max-w-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={adding}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-3 text-left transition-colors hover:border-emerald-500 disabled:opacity-60"
      >
        <span className="text-slate-100">{adding ? 'Adding…' : 'Add a company'}</span>
        <ChevronDown
          className={`h-5 w-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-10 mt-2 flex max-h-96 w-full flex-col rounded-xl border border-slate-700 bg-slate-800 shadow-xl">
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a company or ticker…"
            className="m-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
          />
          <div className="overflow-auto pb-1">
            {canAddNew && (
              <button
                type="button"
                onClick={() => add(upper)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-700/60"
              >
                <Plus className="h-4 w-4 text-emerald-400" />
                <span className="font-medium text-slate-100">Add “{upper}”</span>
                <span className="ml-auto text-sm text-slate-500">new ticker</span>
              </button>
            )}
            {filtered.length === 0 && !canAddNew && (
              <p className="px-4 py-3 text-sm text-slate-500">No match.</p>
            )}
            {filtered.map(({ ticker, name }) => (
              <button
                key={ticker}
                type="button"
                onClick={() => add(ticker)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-700/60"
              >
                <span className="font-medium text-slate-100">{name}</span>
                <span className="ml-auto text-sm text-slate-500">{ticker}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// The selected companies as chips. Holdings are pinned (they come from the
// portfolio and can't be removed here); extras carry a remove button.
function SelectionChips({
  selected,
  ownedSet,
  nameOf,
  onRemove,
}: {
  selected: string[];
  ownedSet: Set<string>;
  nameOf: (ticker: string) => string;
  onRemove: (ticker: string) => void;
}) {
  if (selected.length === 0) return null;
  return (
    <div className="flex w-full flex-wrap justify-center gap-2">
      {selected.map((ticker) => {
        const owned = ownedSet.has(ticker);
        return (
          <span
            key={ticker}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 py-1 pl-2.5 pr-1 text-sm text-slate-200"
            title={nameOf(ticker)}
          >
            {owned ? (
              <Lock className="h-3 w-3 text-slate-500" />
            ) : null}
            <span className="font-medium">{ticker}</span>
            {owned ? (
              <span className="px-1 text-xs text-slate-500">holding</span>
            ) : (
              <button
                type="button"
                onClick={() => onRemove(ticker)}
                aria-label={`Remove ${ticker}`}
                className="ml-0.5 rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-700 hover:text-rose-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

function CorrelationMatrix({ data }: { data: CorrelationResponse }) {
  const { tickers, matrix } = data;
  return (
    <div className="overflow-auto">
      <table className="border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="p-2" />
            {tickers.map((t) => (
              <th key={t} className="p-2 text-sm font-semibold text-slate-300">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickers.map((rowT, i) => (
            <tr key={rowT}>
              <th className="whitespace-nowrap p-2 text-right text-sm font-semibold text-slate-300">
                {rowT}
              </th>
              {tickers.map((colT, j) => {
                const v = matrix[i][j];
                return (
                  <td
                    key={colT}
                    className="h-14 w-16 rounded-md text-center text-sm font-medium text-slate-100"
                    style={{ backgroundColor: cellColor(v) }}
                    title={`${rowT} vs ${colT}: ${v.toFixed(3)}`}
                  >
                    {v.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// "Data" — Pearson correlation matrix of daily returns. Each user's list defaults
// to their portfolio holdings and can be extended with extra companies; adding a
// holding to the portfolio adds it here automatically (but not the other way).
export function DataPanel() {
  const [universe, setUniverse] = useState<UniverseItem[]>([]);
  const [owned, setOwned] = useState<string[]>([]);
  const [extras, setExtras] = useState<string[]>([]);
  const [data, setData] = useState<CorrelationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Investing — LUMNA';
  }, []);

  // Load the shared universe, the user's holdings, and their saved extras.
  useEffect(() => {
    axios
      .get<{ tickers: UniverseItem[] }>('/api/investing/universe')
      .then((r) => setUniverse(r.data.tickers ?? []))
      .catch(() => undefined);
    axios
      .get<{ transactions: Transaction[] }>('/api/investing/transactions')
      .then((r) => setOwned([...ownedTickers(r.data.transactions ?? [])]))
      .catch(() => undefined);
    axios
      .get<{ tickers: string[] }>('/api/investing/correlation/extras')
      .then((r) => setExtras(r.data.tickers ?? []))
      .catch(() => undefined);
  }, []);

  // The correlation list: holdings plus extras, de-duplicated.
  const selected = useMemo(() => [...new Set([...owned, ...extras])], [owned, extras]);
  const ownedSet = useMemo(() => new Set(owned), [owned]);
  const nameByTicker = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of universe) m.set(u.ticker, u.name);
    return m;
  }, [universe]);
  const nameOf = (ticker: string) =>
    nameByTicker.get(ticker) ?? data?.names?.[ticker] ?? ticker;

  const tickerKey = useMemo(() => [...selected].sort().join(','), [selected]);

  useEffect(() => {
    if (selected.length < 2) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    axios
      .get<CorrelationResponse>('/api/investing/correlation', {
        params: { tickers: selected.join(',') },
      })
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (cancelled) return;
        setData(null);
        setError(err?.response?.data?.error ?? 'Could not load correlations.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // tickerKey captures the selected set regardless of order
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey]);

  const addTicker = async (ticker: string) => {
    const t = ticker.trim().toUpperCase();
    if (!t || selected.includes(t)) return;
    setAdding(true);
    setAddError(null);
    try {
      const r = await axios.post<{ ticker: string; name: string }>(
        '/api/investing/correlation/extras',
        { ticker: t },
      );
      setExtras((prev) => (prev.includes(r.data.ticker) ? prev : [...prev, r.data.ticker]));
      setUniverse((prev) =>
        prev.some((u) => u.ticker === r.data.ticker)
          ? prev
          : [...prev, { ticker: r.data.ticker, name: r.data.name }],
      );
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setAddError(e?.response?.data?.error ?? 'Could not add that ticker.');
    } finally {
      setAdding(false);
    }
  };

  const removeExtra = async (ticker: string) => {
    setExtras((prev) => prev.filter((t) => t !== ticker)); // optimistic
    try {
      await axios.delete(`/api/investing/correlation/extras/${encodeURIComponent(ticker)}`);
    } catch {
      // best-effort; a reload will resync if it failed
    }
  };

  const avg = useMemo(() => (data ? averageCorrelation(data.matrix) : null), [data]);

  return (
    <div className="px-6 py-10 text-slate-100">
      <div className="mx-auto flex max-w-5xl flex-col items-center">
        <div className="mb-2 flex items-center gap-3">
          <span className="text-2xl font-bold tracking-wide">Data</span>
        </div>
        <p className="mb-8 flex items-center gap-2 text-slate-400">
          <TrendingUp className="h-4 w-4 text-emerald-400" />
          Daily-return correlation of your holdings
        </p>

        <div className="mb-6 flex w-full flex-col items-center gap-4">
          <CompanyAdder
            universe={universe}
            selected={selected}
            onAdd={addTicker}
            adding={adding}
          />
          {addError && <p className="text-sm text-rose-400">{addError}</p>}
          <SelectionChips
            selected={selected}
            ownedSet={ownedSet}
            nameOf={nameOf}
            onRemove={removeExtra}
          />
        </div>

        {selected.length < 2 && (
          <p className="text-slate-500">
            Add at least two companies to compare. Your portfolio holdings show up here
            automatically.
          </p>
        )}

        {loading && (
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-500" />
        )}

        {error && !loading && <p className="text-rose-400">{error}</p>}

        {data && !loading && (
          <div className="flex w-full flex-col items-center gap-6">
            <CorrelationMatrix data={data} />
            {avg !== null && <PortfolioStats data={data} rho={avg} />}
            <p className="text-sm text-slate-500">
              Pearson correlation of daily returns since {data.start} · {data.observations} trading
              days
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
