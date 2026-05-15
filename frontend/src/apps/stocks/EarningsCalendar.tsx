import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { RefreshCw, AlertTriangle, ChevronUp, ChevronDown } from 'lucide-react';
import {
  type CalendarCompany, companyEvents, daysUntil, daysColor,
  fmtMarketCap, fmtEarningsDate,
} from './calendarShared';

interface CalendarPayload {
  status: 'ready' | 'building' | 'error';
  asOf?: string;
  builtAt?: string | null;
  buildSeconds?: number | null;
  refreshing?: boolean;   // a background rebuild is in flight; companies/builtAt are still the previous snapshot
  error?: string | null;
  companies: CalendarCompany[];
}

type SortKey = 'name' | 'sector' | 'ticker' | 'marketCap' | 'marketCapRank' | 'date';

// The '#' column is a plain 1..N row counter (always in display order), so it
// is rendered separately and is not sortable.
const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Company' },
  { key: 'sector', label: 'Sector' },
  { key: 'ticker', label: 'Ticker' },
  { key: 'marketCap', label: 'Market cap' },
  { key: 'marketCapRank', label: 'Ranking' },
  { key: 'date', label: 'Earnings date' },
];

export function EarningsCalendar({ onOpenCompany }: { onOpenCompany: (ticker: string) => void }) {
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

  // Default to earnings date, soonest first — that's what the user comes here for.
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'asc' });
  const toggleSort = (key: SortKey) =>
    setSort(prev => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: 'asc' });

  // How far back the list reaches: -14 / -7 / 0 (today only). The backend
  // already caps past data at 14 days, so the slider just narrows from there.
  const [startOffset, setStartOffset] = useState(-14);

  // One row per (company, earnings date) — a company with both a recent past
  // report and a known future one shows up twice, on separate rows.
  const events = useMemo(() => companyEvents(payload?.companies ?? []), [payload?.companies]);
  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const filtered = events.filter(e => daysUntil(e.date) >= startOffset);
    return filtered.sort((a, b) => {
      switch (sort.key) {
        case 'marketCap': return (a.marketCap - b.marketCap) * dir;
        case 'marketCapRank': return (a.marketCapRank - b.marketCapRank) * dir;
        case 'name': return a.name.localeCompare(b.name) * dir;
        case 'sector': return (a.sector ?? '').localeCompare(b.sector ?? '') * dir;
        case 'ticker': return a.ticker.localeCompare(b.ticker) * dir;
        case 'date': return a.date.localeCompare(b.date) * dir;
      }
    });
  }, [events, sort, startOffset]);

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 font-sans">
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center relative">
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

      <main className="max-w-6xl mx-auto px-4 py-6">
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
            <div className="flex items-center justify-center gap-4 mb-4 text-sm">
              <span className="text-slate-400 whitespace-nowrap">Start from</span>
              <input
                type="range"
                min={-14}
                max={0}
                step={1}
                value={startOffset}
                onChange={e => setStartOffset(+e.target.value)}
                className="w-96 accent-emerald-500"
              />
              <span className={`font-mono whitespace-nowrap w-20 ${daysColor(startOffset)}`}>
                {startOffset === 0 ? 'today' : `${startOffset} days`}
              </span>
            </div>
            <div className="overflow-x-auto border border-slate-700 rounded-lg">
              <table className="w-full table-fixed text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-800">
                    <th className="px-4 py-3 border-b border-slate-700 w-12 text-center font-semibold text-slate-200">#</th>
                    {COLUMNS.map(col => {
                      const active = sort.key === col.key;
                      // Ticker holds a 3-5 char symbol — no need to give it as
                      // much room as the wider data columns.
                      const widthClass = col.key === 'ticker' ? 'w-24' : '';
                      return (
                        <th key={col.key} className={`px-4 py-3 border-b border-slate-700 ${widthClass}`}>
                          <button
                            onClick={() => toggleSort(col.key)}
                            className={`flex items-center gap-1 w-full justify-center font-semibold transition-colors ${
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
                  {sorted.map((e, i) => {
                    const days = daysUntil(e.date);
                    return (
                      <tr
                        key={`${e.ticker}-${e.date}`}
                        onClick={() => onOpenCompany(e.ticker)}
                        className="border-b border-slate-700 last:border-b-0 hover:bg-slate-800/40 cursor-pointer"
                      >
                        <td className="px-4 py-3 text-center text-slate-500 font-mono">{i + 1}</td>
                        <td className="px-4 py-3 text-center font-semibold text-white">{e.name}</td>
                        <td className="px-4 py-3 text-center text-slate-300 text-xs">{e.sector ?? '—'}</td>
                        <td className="px-4 py-3 text-center font-mono text-xs text-slate-400">{e.ticker}</td>
                        <td className="px-4 py-3 text-center font-mono text-white">{fmtMarketCap(e.marketCap)}</td>
                        <td className="px-4 py-3 text-center font-mono text-white">#{e.marketCapRank}</td>
                        <td className="px-4 py-3 text-center font-mono text-white whitespace-nowrap">
                          {fmtEarningsDate(e.date)}
                          <span className={daysColor(days)}> ({days >= 0 ? '+' : ''}{days})</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
