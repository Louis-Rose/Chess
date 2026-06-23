import { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Transaction } from '../types';
import type { DisplayCurrency } from '../currency';

const sym = (c: DisplayCurrency) => (c === 'USD' ? '$' : '€');
const fmtMoney = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });

interface Point {
  date: string;
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

  return [...byDate.entries()]
    .map(([date, invested]) => ({ date, invested }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
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
    () => buildSeries(transactions, display, eurusd).map((d) => ({ ...d, label: fmtDate(d.date) })),
    [transactions, display, eurusd],
  );

  if (data.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-4">
      <h3 className="mb-3 text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
        Invested capital over time
      </h3>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
            <defs>
              <linearGradient id="invFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={52}
              tickFormatter={(v) => fmtMoney(v as number)}
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
