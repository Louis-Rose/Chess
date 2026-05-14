import { useState } from 'react';
import { type CalendarCompany, fmtEarningsDate } from './calendarShared';

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

// Monday of the week containing `d` (local time, midnight).
function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));   // 0 = Monday
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
       + `-${String(d.getDate()).padStart(2, '0')}`;
}

// The calendar month (year + month) holding the majority of a week's 7 days.
// 7 is odd, so a split week always has a clear winner (no ties).
function weekMonth(weekStart: Date): { year: number; month: number } {
  const counts: Record<string, number> = {};
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  let bestKey = '', best = 0;
  for (const [k, c] of Object.entries(counts)) if (c > best) { best = c; bestKey = k; }
  const [year, month] = bestKey.split('-').map(Number);
  return { year, month };
}

// "May 19 – 25" / "June 29 – July 5"
function fmtWeekRange(start: Date): string {
  const end = addDays(start, 6);
  const left = `${MONTHS_LONG[start.getMonth()]} ${start.getDate()}`;
  const right = start.getMonth() === end.getMonth()
    ? `${end.getDate()}`
    : `${MONTHS_LONG[end.getMonth()]} ${end.getDate()}`;
  return `${left} – ${right}`;
}

export function EarningsCalendarGrid({ companies }: { companies: CalendarCompany[] }) {
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);

  // Weeks for the upcoming ~3 months, starting from this week's Monday — then
  // extended so the final month row is shown in full, not cut off mid-month.
  const today = new Date();
  const horizon = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate());
  const weeks: Date[] = [];
  let w = startOfWeek(today);
  while (w <= horizon) { weeks.push(new Date(w)); w = addDays(w, 7); }
  const lastMonth = weekMonth(weeks[weeks.length - 1]);
  const lastKey = lastMonth.year * 12 + lastMonth.month;
  for (let m = weekMonth(w); m.year * 12 + m.month <= lastKey; m = weekMonth(w)) {
    weeks.push(new Date(w));
    w = addDays(w, 7);
  }

  // Bucket each company into the week its next-earnings date falls in.
  const byWeek: Record<string, CalendarCompany[]> = {};
  for (const c of companies) {
    if (!c.nextEarnings) continue;
    const [y, m, d] = c.nextEarnings.split('-').map(Number);
    const key = isoDay(startOfWeek(new Date(y, m - 1, d)));
    (byWeek[key] ??= []).push(c);
  }

  // One row per month; a split week lands in the month with most of its days.
  const rows: { label: string; weeks: Date[] }[] = [];
  for (const w of weeks) {
    const { year, month } = weekMonth(w);
    const label = `${MONTHS_LONG[month]} ${year}`;
    const last = rows[rows.length - 1];
    if (last && last.label === label) last.weeks.push(w);
    else rows.push({ label, weeks: [w] });
  }

  const selected = selectedWeek
    ? [...(byWeek[selectedWeek] ?? [])].sort(
        (a, b) => (a.nextEarnings ?? '').localeCompare(b.nextEarnings ?? ''))
    : [];

  return (
    <div>
      <div className="border border-slate-700 rounded-lg overflow-x-auto">
        {rows.map(row => (
          <div key={row.label} className="flex items-stretch border-b border-slate-700 last:border-b-0">
            <div className="w-32 flex-shrink-0 flex items-center px-4 bg-slate-800 border-r border-slate-700 font-semibold text-slate-200 text-sm">
              {row.label}
            </div>
            <div className="flex gap-2 p-2">
              {row.weeks.map(w => {
                const key = isoDay(w);
                const count = (byWeek[key] ?? []).length;
                const isSel = selectedWeek === key;
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedWeek(isSel ? null : key)}
                    disabled={count === 0}
                    className={
                      'w-40 h-20 rounded-lg border flex flex-col items-center justify-center gap-1 transition-colors '
                      + (count === 0
                        ? 'border-slate-800 text-slate-600 cursor-default'
                        : 'cursor-pointer ' + (isSel
                          ? 'border-emerald-500 bg-emerald-500/10 text-white'
                          : 'border-slate-700 text-white hover:bg-slate-800'))
                    }
                  >
                    <span className="text-base font-semibold whitespace-nowrap">{fmtWeekRange(w)}</span>
                    <span className="text-sm">{count} {count === 1 ? 'company' : 'companies'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedWeek && (
        <div className="mt-6 p-5 border border-slate-800 rounded-lg bg-slate-900/60">
          <div className="text-sm font-semibold text-slate-200 mb-3">
            {selected.length} reporting the week of {fmtWeekRange(weeks.find(w => isoDay(w) === selectedWeek)!)}
          </div>
          <div className="divide-y divide-slate-800">
            {selected.map(c => (
              <div key={c.ticker} className="flex items-center gap-3 py-2 text-sm">
                <span className="font-semibold text-white flex-1 min-w-0 truncate">{c.name}</span>
                <span className="font-mono text-xs text-slate-400 w-16">{c.ticker}</span>
                <span className="font-mono text-white w-28 text-right">{fmtEarningsDate(c.nextEarnings)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
