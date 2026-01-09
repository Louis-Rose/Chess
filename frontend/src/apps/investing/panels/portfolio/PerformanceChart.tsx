import { useState, useRef, useCallback } from 'react';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Legend, Brush,
  ResponsiveContainer, Tooltip
} from 'recharts';
import { Loader2, Download } from 'lucide-react';
import { toPng } from 'html-to-image';
import axios from 'axios';
import { useLanguage } from '../../../../contexts/LanguageContext';
import type { PerformanceData } from './types';
import { formatEur, addLumraBranding, getScaleFactor } from './utils';

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
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const brushDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [brushRange, setBrushRange] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

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
        backgroundColor: '#f1f5f9',
        pixelRatio: 2,
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
    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 md:p-6">
      <div className="flex items-center justify-center gap-3 mb-4">
        <h3 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-100">{t('performance.title')}</h3>
        <button
          onClick={downloadChart}
          disabled={isDownloading}
          className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          title={language === 'fr' ? 'Telecharger le graphique' : 'Download chart'}
        >
          {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        </button>
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

        return (
          <>
            <div ref={chartContainerRef} className="bg-slate-100 dark:bg-slate-700 rounded-xl p-4">
              <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100 text-center mb-4">
                {language === 'fr' ? 'Performance du Portefeuille' : 'Portfolio Performance'}
              </h4>

              {filteredSummary && (
                <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6">
                  <div className="bg-white dark:bg-slate-600 rounded-lg p-2 md:p-4 text-center">
                    <p className="text-slate-500 dark:text-slate-300 text-xs md:text-sm mb-1">{language === 'fr' ? 'Periode de detention' : 'Holding period'}</p>
                    <span className="text-sm md:text-lg font-bold text-slate-800 dark:text-slate-100">
                      {(() => {
                        const start = new Date(filteredSummary.start_date);
                        const end = new Date(filteredSummary.end_date);

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

                        return parts.length > 0 ? parts.join(' ') : (language === 'fr' ? '0 jour' : '0 days');
                      })()}
                    </span>
                  </div>
                  <div className="bg-white dark:bg-slate-600 rounded-lg p-2 md:p-4 text-center">
                    <p className="text-slate-500 dark:text-slate-300 text-xs md:text-sm mb-1">{showAnnualized ? 'CAGR' : t('performance.totalReturn')}</p>
                    <span className={`text-base md:text-2xl font-bold ${(showAnnualized ? filteredSummary.cagr_eur : filteredSummary.portfolio_return_eur) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {showAnnualized ? (
                        <>
                          {filteredSummary.cagr_eur >= 0 ? '+' : ''}{filteredSummary.cagr_eur}%
                        </>
                      ) : (
                        <>
                          {filteredSummary.portfolio_gains_eur >= 0 ? '+' : ''}{formatEur(filteredSummary.portfolio_gains_eur)}€ ({filteredSummary.portfolio_return_eur >= 0 ? '+' : ''}{filteredSummary.portfolio_return_eur}%)
                        </>
                      )}
                    </span>
                  </div>
                  <div className="bg-white dark:bg-slate-600 rounded-lg p-2 md:p-4 text-center">
                    <p className="text-slate-500 dark:text-slate-300 text-xs md:text-sm mb-1">Benchmark</p>
                    <span className={`text-base md:text-2xl font-bold ${(showAnnualized ? filteredSummary.cagr_benchmark_eur : filteredSummary.benchmark_return_eur) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {showAnnualized ? (
                        <>
                          {filteredSummary.cagr_benchmark_eur >= 0 ? '+' : ''}{filteredSummary.cagr_benchmark_eur}%
                        </>
                      ) : (
                        <>
                          {filteredSummary.benchmark_gains_eur >= 0 ? '+' : ''}{formatEur(filteredSummary.benchmark_gains_eur)}€ ({filteredSummary.benchmark_return_eur >= 0 ? '+' : ''}{filteredSummary.benchmark_return_eur}%)
                        </>
                      )}
                    </span>
                  </div>
                </div>
              )}

              <div className="h-[380px] md:h-[480px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
                    <defs>
                      <linearGradient id="outperformanceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#16a34a" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#16a34a" stopOpacity={0.1} />
                      </linearGradient>
                      <linearGradient id="underperformanceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#dc2626" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#dc2626" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(date) => {
                        const d = new Date(date);
                        const formatted = d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', year: '2-digit' });
                        return formatted.charAt(0).toUpperCase() + formatted.slice(1);
                      }}
                      tick={{ fontSize: 14, fill: '#64748b' }}
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
                      tick={{ fontSize: 14, fill: '#64748b' }}
                      tickFormatter={(val) => {
                        return `${formatEur(val / 1000)}k€`;
                      }}
                      domain={[
                        (dataMin: number) => {
                          const increment = privateMode ? 5000 : 10000;
                          return Math.floor(dataMin / increment) * increment;
                        },
                        (dataMax: number) => {
                          const increment = privateMode ? 5000 : 10000;
                          return Math.ceil(dataMax / increment) * increment;
                        }
                      ]}
                      allowDecimals={false}
                      ticks={(() => {
                        const increment = privateMode ? 5000 : 10000;
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

                        return (
                          <div style={{ backgroundColor: '#1e293b', borderRadius: '6px', border: '1px solid #334155', padding: '6px 10px', fontSize: '12px' }}>
                            <p style={{ color: '#f1f5f9', fontWeight: 'bold', marginBottom: '4px', fontSize: '11px' }}>
                              {new Date(String(label)).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                            </p>
                            <p style={{ color: '#94a3b8', fontSize: '11px', padding: '1px 0', fontWeight: 'bold', borderBottom: '1px solid #475569', paddingBottom: '4px', marginBottom: '4px' }}>
                              {t('performance.invested')} : {formatEur(Math.round(costBasis))}€
                            </p>
                            <p style={{ color: '#4ade80', fontSize: '11px', padding: '1px 0', fontWeight: 'bold' }}>
                              {t('performance.portfolio')} : {formatEur(Math.round(portfolioValue))}€
                            </p>
                            <p style={{ color: '#a5b4fc', fontSize: '11px', padding: '1px 0', fontWeight: 'bold' }}>
                              {benchmarkTicker} : {formatEur(Math.round(benchmarkValue))}€
                            </p>
                            <p style={{ color: displayPerf >= 0 ? '#4ade80' : '#f87171', fontSize: '11px', padding: '1px 0', fontWeight: 'bold', marginTop: '4px', borderTop: '1px solid #475569', paddingTop: '4px' }}>
                              {perfLabel} : {displayPerf >= 0 ? '+' : ''}{displayPerf}%
                            </p>
                            <p style={{ color: '#8A8EFF', fontSize: '11px', padding: '1px 0', fontWeight: 'bold' }}>
                              {benchmarkPerfLabel} : {displayBenchmarkPerf >= 0 ? '+' : ''}{displayBenchmarkPerf}%
                            </p>
                            <p style={{ color: displayOutperfRatio >= 1 ? '#16a34a' : '#dc2626', fontSize: '11px', padding: '1px 0', fontWeight: 'bold' }}>
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
                            <div className="w-4 h-0.5 bg-[#8A8EFF]" style={{ borderStyle: 'dashed', borderWidth: '1px', borderColor: '#8A8EFF', height: 0 }}></div>
                            <span className="text-slate-600 dark:text-slate-300">{language === 'fr' ? 'Indice de ref.' : 'Benchmark'} ({benchmark === 'NASDAQ' ? (currency === 'EUR' ? 'EQQQ' : 'QQQ') : (currency === 'EUR' ? 'CSPX' : 'SPY')})</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-4 h-0.5 bg-slate-400"></div>
                            <span className="text-slate-600 dark:text-slate-300">{t('performance.invested')}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 bg-green-500/30 border border-green-500"></div>
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
                        fill="#e2e8f0"
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
                      stroke="#8A8EFF"
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
