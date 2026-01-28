// Stocks Comparison Panel - Compare two stocks side by side

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Search, X, Loader2, TrendingUp, Eye } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useAuth } from '../../../contexts/AuthContext';
import { findStockByTicker, searchAllStocks, type Stock } from '../utils/allStocks';
import { getCompanyLogoUrl } from '../utils/companyLogos';
import { getRecentStocks, removeRecentStock, addRecentStock } from '../utils/recentStocks';

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
  otherTicker
}: {
  selectedTicker: string | null;
  onSelect: (ticker: string) => void;
  label: string;
  otherTicker: string | null;
}) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [recentStocks, setRecentStocks] = useState<string[]>(() => getRecentStocks(user?.id));
  const dropdownRef = useRef<HTMLDivElement>(null);

  const results = query.length >= 1 ? searchAllStocks(query).filter((s: Stock) => s.ticker !== otherTicker).slice(0, 8) : [];
  const selectedStock = selectedTicker ? findStockByTicker(selectedTicker) : null;
  const logoUrl = selectedTicker ? getCompanyLogoUrl(selectedTicker) : null;

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

  return (
    <div className="flex-1">
      <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">{label}</label>
      {selectedTicker ? (
        <div className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border-2 border-green-500">
          <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-600 flex items-center justify-center overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt={selectedTicker} className="w-8 h-8 object-contain" />
            ) : (
              <span className="text-xs font-bold text-slate-400">{selectedTicker.slice(0, 2)}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{selectedStock?.name || selectedTicker}</p>
            <p className="text-sm text-slate-500">{selectedTicker}</p>
          </div>
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
              className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-green-500"
            />
          </div>
          {isOpen && ((query.length === 0 && filteredRecentStocks.length > 0) || (query.length > 0 && results.length > 0)) && (
            <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-600 max-h-60 overflow-y-auto">
              {/* Recent stocks when search is empty */}
              {query.length === 0 && filteredRecentStocks.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
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
                        className="w-full px-4 py-2 text-left flex items-center gap-3 border-b border-slate-100 dark:border-slate-700 last:border-b-0 hover:bg-green-50 dark:hover:bg-slate-700 cursor-pointer group"
                      >
                        <div className="w-6 h-6 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                          {recentLogoUrl ? (
                            <img src={recentLogoUrl} alt="" className="w-6 h-6 object-contain" />
                          ) : (
                            <span className="text-[10px] font-bold text-slate-500">{ticker.slice(0, 2)}</span>
                          )}
                        </div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 w-16">{ticker}</span>
                        <span className="text-slate-600 dark:text-slate-400 text-sm truncate flex-1">{displayName}</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRecentStock(ticker, user?.id);
                            setRecentStocks(getRecentStocks(user?.id));
                          }}
                          className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
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
                    className="w-full px-4 py-2 text-left hover:bg-green-50 dark:hover:bg-slate-700 flex items-center gap-3 border-b border-slate-100 dark:border-slate-700 last:border-b-0"
                  >
                    <div className="w-6 h-6 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                      {searchLogoUrl ? (
                        <img src={searchLogoUrl} alt="" className="w-6 h-6 object-contain" />
                      ) : (
                        <span className="text-[10px] font-bold text-slate-500">{stock.ticker.slice(0, 2)}</span>
                      )}
                    </div>
                    <span className="font-bold text-slate-800 dark:text-slate-200 w-16">{stock.ticker}</span>
                    <span className="text-slate-600 dark:text-slate-400 text-sm truncate">{stock.name}</span>
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
  title
}: {
  ticker1: string;
  ticker2: string;
  metric: string;
  title: string;
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

  // Merge data by quarter
  const mergedData = (() => {
    if (!data1?.data && !data2?.data) return [];

    const quarterMap = new Map<string, { quarter: string; value1?: number; value2?: number }>();

    // Filter to last 3 years of quarterly data
    const now = new Date();
    const cutoff = new Date(now.getFullYear() - 3, now.getMonth(), 1);

    data1?.data
      .filter(d => new Date(d.date) >= cutoff && d.type === 'quarterly')
      .forEach(d => {
        quarterMap.set(d.quarter, { quarter: d.quarter, value1: d.value });
      });

    data2?.data
      .filter(d => new Date(d.date) >= cutoff && d.type === 'quarterly')
      .forEach(d => {
        const existing = quarterMap.get(d.quarter);
        if (existing) {
          existing.value2 = d.value;
        } else {
          quarterMap.set(d.quarter, { quarter: d.quarter, value2: d.value });
        }
      });

    return Array.from(quarterMap.values())
      .sort((a, b) => a.quarter.localeCompare(b.quarter))
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

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-3">{title}</h3>

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
                  interval={Math.floor(mergedData.length / 4)}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => formatValue(val, currency)}
                  width={50}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', borderRadius: '6px', border: 'none', padding: '8px', fontSize: '11px' }}
                  formatter={(value, name) => [formatValue(Number(value), currency), name === 'value1' ? ticker1 : ticker2]}
                />
                <Legend
                  formatter={(value) => value === 'value1' ? ticker1 : ticker2}
                  wrapperStyle={{ fontSize: '11px' }}
                />
                <Bar dataKey="value1" fill="#f97316" name="value1" radius={[2, 2, 0, 0]} />
                <Bar dataKey="value2" fill="#3b82f6" name="value2" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Growth rates comparison */}
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-slate-500 mb-1">{ticker1}</p>
                <div className="flex gap-2">
                  <span className={getGrowthColor(data1?.growth_rates['1Y'] ?? null)}>1Y: {formatGrowth(data1?.growth_rates['1Y'] ?? null)}</span>
                  <span className={getGrowthColor(data1?.growth_rates['5Y'] ?? null)}>5Y: {formatGrowth(data1?.growth_rates['5Y'] ?? null)}</span>
                </div>
              </div>
              <div>
                <p className="text-slate-500 mb-1">{ticker2}</p>
                <div className="flex gap-2">
                  <span className={getGrowthColor(data2?.growth_rates['1Y'] ?? null)}>1Y: {formatGrowth(data2?.growth_rates['1Y'] ?? null)}</span>
                  <span className={getGrowthColor(data2?.growth_rates['5Y'] ?? null)}>5Y: {formatGrowth(data2?.growth_rates['5Y'] ?? null)}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Key Metrics Comparison
function MetricsComparison({ ticker1, ticker2 }: { ticker1: string; ticker2: string }) {
  const { language } = useLanguage();

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
    <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">
        {language === 'fr' ? 'Métriques clés' : 'Key Metrics'}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left py-2 text-slate-500 font-medium">Metric</th>
              <th className="text-right py-2 text-orange-500 font-medium">{ticker1}</th>
              <th className="text-right py-2 text-blue-500 font-medium">{ticker2}</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map(({ key, label, format }) => (
              <tr key={key} className="border-b border-slate-100 dark:border-slate-700/50">
                <td className="py-2 text-slate-600 dark:text-slate-400">{label}</td>
                <td className="py-2 text-right font-medium text-slate-900 dark:text-slate-100">
                  {format((data1 as any)?.[key] ?? null)}
                </td>
                <td className="py-2 text-right font-medium text-slate-900 dark:text-slate-100">
                  {format((data2 as any)?.[key] ?? null)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ComparisonPanel() {
  const { language } = useLanguage();
  const [ticker1, setTicker1] = useState<string | null>(null);
  const [ticker2, setTicker2] = useState<string | null>(null);

  const bothSelected = ticker1 && ticker2;

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
          />
          <div className="flex items-center justify-center">
            <span className="text-2xl font-bold text-slate-300 dark:text-slate-500">VS</span>
          </div>
          <StockSelector
            selectedTicker={ticker2}
            onSelect={(t) => setTicker2(t || null)}
            label={language === 'fr' ? 'Deuxième action' : 'Second Stock'}
            otherTicker={ticker1}
          />
        </div>
      </div>

      {/* Comparison Content */}
      {bothSelected ? (
        <div className="space-y-6">
          {/* Key Metrics Table */}
          <MetricsComparison ticker1={ticker1} ticker2={ticker2} />

          {/* Financial Charts Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {metrics.map(({ metric, title }) => (
              <ComparisonChart
                key={metric}
                ticker1={ticker1}
                ticker2={ticker2}
                metric={metric}
                title={title}
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
    </div>
  );
}
