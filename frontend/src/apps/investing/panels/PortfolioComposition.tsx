import { useEffect, useMemo, useState, type ReactNode } from 'react';
import axios from 'axios';
import { Download, Eye, EyeOff } from 'lucide-react';
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

type SortKey =
  | 'stock'
  | 'price'
  | 'weight'
  | 'shares'
  | 'invested'
  | 'current'
  | 'gainAbs'
  | 'gainPct';
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'stock', label: 'Ticker' },
  { key: 'price', label: 'Stock price' },
  { key: 'weight', label: 'Weight' },
  { key: 'shares', label: 'Shares' },
  { key: 'invested', label: 'Invested capital' },
  { key: 'current', label: 'Current value' },
  { key: 'gainAbs', label: 'Gain/Loss (absolute)' },
  { key: 'gainPct', label: 'Gain/Loss (percentage)' },
];

// Columns hidden in private mode, and the leading "label" group the TOTAL spans.
const PRIVATE_HIDDEN = new Set<SortKey>(['shares', 'invested', 'current', 'gainAbs']);
const LABEL_GROUP = new Set<SortKey>(['stock', 'price', 'weight', 'shares']);
// Money columns: the currency symbol goes in the header, not the cells.
const CURRENCY_COLS = new Set<SortKey>(['price', 'invested', 'current', 'gainAbs']);

interface Row extends Holding {
  price: number | null; // current market price per share, in the display currency
  investedDisplay: number | null; // cost basis, in the display currency
  currentDisplay: number | null; // market value, in the display currency
  gainAbs: number | null; // current - invested, in the display currency
  gainPct: number | null;
  weight: number;
}

