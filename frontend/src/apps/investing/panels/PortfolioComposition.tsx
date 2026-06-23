import { useMemo } from 'react';
import type { Transaction } from '../types';

interface Holding {
  ticker: string;
  shares: number;
  avgCost: number;
  value: number; // cost basis of the remaining shares (avgCost * shares)
  currency: string;
}

// Net open positions implied by a set of transactions, using average-cost
// accounting. Shares = buys - sells; a holding's value is the cost basis of the
// shares still held (we have no live market price here). Closed/short positions
// (net shares <= 0) are dropped.
function computeHoldings(txs: Transaction[]): Holding[] {
  const agg = new Map<
    string,
    { buyQty: number; buyCost: number; sellQty: number; currency: string }
  >();
  for (const t of txs) {
    const a =
      agg.get(t.stock_ticker) ??
      { buyQty: 0, buyCost: 0, sellQty: 0, currency: t.price_currency };
    if (t.transaction_type === 'BUY') {
      a.buyQty += t.quantity;
      a.buyCost += t.quantity * t.price_per_share;
    } else {
      a.sellQty += t.quantity;
    }
    agg.set(t.stock_ticker, a);
  }

  const holdings: Holding[] = [];
  for (const [ticker, a] of agg) {
    const shares = a.buyQty - a.sellQty;
    if (shares <= 1e-9) continue;
    const avgCost = a.buyQty > 0 ? a.buyCost / a.buyQty : 0;
    holdings.push({ ticker, shares, avgCost, value: avgCost * shares, currency: a.currency });
  }
  return holdings.sort((x, y) => y.value - x.value);
}

// Distinct, readable colors for the composition segments (cycled if exceeded).
const COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4',
];
const colorAt = (i: number) => COLORS[i % COLORS.length];

const fmtShares = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 4 });
const fmtMoney = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 0 });

// "Portfolio" — current composition of the open positions in the given
// (already account-filtered) transactions, weighted by amount invested.
export function PortfolioComposition({ transactions }: { transactions: Transaction[] }) {
  const holdings = useMemo(() => computeHoldings(transactions), [transactions]);
  const total = useMemo(() => holdings.reduce((s, h) => s + h.value, 0), [holdings]);
  const currency = holdings[0]?.currency ?? 'EUR';

  if (holdings.length === 0) {
    return <p className="text-slate-500">No open positions in this account.</p>;
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

      {/* Holdings list */}
      <div className="space-y-1.5">
        {holdings.map((h, i) => {
          const weight = (h.value / total) * 100;
          return (
            <div
              key={h.ticker}
              className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-800/40 px-4 py-2.5"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorAt(i) }}
              />
              <span className="w-16 font-bold text-slate-100">{h.ticker}</span>
              <span className="text-sm text-slate-400">{fmtShares(h.shares)} shares</span>
              <span className="ml-auto text-sm text-slate-300">
                {h.currency} {fmtMoney(h.value)}
              </span>
              <span className="w-14 text-right text-sm font-medium text-slate-400">
                {weight.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
