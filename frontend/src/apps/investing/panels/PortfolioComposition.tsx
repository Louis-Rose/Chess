import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import type { Transaction } from '../types';
import { computeHoldings, type Holding } from '../holdings';
import { useDisplayCurrency } from '../currency';

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

// Current market price of a holding in its own recorded currency, or null if
// we can't price it. Native prices are USD; EUR holdings convert via EURUSD.
function priceInCurrency(h: Holding, q: Quotes | null): number | null {
  const px = q?.prices[h.ticker];
  if (px == null) return null;
  if (h.currency === 'USD') return px;
  if (h.currency === 'EUR') return q?.eurusd ? px / q.eurusd : null;
  return null;
}

type SortKey = 'stock' | 'weight' | 'shares' | 'invested' | 'current' | 'gain';
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'stock', label: 'Ticker' },
  { key: 'weight', label: 'Weight' },
  { key: 'shares', label: 'Shares' },
  { key: 'invested', label: 'Invested capital' },
  { key: 'current', label: 'Current value' },
  { key: 'gain', label: 'Gain/Loss' },
];

interface Row extends Holding {
  investedDisplay: number | null; // cost basis, in the display currency
  currentDisplay: number | null; // market value, in the display currency
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
// (already account-filtered) transactions: invested capital vs current value,
// per-position gain/loss from live prices, weighted by amount invested. All
// money is shown in the app-wide display currency.
export function PortfolioComposition({ transactions }: { transactions: Transaction[] }) {
  const { display } = useDisplayCurrency();
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
  const [sortKey, setSortKey] = useState<SortKey>('weight');
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

  // Convert an amount from a recorded currency into the display currency.
  const conv = useMemo(() => {
    const rate = quotes?.eurusd ?? null;
    return (amount: number | null, from: string): number | null => {
      if (amount == null) return null;
      if (from === display) return amount;
      if (!rate) return null;
      if (from === 'EUR') return amount * rate; // EUR -> USD
      if (from === 'USD') return amount / rate; // USD -> EUR
      return null;
    };
  }, [quotes, display]);

  const rows = useMemo<Row[]>(
    () =>
      holdings.map((h) => {
        const px = quotes?.prices[h.ticker];
        const price = priceInCurrency(h, quotes);
        return {
          ...h,
          investedDisplay: conv(h.value, h.currency),
          currentDisplay: px != null ? conv(px * h.shares, 'USD') : null,
          gain: price != null && h.avgCost > 0 ? (price / h.avgCost - 1) * 100 : null,
          weight: h.value / total,
        };
      }),
    [holdings, quotes, conv, total],
  );

  // Totals in the display currency. Invested covers all positions; current and
  // overall gain cover only the positions we can price.
  const totals = useMemo(() => {
    let invested = 0;
    let investedOk = true;
    let current = 0;
    let currentAny = false;
    let investedPriced = 0;
    let currentPriced = 0;
    for (const h of holdings) {
      const iv = conv(h.value, h.currency);
      if (iv == null) investedOk = false;
      else invested += iv;
      const px = quotes?.prices[h.ticker];
      if (px != null) {
        const cv = conv(px * h.shares, 'USD');
        if (cv != null) {
          current += cv;
          currentAny = true;
          if (iv != null) {
            investedPriced += iv;
            currentPriced += cv;
          }
        }
      }
    }
    return {
      invested: investedOk ? invested : null,
      current: currentAny ? current : null,
      gain: investedPriced > 0 ? (currentPriced / investedPriced - 1) * 100 : null,
    };
  }, [holdings, quotes, conv]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    const dir = sortDir === 'asc' ? 1 : -1;
    const nullable = (a: number | null, b: number | null) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1; // nulls always last
      if (b == null) return -1;
      return (a - b) * dir;
    };
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'stock':
          return a.ticker.localeCompare(b.ticker) * dir;
        case 'weight':
          return (a.weight - b.weight) * dir;
        case 'shares':
          return (a.shares - b.shares) * dir;
        case 'invested':
          return nullable(a.investedDisplay, b.investedDisplay);
        case 'current':
          return nullable(a.currentDisplay, b.currentDisplay);
        case 'gain':
          return nullable(a.gain, b.gain);
      }
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

  const money = (v: number | null) =>
    v != null ? `${fmtMoney(v)} ${sym(display)}` : loadingQuotes ? '…' : '—';

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
                    className={`border-b border-slate-800 px-3 py-2.5 ${i > 0 ? 'border-l' : ''}`}
                  >
                    <button
                      onClick={() => toggleSort(c.key)}
                      className="flex w-full items-center justify-center gap-1 whitespace-nowrap text-xs font-bold uppercase tracking-wide text-white transition-colors hover:text-emerald-300"
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
                  {(h.weight * 100).toFixed(1)}%
                </td>
                <td className="border-l border-slate-800 px-3 py-2.5 text-center text-slate-400">
                  {fmtShares(h.shares)}
                </td>
                <td className="border-l border-slate-800 px-3 py-2.5 text-center text-slate-200">
                  {money(h.investedDisplay)}
                </td>
                <td className="border-l border-slate-800 px-3 py-2.5 text-center text-slate-200">
                  {money(h.currentDisplay)}
                </td>
                <td className="border-l border-slate-800 px-3 py-2.5 text-center font-medium">
                  <GainText pct={h.gain} loading={loadingQuotes} />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-700 font-bold text-white">
              <td colSpan={3} className="px-3 py-2.5 text-center">
                TOTAL
              </td>
              <td className="border-l border-slate-800 px-3 py-2.5 text-center">
                {money(totals.invested)}
              </td>
              <td className="border-l border-slate-800 px-3 py-2.5 text-center">
                {money(totals.current)}
              </td>
              <td className="border-l border-slate-800 px-3 py-2.5 text-center">
                <GainText pct={totals.gain} loading={loadingQuotes} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
