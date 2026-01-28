// Stock detail panel - view individual stock info and price chart

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ArrowLeft, Loader2, TrendingUp, ExternalLink, MessageSquare, Send, ChevronDown, ChevronUp, Youtube, Calendar, RefreshCw, X, ZoomOut } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useAuth } from '../../../contexts/AuthContext';
import { findStockByTicker } from '../utils/allStocks';
import { getCompanyLogoUrl } from '../utils/companyLogos';
import { getCompanyIRUrl } from '../utils/companyIRLinks';
import { addRecentStock } from '../utils/recentStocks';
import { StockSearchBar } from '../components/StockSearchBar';

interface StockHistoryData {
  ticker: string;
  period: string;
  previous_close: number | null;
  currency: string;
  data: { timestamp: string; price: number }[];
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

// Currency symbols for display
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CHF: 'CHF ',
  DKK: 'kr ',
  SEK: 'kr ',
  NOK: 'kr ',
};

const getCurrencySymbol = (currency: string): string => {
  return CURRENCY_SYMBOLS[currency] || `${currency} `;
};

interface Video {
  video_id: string;
  channel_name: string;
  title: string;
  description?: string;
  thumbnail_url: string;
  published_at: string;
  url: string;
}

interface NewsFeedResponse {
  videos: Video[];
  total: number;
  from_cache: boolean;
}

type ChartPeriod = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y' | 'MAX' | `Y${number}`;

// Generate year options (current year down to 2015)
const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: currentYear - 2014 }, (_, i) => currentYear - i);

// Mock data for Tesla - used for logged-off preview
const TESLA_MOCK_DATA = {
  stockHistory: {
    ticker: 'TSLA',
    period: '1M',
    previous_close: 421.06,
    currency: 'USD',
    data: [
      { timestamp: '2024-12-23', price: 421.06 },
      { timestamp: '2024-12-24', price: 462.28 },
      { timestamp: '2024-12-26', price: 454.13 },
      { timestamp: '2024-12-27', price: 442.85 },
      { timestamp: '2024-12-30', price: 417.41 },
      { timestamp: '2024-12-31', price: 410.44 },
      { timestamp: '2025-01-02', price: 379.28 },
      { timestamp: '2025-01-03', price: 391.90 },
      { timestamp: '2025-01-06', price: 394.36 },
      { timestamp: '2025-01-07', price: 378.87 },
      { timestamp: '2025-01-08', price: 386.31 },
      { timestamp: '2025-01-10', price: 390.98 },
      { timestamp: '2025-01-13', price: 391.59 },
      { timestamp: '2025-01-14', price: 398.11 },
      { timestamp: '2025-01-15', price: 411.05 },
      { timestamp: '2025-01-16', price: 413.42 },
      { timestamp: '2025-01-17', price: 401.37 },
      { timestamp: '2025-01-21', price: 424.07 },
    ],
  } as StockHistoryData,
  marketCap: {
    ticker: 'TSLA',
    name: 'Tesla, Inc.',
    market_cap: 1430000000000,
    currency: 'USD',
    trailing_pe: 293.5,
    forward_pe: 198.7,
    dividend_yield: null,
    beta: 1.83,
    price_to_book: 17.93,
    trailing_eps: 1.47,
    profit_margin: 0.053,
    return_on_equity: 0.068,
    fifty_two_week_high: 498.83,
    fifty_two_week_low: 214.25,
    revenue_growth: 0.116,
  } as MarketCapData,
  newsFeed: {
    videos: [
      {
        video_id: 'XrpVjpGVcfI',
        channel_name: 'CNBC Television',
        title: 'Tesla Q4 deliveries fall short of expectations',
        thumbnail_url: 'https://i.ytimg.com/vi/XrpVjpGVcfI/mqdefault.jpg',
        published_at: '2025-01-20T14:00:00Z',
        url: 'https://youtube.com/watch?v=XrpVjpGVcfI',
      },
      {
        video_id: 'YAtLTLiqNwg',
        channel_name: 'Bloomberg Television',
        title: 'Tesla\'s Musk Unveils Cybercab Robotaxi',
        thumbnail_url: 'https://i.ytimg.com/vi/YAtLTLiqNwg/mqdefault.jpg',
        published_at: '2025-01-18T10:30:00Z',
        url: 'https://youtube.com/watch?v=YAtLTLiqNwg',
      },
      {
        video_id: 'cdZZpaB2kDM',
        channel_name: 'Yahoo Finance',
        title: 'Why Tesla\'s stock is up over 65% year to date',
        thumbnail_url: 'https://i.ytimg.com/vi/cdZZpaB2kDM/mqdefault.jpg',
        published_at: '2025-01-15T16:00:00Z',
        url: 'https://youtube.com/watch?v=cdZZpaB2kDM',
      },
    ],
    total: 3,
    from_cache: true,
  } as NewsFeedResponse,
};

