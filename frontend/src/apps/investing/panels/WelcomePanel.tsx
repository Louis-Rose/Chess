// Investing Welcome panel

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Eye, Calendar, TrendingUp, Loader2, Search } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LoginButton } from '../../../components/LoginButton';
import { PWAInstallPrompt } from '../../../components/PWAInstallPrompt';
import { searchAllStocks, type Stock, type IndexFilter } from '../utils/allStocks';

export function InvestingWelcomePanel() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { language } = useLanguage();

  // Stock search state
  const [stockSearch, setStockSearch] = useState('');
  const [stockResults, setStockResults] = useState<Stock[]>([]);
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const [indexFilter, setIndexFilter] = useState<IndexFilter>({ sp500: true, stoxx600: true, swiss: true });
  const stockDropdownRef = useRef<HTMLDivElement>(null);

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
    setStockSearch('');
    setShowStockDropdown(false);
    navigate(`/investing/stock/${stock.ticker}`);
  };

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-green-500 animate-spin mb-4" />
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center py-8 md:py-16">
        <h1 className="text-3xl md:text-5xl font-bold text-slate-900 dark:text-slate-100 text-center px-4">
          {language === 'fr' ? 'Suivez vos Investissements' : 'Track Your Investments'}
        </h1>
        <div className="flex items-start pt-6 md:pt-8 h-[72px] md:h-[144px]">
          <span className="text-7xl md:text-9xl opacity-15 leading-none">&#128200;</span>
        </div>
        <div className="flex flex-col items-center mt-6 md:mt-8 px-4">
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-3 text-center max-w-lg font-light tracking-wide">
            {language === 'fr' ? 'Suivez la performance de votre portefeuille.' : 'Monitor your portfolio performance.'}
          </p>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-8 md:mb-10 text-center max-w-lg font-light tracking-wide">
            {language === 'fr' ? 'Obtenez des informations pour prendre de meilleures décisions.' : 'Get insights to make better investment decisions.'}
          </p>
          <LoginButton />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">
          {language === 'fr' ? 'Tableau de Bord' : 'Your Investment Dashboard'}
        </h1>
        <PWAInstallPrompt className="max-w-md mx-auto" />
      </div>

      <div className="md:animate-in md:fade-in md:slide-in-from-bottom-4 md:duration-700 mt-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            {language === 'fr' ? 'Bienvenue' : 'Welcome'}{user?.name ? `, ${user.name}` : ''} !
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
          {/* Stocks Research */}
          <button
            onClick={() => navigate('/investing/financials')}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 hover:border-purple-500 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Stocks Research</h3>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Financials and insights on any listed company.
            </p>
          </button>

          {/* My Portfolio */}
          <button
            onClick={() => navigate('/investing/portfolio')}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 hover:border-green-500 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">My Portfolio</h3>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              View your holdings, track performance, and analyze your investment distribution.
            </p>
          </button>

          {/* My Watchlist */}
          <button
            onClick={() => navigate('/investing/watchlist')}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 hover:border-blue-500 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Eye className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">My Watchlist</h3>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Manage the list of stocks you want to follow.
            </p>
          </button>

          {/* Earnings Calendar */}
          <button
            onClick={() => navigate('/investing/earnings')}
            className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 hover:border-amber-500 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-amber-600 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Earnings Calendar</h3>
            </div>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Track upcoming earnings releases for your holdings.
            </p>
          </button>
        </div>

        {/* Stock Search Section */}
        <div className="max-w-2xl mx-auto mt-[10vh]">
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">
              {language === 'fr' ? 'Rechercher une action' : 'Search for a stock'}
            </h3>

            {/* Index Filter Toggles */}
            <div className="flex items-center gap-4 mb-3">
              <span className="text-sm text-slate-500 dark:text-slate-400">{language === 'fr' ? 'Indices:' : 'Indices:'}</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={indexFilter.sp500}
                  onChange={(e) => setIndexFilter({ ...indexFilter, sp500: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">S&P 500</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={indexFilter.stoxx600}
                  onChange={(e) => setIndexFilter({ ...indexFilter, stoxx600: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">STOXX Europe 600</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={indexFilter.swiss}
                  onChange={(e) => setIndexFilter({ ...indexFilter, swiss: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">Swiss SPI</span>
              </label>
            </div>

            {/* Search Input */}
            <div className="relative" ref={stockDropdownRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder={language === 'fr' ? 'Rechercher...' : 'Search stocks...'}
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  onFocus={() => stockSearch && setShowStockDropdown(stockResults.length > 0)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              {showStockDropdown && stockResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-50 max-h-60 overflow-auto">
                  {stockResults.map((stock) => (
                    <button
                      key={stock.ticker}
                      type="button"
                      onClick={() => handleSelectStock(stock)}
                      className="w-full px-4 py-2 text-left hover:bg-purple-50 flex items-center gap-3 border-b border-slate-100 last:border-b-0"
                    >
                      <span className="font-bold text-slate-800 w-16">{stock.ticker}</span>
                      <span className="text-slate-600 text-sm truncate">{stock.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
