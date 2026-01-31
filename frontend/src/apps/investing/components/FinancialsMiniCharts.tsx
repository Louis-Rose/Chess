// Mini charts dashboard for financial metrics

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Maximize2, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useAuth } from '../../../contexts/AuthContext';

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
  dataView: 'quarterly' | 'annual';
  onExpand: () => void;
  // Drag & drop props
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent<HTMLButtonElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLButtonElement>) => void;
}

interface PriceChartProps {
  priceData: { timestamp: string; price: number }[] | undefined;
  previousClose: number | null;
  currency: string;
  onExpand?: () => void;
  isLoading?: boolean;
  // Drag & drop props
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement | HTMLButtonElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent<HTMLDivElement | HTMLButtonElement>) => void;
  onDrop?: (e: React.DragEvent<HTMLDivElement | HTMLButtonElement>) => void;
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

function MiniChart({ ticker, metric, title, chartType, color, dataView, onExpand, isDragOver, onDragStart, onDragEnd, onDragOver, onDrop }: MiniChartProps) {
  const { language } = useLanguage();

  const { data, isLoading } = useQuery({
    queryKey: ['financialsHistory', ticker, metric],
    queryFn: () => fetchFinancialsHistory(ticker, metric),
    staleTime: 1000 * 60 * 15, // 15 minutes
  });

  const dragOverClass = isDragOver ? 'ring-2 ring-purple-500 ring-offset-2' : '';

  // Filter based on selected data view
  const getFilteredData = () => {
    if (!data?.data) return [];
    const now = new Date();

    if (dataView === 'quarterly') {
      const cutoff = new Date(now.getFullYear() - 3, now.getMonth(), 1);
      const quarterlyData = data.data
        .filter(d => new Date(d.date) >= cutoff && d.type === 'quarterly')
        .slice(-12);
      // If no quarterly data, fall back to annual
      if (quarterlyData.length > 0) return quarterlyData;
      // Fallback to annual for stocks without quarterly data (e.g., European)
      const annualCutoff = new Date(now.getFullYear() - 10, 0, 1);
      return data.data
        .filter(d => new Date(d.date) >= annualCutoff && d.type === 'annual')
        .slice(-10);
    }

    // Annual data view - strictly show annual data
    const annualCutoff = new Date(now.getFullYear() - 10, 0, 1);
    return data.data
      .filter(d => new Date(d.date) >= annualCutoff && d.type === 'annual')
      .slice(-10);
  };

  const chartData = getFilteredData();
  const currency = data?.currency || 'USD';

  // Calculate YoY or TTM change depending on data type
  const getTTMChange = () => {
    if (!chartData || chartData.length < 2) return null;

    // Check if we have quarterly or annual data
    const isQuarterly = chartData[0]?.type === 'quarterly';

    if (isQuarterly && chartData.length >= 8) {
      // TTM calculation for quarterly data
      const currentTTM = chartData.slice(-4).reduce((sum, d) => sum + d.value, 0);
      const previousTTM = chartData.slice(-8, -4).reduce((sum, d) => sum + d.value, 0);
      if (previousTTM === 0) return null;
      return ((currentTTM - previousTTM) / Math.abs(previousTTM)) * 100;
    } else if (chartData.length >= 2) {
      // YoY calculation for annual data or limited quarterly data
      const current = chartData[chartData.length - 1].value;
      const previous = chartData[chartData.length - 2].value;
      if (previous === 0) return null;
      return ((current - previous) / Math.abs(previous)) * 100;
    }
    return null;
  };

  const ttmChange = getTTMChange();

  return (
    <button
      onClick={onExpand}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors cursor-pointer text-left w-full ${dragOverClass}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
          {ttmChange !== null && (
            <span className={`inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded mt-1 ${
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
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <XAxis
                  dataKey="quarter"
                  tick={{ fontSize: 8, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
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
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
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
                  interval={0}
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

export function PriceMiniChart({ priceData, previousClose, currency, onExpand, isLoading, isDragOver, onDragStart, onDragEnd, onDragOver, onDrop }: PriceChartProps) {
  const { language } = useLanguage();
  const dragOverClass = isDragOver ? 'ring-2 ring-purple-500 ring-offset-2' : '';

  if (isLoading) {
    return (
      <div
        className={`bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 ${dragOverClass}`}
        draggable={!!onDragStart}
        onDragStart={onDragStart as React.DragEventHandler<HTMLDivElement>}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver as React.DragEventHandler<HTMLDivElement>}
        onDrop={onDrop as React.DragEventHandler<HTMLDivElement>}
      >
        <div className="h-[150px] flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      </div>
    );
  }

  if (!priceData || priceData.length === 0) {
    return (
      <div
        className={`bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 ${dragOverClass}`}
        draggable={!!onDragStart}
        onDragStart={onDragStart as React.DragEventHandler<HTMLDivElement>}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver as React.DragEventHandler<HTMLDivElement>}
        onDrop={onDrop as React.DragEventHandler<HTMLDivElement>}
      >
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
      draggable={!!onDragStart}
      onDragStart={onDragStart as React.DragEventHandler<HTMLButtonElement | HTMLDivElement>}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver as React.DragEventHandler<HTMLButtonElement | HTMLDivElement>}
      onDrop={onDrop as React.DragEventHandler<HTMLButtonElement | HTMLDivElement>}
      className={`bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-slate-200 dark:border-slate-700 text-left w-full ${dragOverClass} ${
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
          <AreaChart data={priceData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
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

type DataViewType = 'quarterly' | 'annual';

// Card IDs for financial charts
const ALL_FINANCIAL_CARD_IDS = [
  'price',
  'Revenue',
  'NetIncome',
  'GrossProfit',
  'OperatingIncome',
  'EBITDA',
  'EPS',
] as const;

type FinancialCardId = typeof ALL_FINANCIAL_CARD_IDS[number];

// Grid has 9 slots (3x3), some can be empty (null)
const FINANCIAL_GRID_SIZE = 9;
type FinancialGridSlot = FinancialCardId | null;
const DEFAULT_FINANCIAL_GRID: FinancialGridSlot[] = [...ALL_FINANCIAL_CARD_IDS, null, null];

const fetchFinancialCardOrder = async (): Promise<FinancialGridSlot[] | null> => {
  const response = await axios.get('/api/preferences/financial-card-order');
  return response.data.order;
};

const saveFinancialCardOrder = async (order: FinancialGridSlot[]): Promise<void> => {
  await axios.put('/api/preferences/financial-card-order', { order });
};

interface FinancialsMiniChartsProps {
  ticker: string;
  priceData?: { timestamp: string; price: number }[];
  previousClose?: number | null;
  priceCurrency?: string;
  priceLoading?: boolean;
  dataView: DataViewType;
  onDataViewChange: (view: DataViewType) => void;
  onMetricClick: (metric: string, label: string) => void;
  onPriceClick?: () => void;
}

export function FinancialsMiniCharts({ ticker, priceData, previousClose, priceCurrency, priceLoading, dataView, onDataViewChange, onMetricClick, onPriceClick }: FinancialsMiniChartsProps) {
  const { language } = useLanguage();
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Grid slots state (9 slots, some can be empty)
  const [gridSlots, setGridSlots] = useState<FinancialGridSlot[]>([...DEFAULT_FINANCIAL_GRID]);

  // Drag & drop state
  const [draggedCardId, setDraggedCardId] = useState<FinancialCardId | null>(null);
  const [dragOverSlotIndex, setDragOverSlotIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLElement | null>(null);

  // Fetch card order
  const { data: savedCardOrder } = useQuery({
    queryKey: ['financial-card-order'],
    queryFn: fetchFinancialCardOrder,
    enabled: isAuthenticated,
    staleTime: Infinity,
  });

  // Save card order mutation
  const saveOrderMutation = useMutation({
    mutationFn: saveFinancialCardOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-card-order'] });
    },
  });

  // Update grid slots when loaded from server
  useEffect(() => {
    if (savedCardOrder && savedCardOrder.length > 0) {
      // Validate slots - keep valid card IDs and nulls
      const validSlots: FinancialGridSlot[] = savedCardOrder.map(slot =>
        slot === null || ALL_FINANCIAL_CARD_IDS.includes(slot as FinancialCardId) ? slot as FinancialGridSlot : null
      );
      // Ensure we have exactly FINANCIAL_GRID_SIZE slots
      while (validSlots.length < FINANCIAL_GRID_SIZE) validSlots.push(null);
      // Find any missing cards and add them to empty slots
      const presentCards = validSlots.filter((s): s is FinancialCardId => s !== null);
      const missingCards = ALL_FINANCIAL_CARD_IDS.filter(id => !presentCards.includes(id));
      for (const card of missingCards) {
        const emptyIndex = validSlots.findIndex(s => s === null);
        if (emptyIndex !== -1) validSlots[emptyIndex] = card;
      }
      setGridSlots(validSlots.slice(0, FINANCIAL_GRID_SIZE));
    }
  }, [savedCardOrder]);

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, cardId: FinancialCardId, node: HTMLElement) => {
    setDraggedCardId(cardId);
    dragNodeRef.current = node;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cardId);
    setTimeout(() => {
      if (dragNodeRef.current) {
        dragNodeRef.current.style.opacity = '0.4';
      }
    }, 0);
  };

  const handleDragEnd = () => {
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = '1';
    }
    setDraggedCardId(null);
    setDragOverSlotIndex(null);
    dragNodeRef.current = null;
  };

  const handleSlotDragOver = (e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverSlotIndex !== slotIndex) {
      setDragOverSlotIndex(slotIndex);
    }
  };

  const handleSlotDrop = (e: React.DragEvent, targetSlotIndex: number) => {
    e.preventDefault();

    const draggedId = draggedCardId;
    handleDragEnd();

    if (draggedId === null) return;

    const draggedSlotIndex = gridSlots.findIndex(slot => slot === draggedId);
    if (draggedSlotIndex === -1 || draggedSlotIndex === targetSlotIndex) return;

    const newSlots = [...gridSlots];
    // Swap: dragged card goes to target slot, target slot content goes to dragged slot
    [newSlots[draggedSlotIndex], newSlots[targetSlotIndex]] = [newSlots[targetSlotIndex], newSlots[draggedSlotIndex]];
    setGridSlots(newSlots);
    saveOrderMutation.mutate(newSlots);
  };

  const metrics: Record<string, { title: string; chartType: 'bar' | 'area'; color: string }> = {
    Revenue: { title: language === 'fr' ? 'Chiffre d\'affaires (TTM)' : 'Revenue (TTM)', chartType: 'bar', color: '#f97316' },
    NetIncome: { title: language === 'fr' ? 'Résultat net (TTM)' : 'Net Income (TTM)', chartType: 'bar', color: '#f97316' },
    GrossProfit: { title: language === 'fr' ? 'Marge brute (TTM)' : 'Gross Profit (TTM)', chartType: 'bar', color: '#22c55e' },
    OperatingIncome: { title: language === 'fr' ? 'Résultat opérationnel (TTM)' : 'Operating Income (TTM)', chartType: 'bar', color: '#3b82f6' },
    EBITDA: { title: 'EBITDA (TTM)', chartType: 'bar', color: '#8b5cf6' },
    EPS: { title: 'EPS (TTM)', chartType: 'bar', color: '#06b6d4' },
  };

  // Render a grid slot (card or empty)
  const renderSlot = (slotIndex: number) => {
    const cardId = gridSlots[slotIndex];
    const isDragOver = dragOverSlotIndex === slotIndex;

    // Empty slot
    if (cardId === null) {
      return (
        <div
          key={`empty-${slotIndex}`}
          className={`rounded-xl h-[180px] transition-colors ${isDragOver ? 'bg-slate-200 dark:bg-slate-700/50 ring-2 ring-purple-500' : ''}`}
          onDragOver={(e) => handleSlotDragOver(e, slotIndex)}
          onDrop={(e) => handleSlotDrop(e, slotIndex)}
        />
      );
    }

    // Price chart
    if (cardId === 'price') {
      return (
        <PriceMiniChart
          key={cardId}
          priceData={priceData}
          previousClose={previousClose ?? null}
          currency={priceCurrency || 'USD'}
          onExpand={onPriceClick}
          isLoading={priceLoading}
          isDragOver={isDragOver}
          onDragStart={(e) => handleDragStart(e, cardId, e.currentTarget as HTMLElement)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleSlotDragOver(e, slotIndex)}
          onDrop={(e) => handleSlotDrop(e, slotIndex)}
        />
      );
    }

    // Financial metric charts
    const metricConfig = metrics[cardId];
    if (!metricConfig) return null;

    return (
      <MiniChart
        key={`${cardId}-${dataView}`}
        ticker={ticker}
        metric={cardId}
        title={metricConfig.title}
        chartType={metricConfig.chartType}
        color={metricConfig.color}
        dataView={dataView}
        onExpand={() => onMetricClick(cardId, metricConfig.title)}
        isDragOver={isDragOver}
        onDragStart={(e) => handleDragStart(e, cardId, e.currentTarget)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleSlotDragOver(e, slotIndex)}
        onDrop={(e) => handleSlotDrop(e, slotIndex)}
      />
    );
  };

  return (
    <div className="space-y-4">
      {/* Data View Toggle - Centered */}
      <div className="flex justify-center">
        <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600">
          <button
            onClick={() => onDataViewChange('quarterly')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              dataView === 'quarterly'
                ? 'bg-green-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
            }`}
          >
            {language === 'fr' ? 'Trimestriel' : 'Quarterly'}
          </button>
          <button
            onClick={() => onDataViewChange('annual')}
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {gridSlots.map((_, index) => renderSlot(index))}
      </div>
    </div>
  );
}