const fetchStockHistory = async (ticker: string, period: ChartPeriod): Promise<StockHistoryData> => {
  const response = await axios.get(`/api/investing/stock-history/${ticker}?period=${period}`);
  return response.data;
};

const fetchMarketCap = async (ticker: string): Promise<MarketCapData> => {
  const response = await axios.get(`/api/investing/market-cap?tickers=${ticker}`);
  return response.data.stocks[ticker];
};

const fetchNewsFeed = async (ticker: string, companyName: string): Promise<NewsFeedResponse> => {
  const response = await axios.get('/api/investing/news-feed', {
    params: { ticker, company_name: companyName, limit: 10 }
  });
  return response.data;
};

const formatMarketCap = (marketCap: number | null, currency: string = 'USD'): string => {
  if (!marketCap) return '-';
  const symbol = getCurrencySymbol(currency);
  if (marketCap >= 1e12) return `${symbol}${(marketCap / 1e12).toFixed(2)}T`;
  if (marketCap >= 1e9) return `${symbol}${(marketCap / 1e9).toFixed(1)}B`;
  if (marketCap >= 1e6) return `${symbol}${(marketCap / 1e6).toFixed(0)}M`;
  return `${symbol}${marketCap.toLocaleString()}`;
};

function formatDate(dateStr: string, language: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) {
    return language === 'fr' ? "À l'instant" : 'Just now';
  } else if (diffHours < 24) {
    return language === 'fr' ? `Il y a ${diffHours}h` : `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return language === 'fr' ? `Il y a ${diffDays}j` : `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
}