function GainPct({ pct, loading }: { pct: number | null; loading: boolean }) {
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
// per-position gain/loss (absolute and %) from live prices, weighted by amount
// invested. All money is shown in the app-wide display currency. A "private"
// toggle hides the money columns for over-the-shoulder discretion.
export function PortfolioComposition({ transactions }: { transactions: Transaction[] }) {
  const { display, isPrivate, setIsPrivate } = useDisplayCurrency();
  const holdings = useMemo(() => computeHoldings(transactions), [transactions]);

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

  const rows = useMemo<Row[]>(() => {
    const base: Row[] = holdings.map((h) => {
      const px = quotes?.prices[h.ticker];
      const price = priceInCurrency(h, quotes);
      const investedDisplay = conv(h.value, h.currency);
      const currentDisplay = px != null ? conv(px * h.shares, 'USD') : null;
      return {
        ...h,
        price: px != null ? conv(px, 'USD') : null,
        investedDisplay,
        currentDisplay,
        gainAbs:
          investedDisplay != null && currentDisplay != null
            ? currentDisplay - investedDisplay
            : null,
        gainPct: price != null && h.avgCost > 0 ? (price / h.avgCost - 1) * 100 : null,
        weight: 0,
      };
    });
    // Weight by current market value (display currency). Positions not yet
    // priced get weight 0 (shown as a placeholder) until quotes arrive.
    const totalW = base.reduce((s, r) => s + (r.currentDisplay ?? 0), 0);
    if (totalW > 0) for (const r of base) r.weight = (r.currentDisplay ?? 0) / totalW;
    return base;
  }, [holdings, quotes, conv]);

  const weightByTicker = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.ticker, r.weight);
    return m;
  }, [rows]);

  // Totals in the display currency. Invested covers all positions; current,
  // absolute and % gain cover only the positions we can price.
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
      gainAbs: investedPriced > 0 ? currentPriced - investedPriced : null,
      gainPct: investedPriced > 0 ? (currentPriced / investedPriced - 1) * 100 : null,
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
        case 'price':
          return nullable(a.price, b.price);
        case 'weight':
          return (a.weight - b.weight) * dir;
        case 'shares':
          return (a.shares - b.shares) * dir;
        case 'invested':
          return nullable(a.investedDisplay, b.investedDisplay);
        case 'current':
          return nullable(a.currentDisplay, b.currentDisplay);
        case 'gainAbs':
          return nullable(a.gainAbs, b.gainAbs);
        case 'gainPct':
          return nullable(a.gainPct, b.gainPct);
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
    v != null ? fmtMoney(v) : loadingQuotes ? '…' : '—';

  const gainAbsCell = (v: number | null) => {
    if (v == null) return <span className="text-slate-600">{loadingQuotes ? '…' : '—'}</span>;
    const up = v >= 0;
    return (
      <span className={up ? 'text-emerald-400' : 'text-rose-400'}>
        {up ? '+' : ''}
        {fmtMoney(v)}
      </span>
    );
  };

  const priceText = (v: number | null) => (v != null ? v.toFixed(2) : loadingQuotes ? '…' : '—');

  const cellClass = (key: SortKey): string => {
    if (key === 'invested' || key === 'current' || key === 'price')
      return 'text-center text-slate-200';
    if (key === 'gainAbs' || key === 'gainPct') return 'text-center font-medium';
    if (key === 'stock') return 'text-center';
    return 'text-center text-slate-400';
  };

  const renderCell = (key: SortKey, h: Row): ReactNode => {
    switch (key) {
      case 'stock':
        return (
          <span className="flex items-center justify-center gap-2.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colorByTicker.get(h.ticker) }}
            />
            <span className="font-bold text-slate-100">{h.ticker}</span>
          </span>
        );
      case 'price':
        return priceText(h.price);
      case 'weight':
        return h.currentDisplay != null
          ? `${(h.weight * 100).toFixed(1)}%`
          : loadingQuotes
            ? '…'
            : '—';
      case 'shares':
        return fmtShares(h.shares);
      case 'invested':
        return money(h.investedDisplay);
      case 'current':
        return money(h.currentDisplay);
      case 'gainAbs':
        return gainAbsCell(h.gainAbs);
      case 'gainPct':
        return <GainPct pct={h.gainPct} loading={loadingQuotes} />;
    }
  };

  // Export the table (full data, regardless of private mode) to CSV.
  const downloadCsv = () => {
    const cur = sym(display);
    const num = (v: number | null, dp = 2) => (v != null ? v.toFixed(dp) : '');
    const header = [
      'Ticker',
      `Stock price (${cur})`,
      'Weight (%)',
      'Shares',
      `Invested capital (${cur})`,
      `Current value (${cur})`,
      `Gain/Loss absolute (${cur})`,
      'Gain/Loss percentage (%)',
    ];
    const lines = [header.join(',')];
    for (const r of sorted) {
      lines.push(
        [
          r.ticker,
          num(r.price),
          (r.weight * 100).toFixed(2),
          r.shares,
          num(r.investedDisplay),
          num(r.currentDisplay),
          num(r.gainAbs),
          num(r.gainPct, 1),
        ].join(','),
      );
    }
    lines.push(
      [
        'TOTAL',
        '',
        '',
        '',
        num(totals.invested),
        num(totals.current),
        num(totals.gainAbs),
        num(totals.gainPct, 1),
      ].join(','),
    );

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolio-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const footerCell = (key: SortKey): ReactNode => {
    switch (key) {
      case 'invested':
        return money(totals.invested);
      case 'current':
        return money(totals.current);
      case 'gainAbs':
        return gainAbsCell(totals.gainAbs);
      case 'gainPct':
        return <GainPct pct={totals.gainPct} loading={loadingQuotes} />;
      default:
        return null;
    }
  };

  if (holdings.length === 0) {
    return <p className="text-center text-slate-500">No open positions in this account.</p>;
  }

  const visibleColumns = COLUMNS.filter((c) => !(isPrivate && PRIVATE_HIDDEN.has(c.key)));
  const labelCols = visibleColumns.filter((c) => LABEL_GROUP.has(c.key));
  const dataCols = visibleColumns.filter((c) => !LABEL_GROUP.has(c.key));

  return (
    <div>
      <div className="mb-3 flex items-center justify-center gap-3">
        <p className="text-sm text-slate-400">
          {holdings.length} {holdings.length === 1 ? 'position' : 'positions'}
        </p>
        <button
          onClick={() => setIsPrivate(!isPrivate)}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
            isPrivate
              ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
              : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
          }`}
        >
          {isPrivate ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          Private
        </button>
        <button
          onClick={downloadCsv}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
      </div>

      {/* Composition bar (kept in value order) */}
      <div className="mb-5 flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
        {holdings.map((h) => {
          const w = weightByTicker.get(h.ticker) ?? 0;
          return (
            <div
              key={h.ticker}
              style={{ width: `${w * 100}%`, backgroundColor: colorByTicker.get(h.ticker) }}
              title={`${h.ticker} · ${(w * 100).toFixed(1)}%`}
            />
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {visibleColumns.map((c, i) => {
                const active = c.key === sortKey;
                return (
                  <th
                    key={c.key}
                    className={`border-b border-slate-800 px-3 py-2.5 align-bottom ${
                      i > 0 ? 'border-l' : ''
                    }`}
                  >
                    <button
                      onClick={() => toggleSort(c.key)}
                      className="w-full text-center text-xs font-bold uppercase tracking-wide text-white transition-colors hover:text-emerald-300"
                    >
                      {CURRENCY_COLS.has(c.key) ? `${c.label} (${sym(display)})` : c.label}
                      {active && (
                        <span className="text-emerald-400"> {sortDir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((h) => (
              <tr key={h.ticker} className="border-b border-slate-800">
                {visibleColumns.map((c, i) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2.5 ${i > 0 ? 'border-l border-slate-800' : ''} ${cellClass(
                      c.key,
                    )}`}
                  >
                    {renderCell(c.key, h)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-700 font-bold text-white">
              <td colSpan={labelCols.length} className="px-3 py-2.5 text-center">
                TOTAL
              </td>
              {dataCols.map((c) => (
                <td key={c.key} className="border-l border-slate-800 px-3 py-2.5 text-center">
                  {footerCell(c.key)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
