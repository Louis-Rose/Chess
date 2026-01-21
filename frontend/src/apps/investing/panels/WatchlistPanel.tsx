// Watchlist panel - manage companies in your watchlist

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Eye, Plus, X, Loader2, Search } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PWAInstallPrompt } from '../../../components/PWAInstallPrompt';
import { searchAllStocks, findStockByTicker, type Stock, type IndexFilter } from '../utils/allStocks';
import { getCompanyLogoUrl } from '../utils/companyLogos';

const fetchWatchlist = async (): Promise<{ symbols: string[] }> => {
  const response = await axios.get('/api/investing/watchlist');
  return response.data;
};

const addToWatchlist = async (symbol: string): Promise<void> => {
  await axios.post('/api/investing/watchlist', { symbol });
};

const removeFromWatchlist = async (symbol: string): Promise<void> => {
  await axios.delete(`/api/investing/watchlist/${symbol}`);
};

export function WatchlistPanel() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { language } = useLanguage();
  const queryClient = useQueryClient();
  const [stockSearch, setStockSearch] = useState('');
  const [stockResults, setStockResults] = useState<Stock[]>([]);
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const [indexFilter, setIndexFilter] = useState<IndexFilter>({ sp500: true, stoxx600: true });
  const stockDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch watchlist from database
  const { data: watchlistData, isLoading: watchlistLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: fetchWatchlist,
    enabled: isAuthenticated,
  });

  const watchlist = watchlistData?.symbols ?? [];

  // Mutations
  const addMutation = useMutation({
    mutationFn: addToWatchlist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeFromWatchlist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });

  // Stock search effect
  useEffect(() => {
    const results = searchAllStocks(stockSearch, indexFilter);
    setStockResults(results);
    setShowStockDropdown(results.length > 0 && stockSearch.length > 0);
  }, [stockSearch, indexFilter]);

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
    if (!watchlist.includes(stock.ticker)) {
      addMutation.mutate(stock.ticker);
    }
    setStockSearch('');
    setShowStockDropdown(false);
  };

  const handleAddSymbol = (e: React.FormEvent) => {
    e.preventDefault();
    const ticker = stockSearch.trim().toUpperCase();
    if (ticker && !watchlist.includes(ticker)) {
      addMutation.mutate(ticker);
      setStockSearch('');
      setShowStockDropdown(false);
    }
  };

  const handleRemoveSymbol = (symbol: string) => {
    removeMutation.mutate(symbol);
  };

  if (authLoading || (isAuthenticated && watchlistLoading)) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-400">{language === 'fr' ? 'Chargement...' : 'Loading...'}</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Show exact same view as authenticated users with mock data (it's blurred anyway)
    return (
      <div>
        <div className="flex flex-col items-center gap-2 mb-6 mt-8">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{language === 'fr' ? 'Ma Watchlist' : 'My Watchlist'}</h2>
          <p className="text-slate-500 dark:text-slate-400 text-lg italic">
            {language === 'fr' ? 'G\u00e9rez les actions que vous suivez' : 'Manage the stocks you follow'}
          </p>
        </div>

        <div className="max-w-2xl mx-auto space-y-6">
          {/* Add Company - same structure as authenticated */}
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">
              {language === 'fr' ? 'Ajouter une entreprise \u00e0 ma watchlist' : 'Add a company to my watchlist'}
            </h3>
            {/* Index Filter Toggles - same as authenticated */}
            <div className="flex items-center gap-4 mb-3">
              <span className="text-sm text-slate-500 dark:text-slate-400">{language === 'fr' ? 'Indices:' : 'Indices:'}</span>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked readOnly className="w-4 h-4 rounded border-slate-300 text-blue-600" />
                <span className="text-sm text-slate-700 dark:text-slate-300">S&P 500</span>
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked readOnly className="w-4 h-4 rounded border-slate-300 text-blue-600" />
                <span className="text-sm text-slate-700 dark:text-slate-300">STOXX Europe 600</span>
              </label>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder={language === 'fr' ? 'Rechercher...' : 'Search stocks...'}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-800"
                  disabled
                />
              </div>
              <button className="bg-blue-600 text-white px-6 py-2 rounded-lg flex items-center gap-2">
                <Plus className="w-4 h-4" />
                {language === 'fr' ? 'Ajouter' : 'Add'}
              </button>
            </div>
          </div>

          {/* Watchlist - same structure as authenticated */}
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">
              {language === 'fr' ? 'Ma Watchlist' : 'My Watchlist'}
              <span className="text-slate-500 dark:text-slate-400 font-normal ml-2">(4)</span>
            </h3>
            <div className="space-y-2">
              {[
                { ticker: 'GOOGL', name: 'Alphabet Inc.' },
                { ticker: 'AMZN', name: 'Amazon.com Inc.' },
                { ticker: 'TSLA', name: 'Tesla Inc.' },
                { ticker: 'META', name: 'Meta Platforms Inc.' },
              ].map((stock) => (
                <div
                  key={stock.ticker}
                  className="flex items-center bg-slate-100 dark:bg-slate-600 rounded-lg px-4 py-3 border border-slate-300 dark:border-slate-500 gap-3"
                >
                  <div className="w-8 h-8 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                    <span className="text-xs font-bold text-slate-500">{stock.ticker.slice(0, 2)}</span>
                  </div>
                  <span className="font-bold text-slate-800 dark:text-slate-100 w-16 flex-shrink-0">{stock.ticker}</span>
                  <span className="text-slate-600 dark:text-slate-300 text-sm truncate flex-grow">{stock.name}</span>
                  <div className="text-slate-400 p-1 flex-shrink-0 ml-auto">
                    <X className="w-5 h-5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="md:animate-in md:fade-in md:slide-in-from-bottom-4 md:duration-700">
      <div className="flex flex-col items-center gap-2 mb-6 mt-8">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{language === 'fr' ? 'Ma Watchlist' : 'My Watchlist'}</h2>
        <p className="text-slate-500 dark:text-slate-400 text-lg italic">
          {language === 'fr' ? 'Gérez les actions que vous suivez' : 'Manage the stocks you follow'}
        </p>
        <PWAInstallPrompt className="max-w-md w-full mt-2" />
      </div>

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Add Company */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">
            {language === 'fr' ? 'Ajouter une entreprise à ma watchlist' : 'Add a company to my watchlist'}
          </h3>
          {/* Index Filter Toggles */}
          <div className="flex items-center gap-4 mb-3">
            <span className="text-sm text-slate-500 dark:text-slate-400">{language === 'fr' ? 'Indices:' : 'Indices:'}</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={indexFilter.sp500}
                onChange={(e) => setIndexFilter({ ...indexFilter, sp500: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">S&P 500</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={indexFilter.stoxx600}
                onChange={(e) => setIndexFilter({ ...indexFilter, stoxx600: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">STOXX Europe 600</span>
            </label>
          </div>
          <form onSubmit={handleAddSymbol} className="flex gap-2">
            <div className="relative flex-1" ref={stockDropdownRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder={language === 'fr' ? 'Rechercher...' : 'Search stocks...'}
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  onFocus={() => stockSearch && setShowStockDropdown(stockResults.length > 0)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {showStockDropdown && stockResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-50 max-h-60 overflow-auto">
                  {stockResults.map((stock) => {
                    const isInWatchlist = watchlist.includes(stock.ticker);
                    const logoUrl = getCompanyLogoUrl(stock.ticker);
                    return (
                      <button
                        key={stock.ticker}
                        type="button"
                        onClick={() => handleSelectStock(stock)}
                        disabled={isInWatchlist}
                        className={`w-full px-4 py-2 text-left flex items-center gap-3 border-b border-slate-100 last:border-b-0 ${isInWatchlist ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'hover:bg-blue-50'}`}
                      >
                        <div className="w-6 h-6 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
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
                        {isInWatchlist && <span className="text-xs text-slate-400 ml-auto">{language === 'fr' ? 'Ajouté' : 'Added'}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={!stockSearch.trim() || addMutation.isPending}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {language === 'fr' ? 'Ajouter' : 'Add'}
            </button>
          </form>
        </div>

        {/* Watchlist */}
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">
            {language === 'fr' ? 'Ma Watchlist' : 'My Watchlist'}
            {watchlist.length > 0 && <span className="text-slate-500 dark:text-slate-400 font-normal ml-2">({watchlist.length})</span>}
          </h3>
          {watchlist.length === 0 ? (
            <div className="text-center py-8">
              <Eye className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-500">
                {language === 'fr' ? 'Votre watchlist est vide.' : 'Your watchlist is empty.'}
              </p>
              <p className="text-slate-400 text-sm mt-2">
                {language === 'fr'
                  ? 'Recherchez des actions ci-dessus pour commencer.'
                  : 'Search for stocks above to start tracking.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {watchlist.map((ticker) => {
                const stock = findStockByTicker(ticker);
                const displayName = stock?.name || ticker;
                const logoUrl = getCompanyLogoUrl(ticker);

                return (
                  <div
                    key={ticker}
                    onClick={() => navigate(`/investing/stock/${ticker}`)}
                    className="flex items-center bg-slate-100 dark:bg-slate-600 rounded-lg px-4 py-3 border border-slate-300 dark:border-slate-500 gap-3 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-500 transition-colors"
                  >
                    <div className="w-8 h-8 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
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
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-300">{ticker.slice(0, 2)}</span>
                      )}
                    </div>
                    <span className="font-bold text-slate-800 dark:text-slate-100 w-16 flex-shrink-0">{ticker}</span>
                    <span className="text-slate-600 dark:text-slate-300 text-sm truncate flex-grow">{displayName}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveSymbol(ticker); }}
                      disabled={removeMutation.isPending}
                      className="text-slate-400 hover:text-red-500 p-1 transition-colors flex-shrink-0 ml-auto"
                      title={language === 'fr' ? 'Supprimer' : 'Remove'}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
