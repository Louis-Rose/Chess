// Stock detail panel - view individual stock info and price chart

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ArrowLeft, Loader2, TrendingUp, ExternalLink, MessageSquare, Send, ChevronDown, ChevronUp, Youtube, Calendar, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useAuth } from '../../../contexts/AuthContext';
import { LoginButton } from '../../../components/LoginButton';
import { findStockByTicker } from '../utils/allStocks';
import { getCompanyLogoUrl } from '../utils/companyLogos';
import { getCompanyIRUrl } from '../utils/companyIRLinks';

interface StockHistoryData {
  ticker: string;
  period: string;
  previous_close: number | null;
  data: { timestamp: string; price: number }[];
}

interface MarketCapData {
  ticker: string;
  name: string;
  market_cap: number | null;
  trailing_pe: number | null;
  forward_pe: number | null;
}

interface Video {
  video_id: string;
  channel_name: string;
  title: string;
  thumbnail_url: string;
  published_at: string;
  url: string;
}

interface NewsFeedResponse {
  videos: Video[];
  total: number;
  from_cache: boolean;
}

type ChartPeriod = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y' | 'MAX';

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

const formatMarketCap = (marketCap: number | null): string => {
  if (!marketCap) return '-';
  if (marketCap >= 1e12) return `$${(marketCap / 1e12).toFixed(2)}T`;
  if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(1)}B`;
  if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(0)}M`;
  return `$${marketCap.toLocaleString()}`;
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
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('1M');
  const [videoFilter, setVideoFilter] = useState<'1M' | '3M' | 'ALL'>('ALL');
  const [financialsExpanded, setFinancialsExpanded] = useState(true);
  const [question, setQuestion] = useState('');

  const upperTicker = ticker?.toUpperCase() || '';
  const stock = findStockByTicker(upperTicker);
  const logoUrl = getCompanyLogoUrl(upperTicker);
  const irLink = getCompanyIRUrl(upperTicker);

  // Fetch stock history - only when authenticated
  const { data: stockHistoryData, isLoading: stockHistoryLoading } = useQuery({
    queryKey: ['stockHistory', upperTicker, chartPeriod],
    queryFn: () => fetchStockHistory(upperTicker, chartPeriod),
    enabled: !!upperTicker && isAuthenticated,
  });

  // Fetch market cap - only when authenticated
  const { data: marketCapData, isLoading: marketCapLoading } = useQuery({
    queryKey: ['marketCap', upperTicker],
    queryFn: () => fetchMarketCap(upperTicker),
    enabled: !!upperTicker && isAuthenticated,
  });

  const displayName = marketCapData?.name || stock?.name || upperTicker;

  // Fetch news feed - only when authenticated
  const { data: newsData, isLoading: newsLoading, refetch: refetchNews, isFetching: newsFetching } = useQuery({
    queryKey: ['newsFeed', upperTicker, displayName],
    queryFn: () => fetchNewsFeed(upperTicker, displayName),
    enabled: !!upperTicker && !!displayName && isAuthenticated,
    staleTime: 1000 * 60 * 15,
  });

  const currentPrice = stockHistoryData?.data?.length
    ? stockHistoryData.data[stockHistoryData.data.length - 1].price
    : null;
  const previousClose = stockHistoryData?.previous_close;

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

  // Not authenticated - show sign-in prompt
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center py-8 md:py-16">
        <h1 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-slate-100 text-center px-4">
          {language === 'fr' ? 'Recherche Actions' : 'Stocks Research'}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-4 text-center px-4">
          {language === 'fr' ? 'Connectez-vous pour accéder à la recherche' : 'Sign in to access stock research'}
        </p>
        <div className="mt-8">
          <LoginButton />
        </div>
      </div>
    );
  }

  if (!ticker) {
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
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{upperTicker}</h1>
                {irLink && (
                  <a
                    href={irLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                  >
                    <span>{language === 'fr' ? 'Relations Investisseurs' : 'Investor Relations'}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
              <p className="text-slate-600 dark:text-slate-300">{displayName}</p>
            </div>
            <div className="text-right">
              {currentPrice !== null && (
                <>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    ${currentPrice.toFixed(2)}
                  </p>
                  {priceChange !== null && priceChangePercent !== null && (
                    <p className={`text-sm font-medium ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)} ({priceChange >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Financials (collapsible, contains metrics + price chart) */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl shadow-sm dark:shadow-none overflow-hidden">
          {/* Header - clickable to toggle */}
          <button
            onClick={() => setFinancialsExpanded(!financialsExpanded)}
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
            <div className="px-6 pb-6 space-y-6">
              {/* Metrics */}
              {marketCapLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                      {language === 'fr' ? 'Cap. boursière' : 'Market Cap'}
                    </p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {formatMarketCap(marketCapData?.market_cap ?? null)}
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
                </div>
              )}

              {/* Price Chart */}
              <div className="bg-slate-800 dark:bg-slate-900 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-green-500" />
                    <h3 className="text-base font-semibold text-white">
                      {language === 'fr' ? 'Historique des prix' : 'Price History'}
                    </h3>
                  </div>
                  {/* Period Selectors */}
                  <div className="flex gap-1">
                    {(['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'MAX'] as ChartPeriod[]).map((period) => (
                      <button
                        key={period}
                        onClick={() => setChartPeriod(period)}
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

                {/* Chart */}
                {stockHistoryLoading ? (
                  <div className="h-[250px] flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-green-500" />
                  </div>
                ) : stockHistoryData?.data && stockHistoryData.data.length > 0 ? (
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={stockHistoryData.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <XAxis
                          dataKey="timestamp"
                          tick={{ fontSize: 10, fill: '#94a3b8' }}
                          tickFormatter={(ts) => {
                            const d = new Date(ts);
                            if (chartPeriod === '1D') {
                              return d.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
                            }
                            if (chartPeriod === '5D') {
                              return d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'short' });
                            }
                            return d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });
                          }}
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
                          formatter={(value) => [`$${Number(value).toFixed(2)}`, null]}
                          separator=""
                        />
                        {stockHistoryData.previous_close && (
                          <ReferenceLine
                            y={stockHistoryData.previous_close}
                            stroke="#64748b"
                            strokeDasharray="4 4"
                            label={{
                              value: 'P',
                              position: 'right',
                              fill: '#64748b',
                              fontSize: 10,
                            }}
                          />
                        )}
                        <Line
                          type="monotone"
                          dataKey="price"
                          stroke="#22c55e"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, fill: '#22c55e' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-slate-400">
                    {language === 'fr' ? 'Aucune donnée disponible' : 'No data available'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* News Feed */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Youtube className="w-5 h-5 text-red-500" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {language === 'fr' ? 'Actualités' : 'News Feed'}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              {/* Time filter */}
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
              <div className="space-y-3">
                {filteredVideos.map((video) => (
                  <a
                    key={video.video_id}
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors group"
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
                        <span className="text-xs text-slate-500 dark:text-slate-400">{video.channel_name}</span>
                        <span className="text-slate-400 dark:text-slate-500">·</span>
                        <span className="flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-600 px-2 py-0.5 rounded">
                          <Calendar className="w-3 h-3" />
                          {formatDate(video.published_at, language)}
                        </span>
                      </div>
                    </div>
                  </a>
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
    </div>
  );
}
