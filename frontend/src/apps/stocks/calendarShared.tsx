// Shared types, formatters and small UI bits for the Earnings calendar tab —
// used by both the list view (EarningsCalendar) and the week grid
// (EarningsCalendarGrid).

export interface CalendarCompany {
  ticker: string;
  name: string;
  marketCap: number;
  nextEarnings: string | null;
  frequency: 'quarterly' | 'semi-annual';
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

export function FreqBadge({ frequency }: { frequency: CalendarCompany['frequency'] }) {
  return (
    <span className={
      'inline-block px-2 py-0.5 rounded-full text-xs font-medium '
      + (frequency === 'quarterly'
        ? 'bg-emerald-500/15 text-emerald-300'
        : 'bg-amber-500/15 text-amber-300')
    }>
      {frequency === 'quarterly' ? 'Quarterly' : 'Semi-annual'}
    </span>
  );
}
