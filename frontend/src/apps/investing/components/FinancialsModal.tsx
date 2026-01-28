// Modal for displaying detailed financial metrics with historical chart

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { X, Loader2, ChevronDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getCompanyLogoUrl } from '../utils/companyLogos';

interface FinancialsModalProps {
  ticker: string;
  companyName: string;
  metric: string;
  metricLabel: string;
  onClose: () => void;
}

interface DataPoint {
  date: string;
  quarter: string;
  value: number;
  type: 'quarterly' | 'annual';
}

interface FinancialsData {
  ticker: string;
  company_name: string;
  metric: string;
  metric_label: string;
  currency: string;
  data: DataPoint[];
  growth_rates: {
    '1Y': number | null;
    '2Y': number | null;
    '5Y': number | null;
    '10Y': number | null;
  };
}

type TimeFilter = 'ALL' | '10Y' | '5Y' | '3Y' | '1Y';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CHF: 'CHF ',
};

const getCurrencySymbol = (currency: string): string => {
  return CURRENCY_SYMBOLS[currency] || `${currency} `;
};

const formatValue = (value: number, currency: string): string => {
  const symbol = getCurrencySymbol(currency);
  const absValue = Math.abs(value);
  if (absValue >= 1e12) return `${symbol}${(value / 1e12).toFixed(1)}T`;
  if (absValue >= 1e9) return `${symbol}${(value / 1e9).toFixed(1)}B`;
  if (absValue >= 1e6) return `${symbol}${(value / 1e6).toFixed(0)}M`;
  if (absValue >= 1e3) return `${symbol}${(value / 1e3).toFixed(0)}K`;
  return `${symbol}${value.toFixed(0)}`;
};

const fetchFinancialsHistory = async (ticker: string, metric: string): Promise<FinancialsData> => {
  const response = await axios.get(`/api/investing/financials-history/${ticker}?metric=${metric}`);
  return response.data;
};

export function FinancialsModal({ ticker, companyName, metric, metricLabel, onClose }: FinancialsModalProps) {
  const { language } = useLanguage();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('ALL');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const logoUrl = getCompanyLogoUrl(ticker);

  const { data, isLoading, error } = useQuery({
    queryKey: ['financialsHistory', ticker, metric],
    queryFn: () => fetchFinancialsHistory(ticker, metric),
  });

  // Filter data based on time selection
  const getFilteredData = () => {
    if (!data?.data) return [];
    const now = new Date();
    const yearsMap: Record<TimeFilter, number> = { 'ALL': 100, '10Y': 10, '5Y': 5, '3Y': 3, '1Y': 1 };
    const years = yearsMap[timeFilter];
    const cutoffDate = new Date(now.getFullYear() - years, now.getMonth(), now.getDate());

    return data.data.filter(d => new Date(d.date) >= cutoffDate);
  };

  const filteredData = getFilteredData();
  const currency = data?.currency || 'USD';

  // Determine bar color based on value (positive = orange, negative = red)
  const getBarColor = (value: number) => value >= 0 ? '#f97316' : '#ef4444';

  // Growth rate color
  const getGrowthColor = (value: number | null) => {
    if (value === null) return 'text-slate-400';
    return value >= 0 ? 'text-green-500' : 'text-red-500';
  };

  const formatGrowth = (value: number | null) => {
    if (value === null) return '-';
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-white dark:bg-slate-800 rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            {/* Company Logo */}
            <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-600">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${ticker} logo`}
                  className="w-10 h-10 object-contain"
                  onError={(e) => {
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      parent.innerHTML = `<span class="text-sm font-bold text-slate-400">${ticker.slice(0, 2)}</span>`;
                    }
                  }}
                />
              ) : (
                <span className="text-sm font-bold text-slate-400">{ticker.slice(0, 2)}</span>
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {metricLabel} (TTM) - {ticker}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{companyName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Time Filter Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                <span>{timeFilter === 'ALL' ? (language === 'fr' ? 'Tout' : 'All') : timeFilter}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              {showFilterDropdown && (
                <div className="absolute top-full right-0 mt-1 bg-white dark:bg-slate-700 rounded-lg shadow-lg border border-slate-200 dark:border-slate-600 z-10 overflow-hidden">
                  {(['ALL', '10Y', '5Y', '3Y', '1Y'] as TimeFilter[]).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => {
                        setTimeFilter(filter);
                        setShowFilterDropdown(false);
                      }}
                      className={`w-full px-4 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors ${
                        timeFilter === filter ? 'bg-slate-100 dark:bg-slate-600 font-medium' : ''
                      }`}
                    >
                      {filter === 'ALL' ? (language === 'fr' ? 'Tout' : 'All') : filter}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Chart Area */}
        <div className="p-6">
          {isLoading ? (
            <div className="h-[350px] flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
          ) : error ? (
            <div className="h-[350px] flex items-center justify-center text-slate-500">
              {language === 'fr' ? 'Erreur lors du chargement des données' : 'Error loading data'}
            </div>
          ) : filteredData.length === 0 ? (
            <div className="h-[350px] flex items-center justify-center text-slate-500">
              {language === 'fr' ? 'Aucune donnée disponible' : 'No data available'}
            </div>
          ) : (
            <>
              {/* Bar Chart */}
              <div className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={filteredData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                  >
                    <XAxis
                      dataKey="quarter"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickLine={{ stroke: '#cbd5e1' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                      interval={Math.floor(filteredData.length / 15)}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickLine={{ stroke: '#cbd5e1' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickFormatter={(val) => formatValue(val, currency)}
                      width={70}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        borderRadius: '8px',
                        border: 'none',
                        padding: '8px 12px',
                      }}
                      labelStyle={{ color: '#e2e8f0', fontSize: '12px', fontWeight: 500 }}
                      itemStyle={{ color: '#ffffff' }}
                      separator=": "
                      formatter={(value) => [formatValue(Number(value), currency), metricLabel]}
                      labelFormatter={(label) => label}
                    />
                    <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                      {filteredData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getBarColor(entry.value)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Growth Rates */}
              {data?.growth_rates && (
                <div className="flex justify-center gap-6 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <div className="text-center">
                    <span className={`text-sm font-medium ${getGrowthColor(data.growth_rates['1Y'])}`}>
                      1Y: {formatGrowth(data.growth_rates['1Y'])}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className={`text-sm font-medium ${getGrowthColor(data.growth_rates['2Y'])}`}>
                      2Y: {formatGrowth(data.growth_rates['2Y'])}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className={`text-sm font-medium ${getGrowthColor(data.growth_rates['5Y'])}`}>
                      5Y: {formatGrowth(data.growth_rates['5Y'])}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className={`text-sm font-medium ${getGrowthColor(data.growth_rates['10Y'])}`}>
                      10Y: {formatGrowth(data.growth_rates['10Y'])}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
