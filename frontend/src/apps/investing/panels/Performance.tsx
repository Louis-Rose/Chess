import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import type { Transaction } from '../types';
import { useDisplayCurrency } from '../currency';
import { InvestedCapitalChart } from './InvestedCapitalChart';

const DAY = 86_400_000;

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

interface Age {
  years: number;
  months: number;
  days: number;
}

// Calendar age between a start date and now, in years/months/days.
function ageSince(start: Date): Age {
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();
  if (days < 0) {
    months -= 1;
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); // days in prev month
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months, days };
}

function formatAge({ years, months, days }: Age): string {
  const parts: string[] = [];
  if (years) parts.push(`${years} year${years > 1 ? 's' : ''}`);
  if (months) parts.push(`${months} month${months > 1 ? 's' : ''}`);
  if (days) parts.push(`${days} day${days > 1 ? 's' : ''}`);
  return parts.length ? parts.join(', ') : 'Today';
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-5 text-center">
      <p className="text-sm uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </div>
  );
}

// "Performance" — high-level stats for the (already account- and toggle-
// filtered) transactions: portfolio age, capital-weighted relative age, and a
// chart of invested capital over time.
export function Performance({ transactions }: { transactions: Transaction[] }) {
  const { display } = useDisplayCurrency();
  const [eurusd, setEurusd] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    axios
      .get<{ eurusd: number | null }>('/api/investing/quotes', { params: { tickers: '' } })
      .then((res) => !cancelled && setEurusd(res.data.eurusd ?? null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const firstBuy = useMemo(() => {
    let min: string | null = null;
    for (const t of transactions) {
      if (t.transaction_type !== 'BUY') continue;
      if (min === null || t.transaction_date < min) min = t.transaction_date;
    }
    return min;
  }, [transactions]);

  // Capital-weighted average age of the invested capital: each buy's age
  // weighted by the amount invested (converted to a common currency). Returned
  // as the effective start date, so it formats like a normal age.
  const relativeStart = useMemo(() => {
    const conv = (amount: number, from: string) =>
      from === display || !eurusd ? amount : from === 'EUR' ? amount * eurusd : amount / eurusd;
    const now = Date.now();
    let weighted = 0;
    let weight = 0;
    for (const t of transactions) {
      if (t.transaction_type !== 'BUY') continue;
      const amount = conv(t.quantity * t.price_per_share, t.price_currency);
      if (amount <= 0) continue;
      const ageDays = (now - new Date(`${t.transaction_date}T00:00:00`).getTime()) / DAY;
      weighted += amount * ageDays;
      weight += amount;
    }
    if (weight <= 0) return null;
    return new Date(now - (weighted / weight) * DAY);
  }, [transactions, eurusd, display]);

  if (!firstBuy) {
    return <p className="text-center text-slate-500">No buys yet.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Portfolio age"
          value={formatAge(ageSince(new Date(`${firstBuy}T00:00:00`)))}
          sub={`since first buy on ${fmtDate(firstBuy)}`}
        />
        {relativeStart && (
          <StatCard
            label="Relative portfolio age"
            value={formatAge(ageSince(relativeStart))}
            sub="capital-weighted by amount invested"
          />
        )}
      </div>

      <InvestedCapitalChart transactions={transactions} display={display} eurusd={eurusd} />
    </div>
  );
}
