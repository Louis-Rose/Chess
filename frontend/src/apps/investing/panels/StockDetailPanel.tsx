// Stock detail panel - view individual stock info and price chart

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ArrowLeft, Loader2, TrendingUp, ExternalLink, MessageSquare, Send } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useLanguage } from '../../../contexts/LanguageContext';
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

type ChartPeriod = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y' | 'MAX';

const fetchStockHistory = async (ticker: string, period: ChartPeriod): Promise<StockHistoryData> => {
  const response = await axios.get(`/api/investing/stock-history/${ticker}?period=${period}`);
  return response.data;
};

const fetchMarketCap = async (ticker: string): Promise<MarketCapData> => {
  const response = await axios.get(`/api/investing/market-cap?tickers=${ticker}`);
  return response.data.stocks[ticker];
};

const formatMarketCap = (marketCap: number | null): string => {
  if (!marketCap) return '-';
  if (marketCap >= 1e12) return `$${(marketCap / 1e12).toFixed(2)}T`;
  if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(1)}B`;
  if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(0)}M`;
  return `$${marketCap.toLocaleString()}`;
};

export function StockDetailPanel() {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('1M');

  const [question, setQuestion] = useState('');

  const upperTicker = ticker?.toUpperCase() || '';
  const stock = findStockByTicker(upperTicker);
  const logoUrl = getCompanyLogoUrl(upperTicker);
  const irLink = getCompanyIRUrl(upperTicker);

  // Fetch stock history
  const { data: stockHistoryData, isLoading: stockHistoryLoading } = useQuery({
    queryKey: ['stockHistory', upperTicker, chartPeriod],
    queryFn: () => fetchStockHistory(upperTicker, chartPeriod),
    enabled: !!upperTicker,
  });

  // Fetch market cap
  const { data: marketCapData, isLoading: marketCapLoading } = useQuery({
    queryKey: ['marketCap', upperTicker],
    queryFn: () => fetchMarketCap(upperTicker),
    enabled: !!upperTicker,
  });

  const displayName = marketCapData?.name || stock?.name || upperTicker;
  const currentPrice = stockHistoryData?.data?.length
    ? stockHistoryData.data[stockHistoryData.data.length - 1].price
    : null;
  const previousClose = stockHistoryData?.previous_close;
  const priceChange = currentPrice && previousClose ? currentPrice - previousClose : null;
  const priceChangePercent = priceChange && previousClose ? (priceChange / previousClose) * 100 : null;

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

        {/* Financials */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
            {language === 'fr' ? 'Données financières' : 'Financials'}
          </h2>
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
                  P/E
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
        </div>

        {/* Price Chart */}
        <div className="bg-slate-800 dark:bg-slate-900 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              <h2 className="text-lg font-semibold text-white">
                {language === 'fr' ? 'Historique des prix' : 'Price History'}
              </h2>
            </div>
            {/* Period Selectors */}
            <div className="flex gap-1">
              {(['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'MAX'] as ChartPeriod[]).map((period) => (
                <button
                  key={period}
                  onClick={() => setChartPeriod(period)}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
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
            <div className="h-[300px] flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-green-500" />
            </div>
          ) : stockHistoryData?.data && stockHistoryData.data.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stockHistoryData.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="timestamp"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
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
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    stroke="#475569"
                    axisLine={{ stroke: '#475569' }}
                    tickLine={{ stroke: '#475569' }}
                    tickFormatter={(val) => val.toFixed(0)}
                    width={50}
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
                        value: language === 'fr' ? 'Clôture préc.' : 'Prev close',
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
            <div className="h-[300px] flex items-center justify-center text-slate-400">
              {language === 'fr' ? 'Aucune donnée disponible' : 'No data available'}
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
