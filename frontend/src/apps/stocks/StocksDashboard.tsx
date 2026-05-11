import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, LineChart, ExternalLink } from 'lucide-react';

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
            'w-24 px-3 py-1.5 font-medium transition-colors '
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
    <div className="font-mono text-xs leading-5">
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

export function StocksDashboard() {
  const navigate = useNavigate();
  const [payload, setPayload] = useState<StocksPayload | null>(null);
  const [selected, setSelected] = useState<{ company: Company; metric: Metric } | null>(null);
  const [mode, setMode] = useState<Mode>('ttm');

  useEffect(() => {
    axios.get<StocksPayload>('/api/stocks/data')
      .then(r => setPayload(r.data))
      .catch(() => {});
  }, []);

  const selectedCell = selected && payload?.data?.[selected.company]?.[selected.metric]?.[mode];

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
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex justify-center mb-3">
          <SegmentedToggle
            options={[
              { value: 'quarterly' as const, label: 'Quarterly' },
              { value: 'ttm' as const, label: 'TTM' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>

        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full text-sm border-collapse table-fixed">
            <colgroup>
              <col style={{ width: '200px' }} />
              <col span={COMPANIES.length} />
            </colgroup>
            <thead>
              <tr className="bg-slate-800">
                <th className="text-center font-semibold text-slate-200 px-4 py-3 border-b border-slate-800" />
                {COMPANIES.map(c => (
                  <th
                    key={c}
                    className="text-center font-semibold text-slate-200 px-4 py-3 border-b border-l border-slate-800"
                  >
                    <div className="flex flex-col items-center gap-1.5">
                      <img src={COMPANY_LOGO[c]} alt="" className="h-5 w-auto max-w-full" />
                      <span>{c}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-800">
                <th className="text-center font-semibold text-slate-200 px-4 py-3 whitespace-nowrap bg-slate-800">
                  Latest quarterly results
                </th>
                {COMPANIES.map(c => (
                  <td key={c} className="px-4 py-3 border-l border-slate-800 h-12 whitespace-nowrap text-center">
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
              <tr className="border-b border-slate-800">
                <th className="text-center font-semibold text-slate-200 px-4 py-3 whitespace-nowrap bg-slate-800">
                  Next quarterly results
                </th>
                {COMPANIES.map(c => {
                  const e = payload?.earnings?.[c];
                  return (
                    <td key={c} className="px-4 py-3 border-l border-slate-800 h-12 whitespace-nowrap text-center text-white font-medium">
                      {e ? fmtDaysUntil(e.daysUntil) : null}
                    </td>
                  );
                })}
              </tr>
              {METRICS.map(metric => (
                <tr key={metric} className="border-b border-slate-800 last:border-b-0">
                  <th className="text-center font-semibold text-slate-200 px-4 py-3 whitespace-nowrap bg-slate-800">
                    {metric}
                  </th>
                  {COMPANIES.map(c => {
                    const cell = payload?.data?.[c]?.[metric]?.[mode];
                    const hasData = !!(cell && (cell.oneY !== undefined || cell.threeY !== undefined));
                    const isSelected = selected?.company === c && selected?.metric === metric;
                    return (
                      <td
                        key={c}
                        onClick={hasData ? () => setSelected(isSelected ? null : { company: c, metric }) : undefined}
                        className={
                          'px-4 py-3 border-l border-slate-800 h-12 whitespace-nowrap text-center '
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
              ))}
            </tbody>
          </table>
        </div>

        {payload && (
          <div className="text-center text-xs text-slate-300 font-medium mt-8">
            as of {payload.asOf}
          </div>
        )}

        {selected && selectedCell?.evidence?.length && (
          <div className="mt-6 p-5 border border-slate-800 rounded-lg bg-slate-900/60">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-200">
                Evidence — {selected.company} · {selected.metric}
              </h2>
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-slate-500 hover:text-slate-300"
              >
                Close
              </button>
            </div>
            <div className="space-y-4">
              {selectedCell.evidence.map((e, i) => (
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
        )}
      </main>
    </div>
  );
}
