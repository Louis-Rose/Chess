import { useState, useRef, useCallback } from 'react';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Legend, Brush,
  ResponsiveContainer, Tooltip
} from 'recharts';
import { Loader2, Download, Info } from 'lucide-react';
import { toPng } from 'html-to-image';
import axios from 'axios';
import { useLanguage } from '../../../../contexts/LanguageContext';
import { useTheme } from '../../../../contexts/ThemeContext';
import type { PerformanceData } from './types';
import { formatEur, addLumraBranding, getScaleFactor, PRIVATE_COST_BASIS } from './utils';

interface PerformanceChartProps {
  performanceData: PerformanceData | undefined;
  isLoading: boolean;
  benchmark: 'NASDAQ' | 'SP500';
  currency: 'EUR' | 'USD';
  privateMode: boolean;
  showAnnualized: boolean;
  onBenchmarkChange: (benchmark: 'NASDAQ' | 'SP500') => void;
  onShowAnnualizedChange: (show: boolean) => void;
}

export function PerformanceChart({
  performanceData,
  isLoading,
  benchmark,
  currency,
  privateMode,
  showAnnualized,
  onBenchmarkChange,
  onShowAnnualizedChange,
}: PerformanceChartProps) {
  const { language, t } = useLanguage();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const brushDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [brushRange, setBrushRange] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Theme-aware colors
  const colors = {
    background: isDark ? '#334155' : '#f1f5f9', // slate-700 (lighter gray)
    gridStroke: isDark ? '#64748b' : '#cbd5e1', // Lighter grid
    tickFill: isDark ? '#e2e8f0' : '#64748b', // Lighter font in dark mode for visibility
    axisStroke: isDark ? '#94a3b8' : '#94a3b8', // Lighter axis lines
    brushFill: isDark ? '#1e293b' : '#e2e8f0',
  };

  const handleBrushChange = useCallback((range: { startIndex?: number; endIndex?: number }) => {
    if (brushDebounceRef.current) {
      clearTimeout(brushDebounceRef.current);
    }
    if (typeof range.startIndex === 'number' && typeof range.endIndex === 'number') {
      brushDebounceRef.current = setTimeout(() => {
        setBrushRange({ startIndex: range.startIndex!, endIndex: range.endIndex! });
      }, 1000);
    }
  }, []);

  const downloadChart = async () => {
    if (!chartContainerRef.current) {
      console.error('Chart container ref not found');
      return;
    }
    setIsDownloading(true);
    await new Promise(resolve => setTimeout(resolve, 100));
    try {
      const dataUrl = await toPng(chartContainerRef.current, {
        backgroundColor: colors.background,
        pixelRatio: 2,
        skipFonts: true, // Skip fonts to avoid CORS issues with external stylesheets
      });

      const brandedDataUrl = await addLumraBranding(dataUrl, 70);

      const link = document.createElement('a');
      link.href = brandedDataUrl;
      link.download = `portfolio-performance-${new Date().toISOString().split('T')[0]}.png`;
      link.click();

      axios.post('/api/investing/graph-download', { graph_type: 'performance' }).catch(() => {});
    } catch (error) {
      console.error('Failed to download chart:', error);
      alert(language === 'fr' ? 'Erreur lors du telechargement' : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex-1"></div>
        <h3 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-100">{t('performance.title')}</h3>
        <div className="flex-1 flex justify-end">
          <button
            onClick={downloadChart}
            disabled={isDownloading}
            className="flex items-center gap-1.5 px-2 py-1 text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors text-sm"
            title={language === 'fr' ? 'Telecharger le graphique' : 'Download chart'}
          >
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>{language === 'fr' ? 'Télécharger' : 'Download'}</span>
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-end justify-center gap-3 md:gap-4 mb-4 md:mb-6">
        {/* Toggle: Total vs Annualized */}
        <div className="flex rounded-lg overflow-hidden border border-slate-300">
          <button
            onClick={() => onShowAnnualizedChange(false)}
            className={`px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium transition-colors ${!showAnnualized ? 'bg-green-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {language === 'fr' ? 'Tout' : 'All'}
          </button>
          <button
            onClick={() => onShowAnnualizedChange(true)}
            className={`px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium transition-colors ${showAnnualized ? 'bg-green-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {language === 'fr' ? 'Annualise' : 'Annualized'}
          </button>
        </div>
        {/* Benchmark Toggle */}
        <div className="flex flex-col items-center">
          <span className="text-xs text-slate-500 dark:text-slate-400 mb-1">Benchmark:</span>
          <div className="flex rounded-lg overflow-hidden border border-slate-300">
            <button
              onClick={() => onBenchmarkChange('NASDAQ')}
              className={`px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium transition-colors ${benchmark === 'NASDAQ' ? 'bg-green-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Nasdaq
            </button>
            <button
              onClick={() => onBenchmarkChange('SP500')}
              className={`px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium transition-colors ${benchmark === 'SP500' ? 'bg-green-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              S&P 500
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
        </div>
      ) : performanceData?.data && performanceData.data.length > 0 ? (() => {
        const allData = performanceData.data;

        const startIdx = brushRange?.startIndex ?? 0;
        const endIdx = brushRange?.endIndex ?? allData.length - 1;
        const selectedRangeData = allData.slice(startIdx, endIdx + 1);

        if (selectedRangeData.length === 0) {
          return <p className="text-slate-500 text-center py-8">{language === 'fr' ? 'Aucune donnee' : 'No data'}</p>;
        }

        const lastDataPoint = selectedRangeData[selectedRangeData.length - 1];
        const firstDataPoint = selectedRangeData[0];
        const actualCostBasis = lastDataPoint?.cost_basis_eur || 1;
        const scaleFactor = getScaleFactor(actualCostBasis, privateMode);

        const startDate = firstDataPoint.date;
        const endDate = lastDataPoint.date;
        const startPortfolioValue = firstDataPoint.portfolio_value_eur;
        const startBenchmarkValue = firstDataPoint.benchmark_value_eur;
        const startCostBasis = firstDataPoint.cost_basis_eur;
        const endCostBasis = lastDataPoint.cost_basis_eur;
        const endPortfolioValue = lastDataPoint.portfolio_value_eur;
        const endBenchmarkValue = lastDataPoint.benchmark_value_eur;

        const capitalAdded = endCostBasis - startCostBasis;
        const portfolioValueChange = endPortfolioValue - startPortfolioValue;
        const portfolioNetGains = portfolioValueChange - capitalAdded;
        const portfolioReturn = endCostBasis > 0
          ? Math.round((portfolioNetGains / endCostBasis) * 1000) / 10
          : 0;

        const benchmarkValueChange = endBenchmarkValue - startBenchmarkValue;
        const benchmarkNetGains = benchmarkValueChange - capitalAdded;
        const benchmarkReturn = endCostBasis > 0
          ? Math.round((benchmarkNetGains / endCostBasis) * 1000) / 10
          : 0;

        const daysDiff = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24);
        const years = daysDiff / 365;

        const shouldAnnualize = years > 0 && (years < 0.9 || years > 1.1);
        const cagrPortfolio = shouldAnnualize
          ? Math.round((Math.pow(1 + portfolioReturn / 100, 1 / years) - 1) * 1000) / 10
          : portfolioReturn;
        const cagrBenchmark = shouldAnnualize
          ? Math.round((Math.pow(1 + benchmarkReturn / 100, 1 / years) - 1) * 1000) / 10
          : benchmarkReturn;

        const fullRangeNetGains = brushRange ? portfolioNetGains : (
          allData.length > 0 ? (
            (allData[allData.length - 1].portfolio_value_eur - allData[0].portfolio_value_eur) -
            (allData[allData.length - 1].cost_basis_eur - allData[0].cost_basis_eur)
          ) * scaleFactor : 0
        );
        const fullRangeBenchmarkGains = brushRange ? benchmarkNetGains : (
          allData.length > 0 ? (
            (allData[allData.length - 1].benchmark_value_eur - allData[0].benchmark_value_eur) -
            (allData[allData.length - 1].cost_basis_eur - allData[0].cost_basis_eur)
          ) * scaleFactor : 0
        );

        const filteredSummary = brushRange ? {
          start_date: startDate,
          end_date: endDate,
          years: years,
          portfolio_return_eur: portfolioReturn,
          benchmark_return_eur: benchmarkReturn,
          portfolio_gains_eur: portfolioNetGains * scaleFactor,
          benchmark_gains_eur: benchmarkNetGains * scaleFactor,
          cagr_eur: cagrPortfolio,
          cagr_benchmark_eur: cagrBenchmark,
        } : {
          start_date: allData[0]?.date,
          end_date: allData[allData.length - 1]?.date,
          years: performanceData.summary?.years ?? 0,
          portfolio_return_eur: performanceData.summary?.portfolio_return_eur ?? 0,
          benchmark_return_eur: performanceData.summary?.benchmark_return_eur ?? 0,
          cagr_eur: performanceData.summary?.cagr_eur ?? 0,
          cagr_benchmark_eur: performanceData.summary?.cagr_benchmark_eur ?? 0,
          portfolio_gains_eur: fullRangeNetGains,
          benchmark_gains_eur: fullRangeBenchmarkGains,
        };

        const chartData = allData.map(d => {
          const scaledPortfolioValue = d.portfolio_value_eur * scaleFactor;
          const scaledBenchmarkValue = d.benchmark_value_eur * scaleFactor;
          const scaledCostBasis = d.cost_basis_eur * scaleFactor;
          const isOutperforming = scaledPortfolioValue >= scaledBenchmarkValue;
          return {
            ...d,
            portfolio_value_eur: scaledPortfolioValue,
            benchmark_value_eur: scaledBenchmarkValue,
            cost_basis_eur: scaledCostBasis,
            area_base: 0,
            outperformance_fill: isOutperforming ? scaledPortfolioValue - scaledBenchmarkValue : 0,
            underperformance_fill: !isOutperforming ? scaledBenchmarkValue - scaledPortfolioValue : 0,
          };
        });

        // Helper function to format holding period
        const formatHoldingPeriod = (startDateStr: string, endDateStr: string) => {
          const start = new Date(startDateStr);
          const end = new Date(endDateStr);

          let years = end.getFullYear() - start.getFullYear();
          let months = end.getMonth() - start.getMonth();
          let days = end.getDate() - start.getDate();

          if (days < 0) {
            months--;
            const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
            days += prevMonth.getDate();
          }

          if (months < 0) {
            years--;
            months += 12;
          }

          const parts: string[] = [];
          if (years > 0) parts.push(`${years} ${years !== 1 ? t('performance.years') : t('performance.year')}`);
          if (months > 0) parts.push(`${months} ${language === 'fr' ? 'mois' : (months !== 1 ? 'months' : 'month')}`);
          if (days > 0) parts.push(`${days} ${language === 'fr' ? (days !== 1 ? 'jours' : 'jour') : (days !== 1 ? 'days' : 'day')}`);

          if (parts.length === 0) return language === 'fr' ? '0 jour' : '0 days';
          if (parts.length === 1) return parts[0];
          if (parts.length === 2) return parts.join(language === 'fr' ? ' et ' : ' and ');
          return parts.slice(0, -1).join(', ') + (language === 'fr' ? ' et ' : ' and ') + parts[parts.length - 1];
        };

        // Calculate weighted holding period
        const calculateWeightedPeriod = () => {
          const endDate = new Date(filteredSummary.end_date);
          let weightedDays = 0;
          let totalCapital = 0;

          const rangeData = brushRange
            ? allData.slice(brushRange.startIndex, brushRange.endIndex + 1)
            : allData;

          for (let i = 0; i < rangeData.length; i++) {
            const currentCostBasis = rangeData[i].cost_basis_eur;
            const prevCostBasis = i > 0 ? rangeData[i - 1].cost_basis_eur : 0;
            const capitalAdded = currentCostBasis - prevCostBasis;

            if (capitalAdded > 0) {
              const investDate = new Date(rangeData[i].date);
              const daysHeld = (endDate.getTime() - investDate.getTime()) / (1000 * 60 * 60 * 24);
              weightedDays += capitalAdded * daysHeld;
              totalCapital += capitalAdded;
            }
          }

          const avgDays = totalCapital > 0 ? weightedDays / totalCapital : 0;
          const avgYears = Math.floor(avgDays / 365);
          const avgMonths = Math.floor((avgDays % 365) / 30);
          const avgDaysRemainder = Math.round(avgDays % 30);

          const parts: string[] = [];
          if (avgYears > 0) parts.push(`${avgYears} ${avgYears !== 1 ? t('performance.years') : t('performance.year')}`);
          if (avgMonths > 0) parts.push(`${avgMonths} ${language === 'fr' ? 'mois' : (avgMonths !== 1 ? 'months' : 'month')}`);
          if (avgDaysRemainder > 0 || parts.length === 0) parts.push(`${avgDaysRemainder} ${language === 'fr' ? (avgDaysRemainder !== 1 ? 'jours' : 'jour') : (avgDaysRemainder !== 1 ? 'days' : 'day')}`);

          if (parts.length === 1) return parts[0];
          if (parts.length === 2) return parts.join(language === 'fr' ? ' et ' : ' and ');
          return parts.slice(0, -1).join(', ') + (language === 'fr' ? ' et ' : ' and ') + parts[parts.length - 1];
        };

        return (
          <>
            <div ref={chartContainerRef} className="bg-slate-100 dark:bg-slate-700 rounded-xl p-4">
              {/* Title only visible during download */}
              {isDownloading && (
                <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100 text-center mb-4">
                  {language === 'fr' ? 'Performance du Portefeuille' : 'Portfolio Performance'}
                </h4>
              )}
              {/* Private mode indicator */}
              {privateMode && (
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-slate-600 px-2 py-1 rounded">
                    {language === 'fr' ? `Mode privé (base: ${PRIVATE_COST_BASIS}€)` : `Private mode (base: ${PRIVATE_COST_BASIS}€)`}
                  </span>
                </div>
              )}

              {filteredSummary && (
                <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6 auto-rows-fr">
                  {/* Combined Holding Periods - stacked vertically */}
                  <div className="bg-slate-200 dark:bg-slate-600 rounded-lg p-2 md:p-4 text-center relative group flex flex-col justify-center">
                    <div className="flex flex-col gap-2">
                      <div>
                        <p className="text-slate-600 dark:text-slate-200 text-sm md:text-base font-semibold mb-0.5">{language === 'fr' ? 'Periode de detention' : 'Holding period'}</p>
                        <span className="text-sm md:text-base font-bold text-slate-800 dark:text-slate-100">
                          {formatHoldingPeriod(filteredSummary.start_date, filteredSummary.end_date)}
                        </span>
                      </div>
                      <div className="border-t border-slate-300 dark:border-slate-500 pt-2">
                        <p className="text-slate-600 dark:text-slate-200 text-sm md:text-base font-semibold mb-0.5 flex items-center justify-center gap-1">
                          {language === 'fr' ? 'Periode ponderee' : 'Weighted period'}
                          <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                        </p>
                        <span className="text-sm md:text-base font-bold text-slate-800 dark:text-slate-100">
                          {calculateWeightedPeriod()}
                        </span>
                      </div>
                    </div>
                    {/* Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 w-64 text-left">
                      {language === 'fr'
                        ? 'Periode moyenne ponderee par le capital investi. Tient compte du fait que le capital a ete investi progressivement.'
                        : 'Average holding period weighted by invested capital. Accounts for the fact that capital was invested progressively.'}
                    </div>
                  </div>
                  {/* Portfolio Gains */}
                  <div className="bg-slate-200 dark:bg-slate-600 rounded-lg p-2 md:p-4 text-center flex flex-col justify-center">
                    <p className="text-slate-600 dark:text-slate-200 text-sm md:text-base font-semibold">{showAnnualized ? 'CAGR' : (language === 'fr' ? 'Gains du Portefeuille' : 'Portfolio Gains')}</p>
                    <span className={`font-bold text-base md:text-xl ${(showAnnualized ? filteredSummary.cagr_eur : filteredSummary.portfolio_return_eur) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {filteredSummary.portfolio_gains_eur >= 0 ? '+' : ''}{formatEur(filteredSummary.portfolio_gains_eur)}€ ({showAnnualized
                        ? `${filteredSummary.cagr_eur >= 0 ? '+' : ''}${filteredSummary.cagr_eur}%`
                        : `${filteredSummary.portfolio_return_eur >= 0 ? '+' : ''}${filteredSummary.portfolio_return_eur}%`
                      })
                    </span>
                  </div>
                  {/* Benchmark */}
                  <div className="bg-slate-200 dark:bg-slate-600 rounded-lg p-2 md:p-4 text-center flex flex-col justify-center">
                    <p className="text-slate-600 dark:text-slate-200 text-sm md:text-base font-semibold">Benchmark ({benchmark === 'NASDAQ' ? 'Nasdaq' : 'S&P 500'})</p>
                    <span className={`font-bold text-base md:text-xl ${(showAnnualized ? filteredSummary.cagr_benchmark_eur : filteredSummary.benchmark_return_eur) >= 0 ? 'text-blue-400' : 'text-red-500'}`}>
                      {filteredSummary.benchmark_gains_eur >= 0 ? '+' : ''}{formatEur(filteredSummary.benchmark_gains_eur)}€ ({showAnnualized
                        ? `${filteredSummary.cagr_benchmark_eur >= 0 ? '+' : ''}${filteredSummary.cagr_benchmark_eur}%`
                        : `${filteredSummary.benchmark_return_eur >= 0 ? '+' : ''}${filteredSummary.benchmark_return_eur}%`
                      })
                    </span>
                  </div>
                </div>
              )}

              <div className="h-[380px] md:h-[480px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 70 }}>
                    <defs>
                      <linearGradient id="outperformanceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4ade80" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#4ade80" stopOpacity={0.15} />
                      </linearGradient>
                      <linearGradient id="underperformanceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#dc2626" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#dc2626" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={colors.gridStroke} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(date) => {
                        const d = new Date(date);
                        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
                        const numTicks = isMobile ? 5 : 10;
                        // Use abbreviated month format when there are many data points
                        const useShortMonth = chartData.length > numTicks * 2;
                        const month = d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: useShortMonth ? 'short' : 'long' });
                        const year = d.getFullYear().toString();
                        return `${month.charAt(0).toUpperCase() + month.slice(1)} ${year}`;
                      }}
                      tick={{ fontSize: 15, fill: colors.tickFill }}
                      stroke={colors.axisStroke}
                      tickMargin={8}
                      height={50}
                      ticks={(() => {
                        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
                        const targetTicks = isMobile ? 5 : 10;

                        if (chartData.length <= targetTicks) {
                          return chartData.map(d => d.date);
                        }

                        const interval = Math.ceil(chartData.length / (targetTicks - 1));
                        const ticks: string[] = [];

                        for (let i = 0; i < chartData.length; i += interval) {
                          ticks.push(chartData[i].date);
                        }

                        const lastDate = chartData[chartData.length - 1]?.date;
                        if (lastDate && !ticks.includes(lastDate)) {
                          ticks.push(lastDate);
                        }

                        return ticks;
                      })()}
                    />
                    <YAxis
                      tick={{ fontSize: 15, fill: colors.tickFill }}
                      stroke={colors.axisStroke}
                      tickFormatter={(val) => {
                        // For private mode with small values, don't use k€ format
                        if (privateMode) {
                          return `${formatEur(val)}€`;
                        }
                        return `${formatEur(val / 1000)}k€`;
                      }}
                      domain={[
                        (dataMin: number) => {
                          const increment = privateMode ? 50 : 10000;
                          return Math.floor(dataMin / increment) * increment;
                        },
                        (dataMax: number) => {
                          const increment = privateMode ? 50 : 10000;
                          return Math.ceil(dataMax / increment) * increment;
                        }
                      ]}
                      allowDecimals={false}
                      ticks={(() => {
                        const increment = privateMode ? 50 : 10000;
                        const values = chartData.map(d => Math.max(d.portfolio_value_eur, d.benchmark_value_eur, d.cost_basis_eur));
                        const minVal = Math.floor(Math.min(...values) / increment) * increment;
                        const maxVal = Math.ceil(Math.max(...values) / increment) * increment;
                        const ticks = [];
                        for (let i = minVal; i <= maxVal; i += increment) {
                          ticks.push(i);
                        }
                        return ticks;
                      })()}
                    />
                    <Tooltip
                      wrapperStyle={{ zIndex: 100 }}
                      allowEscapeViewBox={{ x: false, y: true }}
                      offset={10}
                      content={({ active, payload, label }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const data = payload[0]?.payload;
                        if (!data) return null;

                        const benchmarkTicker = benchmark === 'NASDAQ' ? (currency === 'EUR' ? 'EQQQ' : 'QQQ') : (currency === 'EUR' ? 'CSPX' : 'SPY');
                        const portfolioValue = data.portfolio_value_eur;
                        const costBasis = data.cost_basis_eur;
                        const benchmarkValue = data.benchmark_value_eur;

                        const perfPct = costBasis > 0 ? ((portfolioValue - costBasis) / costBasis * 100) : 0;
                        const perfRounded = Math.round(perfPct * 10) / 10;

                        const firstDate = new Date(chartData[0]?.date);
                        const currentDate = new Date(data.date);
                        const daysDiff = Math.max(1, Math.round((currentDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
                        const years = daysDiff / 365;

                        const totalReturn = costBasis > 0 ? (portfolioValue / costBasis) : 1;
                        const cagr = years > 0 ? (Math.pow(totalReturn, 1 / years) - 1) * 100 : 0;
                        const cagrRounded = Math.round(cagr * 10) / 10;

                        const benchmarkPerfPct = costBasis > 0 ? ((benchmarkValue - costBasis) / costBasis * 100) : 0;
                        const benchmarkTotalReturn = costBasis > 0 ? (benchmarkValue / costBasis) : 1;
                        const benchmarkCagr = years > 0 ? (Math.pow(benchmarkTotalReturn, 1 / years) - 1) * 100 : 0;

                        const outperfRatioTotal = benchmarkPerfPct !== 0 ? (perfPct / benchmarkPerfPct) : 0;
                        const outperfRatioAnnualized = benchmarkCagr !== 0 ? (cagr / benchmarkCagr) : 0;
                        const displayOutperfRatio = showAnnualized ? Math.round(outperfRatioAnnualized * 10) / 10 : Math.round(outperfRatioTotal * 10) / 10;

                        const displayPerf = showAnnualized ? cagrRounded : perfRounded;
                        const perfLabel = showAnnualized
                          ? (language === 'fr' ? 'Performance (annualisee)' : 'Performance (annualized)')
                          : (language === 'fr' ? 'Performance (totale)' : 'Performance (all)');

                        const displayBenchmarkPerf = showAnnualized ? Math.round(benchmarkCagr * 10) / 10 : Math.round(benchmarkPerfPct * 10) / 10;
                        const benchmarkPerfLabel = language === 'fr' ? `Performance ${benchmarkTicker}` : `${benchmarkTicker} performance`;

                        const outperfLabel = displayOutperfRatio >= 1
                          ? (language === 'fr' ? `Surperformance vs ${benchmarkTicker}` : `Outperformance vs ${benchmarkTicker}`)
                          : (language === 'fr' ? `Sous-performance vs ${benchmarkTicker}` : `Underperformance vs ${benchmarkTicker}`);

                        // Consistent colors: green #4ade80, blue #60a5fa
                        const greenColor = '#4ade80';
                        const blueColor = '#60a5fa';

                        return (
                          <div style={{ backgroundColor: '#1e293b', borderRadius: '6px', border: '1px solid #334155', padding: '6px 10px', fontSize: '12px' }}>
                            <p style={{ color: '#f1f5f9', fontWeight: 'bold', marginBottom: '4px', fontSize: '11px' }}>
                              {new Date(String(label)).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                            </p>
                            <p style={{ color: '#94a3b8', fontSize: '11px', padding: '1px 0', fontWeight: 'bold', borderBottom: '1px solid #475569', paddingBottom: '4px', marginBottom: '4px' }}>
                              {t('performance.invested')} : {formatEur(Math.round(costBasis))}€
                            </p>
                            <p style={{ color: greenColor, fontSize: '11px', padding: '1px 0', fontWeight: 'bold' }}>
                              {t('performance.portfolio')} : {formatEur(Math.round(portfolioValue))}€
                            </p>
                            <p style={{ color: blueColor, fontSize: '11px', padding: '1px 0', fontWeight: 'bold' }}>
                              {benchmarkTicker} : {formatEur(Math.round(benchmarkValue))}€
                            </p>
                            <p style={{ color: displayPerf >= 0 ? greenColor : '#f87171', fontSize: '11px', padding: '1px 0', fontWeight: 'bold', marginTop: '4px', borderTop: '1px solid #475569', paddingTop: '4px' }}>
                              {perfLabel} : {displayPerf >= 0 ? '+' : ''}{displayPerf}%
                            </p>
                            <p style={{ color: blueColor, fontSize: '11px', padding: '1px 0', fontWeight: 'bold' }}>
                              {benchmarkPerfLabel} : {displayBenchmarkPerf >= 0 ? '+' : ''}{displayBenchmarkPerf}%
                            </p>
                            <p style={{ color: displayOutperfRatio >= 1 ? greenColor : '#dc2626', fontSize: '11px', padding: '1px 0', fontWeight: 'bold' }}>
                              {outperfLabel} : x{displayOutperfRatio}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Legend
                      content={() => (
                        <div className="flex justify-center gap-6 mt-2 text-sm flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <div className="w-4 h-0.5 bg-green-600"></div>
                            <span className="text-slate-600 dark:text-slate-300">{t('performance.portfolio')}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-4 h-0.5 bg-[#60a5fa]" style={{ borderStyle: 'dashed', borderWidth: '1px', borderColor: '#60a5fa', height: 0 }}></div>
                            <span className="text-slate-600 dark:text-slate-300">{language === 'fr' ? 'Indice de ref.' : 'Benchmark'} ({benchmark === 'NASDAQ' ? (currency === 'EUR' ? 'EQQQ' : 'QQQ') : (currency === 'EUR' ? 'CSPX' : 'SPY')})</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-4 h-0.5 bg-slate-400"></div>
                            <span className="text-slate-600 dark:text-slate-300">{t('performance.invested')}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 bg-green-400/50 border border-green-400"></div>
                            <span className="text-slate-600 dark:text-slate-300">{language === 'fr' ? 'Surperformance' : 'Outperformance'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 bg-red-500/30 border border-red-500"></div>
                            <span className="text-slate-600 dark:text-slate-300">{language === 'fr' ? 'Sous-performance' : 'Underperformance'}</span>
                          </div>
                        </div>
                      )}
                    />
                    {!isDownloading && (
                      <Brush
                        dataKey="date"
                        height={40}
                        stroke="#16a34a"
                        fill={colors.brushFill}
                        travellerWidth={12}
                        startIndex={brushRange?.startIndex ?? 0}
                        endIndex={brushRange?.endIndex ?? chartData.length - 1}
                        tickFormatter={(date) => {
                          const d = new Date(date);
                          const formatted = d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', year: '2-digit' });
                          return formatted.charAt(0).toUpperCase() + formatted.slice(1);
                        }}
                        onChange={handleBrushChange}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="area_base"
                      stackId="performance"
                      stroke="none"
                      fill="transparent"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="outperformance_fill"
                      stackId="performance"
                      stroke="none"
                      fill="url(#outperformanceGradient)"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="underperformance_fill"
                      stackId="underperf"
                      stroke="none"
                      fill="url(#underperformanceGradient)"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="area_base"
                      stackId="underperf"
                      stroke="none"
                      fill="transparent"
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="portfolio_value_eur"
                      name="Portfolio (EUR)"
                      stroke="#16a34a"
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="benchmark_value_eur"
                      name={`${benchmark} (EUR)`}
                      stroke="#60a5fa"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                    <Line
                      type="stepAfter"
                      dataKey="cost_basis_eur"
                      name="Amount Invested (EUR)"
                      stroke="#94a3b8"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              {/* LUMRA branding - hidden during download since addLumraBranding adds it */}
              {!isDownloading && (
                <div className="flex items-center justify-end gap-2 mt-3 mr-2">
                  <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-end">
                    <svg viewBox="0 0 128 128" className="w-6 h-6 mr-0.5">
                      <rect x="28" y="64" width="16" height="40" rx="2" fill="white" />
                      <rect x="56" y="48" width="16" height="56" rx="2" fill="white" />
                      <rect x="84" y="32" width="16" height="72" rx="2" fill="white" />
                    </svg>
                  </div>
                  <span className="text-lg font-bold text-slate-300">LUMRA</span>
                </div>
              )}
            </div>
          </>
        );
      })() : (
        <p className="text-slate-500 text-center py-8">
          {performanceData?.error || 'No performance data available.'}
        </p>
      )}
    </div>
  );
}
