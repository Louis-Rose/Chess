// Shared types and formatters for the Earnings calendar tab — used by both the
// list view (EarningsCalendar) and the week grid (EarningsCalendarGrid).

export interface CalendarCompany {
  ticker: string;
  name: string;
  marketCap: number;
  sector: string | null;         // GICS-style sector from Yahoo (e.g. "Technology")
  nextEarnings: string | null;   // soonest future earnings date
  lastEarnings: string | null;   // most recent past date, trimmed to the recent window by the backend
}

// One earnings event = one (company, date) pair. A company can produce up to
// two events — one for its most recent past report, one for its next future
// report — so the calendar shows them on separate rows.
export interface EarningsEvent {
  ticker: string;
  name: string;
  marketCap: number;
  marketCapRank: number;   // 1 = largest in the full universe
  sector: string | null;
  date: string;            // ISO YYYY-MM-DD
}

export function companyEvents(companies: CalendarCompany[]): EarningsEvent[] {
  // Rank by market cap once, before exploding into events — that way the rank
  // is a stable property of the company, independent of the events list's order.
  const rankByTicker = new Map(
    [...companies]
      .sort((a, b) => b.marketCap - a.marketCap)
      .map((c, i) => [c.ticker, i + 1]),
  );
  const out: EarningsEvent[] = [];
  for (const c of companies) {
    const base = {
      ticker: c.ticker,
      name: c.name,
      marketCap: c.marketCap,
      marketCapRank: rankByTicker.get(c.ticker)!,
      sector: c.sector,
    };
    if (c.lastEarnings) out.push({ ...base, date: c.lastEarnings });
    if (c.nextEarnings) out.push({ ...base, date: c.nextEarnings });
  }
  return out;
}

// Signed day count from today to an ISO date — -3, 0, +24.
export function daysUntil(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000);
}

// Color the day-count by sign: red for past, green for today / future.
export function daysColor(n: number): string {
  return n < 0 ? 'text-red-400' : 'text-emerald-400';
}

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtMarketCap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(0)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

export function fmtEarningsDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}
