import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, LineChart } from 'lucide-react';

const COMPANIES = ['Nvidia', 'Alphabet', 'Amazon', 'Meta', 'Microsoft'] as const;
const METRICS = ['Revenue', 'Operating Income', 'Net Income (non-GAAP)', 'Operating Cash-Flow', 'Free Cash-Flow'] as const;

type Company = typeof COMPANIES[number];
type Metric = typeof METRICS[number];

interface CellData { oneY?: number; threeY?: number }
interface StocksPayload {
  period: string;
  data: Partial<Record<Company, Partial<Record<Metric, CellData>>>>;
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

export function StocksDashboard() {
  const navigate = useNavigate();
  const [payload, setPayload] = useState<StocksPayload | null>(null);

  useEffect(() => {
    axios.get<StocksPayload>('/api/stocks/data')
      .then(r => setPayload(r.data))
      .catch(() => {});
  }, []);

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
          {payload && (
            <span className="text-xs text-white">{payload.period}</span>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-800/50">
                <th className="text-center font-semibold text-slate-200 px-4 py-3 border-b border-slate-800" />
                {COMPANIES.map(c => (
                  <th
                    key={c}
                    className="text-center font-semibold text-slate-200 px-4 py-3 border-b border-l border-slate-800"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map(metric => (
                <tr key={metric} className="border-b border-slate-800 last:border-b-0">
                  <th className="text-center font-semibold text-slate-200 px-4 py-3 whitespace-nowrap">
                    {metric}
                  </th>
                  {COMPANIES.map(c => {
                    const cell = payload?.data?.[c]?.[metric];
                    return (
                      <td key={c} className="px-4 py-3 border-l border-slate-800 h-12 whitespace-nowrap text-center">
                        {cell && (cell.oneY !== undefined || cell.threeY !== undefined) && (
                          <span className="font-mono text-xs">
                            <span className={pctColor(cell.oneY)}>{fmtPct(cell.oneY)}</span>
                            <span className="text-white"> (1Y) / </span>
                            <span className={pctColor(cell.threeY)}>{fmtPct(cell.threeY)}</span>
                            <span className="text-white"> (3Y)</span>
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