export function StockDetailPanel() {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('1M');
  const [videoFilter, setVideoFilter] = useState<'1M' | '3M' | 'ALL'>('ALL');
  const [financialsExpanded, setFinancialsExpanded] = useState(true);
  const [newsFeedExpanded, setNewsFeedExpanded] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [question, setQuestion] = useState('');

  // Drag-to-zoom state for price chart
  const [zoomRange, setZoomRange] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [dragStart, setDragStart] = useState<string | null>(null);
  const [dragEnd, setDragEnd] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // View history for "Prev." navigation
  type ViewState = { period: ChartPeriod; zoomRange: { startIndex: number; endIndex: number } | null };
  const [viewHistory, setViewHistory] = useState<ViewState[]>([]);
  const skipHistoryRef = useRef(false); // Flag to skip adding to history when navigating back

  // Push current state to history before changing period
  const changePeriod = (newPeriod: ChartPeriod) => {
    if (newPeriod !== chartPeriod) {
      setViewHistory(prev => [...prev, { period: chartPeriod, zoomRange }]);
      setChartPeriod(newPeriod);
      setZoomRange(null);
    }
  };

  // Push current state to history before zooming
  const changeZoom = (newZoomRange: { startIndex: number; endIndex: number } | null) => {
    if (JSON.stringify(newZoomRange) !== JSON.stringify(zoomRange)) {
      setViewHistory(prev => [...prev, { period: chartPeriod, zoomRange }]);
      setZoomRange(newZoomRange);
    }
  };

  // Go back to previous view
  const goBack = () => {
    if (viewHistory.length > 0) {
      const prevState = viewHistory[viewHistory.length - 1];
      setViewHistory(prev => prev.slice(0, -1));
      skipHistoryRef.current = true;
      setChartPeriod(prevState.period);
      setZoomRange(prevState.zoomRange);
    }
  };

  // Reset zoom when period changes (but not when navigating back)
  useEffect(() => {
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
    }
  }, [chartPeriod]);

  // Use TSLA as preview ticker when not authenticated
  const upperTicker = isAuthenticated ? (ticker?.toUpperCase() || '') : 'TSLA';
  const stock = findStockByTicker(upperTicker);
  const logoUrl = getCompanyLogoUrl(upperTicker);
  const irLink = getCompanyIRUrl(upperTicker);

  // Track stock visit in recently searched
  useEffect(() => {
    if (upperTicker && user?.id && isAuthenticated) {
      addRecentStock(upperTicker, user.id);
    }
  }, [upperTicker, user?.id, isAuthenticated]);

  // Fetch stock history - only when authenticated
  const { data: fetchedStockHistoryData, isLoading: stockHistoryLoading } = useQuery({
    queryKey: ['stockHistory', upperTicker, chartPeriod],
    queryFn: () => fetchStockHistory(upperTicker, chartPeriod),
    enabled: !!upperTicker && isAuthenticated,
  });

  // Fetch market cap - only when authenticated
  const { data: fetchedMarketCapData, isLoading: marketCapLoading } = useQuery({
    queryKey: ['marketCap', upperTicker],
    queryFn: () => fetchMarketCap(upperTicker),
    enabled: !!upperTicker && isAuthenticated,
  });

  // Use mock data when not authenticated, real data when authenticated
  const stockHistoryData = isAuthenticated ? fetchedStockHistoryData : TESLA_MOCK_DATA.stockHistory;
  const marketCapData = isAuthenticated ? fetchedMarketCapData : TESLA_MOCK_DATA.marketCap;

  const displayName = marketCapData?.name || stock?.name || upperTicker;

  // Fetch news feed - enabled for both authenticated users and TSLA preview
  const { data: fetchedNewsData, isLoading: newsLoading, refetch: refetchNews, isFetching: newsFetching } = useQuery({
    queryKey: ['newsFeed', upperTicker, displayName],
    queryFn: () => fetchNewsFeed(upperTicker, displayName),
    enabled: !!upperTicker && !!displayName,
    staleTime: 1000 * 60 * 15,
  });

  // Use fetched data, fall back to mock only if not available
  const newsData = fetchedNewsData || TESLA_MOCK_DATA.newsFeed;

  const currentPrice = stockHistoryData?.data?.length
    ? stockHistoryData.data[stockHistoryData.data.length - 1].price
    : null;
  const previousClose = stockHistoryData?.previous_close;
  // Get currency from history data or market cap data, default to USD
  const currency = stockHistoryData?.currency || marketCapData?.currency || 'USD';
  const currencySymbol = getCurrencySymbol(currency);

  // Track stock view (time spent) - only when authenticated
  const viewStartTime = useRef<number>(Date.now());
  useEffect(() => {
    if (!upperTicker || !isAuthenticated) return;

    viewStartTime.current = Date.now();

    return () => {
      const timeSpentSeconds = Math.round((Date.now() - viewStartTime.current) / 1000);
      if (timeSpentSeconds > 2) {
        axios.post('/api/investing/stock-view', {
          ticker: upperTicker,
          time_spent_seconds: timeSpentSeconds
        }).catch(() => {});
      }
    };
  }, [upperTicker, isAuthenticated]);

  const priceChange = currentPrice && previousClose ? currentPrice - previousClose : null;
  const priceChangePercent = priceChange && previousClose ? (priceChange / previousClose) * 100 : null;

  // Auth loading state
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-green-500 animate-spin" />
      </div>
    );
  }

  // No ticker selected (only applies when authenticated, since we use TSLA for preview)
  if (isAuthenticated && !ticker) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-slate-400">{language === 'fr' ? 'Aucune action sélectionnée' : 'No stock selected'}</p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-6 mt-4"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{language === 'fr' ? 'Retour' : 'Back'}</span>
      </button>

      {/* Search Bar with Title */}
      <div className="max-w-3xl mx-auto mb-6">
        <div className="flex flex-col items-center gap-2 mb-6">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            {language === 'fr' ? 'Recherche d\'actions' : 'Stock Research'}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-lg italic">
            {language === 'fr' ? 'Recherchez 2 500+ actions sur 8 marchés mondiaux' : 'Research 2,500+ stocks across 8 global markets'}
          </p>
        </div>
        <StockSearchBar />
      </div>

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Stock Header */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-lg bg-white dark:bg-slate-600 flex items-center justify-center overflow-hidden flex-shrink-0 border border-slate-200 dark:border-slate-500">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${upperTicker} logo`}
                  className="w-14 h-14 object-contain"
                  onError={(e) => {
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      parent.innerHTML = `<span class="text-xl font-bold text-slate-400">${upperTicker.slice(0, 2)}</span>`;
                    }
                  }}
                />
              ) : (
                <span className="text-xl font-bold text-slate-400">{upperTicker.slice(0, 2)}</span>
              )}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{displayName}</h1>
              <p className="text-slate-600 dark:text-slate-300">{upperTicker}</p>
            </div>
            <div className="text-right">
              {currentPrice !== null && (
                <>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {currencySymbol}{currentPrice.toFixed(2)}
                  </p>
                  {priceChange !== null && priceChangePercent !== null && (
                    <p className={`text-sm font-medium ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {priceChange >= 0 ? '+' : ''}{currencySymbol}{Math.abs(priceChange).toFixed(2)} ({priceChange >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          {irLink && (
            <div className="flex justify-center mt-4">
              <a
                href={irLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/50 rounded-lg text-sm font-medium transition-colors"
              >
                <span>{language === 'fr' ? 'Site Relations Investisseurs' : 'Investor Relations Website'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>

        {/* Financials (collapsible, contains metrics + price chart) */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl shadow-sm dark:shadow-none overflow-hidden">
          {/* Header - clickable to toggle */}
          <button
            onClick={(e) => {
              setFinancialsExpanded(!financialsExpanded);
              setTimeout(() => e.currentTarget?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 10);
            }}
            className="w-full px-6 py-4 flex items-center gap-3 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
          >
            {financialsExpanded ? (
              <ChevronUp className="w-5 h-5 text-slate-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-slate-500" />
            )}
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {language === 'fr' ? 'Données financières' : 'Financials'}
            </h2>
          </button>

          {/* Collapsible content */}
          {financialsExpanded && (
            <div className="px-6 pt-4 pb-6 space-y-6">
              {/* Metrics */}
              {marketCapLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              ) : (
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                      {language === 'fr' ? 'Cap. boursière' : 'Market Cap'}
                    </p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {formatMarketCap(marketCapData?.market_cap ?? null, currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                      P/E Ratio
                    </p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {marketCapData?.trailing_pe ? marketCapData.trailing_pe.toFixed(1) : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                      {language === 'fr' ? 'P/E prévu' : 'Forward P/E'}
                    </p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {marketCapData?.forward_pe ? marketCapData.forward_pe.toFixed(1) : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                      {language === 'fr' ? 'Rendement div.' : 'Div. Yield'}
                    </p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {marketCapData?.dividend_yield ? `${(marketCapData.dividend_yield * 100).toFixed(2)}%` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                      Beta
                    </p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {marketCapData?.beta ? marketCapData.beta.toFixed(2) : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                      P/B Ratio
                    </p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {marketCapData?.price_to_book ? marketCapData.price_to_book.toFixed(2) : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                      EPS
                    </p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {marketCapData?.trailing_eps ? `${currencySymbol}${marketCapData.trailing_eps.toFixed(2)}` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                      {language === 'fr' ? 'Marge nette' : 'Profit Margin'}
                    </p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {marketCapData?.profit_margin ? `${(marketCapData.profit_margin * 100).toFixed(1)}%` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                      ROE
                    </p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {marketCapData?.return_on_equity ? `${(marketCapData.return_on_equity * 100).toFixed(1)}%` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                      {language === 'fr' ? 'Croiss. CA' : 'Rev. Growth'}
                    </p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {marketCapData?.revenue_growth ? `${(marketCapData.revenue_growth * 100).toFixed(1)}%` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                      52W High
                    </p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {marketCapData?.fifty_two_week_high ? `${currencySymbol}${marketCapData.fifty_two_week_high.toFixed(2)}` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                      52W Low
                    </p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {marketCapData?.fifty_two_week_low ? `${currencySymbol}${marketCapData.fifty_two_week_low.toFixed(2)}` : '-'}
                    </p>
                  </div>
                </div>
              )}

              {/* Price Chart */}
              <div className="bg-slate-800 dark:bg-slate-900 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-green-500" />
                      <h3 className="text-base font-semibold text-white">
                        {language === 'fr' ? 'Historique des prix' : 'Price History'}
                      </h3>
                    </div>
                    {/* Go back to previous view */}
                    <button
                      onClick={goBack}
                      disabled={viewHistory.length === 0}
                      className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors w-fit ml-7 ${
                        viewHistory.length > 0
                          ? 'bg-slate-600 text-slate-200 hover:bg-slate-500'
                          : 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-50'
                      }`}
                      title={language === 'fr' ? 'Vue précédente' : 'Previous view'}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      Prev.
                    </button>
                  </div>
                  {/* Period Selectors */}
                  <div className="flex items-center gap-10">
                    {/* Year selector dropdown */}
                    <select
                      value={chartPeriod.startsWith('Y') ? chartPeriod : ''}
                      onChange={(e) => {
                        if (e.target.value) {
                          changePeriod(e.target.value as ChartPeriod);
                        }
                      }}
                      className={`px-2 py-1 text-xs rounded transition-colors cursor-pointer ${
                        chartPeriod.startsWith('Y')
                          ? 'bg-green-600 text-white font-medium'
                          : 'bg-slate-700 text-slate-400 hover:text-white hover:bg-slate-600'
                      }`}
                    >
                      <option value="" disabled className="bg-slate-800 text-slate-400">
                        {language === 'fr' ? 'Année' : 'Year'}
                      </option>
                      {YEAR_OPTIONS.map((year) => (
                        <option key={year} value={`Y${year}`} className="bg-slate-800 text-white">
                          {year}
                        </option>
                      ))}
                    </select>
                    {/* Period buttons */}
                    <div className="flex gap-1">
                      {(['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'MAX'] as ChartPeriod[]).map((period) => (
                        <button
                          key={period}
                          onClick={() => changePeriod(period)}
                          className={`px-2 py-1 text-xs rounded transition-colors ${
                            chartPeriod === period
                              ? 'bg-green-600 text-white font-medium'
                              : 'text-slate-400 hover:text-white hover:bg-slate-700'
                          }`}
                        >
                          {period}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Chart */}
                {stockHistoryLoading ? (
                  <div className="h-[250px] flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-green-500" />
                  </div>
                ) : stockHistoryData?.data && stockHistoryData.data.length > 0 ? (() => {
                  // Apply zoom if set
                  const fullData = stockHistoryData.data;
                  const displayData = zoomRange
                    ? fullData.slice(zoomRange.startIndex, zoomRange.endIndex + 1)
                    : fullData;

                  // Calculate range in days to determine tick format
                  const rangeDays = displayData.length > 1
                    ? Math.ceil((new Date(displayData[displayData.length - 1].timestamp).getTime() -
                        new Date(displayData[0].timestamp).getTime()) / (1000 * 60 * 60 * 24))
                    : 1;

                  // Determine tick format based on zoom level
                  const getTickFormatter = () => {
                    if (chartPeriod === '1D') {
                      return (ts: string) => {
                        const d = new Date(ts);
                        return d.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
                      };
                    }
                    if (chartPeriod === '5D' && !zoomRange) {
                      return (ts: string) => {
                        const d = new Date(ts);
                        return d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'short' });
                      };
                    }
                    // When zoomed in enough, show daily dates
                    if (rangeDays <= 14) {
                      return (ts: string) => {
                        const d = new Date(ts);
                        return d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });
                      };
                    }
                    if (rangeDays <= 60) {
                      return (ts: string) => {
                        const d = new Date(ts);
                        return d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });
                      };
                    }
                    return (ts: string) => {
                      const d = new Date(ts);
                      return d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });
                    };
                  };

                  // Handle drag events (activeLabel can be string | number | undefined)
                  const handleMouseDown = (e: { activeLabel?: string | number }) => {
                    if (e.activeLabel !== undefined) {
                      const label = String(e.activeLabel);
                      setDragStart(label);
                      setDragEnd(label);
                      setIsDragging(true);
                    }
                  };

                  const handleMouseMove = (e: { activeLabel?: string | number }) => {
                    if (isDragging && e.activeLabel !== undefined) {
                      setDragEnd(String(e.activeLabel));
                    }
                  };

                  const handleMouseUp = () => {
                    if (isDragging && dragStart && dragEnd && dragStart !== dragEnd) {
                      // Find indices in displayData
                      const startIdx = displayData.findIndex(d => d.timestamp === dragStart);
                      const endIdx = displayData.findIndex(d => d.timestamp === dragEnd);

                      if (startIdx !== -1 && endIdx !== -1) {
                        const minIdx = Math.min(startIdx, endIdx);
                        const maxIdx = Math.max(startIdx, endIdx);

                        // Only zoom if selection is at least 2 data points
                        if (maxIdx - minIdx >= 1) {
                          // Convert to full data indices if we're already zoomed
                          const baseStartIdx = zoomRange ? zoomRange.startIndex : 0;
                          changeZoom({
                            startIndex: baseStartIdx + minIdx,
                            endIndex: baseStartIdx + maxIdx
                          });
                        }
                      }
                    }
                    setIsDragging(false);
                    setDragStart(null);
                    setDragEnd(null);
                  };

                  return (
                    <div className="h-[250px] relative">
                      {/* Reset zoom button */}
                      {zoomRange && (
                        <button
                          onClick={() => changeZoom(null)}
                          className="absolute top-0 right-0 z-10 flex items-center gap-1 px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded transition-colors"
                        >
                          <ZoomOut className="w-3 h-3" />
                          {language === 'fr' ? 'Réinitialiser' : 'Reset zoom'}
                        </button>
                      )}
                      {/* Zoom hint */}
                      {!zoomRange && displayData.length > 10 && (
                        <div className="absolute top-0 right-0 z-10 text-[10px] text-slate-500 italic px-2">
                          {language === 'fr' ? '💡 Glissez pour zoomer' : '💡 Drag to zoom'}
                        </div>
                      )}
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={displayData}
                          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                          onMouseDown={handleMouseDown}
                          onMouseMove={handleMouseMove}
                          onMouseUp={handleMouseUp}
                          onMouseLeave={handleMouseUp}
                        >
                          <XAxis
                            dataKey="timestamp"
                            tick={{ fontSize: 10, fill: '#94a3b8' }}
                            tickFormatter={getTickFormatter()}
                            stroke="#475569"
                            axisLine={{ stroke: '#475569' }}
                            tickLine={{ stroke: '#475569' }}
                          />
                          <YAxis
                            domain={['auto', 'auto']}
                            tick={{ fontSize: 10, fill: '#94a3b8' }}
                            stroke="#475569"
                            axisLine={{ stroke: '#475569' }}
                            tickLine={{ stroke: '#475569' }}
                            tickFormatter={(val) => val.toFixed(0)}
                            width={45}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', borderRadius: '8px', border: '1px solid #475569', padding: '8px 12px' }}
                            labelStyle={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}
                            labelFormatter={(ts) => {
                              const d = new Date(String(ts));
                              if (chartPeriod === '1D' || chartPeriod === '5D') {
                                return d.toLocaleString(language === 'fr' ? 'fr-FR' : 'en-US', {
                                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                                });
                              }
                              return d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
                                day: 'numeric', month: 'long', year: 'numeric'
                              });
                            }}
                            formatter={(value) => [`${currencySymbol}${Number(value).toFixed(2)}`, null]}
                            separator=""
                          />
                          {/* Drag selection area */}
                          {isDragging && dragStart && dragEnd && (
                            <ReferenceArea
                              x1={dragStart}
                              x2={dragEnd}
                              strokeOpacity={0.3}
                              fill="#22c55e"
                              fillOpacity={0.2}
                            />
                          )}
                          <Line
                            type="monotone"
                            dataKey="price"
                            stroke="#22c55e"
                            strokeWidth={2}
                            dot={rangeDays <= 30 && displayData.length <= 60}
                            activeDot={{ r: 4, fill: '#22c55e' }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })() : (
                  <div className="h-[250px] flex items-center justify-center text-slate-400">
                    {language === 'fr' ? 'Aucune donnée disponible' : 'No data available'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Youtube Feed */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl shadow-sm dark:shadow-none overflow-hidden">
          {/* Header row with toggle and filters */}
          <div className="px-6 py-4 flex items-center gap-3">
            <button
              onClick={(e) => {
                setNewsFeedExpanded(!newsFeedExpanded);
                setTimeout(() => e.currentTarget?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 10);
              }}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              {newsFeedExpanded ? (
                <ChevronUp className="w-5 h-5 text-slate-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-500" />
              )}
              <Youtube className="w-5 h-5 text-red-500" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {language === 'fr' ? 'Flux Youtube' : 'Youtube Feed'}
              </h2>
            </button>

            {/* Time filter and refresh - always visible */}
            <div className="ml-auto flex items-center gap-3">
              <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-500">
                {(['1M', '3M', 'ALL'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setVideoFilter(filter)}
                    className={`px-2 py-1 text-xs font-medium transition-colors ${
                      videoFilter === filter
                        ? 'bg-red-500 text-white'
                        : 'bg-white dark:bg-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-500'
                    }`}
                  >
                    {filter === 'ALL' ? (language === 'fr' ? 'Tout' : 'All') : filter}
                  </button>
                ))}
              </div>
              <button
                onClick={() => refetchNews()}
                disabled={newsFetching}
                className="text-slate-500 hover:text-blue-600 flex items-center gap-1 text-sm disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${newsFetching ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Collapsible content */}
          {newsFeedExpanded && (
            <div className="px-6 pb-6">

              {newsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : newsData?.videos && newsData.videos.length > 0 ? (() => {
            // Filter videos by time period
            const now = new Date();
            const filteredVideos = newsData.videos.filter((video) => {
              if (videoFilter === 'ALL') return true;
              const publishedDate = new Date(video.published_at);
              const diffDays = Math.floor((now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60 * 24));
              if (videoFilter === '1M') return diffDays <= 30;
              if (videoFilter === '3M') return diffDays <= 90;
              return true;
            });

            if (filteredVideos.length === 0) {
              return (
                <div className="text-center py-8">
                  <Youtube className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                  <p className="text-slate-500 dark:text-slate-400 text-sm">
                    {language === 'fr'
                      ? `Aucune vidéo des ${videoFilter === '1M' ? '30' : '90'} derniers jours`
                      : `No videos from the last ${videoFilter === '1M' ? '30' : '90'} days`}
                  </p>
                </div>
              );
            }

            return (
              <div className="space-y-3 max-h-[260px] overflow-y-auto">
                {filteredVideos.map((video) => (
                  <button
                    key={video.video_id}
                    onClick={() => setSelectedVideo(video)}
                    className="w-full flex gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors group text-left"
                  >
                    {/* Thumbnail */}
                    <div className="relative w-32 h-20 flex-shrink-0 rounded-md overflow-hidden bg-slate-200 dark:bg-slate-600">
                      {video.thumbnail_url ? (
                        <img
                          src={video.thumbnail_url}
                          alt={video.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Youtube className="w-8 h-8 text-slate-400" />
                        </div>
                      )}
                      {/* Play icon overlay */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                        <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <svg className="w-3 h-3 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Video info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {video.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-600 px-2 py-0.5 rounded">{video.channel_name}</span>
                        <span className="flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-600 px-2 py-0.5 rounded">
                          <Calendar className="w-3 h-3" />
                          {formatDate(video.published_at, language)}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            );
          })() : (
                <div className="text-center py-8">
                  <Youtube className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                  <p className="text-slate-500 dark:text-slate-400 text-sm">
                    {language === 'fr'
                      ? `Aucune vidéo trouvée pour ${displayName}`
                      : `No videos found for ${displayName}`}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Ask a Question */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {language === 'fr' ? 'Poser une question' : 'Ask a question'}
            </h2>
          </div>
          <div className="relative">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={language === 'fr'
                ? `Posez une question sur ${upperTicker}...`
                : `Ask a question about ${upperTicker}...`}
              className="w-full h-24 px-4 py-3 pr-12 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              disabled={!question.trim()}
              className="absolute bottom-3 right-3 p-2 bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg transition-colors"
              title={language === 'fr' ? 'Envoyer' : 'Send'}
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            {language === 'fr' ? 'Fonctionnalité bientôt disponible' : 'Feature coming soon'}
          </p>
        </div>
      </div>

      {/* Video Modal */}
      {selectedVideo && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedVideo(null)}
        >
          <div
            className="relative w-full max-w-4xl bg-slate-900 rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setSelectedVideo(null)}
              className="absolute top-3 right-3 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>

            {/* YouTube Embed */}
            <div className="relative pt-[56.25%]">
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube.com/embed/${selectedVideo.video_id}?autoplay=1`}
                title={selectedVideo.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            {/* Video info */}
            <div className="p-4">
              <h3 className="text-lg font-semibold text-white mb-2">{selectedVideo.title}</h3>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-300">{selectedVideo.channel_name}</span>
                <span className="text-slate-500">·</span>
                <span className="text-sm text-slate-400">{formatDate(selectedVideo.published_at, language)}</span>
                <a
                  href={selectedVideo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-sm text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <Youtube className="w-4 h-4" />
                  {language === 'fr' ? 'Ouvrir sur YouTube' : 'Open on YouTube'}
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
