import type { Transaction } from './types';

export interface Holding {
  ticker: string;
  shares: number;
  avgCost: number;
  value: number; // cost basis of the remaining shares (avgCost * shares)
  currency: string;
}

// Net open positions implied by a set of transactions, using average-cost
// accounting. Shares = buys - sells; a holding's value is the cost basis of the
// shares still held (we have no live market price here). Closed/short positions
// (net shares <= 0) are dropped. Sorted by value, largest first.
export function computeHoldings(txs: Transaction[]): Holding[] {
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

// The set of tickers currently held (net shares > 0) in the given transactions.
export function ownedTickers(txs: Transaction[]): Set<string> {
  return new Set(computeHoldings(txs).map((h) => h.ticker));
}
