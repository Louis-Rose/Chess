import { useEffect, useState } from 'react';
import axios from 'axios';
import { RefreshCw, AlertTriangle, ChevronUp, ChevronDown } from 'lucide-react';
import {
  type CalendarCompany, fmtMarketCap, fmtEarningsDate, FreqBadge,
} from './calendarShared';
import { EarningsCalendarGrid } from './EarningsCalendarGrid';

interface CalendarPayload {
  status: 'ready' | 'building' | 'error';
  asOf?: string;
  builtAt?: string | null;
  buildSeconds?: number | null;
  refreshing?: boolean;   // a background rebuild is in flight; companies/builtAt are still the previous snapshot
  error?: string | null;
  companies: CalendarCompany[];
}

type SortKey = 'name' | 'ticker' | 'marketCap' | 'nextEarnings' | 'frequency';

// The '#' column is a plain 1..N row counter (always in display order), so it
// is rendered separately and is not sortable.
const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right' | 'center' }[] = [
  { key: 'name', label: 'Company', align: 'left' },
  { key: 'ticker', label: 'Ticker', align: 'left' },
  { key: 'marketCap', label: 'Market cap', align: 'right' },
  { key: 'nextEarnings', label: 'Next earnings', align: 'right' },
  { key: 'frequency', label: 'Reports', align: 'center' },
];

export function EarningsCalendar() {
  const [payload, setPayload] = useState<CalendarPayload | null>(null);

  const fetchData = (bypassCache = false) => {
    // On a manual refresh, keep the current list on screen (the server keeps
    // serving it while it rebuilds in the background) instead of blanking it.
    axios.get<CalendarPayload>('/api/stocks/earnings-calendar', {
      params: bypassCache ? { nocache: 1 } : {},
    })
      .then(r => setPayload(r.data))
      .catch(() => {});
  };

  useEffect(() => { fetchData(); }, []);

  // A build runs in a background thread on the server — poll until it lands,
  // whether it's the first build ('building') or a manual refresh ('refreshing').
  useEffect(() => {
    const inFlight = payload?.status === 'building' || payload?.refreshing === true;
    if (!inFlight) return;
    const id = setInterval(() => fetchData(), 4000);
    return () => clearInterval(id);
  }, [payload?.status, payload?.refreshing]);

  const building = !payload || payload.status === 'building';
  const errored = payload?.status === 'error';
  const refreshing = building || payload?.refreshing === true;

  const [view, setView] = useState<'list' | 'calendar'>('list');

  // Default to the server's order: market cap, largest first.
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'marketCap', dir: 'desc' });
  const toggleSort = (key: SortKey) =>
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' });

  const sorted = [...(payload?.companies ?? [])].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    switch (sort.key) {
      case 'marketCap': return (a.marketCap - b.marketCap) * dir;
      case 'name': return a.name.localeCompare(b.name) * dir;
      case 'ticker': return a.ticker.localeCompare(b.ticker) * dir;
      case 'frequency': return a.frequency.localeCompare(b.frequency) * dir;
      case 'nextEarnings':
        if (!a.nextEarnings) return b.nextEarnings ? 1 : 0;   // missing dates sort last
        if (!b.nextEarnings) return -1;
        return a.nextEarnings.localeCompare(b.nextEarnings) * dir;
    }
  });

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 font-sans">
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center relative">
          <h1 className="text-xl font-semibold absolute left-1/2 -translate-x-1/2">Earnings calendar</h1>
          <div className="ml-auto flex items-center gap-3">
            {!building && !errored && (
              payload?.refreshing ? (
                <span className="text-xs text-white whitespace-nowrap">refreshing…</span>
              ) : payload?.buildSeconds != null ? (
                <span className="text-xs text-white whitespace-nowrap">
                  built in {Math.round(payload.buildSeconds)}s
                </span>
              ) : null
            )}
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="p-2 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
              aria-label="Refresh"
              title="Refresh data (bypass cache)"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {building ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
            <div className="w-10 h-10 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-sm">Building the list. This can take a moment.</p>
          </div>
        ) : errored ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <p className="text-red-300 font-semibold">Could not build the earnings calendar.</p>
            <p className="text-slate-400 text-sm max-w-lg break-words">{payload!.error}</p>
            <p className="text-slate-500 text-xs">
              The companiesmarketcap.com scrape failed. Hit refresh to retry.
            </p>
          </div>
        ) : (
          <>
            {payload!.error && (
              <div className="mb-4 flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>Showing the last good snapshot — the most recent refresh failed: {payload!.error}</span>
              </div>
            )}
            <div className="flex justify-center mb-4">
              <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden text-xs">
                {(['list', 'calendar'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={'px-4 py-1.5 font-medium transition-colors ' + (view === v
                      ? 'bg-slate-700 text-slate-100'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200')}
                  >
                    {v === 'list' ? 'List' : 'Calendar'}
                  </button>
                ))}
              </div>
            </div>
            {view === 'calendar' ? (
              <EarningsCalendarGrid companies={payload!.companies} />
            ) : (
            <div className="overflow-x-auto border border-slate-700 rounded-lg">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-800">
                    <th className="px-4 py-3 border-b border-slate-700 w-12 text-left font-semibold text-slate-200">#</th>
                    {COLUMNS.map(col => {
                      const active = sort.key === col.key;
                      const justify = col.align === 'right' ? 'justify-end'
                        : col.align === 'center' ? 'justify-center' : 'justify-start';
                      return (
                        <th key={col.key} className="px-4 py-3 border-b border-slate-700">
                          <button
                            onClick={() => toggleSort(col.key)}
                            className={`flex items-center gap-1 w-full ${justify} font-semibold transition-colors ${
                              active ? 'text-white' : 'text-slate-200 hover:text-white'
                            }`}
                          >
                            <span>{col.label}</span>
                            {active && (sort.dir === 'asc'
                              ? <ChevronUp className="w-3.5 h-3.5" />
                              : <ChevronDown className="w-3.5 h-3.5" />)}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c, i) => {
                    // The two earnings-date sources disagree — flag the row.
                    const mismatch = c.datesMatch === false;
                    return (
                    <tr
                      key={c.ticker}
                      className={
                        'border-b border-slate-700 last:border-b-0 '
                        + (mismatch ? 'bg-red-500/10 hover:bg-red-500/20' : 'hover:bg-slate-800/40')
                      }
                    >
                      <td className="px-4 py-3 text-slate-500 font-mono">{i + 1}</td>
                      <td className="px-4 py-3 font-semibold text-white">{c.name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{c.ticker}</td>
                      <td className="px-4 py-3 text-right font-mono text-white">{fmtMarketCap(c.marketCap)}</td>
                      <td
                        className="px-4 py-3 text-right font-mono"
                        title={mismatch
                          ? 'Earnings-date sources disagree: get_earnings_dates() vs .calendar'
                          : undefined}
                      >
                        {mismatch ? (
                          <div className="leading-tight">
                            <div className="text-white">{fmtEarningsDate(c.nextEarnings)}</div>
                            <div className="text-red-400 text-xs">≠ {fmtEarningsDate(c.nextEarningsAlt)}</div>
                          </div>
                        ) : (
                          <span className="text-white">{fmtEarningsDate(c.nextEarnings)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <FreqBadge frequency={c.frequency} />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
            {payload!.asOf && (
              <div className="text-center text-xs text-slate-300 font-medium mt-8">
                as of {payload!.asOf}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
