import { useState, useRef, useCallback, forwardRef, useImperativeHandle, useMemo, useEffect } from 'react';
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Brush,
  ResponsiveContainer, Tooltip
} from 'recharts';
import { Loader2, Download, Info, Eye, EyeOff } from 'lucide-react';
import { toPng } from 'html-to-image';
import axios from 'axios';
import { useLanguage } from '../../../../contexts/LanguageContext';
import { useTheme } from '../../../../contexts/ThemeContext';
import type { PerformanceData } from './types';
import { formatEur, addLumnaBranding, getScaleFactor, PRIVATE_COST_BASIS } from './utils';

// Timeframe definitions
type TimeframeKey = '1w' | '1m' | '6m' | 'ytd' | '1y' | '5y' | 'all';

interface TimeframeOption {
  key: TimeframeKey;
  labelFr: string;
  labelEn: string;
  getDaysBack: () => number | null; // null = all
}

const TIMEFRAME_OPTIONS: TimeframeOption[] = [
  { key: '1w', labelFr: '1s', labelEn: '1w', getDaysBack: () => 7 },
  { key: '1m', labelFr: '1m', labelEn: '1m', getDaysBack: () => 30 },
  { key: '6m', labelFr: '6m', labelEn: '6m', getDaysBack: () => 180 },
  { key: 'ytd', labelFr: 'AAJ', labelEn: 'YTD', getDaysBack: () => {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    return Math.ceil((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  }},
  { key: '1y', labelFr: '1a', labelEn: '1y', getDaysBack: () => 365 },
  { key: '5y', labelFr: '5a', labelEn: '5y', getDaysBack: () => 365 * 5 },
  { key: 'all', labelFr: 'Tous', labelEn: 'All', getDaysBack: () => null },
];

export interface PerformanceChartHandle {
  download: () => Promise<void>;
  isDownloading: boolean;
}

interface PerformanceChartProps {
  performanceData: PerformanceData | undefined;
  isLoading: boolean;
  benchmark: 'NASDAQ' | 'SP500';
  currency: 'EUR' | 'USD';
  privateMode: boolean;
  showAnnualized: boolean;
  onBenchmarkChange: (benchmark: 'NASDAQ' | 'SP500') => void;
  onShowAnnualizedChange: (show: boolean) => void;
  hideTitle?: boolean;
  hideDownloadButton?: boolean;
  // Stock selection can be controlled externally
  selectedStocks?: Set<string>;
  onSelectedStocksChange?: (stocks: Set<string>) => void;
}

export const PerformanceChart = forwardRef<PerformanceChartHandle, PerformanceChartProps>(({
  performanceData,
  isLoading,
  benchmark,
  currency,
  privateMode,
  showAnnualized,
  onBenchmarkChange,
  onShowAnnualizedChange,
  hideTitle = false,
  hideDownloadButton = false,
  selectedStocks: controlledSelectedStocks,
  onSelectedStocksChange,
}, ref) => {
  const { language, t } = useLanguage();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Brush range - only updated after user stops dragging (debounced)
  const [brushRange, setBrushRange] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Line visibility toggles
  const [showPortfolio, setShowPortfolio] = useState(true);
  const [showBenchmark, setShowBenchmark] = useState(true);
  const [showInvestedCapital, setShowInvestedCapital] = useState(true);

  // Timestamp to ignore brush changes for a period after visibility toggles
  const ignoreUntilRef = useRef<number>(0);

  // Timeframe selection
  const [selectedTimeframe, setSelectedTimeframe] = useState<TimeframeKey>('all');

  // Y-axis range (percentage of full range, 0-100 for start and end)
  const [yAxisRange, setYAxisRange] = useState<{ start: number; end: number }>({ start: 0, end: 100 });

  // Stock selection for filtering - supports controlled and uncontrolled modes
  const [internalSelectedStocks, setInternalSelectedStocks] = useState<Set<string>>(new Set());
  const [stockSelectorOpen, setStockSelectorOpen] = useState(false);

  // Tooltip pinned state - click to pin tooltip
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pinnedTooltipData, setPinnedTooltipData] = useState<{ data: any; label: string; x: number; y: number; dataIndex: number } | null>(null);

  // Track if hovering on Portfolio line in tooltip to show stock breakdown
  const [showStockBreakdown, setShowStockBreakdown] = useState(false);

  // Helper to render tooltip content (used by both hover and pinned tooltips)
  const renderTooltipContent = (
    data: NonNullable<typeof performanceData>['data'][0] & { portfolio_value_eur: number; cost_basis_eur: number; benchmark_value_eur: number },
    _label: string, // unused, we use data.date instead
    isPinned: boolean,
    onPin: () => void,
    onClose: () => void,
    dataIndex?: number, // Index in chartData to determine date range
    chartDataArr?: Array<{ date: string }> // Pass chartData for date range calculation
  ) => {
    const benchmarkTicker = benchmark === 'NASDAQ' ? (currency === 'EUR' ? 'EQQQ' : 'QQQ') : (currency === 'EUR' ? 'CSPX' : 'SPY');
    const portfolioValue = data.portfolio_value_eur;
    const costBasis = data.cost_basis_eur;
    const benchmarkValue = data.benchmark_value_eur;

    const perfPct = costBasis > 0 ? ((portfolioValue - costBasis) / costBasis * 100) : 0;
    const perfRounded = Math.round(perfPct * 10) / 10;

    const firstDate = performanceData?.data ? new Date(performanceData.data[0]?.date) : new Date();
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

    const greenColor = '#4ade80';
    const blueColor = '#60a5fa';

    const currentDateStr = data.date;
    const currentDateObj = new Date(currentDateStr);

    // Get previous and next data point dates for range calculation
    const prevDataPoint = dataIndex !== undefined && chartDataArr && dataIndex > 0 ? chartDataArr[dataIndex - 1] : null;
    const nextDataPoint = dataIndex !== undefined && chartDataArr && dataIndex < chartDataArr.length - 1 ? chartDataArr[dataIndex + 1] : null;

    // Transactions from previous date (exclusive) to current date (inclusive)
    const prevDateObj = prevDataPoint ? new Date(prevDataPoint.date) : null;

    // Next date for display (exclusive) - subtract 1 day
    const nextDateObj = nextDataPoint ? new Date(nextDataPoint.date) : null;
    const displayEndDate = nextDateObj ? new Date(nextDateObj.getTime() - 24 * 60 * 60 * 1000) : currentDateObj;

    const transactionsOnDate = performanceData?.transactions?.filter(tx => {
      const txDate = new Date(tx.date);
      // From previous date (exclusive) to current date (inclusive)
      const afterPrev = prevDateObj ? txDate > prevDateObj : true;
      return afterPrev && txDate <= currentDateObj;
    }) || [];

    const sortedTransactions = [...transactionsOnDate].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'BUY' ? -1 : 1;
      if (a.ticker !== b.ticker) return a.ticker.localeCompare(b.ticker);
      return b.quantity - a.quantity;
    });

    return (
      <div
        style={{ backgroundColor: '#1e293b', borderRadius: '6px', border: isPinned ? '2px solid #22c55e' : '1px solid #334155', padding: '6px 10px', fontSize: '12px', cursor: isPinned ? 'default' : 'pointer', position: 'relative' }}
        onClick={isPinned ? undefined : onPin}
      >
        {isPinned && (
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            style={{
              position: 'absolute', top: '-8px', right: '-8px', width: '20px', height: '20px',
              borderRadius: '50%', backgroundColor: '#ef4444', border: 'none', color: 'white',
              fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontWeight: 'bold',
            }}
          >×</button>
        )}
        <p style={{ color: '#f1f5f9', fontWeight: 'bold', marginBottom: '4px', fontSize: '11px' }}>
          {currentDateObj.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          {nextDataPoint && displayEndDate.getTime() !== currentDateObj.getTime() && (
            <span> → {displayEndDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          )}
        </p>
        <p style={{ color: '#94a3b8', fontSize: '11px', padding: '1px 0', fontWeight: 'bold', borderBottom: '1px solid #475569', paddingBottom: '4px', marginBottom: '4px' }}>
          {t('performance.invested')} : {currency === 'EUR' ? `${formatEur(Math.round(costBasis))}€` : `$${formatEur(Math.round(costBasis))}`}
        </p>
        <div
          style={{ position: 'relative' }}
          onClick={(e) => {
            e.stopPropagation();
            setShowStockBreakdown(!showStockBreakdown);
          }}
        >
          <p style={{ color: greenColor, fontSize: '11px', padding: '1px 0', fontWeight: 'bold', cursor: 'pointer' }}>
            {t('performance.portfolio')} : {currency === 'EUR' ? `${formatEur(Math.round(portfolioValue))}€` : `$${formatEur(Math.round(portfolioValue))}`}
            <span style={{ color: '#94a3b8', fontSize: '9px', marginLeft: '4px' }}>{showStockBreakdown ? '▲' : '▼'}</span>
          </p>
          {showStockBreakdown && data.stocks && (
            <div style={{
              backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '4px',
              padding: '4px 8px', marginTop: '2px', marginBottom: '4px', maxHeight: '150px', overflowY: 'auto'
            }}>
              {Object.entries(data.stocks as Record<string, { value_eur: number; quantity: number }>)
                .filter(([ticker]) => selectedStocks.has(ticker))
                .sort((a, b) => b[1].value_eur - a[1].value_eur)
                .map(([ticker, stockData]) => (
                  <p key={ticker} style={{ color: '#94a3b8', fontSize: '10px', padding: '1px 0', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span style={{ color: '#e2e8f0' }}>{ticker}</span>
                    <span>{currency === 'EUR' ? `${formatEur(Math.round(stockData.value_eur))}€` : `$${formatEur(Math.round(stockData.value_eur))}`}</span>
                  </p>
                ))
              }
            </div>
          )}
        </div>
        <p style={{ color: blueColor, fontSize: '11px', padding: '1px 0', fontWeight: 'bold' }}>
          {benchmarkTicker} : {currency === 'EUR' ? `${formatEur(Math.round(benchmarkValue))}€` : `$${formatEur(Math.round(benchmarkValue))}`}
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
        {sortedTransactions.length > 0 && (
          <div style={{ borderTop: '1px solid #475569', marginTop: '4px', paddingTop: '4px' }}>
            {sortedTransactions.map((tx, idx) => {
              const pricePerShare = tx.amount_eur && tx.quantity ? (tx.amount_eur / tx.quantity).toFixed(2) : null;
              const pricePerShareStr = pricePerShare ? `, ${currency === 'EUR' ? `${pricePerShare}€` : `$${pricePerShare}`}/${language === 'fr' ? 'action' : 'share'}` : '';
              const amountStr = tx.amount_eur ? ` (${currency === 'EUR' ? `${formatEur(Math.round(tx.amount_eur))}€` : `$${formatEur(Math.round(tx.amount_eur))}`}${pricePerShareStr})` : '';
              const txDateStr = new Date(tx.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              return (
                <p key={idx} style={{ color: tx.type === 'BUY' ? '#22c55e' : '#f97316', fontSize: '11px', padding: '1px 0', fontWeight: 'bold' }}>
                  {tx.type === 'BUY'
                    ? (language === 'fr' ? `${txDateStr}: Acheté ${tx.quantity} ${tx.ticker}${amountStr}` : `${txDateStr}: Bought ${tx.quantity} ${tx.ticker}${amountStr}`)
                    : (language === 'fr' ? `${txDateStr}: Vendu ${tx.quantity} ${tx.ticker}${amountStr}` : `${txDateStr}: Sold ${tx.quantity} ${tx.ticker}${amountStr}`)
                  }
                </p>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Use controlled state if provided, otherwise use internal state
  const selectedStocks = controlledSelectedStocks ?? internalSelectedStocks;
  const setSelectedStocks = useCallback((newStocks: Set<string> | ((prev: Set<string>) => Set<string>)) => {
    const resolvedStocks = typeof newStocks === 'function' ? newStocks(selectedStocks) : newStocks;
    if (onSelectedStocksChange) {
      onSelectedStocksChange(resolvedStocks);
    } else {
      setInternalSelectedStocks(resolvedStocks);
    }
  }, [selectedStocks, onSelectedStocksChange]);

  // Extract available stocks from performance data
  // Separate stocks into currently owned and sold off
  const { currentlyOwnedStocks, soldOffStocks, availableStocks } = useMemo(() => {
    if (!performanceData?.data || performanceData.data.length === 0) {
      return { currentlyOwnedStocks: [], soldOffStocks: [], availableStocks: [] };
    }

    // Get all unique tickers from ALL data points (includes stocks that were sold)
    const allTickers = new Set<string>();
    for (const dataPoint of performanceData.data) {
      if (dataPoint.stocks) {
        for (const ticker of Object.keys(dataPoint.stocks)) {
          allTickers.add(ticker);
        }
      }
    }

    // Get currently owned stocks from the last data point (quantity > 0)
    const lastDataPoint = performanceData.data[performanceData.data.length - 1];
    const currentlyOwned = new Set<string>();
    if (lastDataPoint.stocks) {
      for (const [ticker, data] of Object.entries(lastDataPoint.stocks)) {
        if (data.quantity > 0) {
          currentlyOwned.add(ticker);
        }
      }
    }

    // Separate into two categories
    const owned = Array.from(currentlyOwned).sort();
    const sold = Array.from(allTickers).filter(t => !currentlyOwned.has(t)).sort();

    return {
      currentlyOwnedStocks: owned,
      soldOffStocks: sold,
      availableStocks: [...owned, ...sold]
    };
  }, [performanceData?.data]);

  // Track if we've initialized the stock selection
  const hasInitializedStocks = useRef(false);

  // Initialize selected stocks to all when data first loads (only in uncontrolled mode)
  useEffect(() => {
    if (!controlledSelectedStocks && availableStocks.length > 0 && !hasInitializedStocks.current) {
      hasInitializedStocks.current = true;
      setInternalSelectedStocks(new Set(availableStocks));
    }
  }, [availableStocks, controlledSelectedStocks]);

  // Toggle stock selection
  const toggleStock = useCallback((ticker: string) => {
    setSelectedStocks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(ticker)) {
        newSet.delete(ticker);
      } else {
        newSet.add(ticker);
      }
      return newSet;
    });
  }, [setSelectedStocks]);

  // Select/deselect stocks by category
  const selectAllOwned = useCallback(() => {
    setSelectedStocks(prev => {
      const newSet = new Set(prev);
      currentlyOwnedStocks.forEach(t => newSet.add(t));
      return newSet;
    });
  }, [currentlyOwnedStocks, setSelectedStocks]);

  const deselectAllOwned = useCallback(() => {
    setSelectedStocks(prev => {
      const newSet = new Set(prev);
      currentlyOwnedStocks.forEach(t => newSet.delete(t));
      return newSet;
    });
  }, [currentlyOwnedStocks, setSelectedStocks]);

  const selectAllSold = useCallback(() => {
    setSelectedStocks(prev => {
      const newSet = new Set(prev);
      soldOffStocks.forEach(t => newSet.add(t));
      return newSet;
    });
  }, [soldOffStocks, setSelectedStocks]);

  const deselectAllSold = useCallback(() => {
    setSelectedStocks(prev => {
      const newSet = new Set(prev);
      soldOffStocks.forEach(t => newSet.delete(t));
      return newSet;
    });
  }, [soldOffStocks, setSelectedStocks]);

  // Calculate brush indices from timeframe
  const getTimeframeBrushRange = useCallback((data: { date: string }[], timeframe: TimeframeKey) => {
    if (!data || data.length === 0) return null;
    if (timeframe === 'all') return null; // null means show all

    const option = TIMEFRAME_OPTIONS.find(o => o.key === timeframe);
    if (!option) return null;

    const daysBack = option.getDaysBack();
    if (daysBack === null) return null;

    const endDate = new Date(data[data.length - 1].date);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - daysBack);

    // Find the index of the first data point >= startDate
    let startIndex = 0;
    for (let i = 0; i < data.length; i++) {
      if (new Date(data[i].date) >= startDate) {
        startIndex = i;
        break;
      }
    }

    return { startIndex, endIndex: data.length - 1 };
  }, []);

  // Handle timeframe change
  const handleTimeframeChange = useCallback((timeframe: TimeframeKey) => {
    setSelectedTimeframe(timeframe);
    if (performanceData?.data) {
      const range = getTimeframeBrushRange(performanceData.data, timeframe);
      lastBrushRangeRef.current = range;
      setBrushRange(range);
    }
  }, [performanceData?.data, getTimeframeBrushRange]);

  // Theme-aware colors
  const colors = {
    background: isDark ? '#334155' : '#f1f5f9', // slate-700 (lighter gray)
    gridStroke: isDark ? '#64748b' : '#cbd5e1', // Lighter grid
    tickFill: isDark ? '#e2e8f0' : '#64748b', // Lighter font in dark mode for visibility
    axisStroke: isDark ? '#94a3b8' : '#94a3b8', // Lighter axis lines
    brushFill: isDark ? '#1e293b' : '#e2e8f0',
  };

  // Ref to track the last brush range to prevent unnecessary updates
  const lastBrushRangeRef = useRef<{ startIndex: number; endIndex: number } | null>(null);

  const handleBrushChange = useCallback((range: { startIndex?: number; endIndex?: number }) => {
    if (typeof range.startIndex === 'number' && typeof range.endIndex === 'number') {
      // Ignore brush changes triggered by visibility toggles (within 200ms window)
      if (Date.now() < ignoreUntilRef.current) {
        return;
      }

      // Check if values actually changed to prevent reset on re-renders
      const lastRange = lastBrushRangeRef.current;
      if (lastRange && lastRange.startIndex === range.startIndex && lastRange.endIndex === range.endIndex) {
        return; // No change, skip update
      }

      // Only update after user stops dragging (debounced)
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        lastBrushRangeRef.current = { startIndex: range.startIndex!, endIndex: range.endIndex! };
        setBrushRange({ startIndex: range.startIndex!, endIndex: range.endIndex! });
      }, 500);
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

      const brandedDataUrl = await addLumnaBranding(dataUrl, 70);

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

  // Expose download function to parent via ref
  useImperativeHandle(ref, () => ({
    download: downloadChart,
    isDownloading,
  }));

  const content = (
    <>
      {!hideTitle ? (
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1"></div>
          <h3 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-100">{t('performance.title')}</h3>
          <div className="flex-1 flex justify-end">
            {!hideDownloadButton && (
            <button
              onClick={downloadChart}
              disabled={isDownloading}
              className="flex items-center gap-1.5 px-2 py-1 text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors text-sm"
              title={language === 'fr' ? 'Telecharger le graphique' : 'Download chart'}
            >
              {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{language === 'fr' ? 'Télécharger' : 'Download'}</span>
            </button>
            )}
          </div>
        </div>
      ) : (
        !hideDownloadButton && (
        <div className="flex justify-end mb-4">
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
        )
      )}
      <div className="flex flex-wrap items-end justify-center gap-3 md:gap-4 mb-4 md:mb-6">
        {/* Toggle: Total vs Annualized */}
        <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-600 rounded-lg p-1">
          <button
            onClick={() => onShowAnnualizedChange(false)}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${!showAnnualized ? 'bg-green-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500'}`}
          >
            {t('performance.allTime')}
          </button>
          <button
            onClick={() => onShowAnnualizedChange(true)}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${showAnnualized ? 'bg-green-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500'}`}
          >
            {t('performance.annualized')}
          </button>
        </div>
        {/* Benchmark Toggle */}
        <div className="flex flex-col items-center">
          <span className="text-xs text-slate-500 dark:text-slate-400 mb-1">Benchmark:</span>
          <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-600 rounded-lg p-1">
            <button
              onClick={() => onBenchmarkChange('NASDAQ')}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${benchmark === 'NASDAQ' ? 'bg-green-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500'}`}
            >
              Nasdaq
            </button>
            <button
              onClick={() => onBenchmarkChange('SP500')}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${benchmark === 'SP500' ? 'bg-green-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500'}`}
            >
              S&P 500
            </button>
          </div>
        </div>
      </div>

      {/* Timeframe Selector and Stock Filter */}
      <div className="flex flex-wrap justify-center items-center gap-6 mb-4">
        {/* Timeframe */}
        <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-500">
          {TIMEFRAME_OPTIONS.map((option) => (
            <button
              key={option.key}
              onClick={() => handleTimeframeChange(option.key)}
              className={`px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium transition-colors ${
                selectedTimeframe === option.key
                  ? 'bg-slate-600 text-white dark:bg-slate-500'
                  : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'
              }`}
            >
              {language === 'fr' ? option.labelFr : option.labelEn}
            </button>
          ))}
        </div>

        {/* Stock Filter Dropdown */}
        {availableStocks.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setStockSelectorOpen(!stockSelectorOpen)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs md:text-sm font-medium rounded-lg border transition-colors ${
                selectedStocks.size < availableStocks.length
                  ? 'bg-green-100 dark:bg-green-900/30 border-green-400 text-green-700 dark:text-green-300'
                  : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-500 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600'
              }`}
            >
              <span>{language === 'fr' ? 'Actions' : 'Stocks'}</span>
              <span className="bg-slate-200 dark:bg-slate-600 px-1.5 py-0.5 rounded text-xs">
                {selectedStocks.size}/{availableStocks.length}
              </span>
              <svg className={`w-4 h-4 transition-transform ${stockSelectorOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown menu */}
            {stockSelectorOpen && (
              <>
                {/* Backdrop to close on click outside */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setStockSelectorOpen(false)}
                />
                <div className="absolute top-full mt-1 right-0 z-20 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg max-h-[400px] overflow-y-auto">
                  {/* Two-column layout: Owned | Sold */}
                  <div className="flex">
                    {/* Currently owned stocks - left column */}
                    {currentlyOwnedStocks.length > 0 && (
                      <div className="p-1 min-w-[140px]">
                        <div className="px-3 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                          {language === 'fr' ? 'Détenues' : 'Owned'}
                        </div>
                        <div className="flex gap-1 px-2 pb-1">
                          <button
                            onClick={selectAllOwned}
                            className="flex-1 px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
                          >
                            {language === 'fr' ? 'Tout' : 'All'}
                          </button>
                          <button
                            onClick={deselectAllOwned}
                            className="flex-1 px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
                          >
                            {language === 'fr' ? 'Aucun' : 'None'}
                          </button>
                        </div>
                        {currentlyOwnedStocks.map(ticker => (
                          <button
                            key={ticker}
                            onClick={() => toggleStock(ticker)}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors ${
                              selectedStocks.has(ticker)
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                              selectedStocks.has(ticker)
                                ? 'border-green-500 bg-green-500'
                                : 'border-slate-300 dark:border-slate-500'
                            }`}>
                              {selectedStocks.has(ticker) && (
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <span className="font-medium">{ticker}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Sold off stocks - right column */}
                    {soldOffStocks.length > 0 && (
                      <div className={`p-1 min-w-[140px] ${currentlyOwnedStocks.length > 0 ? 'border-l border-slate-200 dark:border-slate-600' : ''}`}>
                        <div className="px-3 py-1 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                          {language === 'fr' ? 'Vendues' : 'Sold'}
                        </div>
                        <div className="flex gap-1 px-2 pb-1">
                          <button
                            onClick={selectAllSold}
                            className="flex-1 px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
                          >
                            {language === 'fr' ? 'Tout' : 'All'}
                          </button>
                          <button
                            onClick={deselectAllSold}
                            className="flex-1 px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
                          >
                            {language === 'fr' ? 'Aucun' : 'None'}
                          </button>
                        </div>
                        {soldOffStocks.map(ticker => (
                          <button
                            key={ticker}
                            onClick={() => toggleStock(ticker)}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors ${
                              selectedStocks.has(ticker)
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                              selectedStocks.has(ticker)
                                ? 'border-green-500 bg-green-500'
                                : 'border-slate-300 dark:border-slate-500'
                            }`}>
                              {selectedStocks.has(ticker) && (
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <span className="font-medium">{ticker}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-12 h-12 text-green-500 animate-spin mb-4" />
          <p className="text-slate-400 text-lg">{language === 'fr' ? 'Chargement des données...' : 'Loading data...'}</p>
        </div>
      ) : performanceData?.data && performanceData.data.length > 0 ? (() => {
        const rawData = performanceData.data;

        // Check if we're filtering stocks
        // If all stocks selected OR no availableStocks, don't filter
        const isFilteringStocks = availableStocks.length > 0 && selectedStocks.size !== availableStocks.length;

        // Helper to get filtered values for a data point
        const getFilteredValues = (d: typeof rawData[0]) => {
          if (isFilteringStocks && d.stocks) {
            // If no stocks selected, return 0
            if (selectedStocks.size === 0) {
              return { portfolioValueEur: 0, costBasisEur: 0, benchmarkValueEur: 0 };
            }
            let portfolioValueEur = 0;
            let costBasisEur = 0;
            let benchmarkValueEur = 0;
            for (const ticker of selectedStocks) {
              if (d.stocks[ticker]) {
                portfolioValueEur += d.stocks[ticker].value_eur;
                costBasisEur += d.stocks[ticker].cost_basis_eur;
                benchmarkValueEur += d.stocks[ticker].benchmark_value_eur || 0;
              }
            }
            return { portfolioValueEur, costBasisEur, benchmarkValueEur };
          }
          return { portfolioValueEur: d.portfolio_value_eur, costBasisEur: d.cost_basis_eur, benchmarkValueEur: d.benchmark_value_eur };
        };

        // Filter out data points where selected stocks have zero invested capital
        // This ensures the chart starts from when the selected stocks were first purchased
        const allData = isFilteringStocks
          ? rawData.filter(d => getFilteredValues(d).costBasisEur > 0)
          : rawData;

        // If no data after filtering (no stocks selected or selected stocks have no data)
        if (allData.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-lg font-medium">
                {language === 'fr' ? 'Sélectionnez des actions pour voir la performance' : 'Select stocks to view performance'}
              </p>
              <p className="text-sm mt-1 opacity-70">
                {language === 'fr' ? `${availableStocks.length} actions disponibles` : `${availableStocks.length} stocks available`}
              </p>
            </div>
          );
        }

        const startIdx = brushRange?.startIndex ?? 0;
        const endIdx = brushRange?.endIndex ?? allData.length - 1;
        const selectedRangeData = allData.slice(startIdx, Math.min(endIdx + 1, allData.length));

        if (selectedRangeData.length === 0) {
          return <p className="text-slate-500 text-center py-8">{language === 'fr' ? 'Aucune donnee' : 'No data'}</p>;
        }

        const lastDataPoint = selectedRangeData[selectedRangeData.length - 1];
        const firstDataPoint = selectedRangeData[0];

        // Get filtered values for first and last data points
        const firstFiltered = getFilteredValues(firstDataPoint);
        const lastFiltered = getFilteredValues(lastDataPoint);

        const actualCostBasis = lastFiltered.costBasisEur || 1;
        const scaleFactor = getScaleFactor(actualCostBasis, privateMode);

        const startDate = firstDataPoint.date;
        const endDate = lastDataPoint.date;
        const startPortfolioValue = firstFiltered.portfolioValueEur;
        const startBenchmarkValue = firstFiltered.benchmarkValueEur;
        const startCostBasis = firstFiltered.costBasisEur;
        const endCostBasis = lastFiltered.costBasisEur;
        const endPortfolioValue = lastFiltered.portfolioValueEur;
        const endBenchmarkValue = lastFiltered.benchmarkValueEur;

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

        // Calculate full range gains using filtered values
        const fullRangeFirst = getFilteredValues(allData[0]);
        const fullRangeLast = getFilteredValues(allData[allData.length - 1]);
        const fullRangeNetGains = brushRange ? portfolioNetGains : (
          allData.length > 0 ? (
            (fullRangeLast.portfolioValueEur - fullRangeFirst.portfolioValueEur) -
            (fullRangeLast.costBasisEur - fullRangeFirst.costBasisEur)
          ) * scaleFactor : 0
        );

        // For benchmark, use per-stock benchmark values (summed in getFilteredValues)
        const fullRangeBenchmarkGains = brushRange ? benchmarkNetGains : (
          allData.length > 0 ? (
            (fullRangeLast.benchmarkValueEur - fullRangeFirst.benchmarkValueEur) -
            (fullRangeLast.costBasisEur - fullRangeFirst.costBasisEur)
          ) * scaleFactor : 0
        );

        // Recalculate returns for full range when filtering stocks
        const fullRangeReturn = fullRangeLast.costBasisEur > 0
          ? Math.round(((fullRangeLast.portfolioValueEur - fullRangeLast.costBasisEur) / fullRangeLast.costBasisEur) * 1000) / 10
          : 0;
        // Benchmark return using per-stock benchmark values
        const fullRangeBenchmarkReturn = fullRangeLast.costBasisEur > 0
          ? Math.round(((fullRangeLast.benchmarkValueEur - fullRangeLast.costBasisEur) / fullRangeLast.costBasisEur) * 1000) / 10
          : 0;

        // Calculate full range years and CAGR (recalculated when filtering stocks)
        const fullRangeStartDate = allData[0]?.date;
        const fullRangeEndDate = allData[allData.length - 1]?.date;
        const fullRangeDaysDiff = fullRangeStartDate && fullRangeEndDate
          ? (new Date(fullRangeEndDate).getTime() - new Date(fullRangeStartDate).getTime()) / (1000 * 60 * 60 * 24)
          : 0;
        const fullRangeYears = fullRangeDaysDiff / 365;
        const fullRangeShouldAnnualize = fullRangeYears > 0 && (fullRangeYears < 0.9 || fullRangeYears > 1.1);
        const fullRangeCagrPortfolio = fullRangeShouldAnnualize && fullRangeReturn !== 0
          ? Math.round((Math.pow(1 + fullRangeReturn / 100, 1 / fullRangeYears) - 1) * 1000) / 10
          : fullRangeReturn;
        const fullRangeCagrBenchmark = fullRangeShouldAnnualize && fullRangeBenchmarkReturn !== 0
          ? Math.round((Math.pow(1 + fullRangeBenchmarkReturn / 100, 1 / fullRangeYears) - 1) * 1000) / 10
          : fullRangeBenchmarkReturn;

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
          start_date: fullRangeStartDate,
          end_date: fullRangeEndDate,
          years: isFilteringStocks ? fullRangeYears : (performanceData.summary?.years ?? 0),
          portfolio_return_eur: isFilteringStocks ? fullRangeReturn : (performanceData.summary?.portfolio_return_eur ?? 0),
          benchmark_return_eur: isFilteringStocks ? fullRangeBenchmarkReturn : (performanceData.summary?.benchmark_return_eur ?? 0),
          cagr_eur: isFilteringStocks ? fullRangeCagrPortfolio : (performanceData.summary?.cagr_eur ?? 0),
          cagr_benchmark_eur: isFilteringStocks ? fullRangeCagrBenchmark : (performanceData.summary?.cagr_benchmark_eur ?? 0),
          portfolio_gains_eur: fullRangeNetGains,
          benchmark_gains_eur: fullRangeBenchmarkGains,
        };

        const chartData = allData.map(d => {
          const filtered = getFilteredValues(d);
          const scaledPortfolioValue = filtered.portfolioValueEur * scaleFactor;
          // Use per-stock benchmark values (already summed in getFilteredValues)
          const scaledBenchmarkValue = filtered.benchmarkValueEur * scaleFactor;
          const scaledCostBasis = filtered.costBasisEur * scaleFactor;
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

        // Calculate Y-axis domain and ticks based on yAxisRange
        const yAxisCalc = (() => {
          const increment = privateMode ? 50 : 10000;
          // Get values only from visible lines
          const values: number[] = [];
          chartData.forEach(d => {
            if (showPortfolio) values.push(d.portfolio_value_eur);
            if (showBenchmark) values.push(d.benchmark_value_eur);
            if (showInvestedCapital) values.push(d.cost_basis_eur);
          });
          if (values.length === 0) {
            values.push(...chartData.map(d => d.portfolio_value_eur));
          }

          const dataMin = Math.min(...values);
          const dataMax = Math.max(...values);
          // Always start from 0 if data is positive
          const fullMin = dataMin >= 0 ? 0 : Math.floor(dataMin / increment) * increment;
          const fullMax = Math.ceil(dataMax / increment) * increment;
          const fullRange = fullMax - fullMin;

          // Apply Y-axis range slider (inverted: start=bottom, end=top)
          const adjustedMin = fullMin + (fullRange * yAxisRange.start / 100);
          const adjustedMax = fullMin + (fullRange * yAxisRange.end / 100);

          const domainMin = Math.floor(adjustedMin / increment) * increment;
          const domainMax = Math.ceil(adjustedMax / increment) * increment;

          const ticks: number[] = [];
          // Generate ticks within the domain range
          // Start from 0 only if 0 is >= domainMin (i.e., within visible range)
          const tickStart = (dataMin >= 0 && domainMin <= 0) ? 0 : domainMin;
          for (let i = tickStart; i <= domainMax; i += increment) {
            if (i >= domainMin) {
              ticks.push(i);
            }
          }

          return {
            domain: [domainMin, domainMax] as [number, number],
            ticks,
          };
        })();

        const yAxisDomain = yAxisCalc.domain;
        const yAxisTicks = yAxisCalc.ticks;

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

        // Calculate weighted holding period - uses filtered cost basis when filtering stocks
        const calculateWeightedPeriod = () => {
          const endDate = new Date(allData[allData.length - 1].date);
          let weightedDays = 0;
          let totalCapital = 0;

          // Use filtered cost basis values
          for (let i = 0; i < allData.length; i++) {
            const currentFiltered = getFilteredValues(allData[i]);
            const prevFiltered = i > 0 ? getFilteredValues(allData[i - 1]) : { costBasisEur: 0 };
            const capitalAdded = currentFiltered.costBasisEur - prevFiltered.costBasisEur;

            if (capitalAdded > 0) {
              const investDate = new Date(allData[i].date);
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
            <style>{`.recharts-brush-texts { display: none !important; }`}</style>
            <div ref={chartContainerRef} className="bg-slate-100 dark:bg-slate-700 rounded-xl p-4">
              {/* Title only visible during download */}
              {isDownloading && (
                <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100 text-center mb-4">
                  {language === 'fr' ? 'Performance du Portefeuille' : 'Portfolio Performance'}
                </h4>
              )}
              {/* Private mode indicator */}
              {privateMode && (
                <div className="flex items-center justify-center gap-2 mb-3">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-600 px-3 py-1.5 rounded-lg">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                    {language === 'fr' ? `Mode privé (base: ${currency === 'EUR' ? `${PRIVATE_COST_BASIS}€` : `$${PRIVATE_COST_BASIS}`})` : `Private mode (base: ${currency === 'EUR' ? `${PRIVATE_COST_BASIS}€` : `$${PRIVATE_COST_BASIS}`})`}
                  </span>
                </div>
              )}

              {filteredSummary && (
                <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6 auto-rows-fr">
                  {/* Combined Holding Periods - stacked vertically */}
                  <div className="bg-slate-200 dark:bg-slate-600 rounded-lg p-2 md:p-4 text-center relative group flex flex-col justify-center">
                    <div className="flex flex-col gap-2">
                      <div>
                        <p className="text-slate-700 dark:text-white text-sm md:text-base font-bold mb-0.5">{language === 'fr' ? 'Période de détention totale' : 'Total Holding Period'}</p>
                        <span className="text-xs md:text-sm text-slate-600 dark:text-slate-300">
                          {formatHoldingPeriod(allData[0].date, allData[allData.length - 1].date)}
                        </span>
                      </div>
                      <div className="border-t border-slate-300 dark:border-slate-500 pt-2">
                        <p className="text-slate-700 dark:text-white text-sm md:text-base font-bold mb-0.5 flex items-center justify-center gap-1">
                          {language === 'fr' ? 'Période de détention pondérée' : 'Weighted Holding Period'}
                          <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                        </p>
                        <span className="text-xs md:text-sm text-slate-600 dark:text-slate-300">
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
                      {filteredSummary.portfolio_gains_eur >= 0 ? '+' : ''}{currency === 'EUR' ? `${formatEur(filteredSummary.portfolio_gains_eur)}€` : `$${formatEur(filteredSummary.portfolio_gains_eur)}`} ({showAnnualized
                        ? `${filteredSummary.cagr_eur >= 0 ? '+' : ''}${filteredSummary.cagr_eur}%`
                        : `${filteredSummary.portfolio_return_eur >= 0 ? '+' : ''}${filteredSummary.portfolio_return_eur}%`
                      })
                    </span>
                  </div>
                  {/* Benchmark */}
                  <div className="bg-slate-200 dark:bg-slate-600 rounded-lg p-2 md:p-4 text-center flex flex-col justify-center">
                    <p className="text-slate-600 dark:text-slate-200 text-sm md:text-base font-semibold">Benchmark ({benchmark === 'NASDAQ' ? 'Nasdaq' : 'S&P 500'})</p>
                    <span className={`font-bold text-base md:text-xl ${(showAnnualized ? filteredSummary.cagr_benchmark_eur : filteredSummary.benchmark_return_eur) >= 0 ? 'text-blue-400' : 'text-red-500'}`}>
                      {filteredSummary.benchmark_gains_eur >= 0 ? '+' : ''}{currency === 'EUR' ? `${formatEur(filteredSummary.benchmark_gains_eur)}€` : `$${formatEur(filteredSummary.benchmark_gains_eur)}`} ({showAnnualized
                        ? `${filteredSummary.cagr_benchmark_eur >= 0 ? '+' : ''}${filteredSummary.cagr_benchmark_eur}%`
                        : `${filteredSummary.benchmark_return_eur >= 0 ? '+' : ''}${filteredSummary.benchmark_return_eur}%`
                      })
                    </span>
                  </div>
                </div>
              )}

              {/* Chart with Y-axis slider on the left */}
              <div className="flex">
                {/* Vertical Y-axis zoom slider - aligned with chart Y-axis */}
                {!isDownloading && (
                  <div className="flex flex-col items-center mr-1" style={{ height: '380px', paddingTop: '10px', paddingBottom: '70px' }}>
                    <div className="relative h-full w-10 flex flex-col items-center">
                      {/* Track background - vertical */}
                      <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[40px] bg-slate-800 dark:bg-slate-900 rounded-lg border border-slate-600">
                        {/* Selected range indicator */}
                        <div
                          className="absolute left-0 right-0 bg-green-600/30"
                          style={{
                            top: `${100 - yAxisRange.end}%`,
                            height: `${yAxisRange.end - yAxisRange.start}%`,
                          }}
                        />
                        {/* Top traveller */}
                        <div
                          className="absolute left-0 right-0 h-3 bg-green-600 cursor-ns-resize flex items-center justify-center"
                          style={{ top: `${100 - yAxisRange.end}%`, transform: 'translateY(-50%)' }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const startY = e.clientY;
                            const startEnd = yAxisRange.end;
                            const container = e.currentTarget.parentElement;
                            if (!container) return;
                            const containerHeight = container.clientHeight;

                            const onMouseMove = (moveEvent: MouseEvent) => {
                              const deltaY = moveEvent.clientY - startY;
                              const deltaPercent = (deltaY / containerHeight) * 100;
                              const newEnd = Math.max(yAxisRange.start + 10, Math.min(100, startEnd - deltaPercent));
                              setYAxisRange(prev => ({ ...prev, end: newEnd }));
                            };

                            const onMouseUp = () => {
                              document.removeEventListener('mousemove', onMouseMove);
                              document.removeEventListener('mouseup', onMouseUp);
                            };

                            document.addEventListener('mousemove', onMouseMove);
                            document.addEventListener('mouseup', onMouseUp);
                          }}
                        >
                          <div className="w-4 h-0.5 bg-white/70 rounded"></div>
                        </div>
                        {/* Bottom traveller - uses top positioning (100 - start) */}
                        <div
                          className="absolute left-0 right-0 h-3 bg-green-600 cursor-ns-resize flex items-center justify-center"
                          style={{ top: `${100 - yAxisRange.start}%`, transform: 'translateY(-50%)' }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const startY = e.clientY;
                            const startStart = yAxisRange.start;
                            const container = e.currentTarget.parentElement;
                            if (!container) return;
                            const containerHeight = container.clientHeight;

                            const onMouseMove = (moveEvent: MouseEvent) => {
                              const deltaY = moveEvent.clientY - startY;
                              // Moving down = decreasing start (inverted because of top positioning)
                              const deltaPercent = (deltaY / containerHeight) * 100;
                              const newStart = Math.max(0, Math.min(yAxisRange.end - 10, startStart - deltaPercent));
                              setYAxisRange(prev => ({ ...prev, start: newStart }));
                            };

                            const onMouseUp = () => {
                              document.removeEventListener('mousemove', onMouseMove);
                              document.removeEventListener('mouseup', onMouseUp);
                            };

                            document.addEventListener('mousemove', onMouseMove);
                            document.addEventListener('mouseup', onMouseUp);
                          }}
                        >
                          <div className="w-4 h-0.5 bg-white/70 rounded"></div>
                        </div>
                      </div>
                    </div>
                    {/* Reset button below slider */}
                    {(yAxisRange.start !== 0 || yAxisRange.end !== 100) && (
                      <button
                        onClick={() => setYAxisRange({ start: 0, end: 100 })}
                        className="mt-1 text-[10px] text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded hover:bg-slate-600 transition-colors"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                )}

                {/* Main chart */}
                <div className="flex-1 h-[380px] md:h-[480px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 10, right: 50, left: 20, bottom: 70 }}
                    style={{ cursor: 'pointer' }}
                    onClick={(e: unknown) => {
                      const event = e as { activeLabel?: string; activeIndex?: string | number; activeTooltipIndex?: string | number; activeCoordinate?: { x: number; y: number } };
                      // Parse index as number (Recharts returns it as string sometimes)
                      const rawIndex = event?.activeTooltipIndex ?? event?.activeIndex;
                      const index = typeof rawIndex === 'string' ? parseInt(rawIndex, 10) : rawIndex;
                      const label = event?.activeLabel;
                      const coord = event?.activeCoordinate;

                      if (label && typeof index === 'number' && !isNaN(index) && index >= 0 && index < chartData.length) {
                        const clickedData = chartData[index];
                        if (clickedData) {
                          if (pinnedTooltipData && pinnedTooltipData.label === label) {
                            setPinnedTooltipData(null);
                            setShowStockBreakdown(false);
                          } else {
                            setPinnedTooltipData({ data: clickedData, label: label, x: coord?.x ?? 100, y: coord?.y ?? 50, dataIndex: index });
                          }
                        }
                      }
                    }}
                  >
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
                      tick={(props) => {
                        const { x, y, payload } = props;
                        const d = new Date(payload.value);

                        // Calculate visible range in days to determine label detail level
                        const startIdx = brushRange?.startIndex ?? 0;
                        const endIdx = brushRange?.endIndex ?? chartData.length - 1;
                        const startDate = new Date(chartData[startIdx]?.date);
                        const endDate = new Date(chartData[endIdx]?.date);
                        const rangeDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

                        // Determine label format based on zoom level
                        let line1: string;
                        let line2: string;

                        if (rangeDays <= 60) {
                          // Zoomed in: show "Jan 15" format with day
                          line1 = d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric' });
                          line2 = d.getFullYear().toString();
                        } else if (rangeDays <= 180) {
                          // Medium zoom: show "Jan 15" format
                          const month = d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' });
                          const day = d.getDate();
                          line1 = `${month} ${day}`;
                          line2 = d.getFullYear().toString();
                        } else if (rangeDays <= 540) {
                          // ~1.5 year view: show short month
                          const month = d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' });
                          line1 = month.charAt(0).toUpperCase() + month.slice(1);
                          line2 = d.getFullYear().toString();
                        } else {
                          // Wide view: just month and year
                          const month = d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long' });
                          line1 = month.charAt(0).toUpperCase() + month.slice(1);
                          line2 = d.getFullYear().toString();
                        }

                        return (
                          <g transform={`translate(${x},${y})`}>
                            <text x={0} y={0} dy={14} textAnchor="middle" fill={colors.tickFill} fontSize={14} fontWeight="600">
                              {line1}
                            </text>
                            <text x={0} y={0} dy={30} textAnchor="middle" fill={colors.tickFill} fontSize={13} fontWeight="600">
                              {line2}
                            </text>
                          </g>
                        );
                      }}
                      stroke={colors.axisStroke}
                      height={55}
                      interval={0}
                      ticks={(() => {
                        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
                        const maxTicks = isMobile ? 6 : 11;

                        // Generate ticks within the visible range only
                        const startIdx = brushRange?.startIndex ?? 0;
                        const endIdx = brushRange?.endIndex ?? chartData.length - 1;
                        const rangeLength = endIdx - startIdx + 1;

                        // If range is small enough, show all dates
                        if (rangeLength <= maxTicks) {
                          return chartData.slice(startIdx, endIdx + 1).map(d => d.date);
                        }

                        // Distribute ticks proportionally for truly even spacing
                        // Each tick i (0 to maxTicks-1) is placed at: startIdx + (endIdx - startIdx) * i / (maxTicks - 1)
                        const ticks: string[] = [];
                        for (let i = 0; i < maxTicks; i++) {
                          const tickIdx = startIdx + Math.round((endIdx - startIdx) * i / (maxTicks - 1));
                          ticks.push(chartData[tickIdx].date);
                        }

                        return ticks;
                      })()}
                    />
                    <YAxis
                      tick={{ fontSize: 15, fill: colors.tickFill, fontWeight: 600 }}
                      stroke={colors.axisStroke}
                      tickFormatter={(val) => {
                        const sym = currency === 'EUR' ? '€' : '$';
                        // For private mode with small values, don't use k format
                        if (privateMode) {
                          return currency === 'EUR' ? `${formatEur(val)}${sym}` : `${sym}${formatEur(val)}`;
                        }
                        return currency === 'EUR' ? `${formatEur(val / 1000)}k${sym}` : `${sym}${formatEur(val / 1000)}k`;
                      }}
                      domain={yAxisDomain}
                      allowDataOverflow={true}
                      allowDecimals={false}
                      ticks={yAxisTicks}
                    />
                    <Tooltip
                      wrapperStyle={{ zIndex: 100, pointerEvents: 'auto' }}
                      allowEscapeViewBox={{ x: false, y: true }}
                      offset={10}
                      content={({ active, payload, label }) => {
                        // Don't show hover tooltip if we have a pinned one
                        if (pinnedTooltipData) return null;
                        if (!active || !payload || payload.length === 0) return null;

                        const data = (payload[0] as { payload?: typeof chartData[0] })?.payload;
                        if (!data) return null;

                        // Find the index of this data point in chartData
                        const dataIndex = chartData.findIndex(d => d.date === data.date);

                        // Pin is handled by chart onClick, not tooltip click
                        return renderTooltipContent(
                          data as Parameters<typeof renderTooltipContent>[0],
                          label as string,
                          false,
                          () => {}, // no-op, chart click handles pinning
                          () => {},
                          dataIndex >= 0 ? dataIndex : undefined,
                          chartData
                        );
                      }}
                    />
                    {!isDownloading && (
                      <Brush
                        dataKey="date"
                        height={40}
                        stroke="#16a34a"
                        fill={colors.brushFill}
                        travellerWidth={12}
                        tickFormatter={() => ''}
                        startIndex={brushRange?.startIndex}
                        endIndex={brushRange?.endIndex}
                        onChange={handleBrushChange}
                      />
                    )}
                    {/* Only show out/underperformance areas when both portfolio and benchmark are visible */}
                    {showPortfolio && showBenchmark && (
                      <>
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
                      </>
                    )}
                    {showPortfolio && (
                      <Line
                        type="monotone"
                        dataKey="portfolio_value_eur"
                        name="Portfolio (EUR)"
                        stroke="#16a34a"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    )}
                    {showBenchmark && (
                      <Line
                        type="monotone"
                        dataKey="benchmark_value_eur"
                        name={`${benchmark} (EUR)`}
                        stroke="#60a5fa"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                      />
                    )}
                    {showInvestedCapital && (
                      <Line
                        type="stepAfter"
                        dataKey="cost_basis_eur"
                        name="Amount Invested (EUR)"
                        stroke="#94a3b8"
                        strokeWidth={2}
                        dot={false}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
                {/* Pinned tooltip overlay */}
                {pinnedTooltipData && (
                  <div
                    style={{
                      position: 'absolute',
                      top: `${pinnedTooltipData.y}px`,
                      left: `${pinnedTooltipData.x + 15}px`,
                      zIndex: 1000,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {renderTooltipContent(
                      pinnedTooltipData.data as Parameters<typeof renderTooltipContent>[0],
                      pinnedTooltipData.label,
                      true,
                      () => {
                        setPinnedTooltipData(null);
                        setShowStockBreakdown(false);
                      },
                      () => {
                        setPinnedTooltipData(null);
                        setShowStockBreakdown(false);
                      },
                      pinnedTooltipData.dataIndex,
                      chartData
                    )}
                  </div>
                )}
              </div>
              </div>
              {/* Custom brush date labels - show selected range */}
              {!isDownloading && (() => {
                const startIdx = brushRange?.startIndex ?? 0;
                const endIdx = brushRange?.endIndex ?? chartData.length - 1;
                const maxIdx = chartData.length - 1;
                const isXZoomed = brushRange !== null && (startIdx !== 0 || endIdx !== maxIdx);

                // Calculate dynamic offset - max 8% when at start, reduces to 0 as handle moves right
                const leftOffsetPct = maxIdx > 0 ? ((maxIdx - startIdx) / maxIdx) * 8 : 0;

                const startPct = (startIdx / maxIdx) * 100;
                const endPct = (endIdx / maxIdx) * 100;
                const startDate = new Date(chartData[startIdx]?.date);
                const endDate = new Date(chartData[endIdx]?.date);
                const startMonth = startDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long' });
                const endMonth = endDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long' });
                return (
                  <div className="relative h-12 -mt-14 mx-[44px]">
                    <div
                      className="absolute text-center text-green-500 font-semibold text-sm -translate-x-1/2"
                      style={{ left: `${startPct + leftOffsetPct}%` }}
                    >
                      <div>{startMonth.charAt(0).toUpperCase() + startMonth.slice(1)}</div>
                      <div>{startDate.getFullYear()}</div>
                    </div>
                    <div
                      className="absolute text-center text-green-500 font-semibold text-sm -translate-x-1/2"
                      style={{ left: `${endPct}%` }}
                    >
                      <div>{endMonth.charAt(0).toUpperCase() + endMonth.slice(1)}</div>
                      <div>{endDate.getFullYear()}</div>
                    </div>
                    {/* Reset X-axis zoom button - positioned to the left */}
                    {isXZoomed && (
                      <button
                        onClick={() => {
                          lastBrushRangeRef.current = null;
                          setBrushRange(null);
                          setSelectedTimeframe('all');
                        }}
                        className="absolute left-5 -top-4 text-[10px] text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded hover:bg-slate-600 transition-colors"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                );
              })()}
              {/* Interactive Legend - click to toggle visibility */}
              <div className="flex justify-center gap-4 text-sm flex-wrap mt-3">
                {/* Portfolio toggle */}
                <button
                  onClick={() => {
                    ignoreUntilRef.current = Date.now() + 1000;
                    setShowPortfolio(!showPortfolio);
                  }}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all ${
                    showPortfolio
                      ? 'bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50'
                      : 'bg-green-100/50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 opacity-60'
                  }`}
                >
                  {showPortfolio ? <Eye className="w-3.5 h-3.5 text-green-600" /> : <EyeOff className="w-3.5 h-3.5 text-green-600/60" />}
                  <div className="w-4 h-0.5 bg-green-600" style={{ opacity: showPortfolio ? 1 : 0.5 }}></div>
                  <span className={`text-green-700 dark:text-green-300 ${!showPortfolio && 'opacity-60'}`}>
                    {t('performance.portfolio')}
                  </span>
                </button>
                {/* Benchmark toggle */}
                <button
                  onClick={() => {
                    ignoreUntilRef.current = Date.now() + 1000;
                    setShowBenchmark(!showBenchmark);
                  }}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all ${
                    showBenchmark
                      ? 'bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50'
                      : 'bg-blue-100/50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 opacity-60'
                  }`}
                >
                  {showBenchmark ? <Eye className="w-3.5 h-3.5 text-blue-500" /> : <EyeOff className="w-3.5 h-3.5 text-blue-500/60" />}
                  <div className="w-4 h-0.5 bg-[#60a5fa]" style={{ borderStyle: 'dashed', borderWidth: '1px', borderColor: '#60a5fa', height: 0, opacity: showBenchmark ? 1 : 0.5 }}></div>
                  <span className={`text-blue-600 dark:text-blue-300 ${!showBenchmark && 'opacity-60'}`}>
                    {language === 'fr' ? 'Indice' : 'Benchmark'} ({benchmark === 'NASDAQ' ? (currency === 'EUR' ? 'EQQQ' : 'QQQ') : (currency === 'EUR' ? 'CSPX' : 'SPY')})
                  </span>
                </button>
                {/* Invested Capital toggle */}
                <button
                  onClick={() => {
                    ignoreUntilRef.current = Date.now() + 1000;
                    setShowInvestedCapital(!showInvestedCapital);
                  }}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all ${
                    showInvestedCapital
                      ? 'bg-slate-200 dark:bg-slate-500/30 hover:bg-slate-300 dark:hover:bg-slate-500/50'
                      : 'bg-slate-200/50 dark:bg-slate-500/20 hover:bg-slate-200 dark:hover:bg-slate-500/30 opacity-60'
                  }`}
                >
                  {showInvestedCapital ? <Eye className="w-3.5 h-3.5 text-slate-500" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500/60" />}
                  <div className="w-4 h-0.5 bg-slate-400" style={{ opacity: showInvestedCapital ? 1 : 0.5 }}></div>
                  <span className={`text-slate-600 dark:text-slate-300 ${!showInvestedCapital && 'opacity-60'}`}>
                    {t('performance.invested')}
                  </span>
                </button>
                {/* Outperformance indicator */}
                <div className={`flex items-center gap-1.5 px-2 py-1 ${!(showPortfolio && showBenchmark) && 'opacity-40'}`}>
                  <div className="w-3 h-3 bg-green-400/50 border border-green-400"></div>
                  <span className="text-slate-600 dark:text-slate-300">{language === 'fr' ? 'Surperf.' : 'Outperf.'}</span>
                </div>
                {/* Underperformance indicator */}
                <div className={`flex items-center gap-1.5 px-2 py-1 ${!(showPortfolio && showBenchmark) && 'opacity-40'}`}>
                  <div className="w-3 h-3 bg-red-500/30 border border-red-500"></div>
                  <span className="text-slate-600 dark:text-slate-300">{language === 'fr' ? 'Sous-perf.' : 'Underperf.'}</span>
                </div>
                {/* Click hint */}
                {!pinnedTooltipData && (
                  <div className="flex items-center gap-1 px-2 py-1 text-slate-500 dark:text-slate-400 text-xs italic">
                    <span>{language === 'fr' ? '💡 Cliquez sur le graphique pour épingler' : '💡 Click on graph to pin tooltip'}</span>
                  </div>
                )}
              </div>

              {/* LUMNA branding - hidden during download since addLumnaBranding adds it */}
              {!isDownloading && (
                <div className="flex items-center justify-end gap-2 mt-2 mr-2">
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
          </>
        );
      })() : (
        <p className="text-slate-500 text-center py-8">
          {performanceData?.error || 'No performance data available.'}
        </p>
      )}
    </>
  );

  if (hideTitle) {
    return content;
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4 md:p-6">
      {content}
    </div>
  );
});
