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

function GainCell({ pct, loading }: { pct: number | null; loading: boolean }) {
  if (pct == null) {
    return <span className="text-slate-600">{loading ? '…' : '—'}</span>;
  }
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
// per-position unrealized gain/loss from live prices.
export function PortfolioComposition({ transactions }: { transactions: Transaction[] }) {
  const holdings = useMemo(() => computeHoldings(transactions), [transactions]);
  const total = useMemo(() => holdings.reduce((s, h) => s + h.value, 0), [holdings]);
  const currency = holdings[0]?.currency ?? 'EUR';

  const tickerKey = useMemo(
    () => holdings.map((h) => h.ticker).sort().join(','),
    [holdings],
  );
  const [quotes, setQuotes] = useState<Quotes | null>(null);
  const [loadingQuotes, setLoadingQuotes] = useState(false);

  useEffect(() => {
    if (!tickerKey) {
      setQuotes(null);
      return;
    }
    let cancelled = false;
    setLoadingQuotes(true);
    axios
      .get<Quotes>('/api/investing/quotes', { params: { tickers: tickerKey } })
      .then((res) => {
        if (!cancelled) setQuotes(res.data);
      })
      .catch(() => {
        if (!cancelled) setQuotes(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingQuotes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tickerKey]);

  if (holdings.length === 0) {
    return <p className="text-center text-slate-500">No open positions in this account.</p>;
  }

  return (
    <div>
      <p className="mb-3 text-sm text-slate-400">
        {holdings.length} {holdings.length === 1 ? 'position' : 'positions'} ·{' '}
        {currency} {fmtMoney(total)} invested
      </p>

      {/* Composition bar */}
      <div className="mb-5 flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
        {holdings.map((h, i) => (
          <div
            key={h.ticker}
            style={{ width: `${(h.value / total) * 100}%`, backgroundColor: colorAt(i) }}
            title={`${h.ticker} · ${((h.value / total) * 100).toFixed(1)}%`}
          />
        ))}
      </div>

      {/* Holdings table */}
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="border-b border-slate-800 px-3 py-2 text-left font-medium">Stock</th>
              <th className="border-b border-slate-800 px-3 py-2 text-right font-medium">Shares</th>
              <th className="border-b border-slate-800 px-3 py-2 text-right font-medium">Value</th>
              <th className="border-b border-slate-800 px-3 py-2 text-right font-medium">
                Gain/Loss
              </th>
              <th className="border-b border-slate-800 px-3 py-2 text-right font-medium">Weight</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h, i) => (
              <tr key={h.ticker} className="border-b border-slate-800 last:border-b-0">
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: colorAt(i) }}
                    />
                    <span className="font-bold text-slate-100">{h.ticker}</span>
                  </span>
                </td>
                <td className="border-l border-slate-800 px-3 py-2.5 text-right text-slate-400">
                  {fmtShares(h.shares)}
                </td>
                <td className="border-l border-slate-800 px-3 py-2.5 text-right text-slate-200">
                  {h.currency} {fmtMoney(h.value)}
                </td>
                <td className="border-l border-slate-800 px-3 py-2.5 text-right font-medium">
                  <GainCell pct={gainPct(h, quotes)} loading={loadingQuotes} />
                </td>
                <td className="border-l border-slate-800 px-3 py-2.5 text-right text-slate-400">
                  {((h.value / total) * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
