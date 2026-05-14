// Shared types and formatters for the Earnings calendar tab — used by both the
// list view (EarningsCalendar) and the week grid (EarningsCalendarGrid).

export interface CalendarCompany {
  ticker: string;
  name: string;
  marketCap: number;
  nextEarnings: string | null;   // from yfinance get_earnings_dates()
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
