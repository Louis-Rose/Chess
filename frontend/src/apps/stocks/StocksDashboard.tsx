import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, LineChart, ExternalLink, RefreshCw } from 'lucide-react';
import { LineChart as RLineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';

const COMPANIES = ['Nvidia', 'Alphabet', 'Amazon', 'Meta', 'Microsoft'] as const;
const METRICS = ['Stock price', 'Revenue', 'Operating Income', 'Net Income (non-GAAP)', 'Operating Cash-Flow', 'Free Cash-Flow'] as const;

type Company = typeof COMPANIES[number];
type Metric = typeof METRICS[number];

type Mode = 'ttm' | 'quarterly';

interface Evidence { label: string; value: number; quote: string; url: string }
interface CellData {
  oneY?: number;
  threeY?: number;
  current?: number;
  oneYValue?: number;
  threeYValue?: number;
  unit?: string;
  evidence?: Evidence[];
}
interface EarningsInfo { date: string; daysUntil: number }
interface StocksPayload {
  asOf: string;
  data: Partial<Record<Company, Partial<Record<Metric, Partial<Record<Mode, CellData>>>>>>;
  earnings: Partial<Record<Company, EarningsInfo>>;
}

function fmtDaysUntil(d: number): string {
  if (d < 0) return 'TBA';
  if (d === 0) return 'today';
  return `${d} day${d === 1 ? '' : 's'} remaining`;
}

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

function fmtDateNoYear(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${ordinal(d)}`;
}

const TICKERS: Record<Company, string> = {
  Nvidia: 'NVDA',
  Alphabet: 'GOOGL',
  Amazon: 'AMZN',
  Meta: 'META',
  Microsoft: 'MSFT',
};

// Distinct line colors for each company on the overlaid stock chart.
const COMPANY_COLOR: Record<Company, string> = {
  Nvidia: '#34d399',    // emerald
  Alphabet: '#38bdf8',  // sky
  Amazon: '#fb923c',    // orange
  Meta: '#a78bfa',      // violet
  Microsoft: '#f87171', // rose
};

const STOCK_RANGES = ['1M', '6M', 'YTD', '1Y', '3Y', '5Y', '10Y'] as const;
type StockRange = typeof STOCK_RANGES[number];
interface PricePoint { date: string; close: number }
interface PriceHistory { ticker: string; range: StockRange; points: PricePoint[] }

// Brand logos — self-hosted SVGs in public/logos/ (real brand colors).
const COMPANY_LOGO: Record<Company, string> = {
  Nvidia: '/logos/nvidia.svg',
  Alphabet: '/logos/alphabet.svg',
  Amazon: '/logos/amazon.svg',
  Meta: '/logos/meta.svg',
  Microsoft: '/logos/microsoft.svg',
};

// Latest released quarter per company, with link to the press release.
// Update when a new quarter drops (and bump AS_OF_LABEL on the backend).
const MOST_RECENT_QUARTER: Record<Company, { label: string; url: string }> = {
  Nvidia: {
    label: 'Q4 2026',
    url: 'https://nvidianews.nvidia.com/news/nvidia-announces-financial-results-for-fourth-quarter-and-fiscal-2026',
  },
  Alphabet: {
    label: 'Q1 2026',
    url: 'https://abc.xyz/investor/news/news-details/2026/Alphabet-Announces-First-Quarter-2026-Results-2026-X-ge4Dm6bf/default.aspx',
  },
  Amazon: {
    label: 'Q1 2026',
    url: 'https://ir.aboutamazon.com/news-release/news-release-details/2026/Amazon-com-Announces-First-Quarter-Results/',
  },
  Meta: {
    label: 'Q1 2026',
    url: 'https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-First-Quarter-2026-Results/default.aspx',
  },
  Microsoft: {
    label: 'Q3 2026',
    url: 'https://www.microsoft.com/en-us/investor/earnings/fy-2026-q3/press-release-webcast',
  },
};

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
  if (unit === '$B') return `$${v >= 100 ? v.toFixed(0) : v.toFixed(1)}B`;
  if (unit === '$') return `$${v.toFixed(0)}`;
  return String(v);
}

// Bold the "$N billion" portion inside the press-release quote.
function renderQuote(quote: string) {
  const parts = quote.split(/(\$[\d.]+\s*billion)/i);
  return parts.map((part, i) =>
    /^\$[\d.]+\s*billion$/i.test(part)
      ? <strong key={i} className="text-emerald-300 font-semibold not-italic">{part}</strong>
      : <span key={i}>{part}</span>
  );
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

type ChartScale = 'absolute' | 'relative';

function StockChart({ companies, range, scale }: { companies: Company[]; range: StockRange; scale: ChartScale }) {
  const [histories, setHistories] = useState<Partial<Record<Company, PriceHistory>>>({});
  const [loading, setLoading] = useState(false);
  const key = companies.join(',');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setHistories({});
    Promise.all(
      companies.map(c =>
        axios.get<PriceHistory>(`/api/stocks/history/${TICKERS[c]}`, { params: { range } })
          .then(r => ({ c, hist: r.data }))
      )
    ).then(results => {
      if (cancelled) return;
      const next: Partial<Record<Company, PriceHistory>> = {};
      for (const { c, hist } of results) next[c] = hist;
      setHistories(next);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, range]);

  const { combined, yTicks, yDomain, hasData } = (() => {
    // In relative mode, each company's first available close becomes 100.
    const baselines: Partial<Record<Company, number>> = {};
    if (scale === 'relative') {
      for (const c of companies) {
        const h = histories[c];
        if (h && h.points.length > 0) baselines[c] = h.points[0].close;
      }
    }
    const transform = (c: Company, raw: number): number =>
      scale === 'absolute' || !baselines[c] ? raw : (raw / baselines[c]!) * 100;

    const byDate: Record<string, Record<string, number | string>> = {};
    const allValues: number[] = [];
    for (const c of companies) {
      const h = histories[c];
      if (!h) continue;
      for (const p of h.points) {
        const v = transform(c, p.close);
        byDate[p.date] = byDate[p.date] || { date: p.date };
        byDate[p.date][c] = v;
        allValues.push(v);
      }
    }
    const combined = Object.keys(byDate).sort().map(d => byDate[d]);
    if (allValues.length === 0) {
      return { combined: [], yTicks: [0], yDomain: [0, 0] as [number, number], hasData: false };
    }
    const yTicks = niceTicks(Math.min(...allValues), Math.max(...allValues));
    const yDomain: [number, number] = [yTicks[0], yTicks[yTicks.length - 1]];
    return { combined, yTicks, yDomain, hasData: true };
  })();

  const fmtRelative = (v: number) => {
    const g = Math.round(v - 100);
    return `${g >= 0 ? '+' : ''}${g}%`;
  };
  const fmtY = (v: number) => scale === 'absolute' ? `$${v}` : fmtRelative(v);
  const fmtTooltip = (v: number | undefined) =>
    v === undefined ? '—' : scale === 'absolute' ? `$${v.toFixed(2)}` : fmtRelative(v);

  return (
    <div>
      <div className="h-72">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <RLineChart data={combined} margin={{ top: 12, right: 24, bottom: 4, left: 16 }}>
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
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  return (
                    <div className="bg-slate-900 border border-slate-700 rounded-md text-xs">
                      <div className="text-center font-bold text-slate-200 px-3 pt-2 pb-2 border-b border-slate-700">
                        {label}
                      </div>
                      <div className="px-3 py-2 space-y-0.5">
                        {[...payload]
                          .sort((a, b) => ((b.value as number) ?? -Infinity) - ((a.value as number) ?? -Infinity))
                          .map((entry, i) => (
                            <div key={i} style={{ color: entry.stroke as string | undefined }}>
                              {entry.name} : {fmtTooltip(entry.value as number | undefined)}
                            </div>
                          ))}
                      </div>
                    </div>
                  );
                }}
              />
              {companies.map(c => (
                <Line key={c} type="monotone" dataKey={c} name={c} stroke={COMPANY_COLOR[c]} strokeWidth={1.5} dot={false} connectNulls />
              ))}
            </RLineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-500 text-sm">No data</div>
        )}
      </div>
    </div>
  );
}

export function StocksDashboard() {
  const navigate = useNavigate();
  const [payload, setPayload] = useState<StocksPayload | null>(null);
  const [selected, setSelected] = useState<{ metric: Metric; companies: Company[] } | null>(null);

  function toggleCell(company: Company, metric: Metric) {
    setSelected(prev => {
      if (!prev || prev.metric !== metric) return { metric, companies: [company] };
      if (prev.companies.includes(company)) {
        const next = prev.companies.filter(c => c !== company);
        return next.length ? { metric, companies: next } : null;
      }
      return { metric, companies: [...prev.companies, company] };
    });
  }

  function companiesWithData(metric: Metric): Company[] {
    return COMPANIES.filter(c => {
      const cell = payload?.data?.[c]?.[metric]?.[mode];
      return !!(cell && (cell.oneY !== undefined || cell.threeY !== undefined));
    });
  }

  function toggleRow(metric: Metric) {
    const cs = companiesWithData(metric);
    if (cs.length === 0) return;
    setSelected(prev => {
      const allSelected = prev?.metric === metric
        && prev.companies.length === cs.length
        && cs.every(c => prev.companies.includes(c));
      return allSelected ? null : { metric, companies: cs };
    });
  }
  const [mode, setMode] = useState<Mode>('ttm');
  const [chartRange, setChartRange] = useState<StockRange>('1Y');
  const [chartScale, setChartScale] = useState<ChartScale>('absolute');

  const fetchData = (bypassCache = false) => {
    setPayload(null);
    axios.get<StocksPayload>('/api/stocks/data', {
      params: bypassCache ? { nocache: 1 } : {},
    })
      .then(r => setPayload(r.data))
      .catch(() => {});
  };

  useEffect(() => { fetchData(); }, []);

  const selectedEvidences = selected
    ? selected.companies
        .map(c => ({ company: c, cell: payload?.data?.[c]?.[selected.metric]?.[mode] }))
        .filter(x => x.cell?.evidence?.length)
    : [];

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 font-sans">
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/app')}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <LineChart className="w-6 h-6 text-emerald-400" />
          <h1 className="text-xl font-semibold flex-1">Stocks</h1>
          <button
            onClick={() => fetchData(true)}
            disabled={!payload}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Refresh"
            title="Refresh data (bypass cache)"
          >
            <RefreshCw className={`w-5 h-5 ${!payload ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex justify-center mb-3">
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
          <table className="w-full text-sm border-collapse table-fixed">
            <colgroup>
              <col span={COMPANIES.length + 1} />
            </colgroup>
            <thead>
              <tr className="bg-slate-800">
                <th className="text-center font-semibold text-slate-200 px-4 py-3 border-b border-slate-700" />
                {COMPANIES.map(c => (
                  <th
                    key={c}
                    className="text-center font-semibold text-slate-200 px-4 py-3 border-b border-l border-slate-700"
                  >
                    <div className="flex flex-col items-center gap-1.5">
                      <img src={COMPANY_LOGO[c]} alt="" className="h-6 w-auto max-w-full" />
                      <span>{c}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-700">
                <th className="text-center font-semibold text-slate-200 px-4 py-3 whitespace-nowrap bg-slate-800">
                  Latest quarterly results
                </th>
                {COMPANIES.map(c => (
                  <td key={c} className="px-4 py-3 border-l border-slate-700 h-12 whitespace-nowrap text-center">
                    <a
                      href={MOST_RECENT_QUARTER[c].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline underline-offset-4 font-semibold"
                    >
                      {MOST_RECENT_QUARTER[c].label}
                    </a>
                  </td>
                ))}
              </tr>
              <tr className="border-b border-slate-700">
                <th className="text-center font-semibold text-slate-200 px-4 py-3 whitespace-nowrap bg-slate-800">
                  Next quarterly results
                </th>
                {COMPANIES.map(c => {
                  const e = payload?.earnings?.[c];
                  return (
                    <td key={c} className="px-4 py-3 border-l border-slate-700 h-[68px] whitespace-nowrap text-center text-white font-bold">
                      {e && (e.daysUntil >= 0 ? (
                        <>
                          <div>{fmtDateNoYear(e.date)}</div>
                          <div>({fmtDaysUntil(e.daysUntil)})</div>
                        </>
                      ) : (
                        <div>{fmtDaysUntil(e.daysUntil)}</div>
                      ))}
                    </td>
                  );
                })}
              </tr>
              {METRICS.map(metric => {
                const rowHasData = companiesWithData(metric).length > 0;
                const rowSelected = selected?.metric === metric;
                return (
                <tr key={metric} className="border-b border-slate-700 last:border-b-0">
                  <th
                    onClick={rowHasData ? () => toggleRow(metric) : undefined}
                    className={
                      'text-center font-semibold text-slate-200 px-4 py-3 whitespace-nowrap bg-slate-800 '
                      + (rowHasData ? 'cursor-pointer hover:bg-slate-700/80 ' : '')
                      + (rowSelected ? 'bg-emerald-500/10 ring-2 ring-inset ring-emerald-500/40' : '')
                    }
                  >
                    {metric}
                  </th>
                  {COMPANIES.map(c => {
                    const cell = payload?.data?.[c]?.[metric]?.[mode];
                    const hasData = !!(cell && (cell.oneY !== undefined || cell.threeY !== undefined));
                    const isSelected = selected?.metric === metric && selected.companies.includes(c);
                    return (
                      <td
                        key={c}
                        onClick={hasData ? () => toggleCell(c, metric) : undefined}
                        className={
                          'px-4 py-3 border-l border-slate-700 h-[88px] whitespace-nowrap text-center '
                          + (hasData ? 'cursor-pointer hover:bg-slate-800/60 ' : '')
                          + (isSelected ? 'bg-emerald-500/10 ring-2 ring-inset ring-emerald-500/40' : '')
                        }
                      >
                        {hasData && (
                          <CellRows rows={[
                            { value: fmtValue(cell!.current, cell!.unit), label: 'now' },
                            { value: fmtValue(cell!.oneYValue, cell!.unit), label: '1Y ago', growth: cell!.oneY },
                            { value: fmtValue(cell!.threeYValue, cell!.unit), label: '3Y ago', growth: cell!.threeY },
                          ]} />
                        )}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
          {!payload && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ paddingLeft: `${100 / (COMPANIES.length + 1)}%`, paddingTop: '72px' }}
            >
              <div className="w-10 h-10 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {payload && (
          <div className="text-center text-xs text-slate-300 font-medium mt-8">
            as of {payload.asOf}
          </div>
        )}

        {selected && (selected.metric === 'Stock price' || selectedEvidences.length > 0) && (
          <div className="mt-6 p-5 border border-slate-800 rounded-lg bg-slate-900/60">
            <div className="flex items-center justify-between mb-4 gap-4">
              <div className="text-sm font-semibold text-slate-200">
                {selected.metric}
              </div>
              {selected.metric === 'Stock price' && (
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
              )}
            </div>
            <div className="flex items-center justify-center gap-6 mb-4 flex-wrap">
              {selected.companies.map(c => (
                <div key={c} className="flex items-center gap-1.5">
                  <img src={COMPANY_LOGO[c]} alt="" className="h-6 w-auto max-w-full" />
                  <span
                    className="text-sm font-semibold"
                    style={{ color: selected.metric === 'Stock price' ? COMPANY_COLOR[c] : '#e2e8f0' }}
                  >
                    {c}
                  </span>
                </div>
              ))}
            </div>
            {selected.metric === 'Stock price' ? (
              <StockChart companies={selected.companies} range={chartRange} scale={chartScale} />
            ) : (
              <div className="space-y-6">
                {selectedEvidences.map(({ company, cell }) => (
                  <div key={company}>
                    {selected.companies.length > 1 && (
                      <div className="text-xs font-semibold text-slate-400 mb-2">{company}</div>
                    )}
                    <div className="space-y-4">
                      {cell!.evidence!.map((e, i) => (
                        <blockquote
                          key={i}
                          className="border-l-2 border-emerald-500/50 pl-4 py-1"
                        >
                          <p className="text-slate-200 italic">"{renderQuote(e.quote)}"</p>
                          <a
                            href={e.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-400 hover:underline mt-1.5 inline-flex items-center gap-1"
                          >
                            {e.label} press release <ExternalLink className="w-3 h-3" />
                          </a>
                        </blockquote>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
