import { useMemo } from 'react';
import type { Transaction } from '../types';

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

interface Age {
  years: number;
  months: number;
  days: number;
}

// Calendar age between a YYYY-MM-DD date and today, in years/months/days.
function ageSince(fromISO: string): Age {
  const start = new Date(`${fromISO}T00:00:00`);
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

// "Performance" — high-level stats for the (already account- and toggle-
// filtered) transactions. Currently the portfolio age since the first buy.
export function Performance({ transactions }: { transactions: Transaction[] }) {
  const firstBuy = useMemo(() => {
    let min: string | null = null;
    for (const t of transactions) {
      if (t.transaction_type !== 'BUY') continue;
      if (min === null || t.transaction_date < min) min = t.transaction_date;
    }
    return min;
  }, [transactions]);

  if (!firstBuy) {
    return <p className="text-center text-slate-500">No buys yet.</p>;
  }

  return (
    <div className="text-center">
      <p className="text-sm uppercase tracking-wide text-slate-500">Portfolio age</p>
      <p className="mt-1 text-lg font-semibold text-slate-100">{formatAge(ageSince(firstBuy))}</p>
      <p className="mt-1 text-xs text-slate-500">since first buy on {fmtDate(firstBuy)}</p>
    </div>
  );
}
