// Stocks Comparison Panel - Compare two stocks side by side

import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Search, X, Loader2, TrendingUp, Eye, Maximize2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useAuth } from '../../../contexts/AuthContext';
import { findStockByTicker, searchAllStocks, type Stock } from '../utils/allStocks';
import { getCompanyLogoUrl } from '../utils/companyLogos';
import { getRecentStocks, removeRecentStock, addRecentStock } from '../utils/recentStocks';
// Comparison modal is built inline below

type DataViewType = 'quarterly' | 'annual';

interface FinancialsData {
  ticker: string;
  company_name: string;
  metric: string;
  metric_label: string;
  currency: string;
  data: { date: string; quarter: string; value: number; type: string }[];
  growth_rates: { '1Y': number | null; '2Y': number | null; '5Y': number | null; '10Y': number | null };
}

interface MarketCapData {
  ticker: string;
  name: string;
  market_cap: number | null;
  currency: string;
  trailing_pe: number | null;
  forward_pe: number | null;
  dividend_yield: number | null;
  beta: number | null;
  price_to_book: number | null;
  trailing_eps: number | null;
  profit_margin: number | null;
  return_on_equity: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  revenue_growth: number | null;
}

const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', CHF: 'CHF ' };
const getCurrencySymbol = (currency: string): string => CURRENCY_SYMBOLS[currency] || `${currency} `;

const formatValue = (value: number, currency: string): string => {
  const symbol = getCurrencySymbol(currency);
  const absValue = Math.abs(value);
  if (absValue >= 1e12) return `${symbol}${(value / 1e12).toFixed(1)}T`;
  if (absValue >= 1e9) return `${symbol}${(value / 1e9).toFixed(0)}B`;
  if (absValue >= 1e6) return `${symbol}${(value / 1e6).toFixed(0)}M`;
  return `${symbol}${value.toFixed(0)}`;
};

const formatMarketCap = (marketCap: number | null, currency: string = 'USD'): string => {
  if (!marketCap) return '-';
  return formatValue(marketCap, currency);
};

const fetchFinancialsHistory = async (ticker: string, metric: string): Promise<FinancialsData> => {
  const response = await axios.get(`/api/investing/financials-history/${ticker}?metric=${metric}`);
  return response.data;
};

const fetchMarketCap = async (ticker: string): Promise<MarketCapData> => {
  const response = await axios.get(`/api/investing/market-cap?tickers=${ticker}`);
  return response.data.stocks[ticker];
};

