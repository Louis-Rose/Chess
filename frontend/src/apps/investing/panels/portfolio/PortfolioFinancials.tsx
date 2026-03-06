import { useState, useRef, forwardRef, useImperativeHandle } from 'react';
import { toPng } from 'html-to-image';
import { ChevronDown } from 'lucide-react';
import { useLanguage } from '../../../../contexts/LanguageContext';
import { useTheme } from '../../../../contexts/ThemeContext';
import { addLumnaBranding } from './utils';

interface PortfolioFinancialsData {
  quarters: string[];
  tickers: string[];
  weights_by_quarter: Record<string, Record<string, number>>;
  metrics: Record<string, Record<string, Record<string, number>>>;
  currencies: Record<string, string>;
  pe_ratios?: Record<string, Record<string, number>>;
  eurusd_rates?: Record<string, number>;
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
  { key: 'OperatingIncome', labelEn: 'Operating Income', labelFr: 'Résultat opérationnel' },
  { key: 'NetIncome', labelEn: 'Net Income', labelFr: 'Résultat net' },
  { key: 'OperatingCashFlow', labelEn: 'Operating Cash Flow', labelFr: 'Cash flow opérationnel' },
  { key: 'FreeCashFlow', labelEn: 'Free Cash Flow', labelFr: 'Cash flow libre' },
];

const PORTFOLIO_KEY = '__portfolio__';

function formatLargeNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e12) return (value / 1e12).toFixed(1) + 'T';
  if (abs >= 1e9) return (value / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return (value / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return (value / 1e3).toFixed(0) + 'K';
  return value.toFixed(0);
}

function formatGrowth(current: number, previous: number): string {
  if (previous === 0) return '—';
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function getComparisonQuarter(quarter: string, mode: 'qoq' | 'yoy'): string {
  const parts = quarter.split(' ');
  const qNum = parseInt(parts[0][1]);
  const year = parseInt(parts[1]);
  if (mode === 'yoy') {
    return `Q${qNum} ${year - 1}`;
  }
  // QoQ: previous quarter
  if (qNum === 1) return `Q4 ${year - 1}`;
  return `Q${qNum - 1} ${year}`;
}

export const PortfolioFinancials = forwardRef<PortfolioFinancialsHandle, PortfolioFinancialsProps>(
  ({ data, isLoading }, ref) => {
    const { language } = useLanguage();
    const { resolvedTheme } = useTheme();
    const [selectedTicker, setSelectedTicker] = useState<string>(PORTFOLIO_KEY);
    const [selectedQuarter, setSelectedQuarter] = useState<string>('');
    const [compareMode, setCompareMode] = useState<'qoq' | 'yoy'>('yoy');
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
          const name = selectedTicker === PORTFOLIO_KEY ? 'portfolio' : selectedTicker.toLowerCase();
          link.download = `financials-${name}-${activeQuarter}.png`;
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

    // Default to most recent quarter
    const activeQuarter = selectedQuarter && data.quarters.includes(selectedQuarter)
      ? selectedQuarter
      : data.quarters[data.quarters.length - 1];

    const compQuarter = getComparisonQuarter(activeQuarter, compareMode);
    const isPortfolio = selectedTicker === PORTFOLIO_KEY;

    const getMetricValue = (metricKey: string, quarter: string): number | undefined => {
      const metric = data.metrics[metricKey];
      if (!metric) return undefined;
      if (isPortfolio) return metric['total']?.[quarter];
      return metric[selectedTicker]?.[quarter];
    };

    const selectedLabel = isPortfolio
      ? (language === 'fr' ? 'Portefeuille complet' : 'Complete Portfolio')
      : selectedTicker;

    return (
      <div>
        {/* Controls: quarter dropdown | company buttons | QoQ/YoY toggle — single row */}
        {!isDownloading && (
          <div className="flex items-center justify-between gap-3 mb-4">
            {/* Quarter dropdown */}
            <div className="relative flex-shrink-0">
              <select
                value={activeQuarter}
                onChange={e => setSelectedQuarter(e.target.value)}
                className="appearance-none bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium rounded-lg pl-3 pr-8 py-1.5 cursor-pointer hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {data.quarters.map(q => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 pointer-events-none" />
            </div>

            {/* Company buttons */}
            <div className="flex flex-wrap gap-2 justify-center">
              {data.tickers.map(ticker => (
                <button
                  key={ticker}
                  onClick={() => setSelectedTicker(ticker)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    selectedTicker === ticker
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500'
                  }`}
                >
                  {ticker}
                </button>
              ))}
              <button
                onClick={() => setSelectedTicker(PORTFOLIO_KEY)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  isPortfolio
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500'
                }`}
              >
                {language === 'fr' ? 'Portefeuille' : 'Portfolio'}
              </button>
            </div>

            {/* QoQ / YoY toggle */}
            <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-500 flex-shrink-0">
              <button
                onClick={() => setCompareMode('qoq')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  compareMode === 'qoq'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500'
                }`}
              >
                Quarter over Quarter
              </button>
              <button
                onClick={() => setCompareMode('yoy')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  compareMode === 'yoy'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500'
                }`}
              >
                Year over Year
              </button>
            </div>
          </div>
        )}

        <div ref={tableRef} className="pb-14">
          {isDownloading && (
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 text-center mb-4">
              {language === 'fr' ? 'Financiers' : 'Financials'} — {selectedLabel} — {activeQuarter} ({compareMode === 'yoy' ? 'YoY' : 'QoQ'})
            </h3>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse table-fixed border border-slate-300 dark:border-slate-500">
              <thead>
                <tr className="border-b-2 border-slate-300 dark:border-slate-500">
                  <th className="w-1/4 py-2 px-3 text-left font-semibold text-slate-700 dark:text-slate-200 border-r border-slate-300 dark:border-slate-500">
                    {language === 'fr' ? 'Métrique' : 'Metric'}
                  </th>
                  <th className="w-1/4 py-2 px-3 text-center font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap border-r border-slate-300 dark:border-slate-500">
                    {compQuarter}
                  </th>
                  <th className="w-1/4 py-2 px-3 text-center font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap border-r border-slate-300 dark:border-slate-500">
                    {activeQuarter}
                  </th>
                  <th className="w-1/4 py-2 px-3 text-center font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                    {language === 'fr' ? 'Croissance' : 'Growth'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Portfolio weight row */}
                {!isPortfolio && (
                  <tr className="border-b-2 border-slate-300 dark:border-slate-500">
                    <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-100 border-r border-slate-300 dark:border-slate-500">
                      {language === 'fr' ? 'Poids du portefeuille' : 'Portfolio Weight'}
                    </td>
                    <td className="py-2 px-3 text-center tabular-nums whitespace-nowrap text-slate-500 dark:text-slate-400 border-r border-slate-300 dark:border-slate-500">
                      {data.weights_by_quarter[compQuarter]?.[selectedTicker] !== undefined
                        ? `${(data.weights_by_quarter[compQuarter][selectedTicker] * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className="py-2 px-3 text-center tabular-nums whitespace-nowrap text-slate-500 dark:text-slate-400 border-r border-slate-300 dark:border-slate-500">
                      {data.weights_by_quarter[activeQuarter]?.[selectedTicker] !== undefined
                        ? `${(data.weights_by_quarter[activeQuarter][selectedTicker] * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className="py-2 px-3 text-center" />
                  </tr>
                )}
                {METRICS.map(m => {
                  const currentVal = getMetricValue(m.key, activeQuarter);
                  const prevVal = getMetricValue(m.key, compQuarter);
                  const growth = currentVal !== undefined && prevVal !== undefined && prevVal !== 0
                    ? formatGrowth(currentVal, prevVal)
                    : '—';
                  const growthNum = currentVal !== undefined && prevVal !== undefined && prevVal !== 0
                    ? ((currentVal - prevVal) / Math.abs(prevVal)) * 100
                    : null;

                  return (
                    <tr key={m.key} className="border-b border-slate-300 dark:border-slate-500 hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors">
                      <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-100 border-r border-slate-300 dark:border-slate-500">
                        {language === 'fr' ? m.labelFr : m.labelEn}
                      </td>
                      <td className="py-2 px-3 text-center tabular-nums whitespace-nowrap text-slate-500 dark:text-slate-400 border-r border-slate-300 dark:border-slate-500">
                        {prevVal !== undefined ? formatLargeNumber(prevVal) : '—'}
                      </td>
                      <td className={`py-2 px-3 text-center tabular-nums whitespace-nowrap border-r border-slate-300 dark:border-slate-500 ${
                        currentVal !== undefined
                          ? currentVal >= 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                          : 'text-slate-400'
                      }`}>
                        {currentVal !== undefined ? formatLargeNumber(currentVal) : '—'}
                      </td>
                      <td className={`py-2 px-3 text-center tabular-nums whitespace-nowrap font-semibold ${
                        growthNum !== null
                          ? growthNum >= 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                          : 'text-slate-400'
                      }`}>
                        {growth}
                      </td>
                    </tr>
                  );
                })}

                {/* PE Ratio row */}
                {(() => {
                  const peSource = data.pe_ratios;
                  if (!peSource) return null;
                  const currentPe = isPortfolio ? peSource['total']?.[activeQuarter] : peSource[selectedTicker]?.[activeQuarter];
                  const prevPe = isPortfolio ? peSource['total']?.[compQuarter] : peSource[selectedTicker]?.[compQuarter];
                  const peGrowth = currentPe !== undefined && prevPe !== undefined && prevPe !== 0
                    ? formatGrowth(currentPe, prevPe)
                    : '—';
                  const peGrowthNum = currentPe !== undefined && prevPe !== undefined && prevPe !== 0
                    ? ((currentPe - prevPe) / Math.abs(prevPe)) * 100
                    : null;
                  return (
                    <tr className="border-b border-slate-300 dark:border-slate-500 border-t-2 hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors">
                      <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-100 border-r border-slate-300 dark:border-slate-500">
                        {language === 'fr' ? 'Ratio C/B' : 'PE Ratio'}
                      </td>
                      <td className="py-2 px-3 text-center tabular-nums whitespace-nowrap text-slate-500 dark:text-slate-400 border-r border-slate-300 dark:border-slate-500">
                        {prevPe !== undefined ? prevPe.toFixed(1) : '—'}
                      </td>
                      <td className={`py-2 px-3 text-center tabular-nums whitespace-nowrap border-r border-slate-300 dark:border-slate-500 ${
                        currentPe !== undefined && prevPe !== undefined
                          ? currentPe < prevPe
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-green-600 dark:text-green-400'
                          : 'text-slate-400'
                      }`}>
                        {currentPe !== undefined ? currentPe.toFixed(1) : '—'}
                      </td>
                      <td className={`py-2 px-3 text-center tabular-nums whitespace-nowrap font-semibold ${
                        peGrowthNum !== null
                          ? peGrowthNum < 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-green-600 dark:text-green-400'
                          : 'text-slate-400'
                      }`}>
                        {peGrowth}
                      </td>
                    </tr>
                  );
                })()}

                {/* EUR/USD Rate row */}
                {data.eurusd_rates && (() => {
                  const currentRate = data.eurusd_rates![activeQuarter];
                  const prevRate = data.eurusd_rates![compQuarter];
                  const fxGrowth = currentRate !== undefined && prevRate !== undefined && prevRate !== 0
                    ? formatGrowth(currentRate, prevRate)
                    : '—';
                  const fxGrowthNum = currentRate !== undefined && prevRate !== undefined && prevRate !== 0
                    ? ((currentRate - prevRate) / Math.abs(prevRate)) * 100
                    : null;
                  return (
                    <tr className="border-b border-slate-300 dark:border-slate-500 hover:bg-slate-100 dark:hover:bg-slate-600/50 transition-colors">
                      <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-100 border-r border-slate-300 dark:border-slate-500">
                        EUR/USD
                      </td>
                      <td className="py-2 px-3 text-center tabular-nums whitespace-nowrap text-slate-500 dark:text-slate-400 border-r border-slate-300 dark:border-slate-500">
                        {prevRate !== undefined ? prevRate.toFixed(4) : '—'}
                      </td>
                      <td className="py-2 px-3 text-center tabular-nums whitespace-nowrap text-slate-500 dark:text-slate-400 border-r border-slate-300 dark:border-slate-500">
                        {currentRate !== undefined ? currentRate.toFixed(4) : '—'}
                      </td>
                      <td className="py-2 px-3 text-center tabular-nums whitespace-nowrap font-semibold text-slate-500 dark:text-slate-400">
                        {fxGrowth !== '—' ? fxGrowth : '—'}
                      </td>
                    </tr>
                  );
                })()}
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
