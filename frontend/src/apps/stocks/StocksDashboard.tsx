import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LineChart } from 'lucide-react';

const COMPANIES = ['Nvidia', 'Alphabet', 'Amazon', 'Meta', 'Microsoft'] as const;
const METRICS = ['Revenue', 'Operating Income', 'Net Income (non-GAAP)', 'Operating Cash-Flow', 'Free Cash-Flow'] as const;

export function StocksDashboard() {
  const navigate = useNavigate();

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
        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-800/50">
                <th className="text-left font-semibold text-slate-200 px-4 py-3 border-b border-slate-800" />
                {COMPANIES.map(c => (
                  <th
                    key={c}
                    className="text-left font-semibold text-slate-200 px-4 py-3 border-b border-l border-slate-800"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map(metric => (
                <tr key={metric} className="border-b border-slate-800 last:border-b-0">
                  <th className="text-left font-semibold text-slate-200 px-4 py-3 whitespace-nowrap">
                    {metric}
                  </th>
                  {COMPANIES.map(c => (
                    <td key={c} className="px-4 py-3 border-l border-slate-800 h-12" />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
