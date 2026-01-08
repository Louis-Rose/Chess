// Shared Stock Search Bar component

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Eye, X } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { searchAllStocks, findStockByTicker, type Stock, type IndexFilter } from '../utils/allStocks';
import { getCompanyLogoUrl } from '../utils/companyLogos';
import { addRecentStock, getRecentStocks, removeRecentStock } from '../utils/recentStocks';

interface StockSearchBarProps {
  className?: string;
}

export function StockSearchBar({ className = '' }: StockSearchBarProps) {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [stockSearch, setStockSearch] = useState('');
  const [stockResults, setStockResults] = useState<Stock[]>([]);
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const [indexFilter, setIndexFilter] = useState<IndexFilter>({ sp500: true, stoxx600: true, swiss: true });
  const stockDropdownRef = useRef<HTMLDivElement>(null);

  // Recent stocks state - refresh when dropdown opens
  const [recentStocks, setRecentStocks] = useState<string[]>(() => getRecentStocks());

  // Stock search effect
  useEffect(() => {
    const results = searchAllStocks(stockSearch, indexFilter);
    setStockResults(results);
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

  const handleSelectStock = (ticker: string) => {
    setStockSearch('');
    setShowStockDropdown(false);
    addRecentStock(ticker);
    navigate(`/investing/stock/${ticker}`);
  };

  return (
    <div className={`bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none ${className}`}>
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
            onFocus={() => { setRecentStocks(getRecentStocks()); setShowStockDropdown(true); }}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        {showStockDropdown && ((stockSearch.length === 0 && recentStocks.length > 0) || (stockSearch.length > 0 && stockResults.length > 0)) && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-50 max-h-60 overflow-auto">
            {/* Show recent stocks when search is empty */}
            {stockSearch.length === 0 && recentStocks.length > 0 && (
              <>
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    {language === 'fr' ? 'Recherches récentes' : 'Recently searched'}
                  </span>
                </div>
                {recentStocks.map((ticker) => {
                  const stock = findStockByTicker(ticker);
                  const displayName = stock?.name || ticker;
                  const logoUrl = getCompanyLogoUrl(ticker);
                  return (
                    <div
                      key={ticker}
                      onClick={() => handleSelectStock(ticker)}
                      className="w-full px-4 py-2 text-left flex items-center gap-3 border-b border-slate-100 last:border-b-0 hover:bg-purple-50 cursor-pointer group"
                    >
                      <div className="w-6 h-6 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
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
                      <span className="text-slate-600 text-sm truncate flex-1">{displayName}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRecentStock(ticker);
                          setRecentStocks(getRecentStocks());
                        }}
                        className="p-1 rounded hover:bg-slate-200 opacity-0 group-hover:opacity-100 transition-opacity"
                        title={language === 'fr' ? 'Supprimer' : 'Remove'}
                      >
                        <X className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    </div>
                  );
                })}
              </>
            )}
            {/* Show search results when searching */}
            {stockSearch.length > 0 && stockResults.map((stock) => {
              const logoUrl = getCompanyLogoUrl(stock.ticker);
              return (
                <button
                  key={stock.ticker}
                  type="button"
                  onClick={() => handleSelectStock(stock.ticker)}
                  className="w-full px-4 py-2 text-left flex items-center gap-3 border-b border-slate-100 last:border-b-0 hover:bg-purple-50"
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
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
