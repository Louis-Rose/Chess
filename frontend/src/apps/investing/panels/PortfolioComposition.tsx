import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import type { Transaction } from '../types';
import { computeHoldings, type Holding } from '../holdings';

// Distinct, readable colors for the composition segments (cycled if exceeded).
const COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4',
];
const colorAt = (i: number) => COLORS[i % COLORS.length];

const fmtShares = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });
const fmtMoney = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

const CCY: Record<string, string> = { EUR: '€', USD: '$' };
const sym = (c: string) => CCY[c] ?? c;

interface Quotes {
  prices: Record<string, number>; // native (USD for US stocks)
  eurusd: number | null; // USD per 1 EUR
}

// Unrealized gain/loss of a holding, as a percentage of its average cost.
// The market price is native (USD); we convert it into the holding's recorded
// currency before comparing. Returns null when we can't price it.
function gainPct(h: Holding, q: Quotes | null): number | null {
  if (!q) return null;
  const px = q.prices[h.ticker];
  if (px == null || h.avgCost <= 0) return null;
  let priceInCcy: number;
  if (h.currency === 'USD') {
    priceInCcy = px;
  } else if (h.currency === 'EUR') {
    if (!q.eurusd) return null;
    priceInCcy = px / q.eurusd;
  } else {
    return null;
  }
  return (priceInCcy / h.avgCost - 1) * 100;
}

type SortKey = 'stock' | 'shares' | 'value' | 'gain' | 'weight';
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'stock', label: 'Stock' },
  { key: 'shares', label: 'Shares' },
  { key: 'value', label: 'Value' },
  { key: 'gain', label: 'Gain/Loss' },
  { key: 'weight', label: 'Weight' },
];

interface Row extends Holding {
  gain: number | null;
  weight: number;
}

function GainText({ pct, loading }: { pct: number | null; loading: boolean }) {
  if (pct == null) return <span className="text-slate-600">{loading ? '…' : '—'}</span>;
  const up = pct >= 0;
  return (
    <span className={up ? 'text-emerald-400' : 'text-rose-400'}>
      {up ? '+' : ''}
      {pct.toFixed(1)}%
    </span>
  );
}

// "Portfolio" — current composition of the open positions in the given
// (already account-filtered) transactions, weighted by amount invested, with
// per-position unrealized gain/loss from live prices. Sortable columns.
export function PortfolioComposition({ transactions }: { transactions: Transaction[] }) {
  const holdings = useMemo(() => computeHoldings(transactions), [transactions]);
  const total = useMemo(() => holdings.reduce((s, h) => s + h.value, 0), [holdings]);

  // Stable color per ticker, by the default value-descending rank.
  const colorByTicker = useMemo(() => {
    const m = new Map<string, string>();
    holdings.forEach((h, i) => m.set(h.ticker, colorAt(i)));
    return m;
  }, [holdings]);

  const tickerKey = useMemo(() => holdings.map((h) => h.ticker).sort().join(','), [holdings]);
  const [quotes, setQuotes] = useState<Quotes | null>(null);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (!tickerKey) {
      setQuotes(null);
      return;
    }
    let cancelled = false;
    setLoadingQuotes(true);
    axios
      .get<Quotes>('/api/investing/quotes', { params: { tickers: tickerKey } })
      .then((res) => !cancelled && setQuotes(res.data))
      .catch(() => !cancelled && setQuotes(null))
      .finally(() => !cancelled && setLoadingQuotes(false));
    return () => {
      cancelled = true;
    };
  }, [tickerKey]);

  // Invested capital, normalized to EUR (USD cost basis converted at today's
  // rate, matching how gain/loss treats EUR holdings).
  const investedEUR = useMemo(
    () =>
      holdings.reduce((s, h) => {
        if (h.currency === 'USD' && quotes?.eurusd) return s + h.value / quotes.eurusd;
        return s + h.value;
      }, 0),
    [holdings, quotes],
  );

  const rows = useMemo<Row[]>(
    () => holdings.map((h) => ({ ...h, gain: gainPct(h, quotes), weight: h.value / total })),
    [holdings, quotes, total],
  );

  const sorted = useMemo(() => {
    const arr = [...rows];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === 'stock') return a.ticker.localeCompare(b.ticker) * dir;
      if (sortKey === 'gain') {
        if (a.gain == null && b.gain == null) return 0;
        if (a.gain == null) return 1; // nulls always last
        if (b.gain == null) return -1;
        return (a.gain - b.gain) * dir;
      }
      const pick = (r: Row) =>
        sortKey === 'shares' ? r.shares : sortKey === 'weight' ? r.weight : r.value;
      return (pick(a) - pick(b)) * dir;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'stock' ? 'asc' : 'desc');
    }
  };

  if (holdings.length === 0) {
    return <p className="text-center text-slate-500">No open positions in this account.</p>;
  }

  return (
    <div>
      <p className="mb-3 text-center text-sm text-slate-400">
        {holdings.length} {holdings.length === 1 ? 'position' : 'positions'}
      </p>

      {/* Composition bar (kept in value order) */}
      <div className="mb-5 flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
        {holdings.map((h) => (
          <div
            key={h.ticker}
            style={{
              width: `${(h.value / total) * 100}%`,
              backgroundColor: colorByTicker.get(h.ticker),
            }}
            title={`${h.ticker} · ${((h.value / total) * 100).toFixed(1)}%`}
          />
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {COLUMNS.map((c, i) => {
                const active = c.key === sortKey;
                return (
                  <th
                    key={c.key}
                    className={`border-b border-slate-800 px-3 py-2.5 ${
                      i > 0 ? 'border-l' : ''
                    }`}
                  >
                    <button
                      onClick={() => toggleSort(c.key)}
                      className="flex w-full items-center justify-center gap-1 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:text-emerald-300"
                    >
                      {c.label}
                      <span className="text-emerald-400">
                        {active ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => (
              <tr key={h.ticker} className="border-b border-slate-800">
                <td className="px-3 py-2.5 text-center">
                  <span className="flex items-center justify-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colorByTicker.get(h.ticker) }}
                    />
                    <span className="font-bold text-slate-100">{h.ticker}</span>
                  </span>
                </td>
                <td className="border-l border-slate-800 px-3 py-2.5 text-center text-slate-400">
                  {fmtShares(h.shares)}
                </td>
                <td className="border-l border-slate-800 px-3 py-2.5 text-center text-slate-200">
                  {fmtMoney(h.value)} {sym(h.currency)}
                </td>
                <td className="border-l border-slate-800 px-3 py-2.5 text-center font-medium">
                  <GainText pct={h.gain} loading={loadingQuotes} />
                </td>
                <td className="border-l border-slate-800 px-3 py-2.5 text-center text-slate-400">
                  {(h.weight * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-700">
              <td colSpan={2} className="px-3 py-2.5 text-center font-bold text-white">
                Invested capital
              </td>
              <td className="border-l border-slate-800 px-3 py-2.5 text-center font-bold text-white">
                {fmtMoney(investedEUR)} €
              </td>
              <td className="border-l border-slate-800" />
              <td className="border-l border-slate-800" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
