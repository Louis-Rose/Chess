// Earnings Calendar panel - displays upcoming earnings dates for portfolio holdings and watchlist

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Calendar, Loader2, CheckCircle2, HelpCircle, Search, Plus, X, Briefcase, Eye } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LoginButton } from '../../../components/LoginButton';
import { searchStocks, type Stock } from '../utils/sp500';

interface EarningsData {
  ticker: string;
  next_earnings_date: string | null;
  remaining_days: number | null;
  date_confirmed: boolean;
  source: 'portfolio' | 'watchlist';
  error?: string;
}

interface EarningsResponse {
  earnings: EarningsData[];
  watchlist: string[];
  message?: string;
}

const fetchEarningsCalendar = async (includePortfolio: boolean): Promise<EarningsResponse> => {
  const response = await axios.get(`/api/investing/earnings-calendar?include_portfolio=${includePortfolio}`);
  return response.data;
};

const addToEarningsWatchlist = async (symbol: string): Promise<void> => {
  await axios.post('/api/investing/earnings-watchlist', { symbol });
};

const removeFromEarningsWatchlist = async (symbol: string): Promise<void> => {
  await axios.delete(`/api/investing/earnings-watchlist/${symbol}`);
};

export function EarningsCalendarPanel() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { language } = useLanguage();
  const queryClient = useQueryClient();

  const [includePortfolio, setIncludePortfolio] = useState(true);
  const [stockSearch, setStockSearch] = useState('');
  const [stockResults, setStockResults] = useState<Stock[]>([]);
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const stockDropdownRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['earnings-calendar', includePortfolio],
    queryFn: () => fetchEarningsCalendar(includePortfolio),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 30, // Cache for 30 minutes
  });

  const addMutation = useMutation({
    mutationFn: addToEarningsWatchlist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['earnings-calendar'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeFromEarningsWatchlist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['earnings-calendar'] });
    },
  });

  // Stock search effect
  useEffect(() => {
    const results = searchStocks(stockSearch);
    setStockResults(results);
    setShowStockDropdown(results.length > 0 && stockSearch.length > 0);
  }, [stockSearch]);

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
    if (!data?.watchlist?.includes(stock.ticker)) {
      addMutation.mutate(stock.ticker);
    }
    setStockSearch('');
    setShowStockDropdown(false);
  };

  const handleAddSymbol = (e: React.FormEvent) => {
    e.preventDefault();
    const ticker = stockSearch.trim().toUpperCase();
    if (ticker && !data?.watchlist?.includes(ticker)) {
      addMutation.mutate(ticker);
      setStockSearch('');
      setShowStockDropdown(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-green-500 animate-spin mb-4" />
        <p className="text-slate-400">{language === 'fr' ? 'Chargement...' : 'Loading...'}</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col items-center justify-center py-20">
          <Calendar className="w-16 h-16 text-slate-500 mb-4" />
          <h2 className="text-2xl font-bold text-slate-300 mb-2">
            {language === 'fr' ? 'Connexion requise' : 'Sign In Required'}
          </h2>
          <p className="text-slate-500 mb-6">
            {language === 'fr'
              ? 'Connectez-vous pour voir le calendrier des résultats.'
              : 'Please sign in to view the earnings calendar.'}
          </p>
          <LoginButton />
        </div>
      </div>
    );
  }

  const watchlistTickers = data?.watchlist || [];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="sticky top-0 z-20 bg-slate-800 py-4 -mx-4 px-4 mt-8">
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-3xl font-bold text-slate-100">
            {language === 'fr' ? 'Calendrier des Résultats' : 'Earnings Calendar'}
          </h2>
          <p className="text-slate-400 text-lg italic">
            {language === 'fr'
              ? 'Prochaines publications de résultats'
              : 'Upcoming earnings releases'}
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto mt-8 space-y-6">
        {/* Controls: Add stock + Portfolio toggle */}
        <div className="bg-slate-100 rounded-xl p-6">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
            {/* Stock search */}
            <div className="flex-1 w-full">
              <label className="block text-sm font-medium text-slate-600 mb-2">
                {language === 'fr' ? 'Ajouter une action' : 'Add a stock'}
              </label>
              <form onSubmit={handleAddSymbol} className="flex gap-2">
                <div className="relative flex-1" ref={stockDropdownRef}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder={language === 'fr' ? 'Rechercher S&P 500...' : 'Search S&P 500...'}
                      value={stockSearch}
                      onChange={(e) => setStockSearch(e.target.value)}
                      onFocus={() => stockSearch && setShowStockDropdown(stockResults.length > 0)}
                      className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  {showStockDropdown && stockResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-50 max-h-60 overflow-auto">
                      {stockResults.map((stock) => {
                        const isInWatchlist = watchlistTickers.includes(stock.ticker);
                        const isInEarnings = data?.earnings?.some(e => e.ticker === stock.ticker);
                        const isAdded = isInWatchlist || isInEarnings;
                        return (
                          <button
                            key={stock.ticker}
                            type="button"
                            onClick={() => handleSelectStock(stock)}
                            disabled={isAdded}
                            className={`w-full px-4 py-2 text-left flex items-center gap-3 border-b border-slate-100 last:border-b-0 ${isAdded ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'hover:bg-green-50'}`}
                          >
                            <span className="font-bold text-slate-800 w-16">{stock.ticker}</span>
                            <span className="text-slate-600 text-sm truncate">{stock.name}</span>
                            {isAdded && <span className="text-xs text-slate-400 ml-auto">{language === 'fr' ? 'Ajouté' : 'Added'}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={!stockSearch.trim() || addMutation.isPending}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </button>
              </form>
            </div>

            {/* Portfolio toggle */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePortfolio}
                  onChange={(e) => setIncludePortfolio(e.target.checked)}
                  className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                />
                <span className="text-sm text-slate-600 flex items-center gap-1">
                  <Briefcase className="w-4 h-4" />
                  {language === 'fr' ? 'Inclure portefeuille' : 'Include portfolio'}
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Earnings table */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-green-500 animate-spin mb-4" />
            <p className="text-slate-400">
              {language === 'fr' ? 'Récupération des dates...' : 'Fetching earnings dates...'}
            </p>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-700 rounded-xl p-6 text-center">
            <p className="text-red-400">
              {language === 'fr' ? 'Erreur lors du chargement' : 'Error loading data'}
            </p>
          </div>
        ) : data?.earnings && data.earnings.length > 0 ? (
          <div className="bg-slate-100 rounded-xl p-6">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="text-left text-slate-600 text-sm border-b-2 border-slate-300">
                    <th className="pb-3 pl-2 font-semibold w-[20%]">Ticker</th>
                    <th className="pb-3 font-semibold w-[35%]">
                      {language === 'fr' ? 'Date' : 'Date'}
                    </th>
                    <th className="pb-3 text-center font-semibold w-[20%]">
                      {language === 'fr' ? 'Jours restants' : 'Remaining'}
                    </th>
                    <th className="pb-3 text-center font-semibold w-[15%]">
                      {language === 'fr' ? 'Confirmé' : 'Confirmed'}
                    </th>
                    <th className="pb-3 text-center font-semibold w-[10%]"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.earnings.map((item) => (
                    <tr
                      key={item.ticker}
                      className="border-b border-slate-200 hover:bg-slate-50 transition-colors"
                    >
                      <td className="py-4 pl-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{item.ticker}</span>
                          {item.source === 'portfolio' ? (
                            <span title={language === 'fr' ? 'Portefeuille' : 'Portfolio'}>
                              <Briefcase className="w-3 h-3 text-green-600" />
                            </span>
                          ) : (
                            <span title="Watchlist">
                              <Eye className="w-3 h-3 text-blue-600" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4">
                        {item.next_earnings_date ? (
                          <span className="text-slate-700">
                            {new Date(item.next_earnings_date).toLocaleDateString(
                              language === 'fr' ? 'fr-FR' : 'en-US',
                              { day: 'numeric', month: 'long', year: 'numeric' }
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">
                            {language === 'fr' ? 'N/A' : 'N/A'}
                          </span>
                        )}
                      </td>
                      <td className="py-4 text-center">
                        {item.remaining_days !== null ? (
                          <span className="inline-flex items-center justify-center min-w-[3rem] px-2 py-1 rounded-full text-sm font-medium bg-slate-200 text-slate-700">
                            {item.remaining_days}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-4 text-center">
                        {item.date_confirmed ? (
                          <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto" />
                        ) : (
                          <HelpCircle className="w-5 h-5 text-slate-400 mx-auto" />
                        )}
                      </td>
                      <td className="py-4 text-center">
                        {item.source === 'watchlist' && (
                          <button
                            onClick={() => removeMutation.mutate(item.ticker)}
                            disabled={removeMutation.isPending}
                            className="text-slate-400 hover:text-red-500 p-1"
                            title={language === 'fr' ? 'Supprimer' : 'Remove'}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">
                <span className="font-medium text-slate-600">
                  {language === 'fr' ? 'Légende : ' : 'Legend: '}
                </span>
                <Briefcase className="w-4 h-4 text-green-600 inline-block mx-1" />
                {language === 'fr' ? 'Portefeuille' : 'Portfolio'}
                {' • '}
                <Eye className="w-4 h-4 text-blue-600 inline-block mx-1" />
                {language === 'fr' ? 'Watchlist' : 'Watchlist'}
                {' • '}
                <CheckCircle2 className="w-4 h-4 text-green-600 inline-block mx-1" />
                {language === 'fr' ? 'Date confirmée' : 'Confirmed'}
                {' • '}
                <HelpCircle className="w-4 h-4 text-slate-400 inline-block mx-1" />
                {language === 'fr' ? 'Date estimée' : 'Estimated'}
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-slate-100 rounded-xl p-12 text-center">
            <Calendar className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 text-lg mb-2">
              {language === 'fr'
                ? 'Aucune action à suivre'
                : 'No stocks to track'}
            </p>
            <p className="text-slate-400">
              {language === 'fr'
                ? 'Ajoutez des actions ci-dessus ou activez le portefeuille.'
                : 'Add stocks above or enable portfolio tracking.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
