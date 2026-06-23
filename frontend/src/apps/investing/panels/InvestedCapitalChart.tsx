import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Area,
  AreaChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Transaction } from '../types';
import { useDisplayCurrency, type DisplayCurrency } from '../currency';

const sym = (c: DisplayCurrency) => (c === 'USD' ? '$' : '€');
const fmtMoney = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtAxisMoney = (n: number) =>
  Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`;
const fmtTick = (ts: number) =>
  new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

interface History {
  dates: string[];
  prices: Record<string, (number | null)[]>;
}

interface Point {
  t: number;
  invested: number;
  value: number | null;
}

const byDateTimeId = (a: Transaction, b: Transaction) => {
  if (a.transaction_date !== b.transaction_date)
    return a.transaction_date < b.transaction_date ? -1 : 1;
  const ta = a.transaction_time ?? '';
  const tb = b.transaction_time ?? '';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.id - b.id;
};

// Build invested-capital and portfolio-value series over a daily timeline.
function buildSeries(
  txs: Transaction[],
  history: History,
  display: DisplayCurrency,
  eurusd: number | null,
): Point[] {
  const conv = (amount: number, from: string) => {
    if (from === display || !eurusd) return amount;
    return from === 'EUR' ? amount * eurusd : amount / eurusd;
  };
  const sorted = [...txs].sort(byDateTimeId);
  const pos = new Map<string, { shares: number; cost: number }>();
  const lastPrice = new Map<string, number>();
  let totalCost = 0;
  let ti = 0;

  const apply = (t: Transaction) => {
    const p = pos.get(t.stock_ticker) ?? { shares: 0, cost: 0 };
    const amt = conv(t.quantity * t.price_per_share, t.price_currency);
    if (t.transaction_type === 'BUY') {
      p.cost += amt;
      p.shares += t.quantity;
      totalCost += amt;
    } else {
      const avg = p.shares > 0 ? p.cost / p.shares : 0;
      const r = avg * t.quantity;
      p.cost -= r;
      p.shares -= t.quantity;
      totalCost -= r;
    }
    pos.set(t.stock_ticker, p);
  };

  const valueNow = (): number | null => {
    let usd = 0;
    let priced = false;
    for (const [tk, p] of pos) {
      if (p.shares > 1e-9) {
        const px = lastPrice.get(tk);
        if (px != null) {
          usd += p.shares * px;
          priced = true;
        }
      }
    }
    return priced ? conv(usd, 'USD') : null;
  };

  const pts: Point[] = [];
  const tickers = Object.keys(history.prices);
  history.dates.forEach((date, i) => {
    for (const tk of tickers) {
      const v = history.prices[tk][i];
      if (v != null) lastPrice.set(tk, v);
    }
    while (ti < sorted.length && sorted[ti].transaction_date <= date) apply(sorted[ti++]);
    pts.push({ t: new Date(`${date}T00:00:00`).getTime(), invested: totalCost, value: valueNow() });
  });

  while (ti < sorted.length) apply(sorted[ti++]);
  const now = Date.now();
  if (!pts.length || now > pts[pts.length - 1].t) {
    pts.push({ t: now, invested: totalCost, value: valueNow() });
  }
  return pts;
}

function regularTicks(min: number, max: number, n = 8): number[] {
  if (min === max) return [min];
  return Array.from({ length: n }, (_, i) => Math.round(min + (i * (max - min)) / (n - 1)));
}

export function InvestedCapitalChart({
  transactions,
  display,
  eurusd,
}: {
  transactions: Transaction[];
  display: DisplayCurrency;
  eurusd: number | null;
}) {
  const { isPrivate } = useDisplayCurrency();
  const [history, setHistory] = useState<History | null>(null);

  const tickers = useMemo(
    () => [...new Set(transactions.map((t) => t.stock_ticker))].sort(),
    [transactions],
  );
  const start = useMemo(() => {
    let min: string | null = null;
    for (const t of transactions)
      if (min === null || t.transaction_date < min) min = t.transaction_date;
    return min;
  }, [transactions]);

  useEffect(() => {
    if (!start || tickers.length === 0) {
      setHistory(null);
      return;
    }
    let cancelled = false;
    axios
      .get<History>('/api/investing/history', { params: { tickers: tickers.join(','), start } })
      .then((res) => !cancelled && setHistory(res.data))
      .catch(() => !cancelled && setHistory(null));
    return () => {
      cancelled = true;
    };
  }, [tickers, start]);

  const data = useMemo(
    () => buildSeries(transactions, history ?? { dates: [], prices: {} }, display, eurusd),
    [transactions, history, display, eurusd],
  );

  const xTicks = useMemo(
    () => (data.length ? regularTicks(data[0].t, data[data.length - 1].t, 8) : []),
    [data],
  );

  // In private mode, normalize both curves to a percentage of the *current*
  // invested capital (100% = invested today). Otherwise plot absolute amounts.
  const view = useMemo(() => {
    const currentInvested = data.length ? data[data.length - 1].invested : 0;
    const pctMode = isPrivate && currentInvested > 0;
    const chartData = pctMode
      ? data.map((p) => ({
          t: p.t,
          invested: (p.invested / currentInvested) * 100,
          value: p.value == null ? null : (p.value / currentInvested) * 100,
        }))
      : data;

    let m = 0;
    for (const p of chartData) m = Math.max(m, p.invested, p.value ?? 0);
    const step = pctMode ? 25 : 50_000;
    const top = Math.max(step * (pctMode ? 4 : 1), Math.ceil(m / step) * step);
    const yTicks: number[] = [];
    for (let v = 0; v <= top; v += step) yTicks.push(v);

    // Today's value (last plotted point) and the all-time high, in plot units.
    const vals = chartData.map((p) => p.value).filter((v): v is number => v != null);
    const todayY = vals.length ? vals[vals.length - 1] : null;
    const maxY = vals.length ? Math.max(...vals) : null;

    return { pctMode, chartData, yMax: top, yTicks, todayY, maxY };
  }, [data, isPrivate]);

  if (data.length === 0) return null;

  const { pctMode, chartData, yMax, yTicks, todayY, maxY } = view;
  const fmtRef = (v: number) => (pctMode ? `${v.toFixed(1)}%` : `${fmtMoney(v)} ${sym(display)}`);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4">
      <h3 className="mb-3 text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
        Portfolio value over time
      </h3>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <defs>
              <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[chartData[0].t, chartData[chartData.length - 1].t]}
              ticks={xTicks}
              tickFormatter={fmtTick}
              tick={{ fill: '#e2e8f0', fontSize: 13 }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={{ stroke: '#e2e8f0' }}
              angle={-30}
              textAnchor="end"
              height={56}
            />
            <YAxis
              domain={[0, yMax]}
              ticks={yTicks}
              interval={0}
              tick={{ fill: '#e2e8f0', fontSize: 13 }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={{ stroke: '#e2e8f0' }}
              width={48}
              tickFormatter={(v) => (pctMode ? `${v}%` : fmtAxisMoney(v as number))}
            />
            <Tooltip
              contentStyle={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: 8,
                color: '#e2e8f0',
                fontSize: 12,
              }}
              labelStyle={{ color: '#94a3b8' }}
              labelFormatter={(v) => fmtTick(v as number)}
              formatter={(value, name) => [
                value == null
                  ? '—'
                  : pctMode
                    ? `${(value as number).toFixed(1)}%`
                    : `${fmtMoney(value as number)} ${sym(display)}`,
                name,
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: '#e2e8f0' }} />
            {maxY != null && (
              <ReferenceLine
                y={maxY}
                stroke="#f59e0b"
                strokeDasharray="3 3"
                ifOverflow="extendDomain"
                label={{
                  value: `ATH ${fmtRef(maxY)}`,
                  position: 'insideTopLeft',
                  fill: '#f59e0b',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              />
            )}
            {todayY != null && (
              <ReferenceLine
                y={todayY}
                stroke="#10b981"
                strokeDasharray="3 3"
                ifOverflow="extendDomain"
                label={{
                  value: `Today ${fmtRef(todayY)}`,
                  position: 'insideBottomRight',
                  fill: '#10b981',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              />
            )}
            <Area
              type="linear"
              dataKey="invested"
              name="Invested capital"
              stroke="#94a3b8"
              strokeWidth={2}
              fill="#94a3b8"
              fillOpacity={0.06}
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="value"
              name="Portfolio value"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#valueFill)"
              connectNulls
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
