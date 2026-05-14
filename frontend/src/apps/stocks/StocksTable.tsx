import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { LineChart, RefreshCw } from 'lucide-react';
import {
  LineChart as RLineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import type { CalendarCompany } from './calendarShared';

const METRICS = [
  'Stock price', 'Revenue', 'Operating Income', 'Net Income',
  'Operating Cash-Flow', 'Free Cash-Flow',
] as const;
type Metric = typeof METRICS[number];
type Mode = 'ttm' | 'quarterly';

interface CellData {
  current?: number;
  oneY?: number;
  threeY?: number;
  oneYValue?: number;
  threeYValue?: number;
  unit?: string;
}
interface DataPayload {
  ticker: string;
  asOf: string;
  nextEarnings: string | null;
  data: Partial<Record<Metric, Partial<Record<Mode, CellData>>>>;
}

const STOCK_RANGES = ['1M', '6M', 'YTD', '1Y', '3Y', '5Y', '10Y'] as const;
type StockRange = typeof STOCK_RANGES[number];
type ChartScale = 'absolute' | 'relative';
interface PricePoint { date: string; close: number }
interface PriceHistory { ticker: string; range: StockRange; points: PricePoint[] }

// ── Date formatting ──────────────────────────────────────────────────────────

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function fmtEarningsDate(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${ordinal(d)}, ${y}`;
}

// ── Small reusable primitives ────────────────────────────────────────────────

interface ToggleOption<T extends string> { value: T; label: string }

function SegmentedToggle<T extends string>({
  options, value, onChange,
}: { options: ToggleOption<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden text-xs">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={
            'w-28 px-3 py-1.5 font-medium transition-colors '
            + (value === opt.value
              ? 'bg-slate-700 text-slate-100'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200')
          }
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface CellRow { value: string; label: string; growth?: number }

function CellRows({ rows }: { rows: CellRow[] }) {
  return (
    <div className="font-mono text-xs leading-5 font-bold">
      {rows.map(({ value, label, growth }) => (
        <div key={label}>
          <span className="text-white">{value}</span>
          <span className="text-white"> ({label})</span>
          {growth !== undefined && (
            <span className={pctColor(growth)}> {fmtPct(growth)}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function fmtPct(p: number | undefined): string {
  if (p === undefined) return '—';
  const pct = Math.round(p * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

function pctColor(p: number | undefined): string {
  if (p === undefined) return 'text-slate-500';
  if (p > 0) return 'text-emerald-400';
  if (p < 0) return 'text-red-400';
  return 'text-slate-300';
}

function fmtValue(v: number | undefined, unit: string | undefined): string {
  if (v === undefined) return '—';
  if (unit === '$B') return `$${Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)}B`;
  if (unit === '$') return `$${v.toFixed(0)}`;
  return String(v);
}

// Round-number tick generator — e.g. for range 189-225 returns [180, 190, 200, 210, 220, 230].
function niceTicks(min: number, max: number, target = 5): number[] {
  if (!isFinite(min) || !isFinite(max) || min === max) return [min];
  const rawStep = (max - min) / target;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const niceStep = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  const step = niceStep * magnitude;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step * 0.001; v += step) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return ticks;
}

// ── Stock price chart (single company) ───────────────────────────────────────

function StockChart({ ticker, range, scale }: { ticker: string; range: StockRange; scale: ChartScale }) {
  const [points, setPoints] = useState<PricePoint[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPoints(null);
    axios.get<PriceHistory>(`/api/stocks/history/${ticker}`, { params: { range } })
      .then(r => { if (!cancelled) { setPoints(r.data.points); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker, range]);

  const { data, yTicks, yDomain, hasData } = (() => {
    if (!points || points.length === 0) {
      return { data: [] as { date: string; value: number }[], yTicks: [0], yDomain: [0, 0] as [number, number], hasData: false };
    }
    // In relative mode the first available close becomes 100.
    const baseline = scale === 'relative' ? points[0].close : 0;
    const transform = (raw: number) =>
      scale === 'absolute' || !baseline ? raw : (raw / baseline) * 100;
    const data = points.map(p => ({ date: p.date, value: transform(p.close) }));
    const values = data.map(d => d.value);
    const yTicks = niceTicks(Math.min(...values), Math.max(...values));
    const yDomain: [number, number] = [yTicks[0], yTicks[yTicks.length - 1]];
    return { data, yTicks, yDomain, hasData: true };
  })();

  const fmtRelative = (v: number) => {
    const g = Math.round(v - 100);
    return `${g >= 0 ? '+' : ''}${g}%`;
  };
  const fmtY = (v: number) => scale === 'absolute' ? `$${v}` : fmtRelative(v);
  const fmtTooltip = (v: number | undefined) =>
    v === undefined ? '—' : scale === 'absolute' ? `$${v.toFixed(2)}` : fmtRelative(v);

  return (
    <div className="h-72">
      {loading ? (
        <div className="h-full flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      ) : hasData ? (
        <ResponsiveContainer width="100%" height="100%">
          <RLineChart data={data} margin={{ top: 12, right: 24, bottom: 4, left: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#64748b" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#cbd5e1"
              tick={{ fontSize: 12, fill: '#cbd5e1' }}
              tickMargin={8}
              angle={-45}
              textAnchor="end"
              height={75}
              minTickGap={80}
              axisLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
            />
            <YAxis
              stroke="#cbd5e1"
              tick={{ fontSize: 12, fill: '#cbd5e1' }}
              domain={yDomain}
              ticks={yTicks}
              tickFormatter={fmtY}
              width={60}
              axisLine={{ stroke: '#cbd5e1', strokeWidth: 1 }}
            />
            <Tooltip
              allowEscapeViewBox={{ x: true, y: false }}
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null;
                const firstDate = data.length > 0 ? data[0].date : '';
                const showRange = scale === 'relative' && firstDate && firstDate !== label;
                return (
                  <div className="bg-slate-900 border border-slate-700 rounded-md text-xs">
                    <div className="text-center font-bold text-slate-200 px-3 pt-2 pb-2 border-b border-slate-700 whitespace-nowrap leading-5">
                      {showRange ? (
                        <>
                          <div>From {firstDate}</div>
                          <div>to {String(label)}</div>
                        </>
                      ) : (
                        String(label)
                      )}
                    </div>
                    <div className="px-3 py-2 text-center font-mono text-emerald-300">
                      {fmtTooltip(payload[0].value as number | undefined)}
                    </div>
                  </div>
                );
              }}
            />
            <Line type="monotone" dataKey="value" stroke="#34d399" strokeWidth={1.5} dot={false} connectNulls />
          </RLineChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-full flex items-center justify-center text-slate-500 text-sm">No data</div>
      )}
    </div>
  );
}

// ── Company search / picker ──────────────────────────────────────────────────

function CompanyPicker({
  companies, ticker, onSelect,
}: { companies: CalendarCompany[]; ticker: string; onSelect: (t: string) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const selected = companies.find(c => c.ticker === ticker);
  const q = query.trim().toLowerCase();
  // Match on company name or ticker; cap the list so we never render 300 nodes.
  const matches = (q
    ? companies.filter(c =>
        c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q))
    : companies
  ).slice(0, 50);

  return (
    <div ref={ref} className="relative w-80 max-w-full">
      <input
        type="text"
        value={open ? query : (selected ? `${selected.name} (${selected.ticker})` : '')}
        placeholder={companies.length ? 'Search company or ticker…' : 'Loading companies…'}
        disabled={companies.length === 0}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-medium text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50"
      />
      {open && companies.length > 0 && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto bg-slate-800 border border-slate-700 rounded-lg shadow-lg">
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-500">No match</div>
          ) : (
            matches.map(c => (
              <button
                key={c.ticker}
                onClick={() => { onSelect(c.ticker); setOpen(false); setQuery(''); }}
                className={
                  'w-full text-left px-3 py-1.5 text-sm transition-colors '
                  + (c.ticker === ticker
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-300 hover:bg-slate-700/60')
                }
              >
                {c.name} <span className="text-slate-500 font-mono text-xs">{c.ticker}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Single-company dashboard ─────────────────────────────────────────────────

export function StocksTable() {
  const [companies, setCompanies] = useState<CalendarCompany[]>([]);
  const [ticker, setTicker] = useState('');
  const [payload, setPayload] = useState<DataPayload | null>(null);
  const [mode, setMode] = useState<Mode>('ttm');
  const [chartRange, setChartRange] = useState<StockRange>('1Y');
  const [chartScale, setChartScale] = useState<ChartScale>('absolute');

  // The dropdown is the exact same universe as the Earnings calendar tab — by
  // construction, both read it from /api/stocks/earnings-calendar.
  useEffect(() => {
    axios.get<{ companies: CalendarCompany[] }>('/api/stocks/earnings-calendar')
      .then(r => {
        const cs = r.data?.companies ?? [];
        setCompanies(cs);
        if (cs.length > 0) setTicker(prev => prev || cs[0].ticker);
      })
      .catch(() => {});
  }, []);

  const fetchData = (tk: string, bypassCache = false) => {
    if (!tk) return;
    setPayload(null);
    axios.get<DataPayload>('/api/stocks/data', {
      params: { ticker: tk, ...(bypassCache ? { nocache: 1 } : {}) },
    })
      .then(r => setPayload(r.data))
      .catch(() => {});
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(ticker); }, [ticker]);

  const loading = !!ticker && !payload;

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 font-sans">
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <LineChart className="w-6 h-6 text-emerald-400" />
          <h1 className="text-xl font-semibold flex-1">Stocks</h1>
          <button
            onClick={() => fetchData(ticker, true)}
            disabled={loading || !ticker}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Refresh"
            title="Refresh data (bypass cache)"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex justify-center mb-3">
          <CompanyPicker companies={companies} ticker={ticker} onSelect={setTicker} />
        </div>
        <div className="flex justify-center mb-5">
          <SegmentedToggle
            options={[
              { value: 'quarterly' as const, label: 'Quarterly data' },
              { value: 'ttm' as const, label: 'TTM data' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>

        <div className="overflow-x-auto border border-slate-700 rounded-lg relative">
          <table className="w-full text-sm border-collapse">
            <tbody>
              <tr className="border-b border-slate-700">
                <th className="text-left font-semibold text-slate-200 px-4 py-3 whitespace-nowrap bg-slate-800 w-1/2">
                  Next earnings
                </th>
                <td className="px-4 py-3 text-white font-bold">
                  {fmtEarningsDate(payload?.nextEarnings ?? null)}
                </td>
              </tr>
              {METRICS.map(metric => {
                const cell = payload?.data?.[metric]?.[mode];
                const hasData = !!(cell && cell.current !== undefined);
                return (
                  <tr key={metric} className="border-b border-slate-700 last:border-b-0">
                    <th className="text-left font-semibold text-slate-200 px-4 py-3 whitespace-nowrap bg-slate-800 w-1/2">
                      {metric}
                    </th>
                    <td className="px-4 py-3 h-[88px]">
                      {hasData && (
                        <CellRows rows={[
                          { value: fmtValue(cell!.current, cell!.unit), label: 'now' },
                          { value: fmtValue(cell!.oneYValue, cell!.unit), label: '1Y ago', growth: cell!.oneY },
                          { value: fmtValue(cell!.threeYValue, cell!.unit), label: '3Y ago', growth: cell!.threeY },
                        ]} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-10 h-10 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {ticker && (
          <div className="mt-6 p-5 border border-slate-800 rounded-lg bg-slate-900/60">
            <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
              <div className="text-sm font-semibold text-slate-200">Stock price</div>
              <div className="flex items-center gap-3">
                <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden text-xs">
                  {(['absolute', 'relative'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setChartScale(s)}
                      className={
                        'px-3 py-1 font-medium transition-colors '
                        + (chartScale === s
                          ? 'bg-slate-700 text-slate-100'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200')
                      }
                    >
                      {s === 'absolute' ? 'Absolute' : 'Relative'}
                    </button>
                  ))}
                </div>
                <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden text-xs">
                  {STOCK_RANGES.map(r => (
                    <button
                      key={r}
                      onClick={() => setChartRange(r)}
                      className={
                        'px-[7px] py-1 font-medium transition-colors '
                        + (chartRange === r
                          ? 'bg-slate-700 text-slate-100'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200')
                      }
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <StockChart ticker={ticker} range={chartRange} scale={chartScale} />
          </div>
        )}

        {payload && (
          <div className="text-center text-xs text-slate-300 font-medium mt-8">
            as of {payload.asOf}
          </div>
        )}
      </main>
    </div>
  );
}