// Stock Search Component
function StockSelector({
  selectedTicker,
  onSelect,
  label,
  otherTicker,
  position,
  onSwap
}: {
  selectedTicker: string | null;
  onSelect: (ticker: string) => void;
  label: string;
  otherTicker: string | null;
  position: 'left' | 'right';
  onSwap: () => void;
}) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [recentStocks, setRecentStocks] = useState<string[]>(() => getRecentStocks(user?.id));
  const [isDragOver, setIsDragOver] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const results = query.length >= 1 ? searchAllStocks(query).filter((s: Stock) => s.ticker !== otherTicker).slice(0, 8) : [];
  const selectedStock = selectedTicker ? findStockByTicker(selectedTicker) : null;
  const logoUrl = selectedTicker ? getCompanyLogoUrl(selectedTicker) : null;

  // For drag preview - show the other stock (what will be here after swap)
  const otherStock = otherTicker ? findStockByTicker(otherTicker) : null;
  const otherLogoUrl = otherTicker ? getCompanyLogoUrl(otherTicker) : null;

  // Filter recent stocks to exclude the other selector's stock
  const filteredRecentStocks = recentStocks.filter(t => t !== otherTicker);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectStock = (ticker: string) => {
    addRecentStock(ticker, user?.id);
    onSelect(ticker);
    setQuery('');
    setIsOpen(false);
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', position);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const fromPosition = e.dataTransfer.getData('text/plain');
    if (fromPosition !== position) {
      onSwap();
    }
  };

  // Determine what to display - show preview of other stock when dragging over
  const displayTicker = isDragOver && otherTicker ? otherTicker : selectedTicker;
  const displayStock = isDragOver && otherTicker ? otherStock : selectedStock;
  const displayLogo = isDragOver && otherTicker ? otherLogoUrl : logoUrl;

  return (
    <div className="flex-1">
      <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">{label}</label>
      {selectedTicker ? (
        <div
          draggable
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border-2 cursor-grab active:cursor-grabbing transition-all ${
            isDragOver ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20' : 'border-green-500'
          }`}
        >
          <Link to={`/investing/stock/${displayTicker}`} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-600 flex items-center justify-center overflow-hidden">
              {displayLogo ? (
                <img src={displayLogo} alt={displayTicker || ''} className="w-8 h-8 object-contain" />
              ) : (
                <span className="text-xs font-bold text-slate-400">{displayTicker?.slice(0, 2)}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{displayStock?.name || displayTicker}</p>
              <p className="text-sm text-slate-500">{displayTicker}</p>
            </div>
          </Link>
          <button
            onClick={() => onSelect('')}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-600 rounded"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      ) : (
        <div className="relative" ref={dropdownRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
              onFocus={() => { setRecentStocks(getRecentStocks(user?.id)); setIsOpen(true); }}
              placeholder={language === 'fr' ? 'Rechercher...' : 'Search stocks...'}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          {isOpen && ((query.length === 0 && filteredRecentStocks.length > 0) || (query.length > 0 && results.length > 0)) && (
            <div className="absolute z-10 w-full mt-1 bg-white rounded-lg shadow-lg border border-slate-300 max-h-60 overflow-y-auto">
              {/* Recent stocks when search is empty */}
              {query.length === 0 && filteredRecentStocks.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      {language === 'fr' ? 'Recherches récentes' : 'Recently searched'}
                    </span>
                  </div>
                  {filteredRecentStocks.map((ticker) => {
                    const stock = findStockByTicker(ticker);
                    const displayName = stock?.name || ticker;
                    const recentLogoUrl = getCompanyLogoUrl(ticker);
                    return (
                      <div
                        key={ticker}
                        onClick={() => handleSelectStock(ticker)}
                        className="w-full px-4 py-2 text-left flex items-center gap-3 border-b border-slate-100 last:border-b-0 hover:bg-green-50 cursor-pointer group"
                      >
                        <div className="w-6 h-6 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                          {recentLogoUrl ? (
                            <img src={recentLogoUrl} alt="" className="w-6 h-6 object-contain" />
                          ) : (
                            <span className="text-[10px] font-bold text-slate-500">{ticker.slice(0, 2)}</span>
                          )}
                        </div>
                        <span className="font-bold text-slate-800 w-16">{ticker}</span>
                        <span className="text-slate-600 text-sm truncate flex-1">{displayName}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRecentStock(ticker, user?.id);
                            setRecentStocks(getRecentStocks(user?.id));
                          }}
                          className="p-1 rounded hover:bg-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
                          title={language === 'fr' ? 'Supprimer' : 'Remove'}
                        >
                          <X className="w-3.5 h-3.5 text-slate-400" />
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
              {/* Search results */}
              {query.length > 0 && results.map((stock: Stock) => {
                const searchLogoUrl = getCompanyLogoUrl(stock.ticker);
                return (
                  <button
                    key={stock.ticker}
                    onClick={() => handleSelectStock(stock.ticker)}
                    className="w-full px-4 py-2 text-left hover:bg-green-50 flex items-center gap-3 border-b border-slate-100 last:border-b-0"
                  >
                    <div className="w-6 h-6 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                      {searchLogoUrl ? (
                        <img src={searchLogoUrl} alt="" className="w-6 h-6 object-contain" />
                      ) : (
                        <span className="text-[10px] font-bold text-slate-500">{stock.ticker.slice(0, 2)}</span>
                      )}
                    </div>
                    <span className="font-bold text-slate-800 w-16">{stock.ticker}</span>
                    <span className="text-slate-600 text-sm truncate">{stock.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Comparison Chart Component
function ComparisonChart({
  ticker1,
  ticker2,
  metric,
  title,
  dataView,
  onChartClick
}: {
  ticker1: string;
  ticker2: string;
  metric: string;
  title: string;
  dataView: DataViewType;
  onChartClick: () => void;
}) {
  const { language } = useLanguage();

  const { data: data1, isLoading: loading1 } = useQuery({
    queryKey: ['financialsHistory', ticker1, metric],
    queryFn: () => fetchFinancialsHistory(ticker1, metric),
    enabled: !!ticker1,
    staleTime: 1000 * 60 * 15,
  });

  const { data: data2, isLoading: loading2 } = useQuery({
    queryKey: ['financialsHistory', ticker2, metric],
    queryFn: () => fetchFinancialsHistory(ticker2, metric),
    enabled: !!ticker2,
    staleTime: 1000 * 60 * 15,
  });

  const isLoading = loading1 || loading2;
  const currency = data1?.currency || data2?.currency || 'USD';

  // Merge data by quarter or year based on dataView
  const mergedData = (() => {
    if (!data1?.data && !data2?.data) return [];

    const dataMap = new Map<string, { quarter: string; value1?: number; value2?: number }>();
    const now = new Date();

    // Helper to get filtered data for a stock
    const getFilteredData = (data: FinancialsData['data'] | undefined) => {
      if (!data) return [];

      if (dataView === 'quarterly') {
        const cutoff = new Date(now.getFullYear() - 3, now.getMonth(), 1);
        return data.filter(d => new Date(d.date) >= cutoff && d.type === 'quarterly');
      }

      // Annual data
      const annualCutoff = new Date(now.getFullYear() - 10, 0, 1);
      return data.filter(d => new Date(d.date) >= annualCutoff && d.type === 'annual');
    };

    const filtered1 = getFilteredData(data1?.data);
    const filtered2 = getFilteredData(data2?.data);

    filtered1.forEach(d => {
      dataMap.set(d.quarter, { quarter: d.quarter, value1: d.value });
    });

    filtered2.forEach(d => {
      const existing = dataMap.get(d.quarter);
      if (existing) {
        existing.value2 = d.value;
      } else {
        dataMap.set(d.quarter, { quarter: d.quarter, value2: d.value });
      }
    });

    return Array.from(dataMap.values())
      .sort((a, b) => {
        // Parse quarter format like "Q1 2025" or "FY 2024" to sort chronologically
        const parseQuarter = (q: string) => {
          const fyMatch = q.match(/FY\s*(\d{4})/);
          if (fyMatch) return new Date(parseInt(fyMatch[1]), 11, 31).getTime(); // End of year
          const qMatch = q.match(/Q(\d)\s*(\d{4})/);
          if (qMatch) return new Date(parseInt(qMatch[2]), (parseInt(qMatch[1]) - 1) * 3 + 2, 28).getTime();
          return 0;
        };
        return parseQuarter(a.quarter) - parseQuarter(b.quarter);
      })
      .slice(-12);
  })();

  const getGrowthColor = (value: number | null) => {
    if (value === null) return 'text-slate-400';
    return value >= 0 ? 'text-green-500' : 'text-red-500';
  };

  const formatGrowth = (value: number | null) => {
    if (value === null) return '-';
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  // Calculate CAGR for specific years using annual data
  const calculateCAGRForYears = (data: FinancialsData['data'] | undefined, years: number) => {
    if (!data) return null;
    const annualData = data.filter(d => d.type === 'annual').sort((a, b) => a.date.localeCompare(b.date));
    if (annualData.length < 2) return null;
    const endIdx = annualData.length - 1;
    const startIdx = Math.max(0, endIdx - years);
    if (startIdx === endIdx) return null;
    const startValue = annualData[startIdx]?.value;
    const endValue = annualData[endIdx]?.value;
    if (!startValue || startValue <= 0 || !endValue || endValue <= 0) return null;
    const actualYears = endIdx - startIdx;
    if (actualYears < 1) return null;
    return (Math.pow(endValue / startValue, 1 / actualYears) - 1) * 100;
  };

  const cagr1Y_1 = calculateCAGRForYears(data1?.data, 1);
  const cagr5Y_1 = calculateCAGRForYears(data1?.data, 5);
  const cagr1Y_2 = calculateCAGRForYears(data2?.data, 1);
  const cagr5Y_2 = calculateCAGRForYears(data2?.data, 5);

  return (
    <button
      onClick={onChartClick}
      className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors cursor-pointer text-left w-full"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
        <Maximize2 className="w-4 h-4 text-slate-400" />
      </div>

      {isLoading ? (
        <div className="h-[200px] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : mergedData.length === 0 ? (
        <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm">
          {language === 'fr' ? 'Pas de données' : 'No data available'}
        </div>
      ) : (
        <>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mergedData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
                <XAxis
                  dataKey="quarter"
                  tick={{ fontSize: 9, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => formatValue(val, currency)}
                  width={50}
                />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{ backgroundColor: '#1e293b', borderRadius: '6px', border: 'none', padding: '8px', fontSize: '11px' }}
                  formatter={(value, name) => [formatValue(Number(value), currency), name === 'value1' ? ticker1 : ticker2]}
                />
                <Legend
                  formatter={(value) => <span style={{ marginRight: '48px' }}>{value === 'value1' ? ticker1 : ticker2}</span>}
                  wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                  iconSize={10}
                />
                <Bar dataKey="value1" fill="#f97316" name="value1" radius={[2, 2, 0, 0]} />
                <Bar dataKey="value2" fill="#3b82f6" name="value2" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Growth rates comparison - CAGR */}
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-orange-500 font-medium mb-1">{ticker1}</p>
                <div className="flex gap-3">
                  <span className={getGrowthColor(cagr1Y_1)}>1Y: {formatGrowth(cagr1Y_1)}</span>
                  <span className={getGrowthColor(cagr5Y_1)}>5Y: {formatGrowth(cagr5Y_1)}</span>
                </div>
              </div>
              <div>
                <p className="text-blue-500 font-medium mb-1">{ticker2}</p>
                <div className="flex gap-3">
                  <span className={getGrowthColor(cagr1Y_2)}>1Y: {formatGrowth(cagr1Y_2)}</span>
                  <span className={getGrowthColor(cagr5Y_2)}>5Y: {formatGrowth(cagr5Y_2)}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </button>
  );
}

// Key Metrics Comparison
function MetricsComparison({ ticker1, ticker2 }: { ticker1: string; ticker2: string }) {
  const { language } = useLanguage();
  const logo1 = getCompanyLogoUrl(ticker1);
  const logo2 = getCompanyLogoUrl(ticker2);
  const stock1 = findStockByTicker(ticker1);
  const stock2 = findStockByTicker(ticker2);

  const { data: data1, isLoading: loading1 } = useQuery({
    queryKey: ['marketCap', ticker1],
    queryFn: () => fetchMarketCap(ticker1),
    enabled: !!ticker1,
  });

  const { data: data2, isLoading: loading2 } = useQuery({
    queryKey: ['marketCap', ticker2],
    queryFn: () => fetchMarketCap(ticker2),
    enabled: !!ticker2,
  });

  const isLoading = loading1 || loading2;


  const metrics = [
    { key: 'market_cap', label: language === 'fr' ? 'Cap. boursière' : 'Market Cap', format: (v: number | null) => formatMarketCap(v) },
    { key: 'trailing_pe', label: 'P/E Ratio', format: (v: number | null) => v ? v.toFixed(1) : '-' },
    { key: 'dividend_yield', label: language === 'fr' ? 'Rendement div.' : 'Div. Yield', format: (v: number | null) => v ? `${(v * 100).toFixed(2)}%` : '-' },
    { key: 'beta', label: 'Beta', format: (v: number | null) => v ? v.toFixed(2) : '-' },
    { key: 'profit_margin', label: language === 'fr' ? 'Marge nette' : 'Profit Margin', format: (v: number | null) => v ? `${(v * 100).toFixed(1)}%` : '-' },
    { key: 'return_on_equity', label: 'ROE', format: (v: number | null) => v ? `${(v * 100).toFixed(1)}%` : '-' },
    { key: 'revenue_growth', label: language === 'fr' ? 'Croiss. CA' : 'Rev. Growth', format: (v: number | null) => v ? `${(v * 100).toFixed(1)}%` : '-' },
  ];

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <table className="w-full text-sm table-fixed">
        <colgroup>
          <col className="w-32" />
          <col className="w-1/2" />
          <col className="w-1/2" />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            <th className="text-left py-3 px-4 text-white font-semibold border-r border-slate-200 dark:border-slate-700 bg-slate-700 dark:bg-slate-700">
              {language === 'fr' ? 'Métriques clés' : 'Key Metrics'}
            </th>
            <th className="py-3 px-4 border-r border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-center gap-2">
                {logo1 && <img src={logo1} alt="" className="w-6 h-6 object-contain" />}
                <div className="text-left">
                  <span className="text-orange-500 font-medium">{ticker1}</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-normal truncate max-w-[150px]">{stock1?.name}</p>
                </div>
              </div>
            </th>
            <th className="py-3 px-4">
              <div className="flex items-center justify-center gap-2">
                {logo2 && <img src={logo2} alt="" className="w-6 h-6 object-contain" />}
                <div className="text-left">
                  <span className="text-blue-500 font-medium">{ticker2}</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-normal truncate max-w-[150px]">{stock2?.name}</p>
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {metrics.map(({ key, label, format }) => (
            <tr key={key} className="border-b border-slate-100 dark:border-slate-700/50">
              <td className="py-2 px-4 text-slate-600 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700">{label}</td>
              <td className="py-2 text-center font-medium text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-700">
                {format((data1 as any)?.[key] ?? null)}
              </td>
              <td className="py-2 text-center font-medium text-slate-900 dark:text-slate-100">
                {format((data2 as any)?.[key] ?? null)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Comparison Modal Component - shows both companies side by side
function ComparisonModal({
  ticker1,
  ticker2,
  metric,
  metricLabel,
  initialDataView,
  onClose
}: {
  ticker1: string;
  ticker2: string;
  metric: string;
  metricLabel: string;
  initialDataView: DataViewType;
  onClose: () => void;
}) {
  const { language } = useLanguage();
  const [dataView, setDataView] = useState<DataViewType>(initialDataView);
  const logo1 = getCompanyLogoUrl(ticker1);
  const logo2 = getCompanyLogoUrl(ticker2);

  const { data: data1, isLoading: loading1 } = useQuery({
    queryKey: ['financialsHistory', ticker1, metric],
    queryFn: () => fetchFinancialsHistory(ticker1, metric),
    staleTime: 1000 * 60 * 15,
  });

  const { data: data2, isLoading: loading2 } = useQuery({
    queryKey: ['financialsHistory', ticker2, metric],
    queryFn: () => fetchFinancialsHistory(ticker2, metric),
    staleTime: 1000 * 60 * 15,
  });

  const isLoading = loading1 || loading2;
  const currency = data1?.currency || data2?.currency || 'USD';

  // Merge data for chart
  const mergedData = (() => {
    if (!data1?.data && !data2?.data) return [];
    const dataMap = new Map<string, { quarter: string; value1?: number; value2?: number }>();
    const now = new Date();

    const getFilteredData = (data: FinancialsData['data'] | undefined) => {
      if (!data) return [];
      if (dataView === 'quarterly') {
        const cutoff = new Date(now.getFullYear() - 5, now.getMonth(), 1);
        return data.filter(d => new Date(d.date) >= cutoff && d.type === 'quarterly');
      }
      const annualCutoff = new Date(now.getFullYear() - 10, 0, 1);
      return data.filter(d => new Date(d.date) >= annualCutoff && d.type === 'annual');
    };

    const filtered1 = getFilteredData(data1?.data);
    const filtered2 = getFilteredData(data2?.data);

    filtered1.forEach(d => dataMap.set(d.quarter, { quarter: d.quarter, value1: d.value }));
    filtered2.forEach(d => {
      const existing = dataMap.get(d.quarter);
      if (existing) existing.value2 = d.value;
      else dataMap.set(d.quarter, { quarter: d.quarter, value2: d.value });
    });

    return Array.from(dataMap.values()).sort((a, b) => {
      // Parse quarter format like "Q1 2025" or "FY 2024" to sort chronologically
      const parseQuarter = (q: string) => {
        const fyMatch = q.match(/FY\s*(\d{4})/);
        if (fyMatch) return new Date(parseInt(fyMatch[1]), 11, 31).getTime(); // End of year
        const qMatch = q.match(/Q(\d)\s*(\d{4})/);
        if (qMatch) return new Date(parseInt(qMatch[2]), (parseInt(qMatch[1]) - 1) * 3 + 2, 28).getTime();
        return 0;
      };
      return parseQuarter(a.quarter) - parseQuarter(b.quarter);
    });
  })();

  // Calculate CAGR for specific number of years
  const calculateCAGRForYears = (data: FinancialsData['data'] | undefined, years: number) => {
    if (!data || data.length === 0) return null;

    // Use annual data for CAGR calculation (more reliable)
    const annualData = data.filter(d => d.type === 'annual').sort((a, b) => a.date.localeCompare(b.date));
    if (annualData.length < 2) return null;

    // Get data points for the specified years
    const endIdx = annualData.length - 1;
    const startIdx = Math.max(0, endIdx - years);

    if (startIdx === endIdx) return null;

    const startValue = annualData[startIdx]?.value;
    const endValue = annualData[endIdx]?.value;

    if (!startValue || startValue <= 0 || !endValue || endValue <= 0) return null;

    const actualYears = endIdx - startIdx;
    if (actualYears < 1) return null;

    return (Math.pow(endValue / startValue, 1 / actualYears) - 1) * 100;
  };

  // Calculate CAGRs for both companies
  const cagr1Y_1 = calculateCAGRForYears(data1?.data, 1);
  const cagr3Y_1 = calculateCAGRForYears(data1?.data, 3);
  const cagr5Y_1 = calculateCAGRForYears(data1?.data, 5);

  const cagr1Y_2 = calculateCAGRForYears(data2?.data, 1);
  const cagr3Y_2 = calculateCAGRForYears(data2?.data, 3);
  const cagr5Y_2 = calculateCAGRForYears(data2?.data, 5);

  // Calculate total growth from first to last data point shown
  const calcTotalGrowth = (dataPoints: typeof mergedData, valueKey: 'value1' | 'value2') => {
    const filtered = dataPoints.filter(d => d[valueKey] !== undefined);
    if (filtered.length < 2) return null;
    const first = filtered[0];
    const last = filtered[filtered.length - 1];
    const firstVal = first[valueKey];
    const lastVal = last[valueKey];
    if (!firstVal || !lastVal || firstVal <= 0) return null;
    const pctChange = ((lastVal - firstVal) / firstVal) * 100;
    return { pct: pctChange, from: first.quarter, to: last.quarter };
  };

  const totalGrowth1 = calcTotalGrowth(mergedData, 'value1');
  const totalGrowth2 = calcTotalGrowth(mergedData, 'value2');

  const formatGrowth = (value: number | null) => {
    if (value === null) return '-';
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const getGrowthColor = (value: number | null) => {
    if (value === null) return 'text-slate-400';
    return value >= 0 ? 'text-green-500' : 'text-red-500';
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative w-full max-w-5xl bg-white dark:bg-slate-800 rounded-xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          {/* Left: Title and tickers */}
          <div className="flex items-center gap-4 flex-1">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{metricLabel}</h2>
            <div className="flex items-center gap-2">
              <Link to={`/investing/stock/${ticker1}`} className="flex items-center gap-1.5 px-2 py-1 bg-orange-100 dark:bg-orange-900/30 rounded hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors">
                {logo1 && <img src={logo1} alt="" className="w-5 h-5 object-contain" />}
                <span className="text-sm font-medium text-orange-600 dark:text-orange-400">{ticker1}</span>
              </Link>
              <span className="text-slate-400">vs</span>
              <Link to={`/investing/stock/${ticker2}`} className="flex items-center gap-1.5 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors">
                {logo2 && <img src={logo2} alt="" className="w-5 h-5 object-contain" />}
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">{ticker2}</span>
              </Link>
            </div>
          </div>
          {/* Center: Toggle */}
          <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600">
            <button
              onClick={() => setDataView('quarterly')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                dataView === 'quarterly'
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              {language === 'fr' ? 'Trim.' : 'Quarterly'}
            </button>
            <button
              onClick={() => setDataView('annual')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                dataView === 'annual'
                  ? 'bg-green-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              {language === 'fr' ? 'Annuel' : 'Annual'}
            </button>
          </div>
          {/* Right: Close button */}
          <div className="flex-1 flex justify-end">
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Chart */}
        <div className="p-6">
          {isLoading ? (
            <div className="h-[400px] flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
          ) : mergedData.length === 0 ? (
            <div className="h-[400px] flex items-center justify-center text-slate-500">
              {language === 'fr' ? 'Aucune donnée disponible' : 'No data available'}
            </div>
          ) : (
            <>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mergedData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <XAxis
                      dataKey="quarter"
                      tick={{ fontSize: 12, fill: '#e2e8f0', fontWeight: 500 }}
                      tickLine={{ stroke: '#475569' }}
                      axisLine={{ stroke: '#475569' }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                      interval={0}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#e2e8f0', fontWeight: 500 }}
                      tickLine={{ stroke: '#475569' }}
                      axisLine={{ stroke: '#475569' }}
                      tickFormatter={(val) => formatValue(val, currency)}
                      width={80}
                    />
                    <Tooltip
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', border: 'none', padding: '8px 12px' }}
                      formatter={(value, name) => [formatValue(Number(value), currency), name === 'value1' ? ticker1 : ticker2]}
                    />
                    <Legend formatter={(value) => <span style={{ marginRight: '64px' }}>{value === 'value1' ? ticker1 : ticker2}</span>} wrapperStyle={{ paddingTop: '10px' }} iconSize={12} />
                    <Bar dataKey="value1" fill="#f97316" name="value1" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="value2" fill="#3b82f6" name="value2" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Growth rates comparison */}
              <div className="flex justify-center gap-12 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    {logo1 && <img src={logo1} alt="" className="w-5 h-5 object-contain" />}
                    <div>
                      <p className="text-sm text-orange-500 font-medium">{ticker1}</p>
                      <p className="text-xs text-slate-400">{findStockByTicker(ticker1)?.name}</p>
                    </div>
                  </div>
                  {totalGrowth1 && (
                    <div className="text-center mb-2">
                      <p className="text-xs text-slate-400 mb-0.5">
                        ({totalGrowth1.from} → {totalGrowth1.to})
                      </p>
                      <p className={`text-sm font-medium ${totalGrowth1.pct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {totalGrowth1.pct >= 0 ? '+' : ''}{totalGrowth1.pct.toFixed(1)}%
                      </p>
                    </div>
                  )}
                  <div className="flex gap-4">
                    <span className={`text-sm ${getGrowthColor(cagr1Y_1)}`}>
                      1Y: {formatGrowth(cagr1Y_1)}
                    </span>
                    <span className={`text-sm ${getGrowthColor(cagr3Y_1)}`}>
                      3Y: {formatGrowth(cagr3Y_1)}
                    </span>
                    <span className={`text-sm ${getGrowthColor(cagr5Y_1)}`}>
                      5Y: {formatGrowth(cagr5Y_1)}
                    </span>
                  </div>
                </div>
                <div className="w-px bg-slate-300 dark:bg-slate-600" />
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    {logo2 && <img src={logo2} alt="" className="w-5 h-5 object-contain" />}
                    <div>
                      <p className="text-sm text-blue-500 font-medium">{ticker2}</p>
                      <p className="text-xs text-slate-400">{findStockByTicker(ticker2)?.name}</p>
                    </div>
                  </div>
                  {totalGrowth2 && (
                    <div className="text-center mb-2">
                      <p className="text-xs text-slate-400 mb-0.5">
                        ({totalGrowth2.from} → {totalGrowth2.to})
                      </p>
                      <p className={`text-sm font-medium ${totalGrowth2.pct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {totalGrowth2.pct >= 0 ? '+' : ''}{totalGrowth2.pct.toFixed(1)}%
                      </p>
                    </div>
                  )}
                  <div className="flex gap-4">
                    <span className={`text-sm ${getGrowthColor(cagr1Y_2)}`}>
                      1Y: {formatGrowth(cagr1Y_2)}
                    </span>
                    <span className={`text-sm ${getGrowthColor(cagr3Y_2)}`}>
                      3Y: {formatGrowth(cagr3Y_2)}
                    </span>
                    <span className={`text-sm ${getGrowthColor(cagr5Y_2)}`}>
                      5Y: {formatGrowth(cagr5Y_2)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ComparisonPanel() {
  const { language } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize from URL params
  const [ticker1, setTicker1Internal] = useState<string | null>(() => searchParams.get('t1'));
  const [ticker2, setTicker2Internal] = useState<string | null>(() => searchParams.get('t2'));
  const [dataView, setDataView] = useState<DataViewType>('quarterly');
  const [hasAutoSetDataView, setHasAutoSetDataView] = useState(false);
  const [selectedModal, setSelectedModal] = useState<{ metric: string; title: string } | null>(null);

  // Sync state with URL params
  const setTicker1 = (ticker: string | null) => {
    setTicker1Internal(ticker);
    setHasAutoSetDataView(false); // Reset when ticker changes
    const newParams = new URLSearchParams(searchParams);
    if (ticker) newParams.set('t1', ticker);
    else newParams.delete('t1');
    setSearchParams(newParams, { replace: true });
  };

  const setTicker2 = (ticker: string | null) => {
    setTicker2Internal(ticker);
    setHasAutoSetDataView(false); // Reset when ticker changes
    const newParams = new URLSearchParams(searchParams);
    if (ticker) newParams.set('t2', ticker);
    else newParams.delete('t2');
    setSearchParams(newParams, { replace: true });
  };

  const bothSelected = ticker1 && ticker2;

  // Fetch Revenue data to check for quarterly availability
  const { data: revenueData1 } = useQuery({
    queryKey: ['financialsHistory', ticker1, 'Revenue'],
    queryFn: () => fetchFinancialsHistory(ticker1!, 'Revenue'),
    enabled: !!ticker1,
    staleTime: 1000 * 60 * 15,
  });

  const { data: revenueData2 } = useQuery({
    queryKey: ['financialsHistory', ticker2, 'Revenue'],
    queryFn: () => fetchFinancialsHistory(ticker2!, 'Revenue'),
    enabled: !!ticker2,
    staleTime: 1000 * 60 * 15,
  });

  // Auto-select dataView based on data availability
  useEffect(() => {
    if (!bothSelected || hasAutoSetDataView) return;
    if (!revenueData1?.data || !revenueData2?.data) return;

    const hasQuarterly1 = revenueData1.data.some(d => d.type === 'quarterly');
    const hasQuarterly2 = revenueData2.data.some(d => d.type === 'quarterly');
    const hasAnnual1 = revenueData1.data.some(d => d.type === 'annual');
    const hasAnnual2 = revenueData2.data.some(d => d.type === 'annual');

    // Default to quarterly if both have it, otherwise annual
    if (hasQuarterly1 && hasQuarterly2) {
      setDataView('quarterly');
    } else if (hasAnnual1 || hasAnnual2) {
      setDataView('annual');
    }
    setHasAutoSetDataView(true);
  }, [bothSelected, revenueData1, revenueData2, hasAutoSetDataView]);

  const metrics = [
    { metric: 'Revenue', title: language === 'fr' ? 'Chiffre d\'affaires' : 'Revenue' },
    { metric: 'NetIncome', title: language === 'fr' ? 'Résultat net' : 'Net Income' },
    { metric: 'GrossProfit', title: language === 'fr' ? 'Marge brute' : 'Gross Profit' },
    { metric: 'OperatingIncome', title: language === 'fr' ? 'Résultat opérationnel' : 'Operating Income' },
    { metric: 'EBITDA', title: 'EBITDA' },
    { metric: 'EPS', title: 'EPS' },
  ];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="mb-6 text-center max-w-xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
          {language === 'fr' ? 'Comparaison d\'actions' : 'Stocks Comparison'}
        </h1>
        <p className="text-slate-500 dark:text-slate-400">
          {language === 'fr'
            ? 'Comparez les métriques financières de deux entreprises côte à côte'
            : 'Compare financial metrics of two companies side by side'}
        </p>
      </div>

      {/* Stock Selectors */}
      <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <StockSelector
            selectedTicker={ticker1}
            onSelect={(t) => setTicker1(t || null)}
            label={language === 'fr' ? 'Première action' : 'First Stock'}
            otherTicker={ticker2}
            position="left"
            onSwap={() => { setTicker1(ticker2); setTicker2(ticker1); }}
          />
          <div className="flex items-center justify-center self-end mb-3">
            <span className="text-2xl font-bold text-slate-300 dark:text-slate-500">VS</span>
          </div>
          <StockSelector
            selectedTicker={ticker2}
            onSelect={(t) => setTicker2(t || null)}
            label={language === 'fr' ? 'Deuxième action' : 'Second Stock'}
            otherTicker={ticker1}
            position="right"
            onSwap={() => { setTicker1(ticker2); setTicker2(ticker1); }}
          />
        </div>
      </div>

      {/* Comparison Content */}
      {bothSelected ? (
        <div className="space-y-6">
          {/* Key Metrics Table */}
          <MetricsComparison ticker1={ticker1} ticker2={ticker2} />

          {/* Data View Toggle - Centered */}
          <div className="flex justify-center">
            <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600">
              <button
                onClick={() => setDataView('quarterly')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  dataView === 'quarterly'
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {language === 'fr' ? 'Trimestriel' : 'Quarterly'}
              </button>
              <button
                onClick={() => setDataView('annual')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  dataView === 'annual'
                    ? 'bg-green-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {language === 'fr' ? 'Annuel' : 'Annual'}
              </button>
            </div>
          </div>

          {/* Financial Charts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {metrics.map(({ metric, title }) => (
              <ComparisonChart
                key={`${metric}-${dataView}`}
                ticker1={ticker1}
                ticker2={ticker2}
                metric={metric}
                title={title}
                dataView={dataView}
                onChartClick={() => setSelectedModal({ metric, title })}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-12 text-center">
          <TrendingUp className="w-12 h-12 text-slate-300 dark:text-slate-500 mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">
            {language === 'fr'
              ? 'Sélectionnez deux actions pour comparer leurs métriques financières'
              : 'Select two stocks to compare their financial metrics'}
          </p>
        </div>
      )}

      {/* Comparison Modal - shows both companies */}
      {selectedModal && ticker1 && ticker2 && (
        <ComparisonModal
          ticker1={ticker1}
          ticker2={ticker2}
          metric={selectedModal.metric}
          metricLabel={selectedModal.title}
          initialDataView={dataView}
          onClose={() => setSelectedModal(null)}
        />
      )}
    </div>
  );
}
