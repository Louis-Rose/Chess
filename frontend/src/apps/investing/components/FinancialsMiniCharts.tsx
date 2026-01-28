// Mini charts dashboard for financial metrics

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Maximize2, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useLanguage } from '../../../contexts/LanguageContext';

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

interface MiniChartProps {
  ticker: string;
  metric: string;
  title: string;
  chartType: 'bar' | 'area';
  color: string;
  onExpand: () => void;
}

interface PriceChartProps {
  priceData: { timestamp: string; price: number }[] | undefined;
  previousClose: number | null;
  currency: string;
  onExpand?: () => void;
}

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
  if (absValue >= 1e9) return `${symbol}${(value / 1e9).toFixed(0)}b`;
  if (absValue >= 1e6) return `${symbol}${(value / 1e6).toFixed(0)}M`;
  if (absValue >= 1e3) return `${symbol}${(value / 1e3).toFixed(0)}K`;
  return `${symbol}${value.toFixed(2)}`;
};

const fetchFinancialsHistory = async (ticker: string, metric: string): Promise<FinancialsData> => {
  const response = await axios.get(`/api/investing/financials-history/${ticker}?metric=${metric}`);
  return response.data;
};

function MiniChart({ ticker, metric, title, chartType, color, onExpand }: MiniChartProps) {
  const { language } = useLanguage();

  const { data, isLoading } = useQuery({
    queryKey: ['financialsHistory', ticker, metric],
    queryFn: () => fetchFinancialsHistory(ticker, metric),
    staleTime: 1000 * 60 * 15, // 15 minutes
  });

  // Filter to last 3 years of quarterly data
  const getFilteredData = () => {
    if (!data?.data) return [];
    const now = new Date();
    const cutoff = new Date(now.getFullYear() - 3, now.getMonth(), 1);
    return data.data
      .filter(d => new Date(d.date) >= cutoff && d.type === 'quarterly')
      .slice(-12); // Last 12 quarters max
  };

  const chartData = getFilteredData();
  const currency = data?.currency || 'USD';

  // Calculate TTM change
  const getTTMChange = () => {
    if (!chartData || chartData.length < 5) return null;
    const currentTTM = chartData.slice(-4).reduce((sum, d) => sum + d.value, 0);
    const previousTTM = chartData.slice(-8, -4).reduce((sum, d) => sum + d.value, 0);
    if (previousTTM === 0) return null;
    return ((currentTTM - previousTTM) / Math.abs(previousTTM)) * 100;
  };

  const ttmChange = getTTMChange();

  return (
    <button
      onClick={onExpand}
      className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors cursor-pointer text-left w-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
          {ttmChange !== null && (
            <span className={`flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded ${
              ttmChange >= 0
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
            }`}>
              {ttmChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {ttmChange >= 0 ? '+' : ''}{ttmChange.toFixed(1)}%
            </span>
          )}
        </div>
        <Maximize2 className="w-4 h-4 text-slate-400" />
      </div>

      {/* Chart */}
      {isLoading ? (
        <div className="h-[120px] flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-[120px] flex items-center justify-center text-slate-400 text-xs">
          {language === 'fr' ? 'Pas de données' : 'No data'}
        </div>
      ) : (
        <div className="h-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <XAxis
                  dataKey="quarter"
                  tick={{ fontSize: 8, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.floor(chartData.length / 4)}
                />
                <YAxis
                  tick={{ fontSize: 8, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => formatValue(val, currency)}
                  width={45}
                />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderRadius: '6px',
                    border: 'none',
                    padding: '8px 12px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: '#e2e8f0', fontWeight: 500 }}
                  itemStyle={{ color: '#ffffff' }}
                  separator=": "
                  formatter={(value) => [formatValue(Number(value), currency), title]}
                />
                <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.value >= 0 ? color : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id={`gradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="quarter"
                  tick={{ fontSize: 8, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.floor(chartData.length / 4)}
                />
                <YAxis
                  tick={{ fontSize: 8, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => formatValue(val, currency)}
                  width={45}
                />
                <Tooltip
                  cursor={{ fill: 'transparent' }}
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderRadius: '6px',
                    border: 'none',
                    padding: '8px 12px',
                    fontSize: '12px',
                  }}
                  labelStyle={{ color: '#e2e8f0', fontWeight: 500 }}
                  itemStyle={{ color: '#ffffff' }}
                  separator=": "
                  formatter={(value) => [formatValue(Number(value), currency), title]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#gradient-${metric})`}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </button>
  );
}

export function PriceMiniChart({ priceData, previousClose, currency, onExpand }: PriceChartProps) {
  const { language } = useLanguage();

  if (!priceData || priceData.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700">
        <div className="h-[150px] flex items-center justify-center text-slate-400 text-xs">
          {language === 'fr' ? 'Pas de données' : 'No data'}
        </div>
      </div>
    );
  }

  const currentPrice = priceData[priceData.length - 1]?.price;
  const startPrice = previousClose || priceData[0]?.price;
  const priceChange = currentPrice && startPrice ? ((currentPrice - startPrice) / startPrice) * 100 : null;
  const isPositive = priceChange !== null && priceChange >= 0;
  const color = isPositive ? '#22c55e' : '#ef4444';
  const currencySymbol = getCurrencySymbol(currency);

  const CardWrapper = onExpand ? 'button' : 'div';

  return (
    <CardWrapper
      onClick={onExpand}
      className={`bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 text-left w-full ${
        onExpand ? 'hover:border-slate-300 dark:hover:border-slate-600 transition-colors cursor-pointer' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {language === 'fr' ? 'Prix' : 'Price'}
          </h3>
          {priceChange !== null && (
            <span className={`flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded ${
              isPositive
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
            }`}>
              {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {isPositive ? '+' : ''}{priceChange.toFixed(2)}%
            </span>
          )}
        </div>
        {onExpand && <Maximize2 className="w-4 h-4 text-slate-400" />}
      </div>

      {/* Chart */}
      <div className="h-[120px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={priceData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <defs>
              <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="timestamp"
              tick={{ fontSize: 8, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(ts) => {
                const d = new Date(ts);
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              }}
              interval={Math.floor(priceData.length / 4)}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 8, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => `${currencySymbol}${val.toFixed(0)}`}
              width={45}
            />
            <Tooltip
              cursor={{ stroke: 'transparent' }}
              contentStyle={{
                backgroundColor: '#1e293b',
                borderRadius: '6px',
                border: 'none',
                padding: '8px 12px',
                fontSize: '12px',
              }}
              labelStyle={{ color: '#e2e8f0', fontWeight: 500 }}
              itemStyle={{ color: '#ffffff' }}
              separator=": "
              labelFormatter={(ts) => new Date(String(ts)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              formatter={(value) => [`${currencySymbol}${Number(value).toFixed(2)}`, 'Price']}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke={color}
              strokeWidth={2}
              fill="url(#priceGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </CardWrapper>
  );
}

interface FinancialsMiniChartsProps {
  ticker: string;
  priceData?: { timestamp: string; price: number }[];
  previousClose?: number | null;
  priceCurrency?: string;
  onMetricClick: (metric: string, label: string) => void;
  onPriceClick?: () => void;
}

export function FinancialsMiniCharts({ ticker, priceData, previousClose, priceCurrency, onMetricClick, onPriceClick }: FinancialsMiniChartsProps) {
  const { language } = useLanguage();

  const metrics = [
    { metric: 'Revenue', title: language === 'fr' ? 'Chiffre d\'affaires (TTM)' : 'Revenue (TTM)', chartType: 'bar' as const, color: '#f97316' },
    { metric: 'NetIncome', title: language === 'fr' ? 'Résultat net (TTM)' : 'Net Income (TTM)', chartType: 'bar' as const, color: '#f97316' },
    { metric: 'GrossProfit', title: language === 'fr' ? 'Marge brute (TTM)' : 'Gross Profit (TTM)', chartType: 'bar' as const, color: '#22c55e' },
    { metric: 'OperatingIncome', title: language === 'fr' ? 'Résultat opérationnel (TTM)' : 'Operating Income (TTM)', chartType: 'bar' as const, color: '#3b82f6' },
    { metric: 'EBITDA', title: 'EBITDA (TTM)', chartType: 'bar' as const, color: '#8b5cf6' },
    { metric: 'EPS', title: 'EPS (TTM)', chartType: 'bar' as const, color: '#06b6d4' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {/* Price Chart */}
      <PriceMiniChart
        priceData={priceData}
        previousClose={previousClose ?? null}
        currency={priceCurrency || 'USD'}
        onExpand={onPriceClick}
      />

      {/* Financial Metrics */}
      {metrics.map(({ metric, title, chartType, color }) => (
        <MiniChart
          key={metric}
          ticker={ticker}
          metric={metric}
          title={title}
          chartType={chartType}
          color={color}
          onExpand={() => onMetricClick(metric, title)}
        />
      ))}
    </div>
  );
}
