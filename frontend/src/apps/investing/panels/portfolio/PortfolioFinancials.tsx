import { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { toPng } from 'html-to-image';
import { useLanguage } from '../../../../contexts/LanguageContext';
import { useTheme } from '../../../../contexts/ThemeContext';
import { addLumnaBranding } from './utils';

interface PortfolioFinancialsData {
  quarters: string[];
  tickers: string[];
  weights_by_quarter: Record<string, Record<string, number>>;
  metrics: Record<string, Record<string, Record<string, number>>>;
  currencies: Record<string, string>;
}

interface PortfolioFinancialsProps {
  data: PortfolioFinancialsData | undefined;
  isLoading: boolean;
}

export interface PortfolioFinancialsHandle {
  download: () => Promise<void>;
}

const METRICS = [
  { key: 'Revenue', labelEn: 'Revenue', labelFr: 'Chiffre d\'affaires' },
  { key: 'NetIncome', labelEn: 'Net Income', labelFr: 'Résultat net' },
  { key: 'OperatingIncome', labelEn: 'Operating Income', labelFr: 'Résultat opérationnel' },
  { key: 'FreeCashFlow', labelEn: 'Free Cash Flow', labelFr: 'Cash flow libre' },
  { key: 'OperatingCashFlow', labelEn: 'Operating Cash Flow', labelFr: 'Cash flow opérationnel' },
];

function formatLargeNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return (value / 1e12).toFixed(1) + 'T';
  if (abs >= 1e9) return (value / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return (value / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return (value / 1e3).toFixed(0) + 'K';
  return value.toFixed(0);
}

export const PortfolioFinancials = forwardRef<PortfolioFinancialsHandle, PortfolioFinancialsProps>(
  ({ data, isLoading }, ref) => {
    const { language } = useLanguage();
    const { resolvedTheme } = useTheme();
    const [selectedMetric, setSelectedMetric] = useState('Revenue');
    const [isDownloading, setIsDownloading] = useState(false);
    const tableRef = useRef<HTMLDivElement>(null);

    const handleDownload = async () => {
      setIsDownloading(true);
      await new Promise(r => setTimeout(r, 100));
      const bgColor = resolvedTheme === 'dark' ? '#334155' : '#f1f5f9';
      try {
        if (tableRef.current) {
          const dataUrl = await toPng(tableRef.current, { backgroundColor: bgColor, pixelRatio: 2, skipFonts: true });
          const branded = await addLumnaBranding(dataUrl);
          const link = document.createElement('a');
          link.download = `portfolio-financials-${selectedMetric.toLowerCase()}.png`;
          link.href = branded;
          link.click();
        }
      } finally {
        setIsDownloading(false);
      }
    };

    useImperativeHandle(ref, () => ({ download: handleDownload }));

    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }

    if (!data || data.quarters.length === 0) {
      return (
        <p className="text-slate-500 text-center py-4">
          {language === 'fr' ? 'Aucune donnée financière disponible' : 'No financial data available'}
        </p>
      );
    }

    const metricData = data.metrics[selectedMetric] || {};
    const metricInfo = METRICS.find(m => m.key === selectedMetric)!;

    return (
      <div>
        {/* Metric tabs - hidden during download */}
        {!isDownloading && (
          <div className="flex flex-wrap gap-2 mb-4 justify-center">
            {METRICS.map(m => (
              <button
                key={m.key}
                onClick={() => setSelectedMetric(m.key)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  selectedMetric === m.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500'
                }`}
              >
                {language === 'fr' ? m.labelFr : m.labelEn}
              </button>
            ))}
          </div>
        )}

        <div ref={tableRef} className="pb-14">
          {isDownloading && (
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 text-center mb-4">
              {language === 'fr' ? 'Financiers du portefeuille' : 'Portfolio Financials'} — {language === 'fr' ? metricInfo.labelFr : metricInfo.labelEn}
            </h3>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-300 dark:border-slate-500">
                  <th className="py-2 px-3 text-left font-semibold text-slate-700 dark:text-slate-200 sticky left-0 bg-slate-50 dark:bg-slate-700 z-10 min-w-[140px]">
                    {language === 'fr' ? 'Entreprise' : 'Company'}
                  </th>
                  {data.quarters.map(q => (
                    <th key={q} className="py-2 px-3 text-right font-semibold text-slate-700 dark:text-slate-200 min-w-[90px] whitespace-nowrap">
                      {q}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.tickers.map(ticker => {
                  const tickerVals = metricData[ticker] || {};
                  const currency = data.currencies[ticker] || 'USD';
                  return (
                    <tr key={ticker} className="border-b border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors">
                      <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-100 sticky left-0 bg-slate-50 dark:bg-slate-700 z-10">
                        <span>{ticker}</span>
                        <span className="ml-1 text-xs text-slate-400">{currency}</span>
                      </td>
                      {data.quarters.map(q => {
                        const val = tickerVals[q];
                        const weight = data.weights_by_quarter[q]?.[ticker];
                        return (
                          <td key={q} className="py-2 px-3 text-right tabular-nums whitespace-nowrap">
                            <div className={val !== undefined
                              ? val >= 0
                                ? 'text-green-600 dark:text-green-400'
                                : 'text-red-600 dark:text-red-400'
                              : 'text-slate-400'
                            }>
                              {val !== undefined ? formatLargeNumber(val) : '—'}
                            </div>
                            {weight !== undefined && (
                              <div className="text-[10px] text-slate-400 dark:text-slate-500">
                                {(weight * 100).toFixed(1)}%
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* Weighted Total row */}
                <tr className="border-t-2 border-slate-400 dark:border-slate-300 font-bold">
                  <td className="py-2 px-3 text-slate-800 dark:text-slate-100 sticky left-0 bg-slate-50 dark:bg-slate-700 z-10">
                    {language === 'fr' ? 'Total pondéré' : 'Weighted Total'}
                  </td>
                  {data.quarters.map(q => {
                    const val = metricData['total']?.[q];
                    return (
                      <td key={q} className={`py-2 px-3 text-right tabular-nums whitespace-nowrap ${
                        val !== undefined
                          ? val >= 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                          : 'text-slate-400'
                      }`}>
                        {val !== undefined ? formatLargeNumber(val) : '—'}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {!isDownloading && (
            <div className="flex items-center justify-end gap-2 mt-3 mr-2">
              <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-end">
                <svg viewBox="0 0 128 128" className="w-6 h-6 mr-0.5">
                  <rect x="28" y="64" width="16" height="40" rx="2" fill="white" />
                  <rect x="56" y="48" width="16" height="56" rx="2" fill="white" />
                  <rect x="84" y="32" width="16" height="72" rx="2" fill="white" />
                </svg>
              </div>
              <span className="text-lg font-bold text-slate-300">LUMNA</span>
            </div>
          )}
        </div>
      </div>
    );
  }
);
