import { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Transaction } from '../types';
import type { DisplayCurrency } from '../currency';

const sym = (c: DisplayCurrency) => (c === 'USD' ? '$' : '€');
const fmtMoney = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
// Compact axis labels: 220000 -> "220k". Keeps the y-axis narrow.
const fmtAxisMoney = (n: number) =>
  Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`;
const fmtTick = (ts: number) =>
  new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

interface Point {
  t: number; // timestamp (ms) — gives the axis real time spacing
  invested: number;
}

// Cumulative invested capital (cost basis, average-cost method) over time, in
// the display currency. Amounts convert at today's EUR/USD, matching the table.
// One point per transaction date (last value of the day wins); stepwise.
function buildSeries(
  txs: Transaction[],
  display: DisplayCurrency,
  eurusd: number | null,
): Point[] {
  const conv = (amount: number, from: string) => {
    if (from === display || !eurusd) return amount;
    return from === 'EUR' ? amount * eurusd : amount / eurusd;
  };
  const sorted = [...txs].sort((a, b) => {
    if (a.transaction_date !== b.transaction_date)
      return a.transaction_date < b.transaction_date ? -1 : 1;
    const ta = a.transaction_time ?? '';
    const tb = b.transaction_time ?? '';
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.id - b.id;
  });

  const pos = new Map<string, { shares: number; cost: number }>();
  const byDate = new Map<string, number>();
  let totalCost = 0;
  for (const t of sorted) {
    const p = pos.get(t.stock_ticker) ?? { shares: 0, cost: 0 };
    const amount = conv(t.quantity * t.price_per_share, t.price_currency);
    if (t.transaction_type === 'BUY') {
      p.cost += amount;
      p.shares += t.quantity;
      totalCost += amount;
    } else {
      const avg = p.shares > 0 ? p.cost / p.shares : 0;
      const reduce = avg * t.quantity;
      p.cost -= reduce;
      p.shares -= t.quantity;
      totalCost -= reduce;
    }
    pos.set(t.stock_ticker, p);
    byDate.set(t.transaction_date, totalCost);
  }

  const points = [...byDate.entries()]
    .map(([date, invested]) => ({ t: new Date(`${date}T00:00:00`).getTime(), invested }))
    .sort((a, b) => a.t - b.t);

  // Extend flat to today: invested capital doesn't change after the last trade.
  const now = Date.now();
  const last = points[points.length - 1];
  if (last && now > last.t) points.push({ t: now, invested: last.invested });
  return points;
}

// Evenly spaced timestamps across the data range, for regular axis ticks.
function regularTicks(min: number, max: number, n = 6): number[] {
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
  const data = useMemo(
    () => buildSeries(transactions, display, eurusd),
    [transactions, display, eurusd],
  );
  const ticks = useMemo(
    () => (data.length ? regularTicks(data[0].t, data[data.length - 1].t, 8) : []),
    [data],
  );

  if (data.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4">
      <h3 className="mb-3 text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
        Invested capital over time
      </h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <defs>
              <linearGradient id="invFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[data[0].t, data[data.length - 1].t]}
              ticks={ticks}
              tickFormatter={fmtTick}
              tick={{ fill: '#e2e8f0', fontSize: 13 }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={{ stroke: '#e2e8f0' }}
              angle={-30}
              textAnchor="end"
              height={56}
            />
            <YAxis
              tick={{ fill: '#e2e8f0', fontSize: 13 }}
              axisLine={{ stroke: '#e2e8f0' }}
              tickLine={{ stroke: '#e2e8f0' }}
              width={48}
              tickFormatter={(v) => fmtAxisMoney(v as number)}
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
              formatter={(value) => [`${fmtMoney(value as number)} ${sym(display)}`, 'Invested']}
            />
            <Area
              type="stepAfter"
              dataKey="invested"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#invFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
