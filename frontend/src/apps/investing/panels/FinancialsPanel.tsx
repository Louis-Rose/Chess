// Financials panel - search S&P 500 stocks and view market cap

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { TrendingUp, Search, X, Loader2, Eye } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { searchStocks, SP500_STOCKS, type Stock } from '../utils/sp500';
import { getCompanyLogoUrl } from '../utils/companyLogos';

interface MarketCapData {
  ticker: string;
  name: string;
  market_cap: number | null;
  error?: string;
}

const fetchMarketCap = async (tickers: string[]): Promise<{ stocks: Record<string, MarketCapData> }> => {
  if (tickers.length === 0) return { stocks: {} };
  const response = await axios.get(`/api/investing/market-cap?tickers=${tickers.join(',')}`);
  return response.data;
};

const fetchWatchlist = async (): Promise<{ symbols: string[] }> => {
  const response = await axios.get('/api/investing/watchlist');
  return response.data;
};

const formatMarketCap = (marketCap: number | null): string => {
  if (!marketCap) return '-';
  if (marketCap >= 1e12) return `$${(marketCap / 1e12).toFixed(2)}T`;
  if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(1)}B`;
  if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(0)}M`;
  return `$${marketCap.toLocaleString()}`;
};

export function FinancialsPanel() {
  const { isAuthenticated } = useAuth();
  const { language } = useLanguage();
  const [stockSearch, setStockSearch] = useState('');
  const [stockResults, setStockResults] = useState<Stock[]>([]);
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const stockDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch watchlist
  const { data: watchlistData } = useQuery({
    queryKey: ['watchlist'],
    queryFn: fetchWatchlist,
    enabled: isAuthenticated,
  });

  const watchlist = watchlistData?.symbols ?? [];

  // Fetch market cap for selected tickers
  const { data: marketCapData, isLoading: marketCapLoading } = useQuery({
    queryKey: ['marketCap', selectedTickers],
    queryFn: () => fetchMarketCap(selectedTickers),
    enabled: selectedTickers.length > 0,
  });

  // Stock search effect
  useEffect(() => {
    const results = searchStocks(stockSearch);
    setStockResults(results);
    // Show dropdown if there are search results OR if empty and we have watchlist items
    setShowStockDropdown((results.length > 0 && stockSearch.length > 0) || (stockSearch.length === 0 && watchlist.length > 0));
  }, [stockSearch, watchlist.length]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (stockDropdownRef.current && !stockDropdownRef.current.contains(event.target as Node)) {
        setShowStockDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectStock = (stock: Stock) => {
    if (!selectedTickers.includes(stock.ticker)) {
      setSelectedTickers([...selectedTickers, stock.ticker]);
    }
    setStockSearch('');
    setShowStockDropdown(false);
  };

  const handleRemoveStock = (ticker: string) => {
    setSelectedTickers(selectedTickers.filter(t => t !== ticker));
  };

  const marketCaps = marketCapData?.stocks || {};

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col items-center gap-2 mb-6 mt-8">
        <h2 className="text-3xl font-bold text-slate-100">Stocks Research</h2>
        <p className="text-slate-400 text-lg italic">
          {language === 'fr' ? 'Recherchez des actions S&P 500' : 'Search S&P 500 stocks'}
        </p>
      </div>

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Search Bar */}
        <div className="bg-slate-100 rounded-xl p-6">
          <h3 className="text-xl font-bold text-slate-800 mb-4">
            {language === 'fr' ? 'Rechercher une action' : 'Search for a stock'}
          </h3>
          <div className="relative" ref={stockDropdownRef}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder={language === 'fr' ? 'Rechercher S&P 500...' : 'Search S&P 500 stocks...'}
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                onFocus={() => setShowStockDropdown((stockResults.length > 0 && stockSearch.length > 0) || (stockSearch.length === 0 && watchlist.length > 0))}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            {showStockDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-50 max-h-60 overflow-auto">
                {/* Show watchlist when search is empty */}
                {stockSearch.length === 0 && watchlist.length > 0 && (
                  <>
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                      <Eye className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                        {language === 'fr' ? 'Ma Watchlist' : 'My Watchlist'}
                      </span>
                    </div>
                    {watchlist.map((ticker) => {
                      const isSelected = selectedTickers.includes(ticker);
                      const sp500Stock = SP500_STOCKS.find(s => s.ticker === ticker);
                      const displayName = sp500Stock?.name || ticker;
                      const logoUrl = getCompanyLogoUrl(ticker);
                      return (
                        <button
                          key={ticker}
                          type="button"
                          onClick={() => handleSelectStock({ ticker, name: displayName })}
                          disabled={isSelected}
                          className={`w-full px-4 py-2 text-left flex items-center gap-3 border-b border-slate-100 last:border-b-0 ${isSelected ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'hover:bg-purple-50'}`}
                        >
                          <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {logoUrl && (
                              <img
                                src={logoUrl}
                                alt={`${ticker} logo`}
                                className="w-6 h-6 object-contain"
                                onError={(e) => {
                                  const parent = e.currentTarget.parentElement;
                                  if (parent) {
                                    parent.innerHTML = `<span class="text-[10px] font-bold text-slate-500">${ticker.slice(0, 2)}</span>`;
                                  }
                                }}
                              />
                            )}
                            {!logoUrl && (
                              <span className="text-[10px] font-bold text-slate-500">{ticker.slice(0, 2)}</span>
                            )}
                          </div>
                          <span className="font-bold text-slate-800 w-16">{ticker}</span>
                          <span className="text-slate-600 text-sm truncate">{displayName}</span>
                          {isSelected && <span className="text-xs text-slate-400 ml-auto">{language === 'fr' ? 'Ajouté' : 'Added'}</span>}
                        </button>
                      );
                    })}
                  </>
                )}
                {/* Show search results when searching */}
                {stockSearch.length > 0 && stockResults.map((stock) => {
                  const isSelected = selectedTickers.includes(stock.ticker);
                  const logoUrl = getCompanyLogoUrl(stock.ticker);
                  return (
                    <button
                      key={stock.ticker}
                      type="button"
                      onClick={() => handleSelectStock(stock)}
                      disabled={isSelected}
                      className={`w-full px-4 py-2 text-left flex items-center gap-3 border-b border-slate-100 last:border-b-0 ${isSelected ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'hover:bg-purple-50'}`}
                    >
                      <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {logoUrl && (
                          <img
                            src={logoUrl}
                            alt={`${stock.ticker} logo`}
                            className="w-6 h-6 object-contain"
                            onError={(e) => {
                              const parent = e.currentTarget.parentElement;
                              if (parent) {
                                parent.innerHTML = `<span class="text-[10px] font-bold text-slate-500">${stock.ticker.slice(0, 2)}</span>`;
                              }
                            }}
                          />
                        )}
                        {!logoUrl && (
                          <span className="text-[10px] font-bold text-slate-500">{stock.ticker.slice(0, 2)}</span>
                        )}
                      </div>
                      <span className="font-bold text-slate-800 w-16">{stock.ticker}</span>
                      <span className="text-slate-600 text-sm truncate">{stock.name}</span>
                      {isSelected && <span className="text-xs text-slate-400 ml-auto">{language === 'fr' ? 'Ajouté' : 'Added'}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Selected Stocks */}
        {selectedTickers.length > 0 && (
          <div className="bg-slate-100 rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-800">
                {language === 'fr' ? 'Actions sélectionnées' : 'Selected Stocks'}
                <span className="text-slate-500 font-normal ml-2">({selectedTickers.length})</span>
              </h3>
              {marketCapLoading && (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">{language === 'fr' ? 'Chargement...' : 'Loading...'}</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              {selectedTickers.map((ticker) => {
                const sp500Stock = SP500_STOCKS.find(s => s.ticker === ticker);
                const marketCapInfo = marketCaps[ticker];
                const displayName = marketCapInfo?.name || sp500Stock?.name || ticker;
                const logoUrl = getCompanyLogoUrl(ticker);
                const isLoading = !marketCapInfo && marketCapLoading;

                return (
                  <div
                    key={ticker}
                    className="flex items-center bg-white rounded-lg px-4 py-3 border border-slate-200 gap-3"
                  >
                    <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {logoUrl && (
                        <img
                          src={logoUrl}
                          alt={`${ticker} logo`}
                          className="w-8 h-8 object-contain"
                          onError={(e) => {
                            const parent = e.currentTarget.parentElement;
                            if (parent) {
                              parent.innerHTML = `<span class="text-xs font-bold text-slate-500">${ticker.slice(0, 2)}</span>`;
                            }
                          }}
                        />
                      )}
                      {!logoUrl && (
                        <span className="text-xs font-bold text-slate-500">{ticker.slice(0, 2)}</span>
                      )}
                    </div>
                    <span className="font-bold text-slate-800 w-16 flex-shrink-0">{ticker}</span>
                    <span className="text-slate-600 text-sm truncate flex-1">{displayName}</span>
                    <span className="text-slate-800 font-semibold flex-shrink-0">
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      ) : (
                        formatMarketCap(marketCapInfo?.market_cap ?? null)
                      )}
                    </span>
                    <button
                      onClick={() => handleRemoveStock(ticker)}
                      className="text-slate-400 hover:text-red-500 p-1 transition-colors flex-shrink-0"
                      title={language === 'fr' ? 'Supprimer' : 'Remove'}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {selectedTickers.length === 0 && (
          <div className="bg-slate-100 rounded-xl p-12 text-center">
            <TrendingUp className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-500">
              {language === 'fr'
                ? 'Recherchez des actions ci-dessus pour voir leur capitalisation boursière.'
                : 'Search for stocks above to see their market cap.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
