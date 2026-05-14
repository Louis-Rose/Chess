import { useEffect, useState } from 'react';
import axios from 'axios';
import { RefreshCw } from 'lucide-react';

interface CalendarCompany {
  ticker: string;
  name: string;
  marketCap: number;
  nextEarnings: string | null;
  frequency: 'quarterly' | 'semi-annual';
}
interface CalendarPayload {
  status: 'ready' | 'building';
  asOf?: string;
  builtAt?: string | null;
  companies: CalendarCompany[];
}

function fmtMarketCap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(0)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtEarningsDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}

export function EarningsCalendar() {
  const [payload, setPayload] = useState<CalendarPayload | null>(null);

  const fetchData = (bypassCache = false) => {
    if (bypassCache) setPayload(null);
    axios.get<CalendarPayload>('/api/stocks/earnings-calendar', {
      params: bypassCache ? { nocache: 1 } : {},
    })
      .then(r => setPayload(r.data))
      .catch(() => {});
  };

  useEffect(() => { fetchData(); }, []);

  // The first snapshot is built in a background thread on the server — poll
  // until it is ready.
  useEffect(() => {
    if (payload?.status !== 'building') return;
    const id = setInterval(() => fetchData(), 4000);
    return () => clearInterval(id);
  }, [payload?.status]);

  const building = !payload || payload.status === 'building';

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 font-sans">
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <h1 className="text-xl font-semibold flex-1">Earnings calendar</h1>
          <button
            onClick={() => fetchData(true)}
            disabled={building}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Refresh"
            title="Refresh data (bypass cache)"
          >
            <RefreshCw className={`w-5 h-5 ${building ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {building ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-400">
            <div className="w-10 h-10 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-sm">Building the list. This can take a moment.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto border border-slate-700 rounded-lg">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-800">
                    <th className="text-left font-semibold text-slate-200 px-4 py-3 border-b border-slate-700 w-12">#</th>
                    <th className="text-left font-semibold text-slate-200 px-4 py-3 border-b border-slate-700">Company</th>
                    <th className="text-right font-semibold text-slate-200 px-4 py-3 border-b border-slate-700">Market cap</th>
                    <th className="text-right font-semibold text-slate-200 px-4 py-3 border-b border-slate-700">Next earnings</th>
                    <th className="text-center font-semibold text-slate-200 px-4 py-3 border-b border-slate-700">Reports</th>
                  </tr>
                </thead>
                <tbody>
                  {payload!.companies.map((c, i) => (
                    <tr key={c.ticker} className="border-b border-slate-700 last:border-b-0 hover:bg-slate-800/40">
                      <td className="px-4 py-3 text-slate-500 font-mono">{i + 1}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-white">{c.name}</span>
                        <span className="text-slate-500 ml-2 font-mono text-xs">{c.ticker}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-white">{fmtMarketCap(c.marketCap)}</td>
                      <td className="px-4 py-3 text-right font-mono text-white">{fmtEarningsDate(c.nextEarnings)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={
                          'inline-block px-2 py-0.5 rounded-full text-xs font-medium '
                          + (c.frequency === 'quarterly'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-amber-500/15 text-amber-300')
                        }>
                          {c.frequency === 'quarterly' ? 'Quarterly' : 'Semi-annual'}
                        </span>
                      </td>
                    </tr>
                  ))}
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
