// Financials panel - search stocks

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Eye, ChevronRight, Layers, Loader2, TrendingUp, X } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LoginButton } from '../../../components/LoginButton';
import { searchAllStocks, findStockByTicker, type Stock, type IndexFilter } from '../utils/allStocks';
import { getCompanyLogoUrl } from '../utils/companyLogos';
import { GICS_SECTORS, getStocksBySubIndustry, type GICSSector, type GICSIndustryGroup, type GICSIndustry, type GICSSubIndustry } from '../utils/gics';
import { addRecentStock, getRecentStocks, removeRecentStock } from '../utils/recentStocks';
import { PWAInstallPrompt } from '../../../components/PWAInstallPrompt';

export function FinancialsPanel() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { language } = useLanguage();
  const [stockSearch, setStockSearch] = useState('');
  const [stockResults, setStockResults] = useState<Stock[]>([]);
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const [indexFilter, setIndexFilter] = useState<IndexFilter>({ sp500: true, stoxx600: true });
  const stockDropdownRef = useRef<HTMLDivElement>(null);

  // GICS state
  const [showGICS, setShowGICS] = useState(false);
  const [selectedSector, setSelectedSector] = useState<GICSSector | null>(null);
  const [selectedIndustryGroup, setSelectedIndustryGroup] = useState<GICSIndustryGroup | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState<GICSIndustry | null>(null);
  const [selectedSubIndustry, setSelectedSubIndustry] = useState<GICSSubIndustry | null>(null);

  // Recent stocks state - refresh when dropdown opens
  const [recentStocks, setRecentStocks] = useState<string[]>(() => getRecentStocks());

  // Stock search effect - only update results, don't auto-show dropdown
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

  // GICS handlers
  const handleSelectSector = (sector: GICSSector) => {
    setSelectedSector(sector);
    setSelectedIndustryGroup(null);
    setSelectedIndustry(null);
    setSelectedSubIndustry(null);
  };

  const handleSelectIndustryGroup = (group: GICSIndustryGroup) => {
    setSelectedIndustryGroup(group);
    setSelectedIndustry(null);
    setSelectedSubIndustry(null);
  };

  const handleSelectIndustry = (industry: GICSIndustry) => {
    setSelectedIndustry(industry);
    setSelectedSubIndustry(null);
  };

  const handleSelectSubIndustry = (subIndustry: GICSSubIndustry) => {
    setSelectedSubIndustry(subIndustry);
  };

  const handleResetGICS = () => {
    setSelectedSector(null);
    setSelectedIndustryGroup(null);
    setSelectedIndustry(null);
    setSelectedSubIndustry(null);
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
          {language === 'fr' ? 'Recherche Actions' : 'Stocks Research'}
        </h1>
        <div className="flex items-start pt-6 md:pt-8 h-[72px] md:h-[144px]">
          <TrendingUp className="w-24 h-24 md:w-32 md:h-32 text-slate-300 dark:text-slate-600" />
        </div>
        <div className="flex flex-col items-center mt-6 md:mt-8 px-4">
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-300 mb-8 md:mb-10 text-center max-w-lg font-light tracking-wide">
            {language === 'fr'
              ? 'Connectez-vous pour rechercher des actions et consulter leurs données financières.'
              : 'Sign in to search stocks and view their financial data.'}
          </p>
          <LoginButton />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col items-center gap-2 mb-6 mt-8">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Stocks Research</h2>
        <p className="text-slate-500 dark:text-slate-400 text-lg italic">
          {language === 'fr' ? 'Recherchez des actions' : 'Search stocks'}
        </p>
        <PWAInstallPrompt className="max-w-md w-full mt-2" />
      </div>

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Search Bar */}
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
          </div>
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

        {/* GICS Industry Search Toggle */}
        {!showGICS && (
          <button
            onClick={() => setShowGICS(true)}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-50 dark:bg-slate-700 rounded-xl border border-dashed border-slate-300 dark:border-slate-500 text-slate-500 dark:text-slate-400 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
          >
            <span className="text-lg font-medium">+</span>
            <Layers className="w-4 h-4" />
            <span className="text-sm font-medium">
              {language === 'fr' ? 'Rechercher par industrie (GICS)' : 'Search by industry (GICS)'}
            </span>
          </button>
        )}

        {/* GICS Industry Search */}
        {showGICS && (
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          {/* Close button centered at top */}
          <button
            onClick={() => { setShowGICS(false); handleResetGICS(); }}
            className="w-full flex items-center justify-center gap-2 mb-4 py-2 text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
          >
            <span className="text-lg font-medium">−</span>
            <Layers className="w-4 h-4" />
            <span className="text-sm font-medium">
              {language === 'fr' ? 'Rechercher par industrie (GICS)' : 'Search by industry (GICS)'}
            </span>
          </button>

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                {language === 'fr' ? 'Secteurs GICS' : 'GICS Sectors'}
              </h3>
            </div>
            {selectedSector && (
              <button
                onClick={handleResetGICS}
                className="text-sm text-purple-600 hover:text-purple-700 font-medium"
              >
                {language === 'fr' ? 'Réinitialiser' : 'Reset'}
              </button>
            )}
          </div>

          {/* Breadcrumb */}
          {selectedSector && (
            <div className="flex items-center gap-1 text-sm mb-4 flex-wrap">
              <button
                onClick={handleResetGICS}
                className="text-purple-600 hover:underline"
              >
                GICS
              </button>
              <ChevronRight className="w-4 h-4 text-slate-400" />
              <button
                onClick={() => { setSelectedIndustryGroup(null); setSelectedIndustry(null); setSelectedSubIndustry(null); }}
                className={`${selectedIndustryGroup ? 'text-purple-600 hover:underline' : 'text-slate-700 dark:text-slate-300 font-medium'}`}
              >
                {selectedSector.name}
              </button>
              {selectedIndustryGroup && (
                <>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                  <button
                    onClick={() => { setSelectedIndustry(null); setSelectedSubIndustry(null); }}
                    className={`${selectedIndustry ? 'text-purple-600 hover:underline' : 'text-slate-700 dark:text-slate-300 font-medium'}`}
                  >
                    {selectedIndustryGroup.name}
                  </button>
                </>
              )}
              {selectedIndustry && (
                <>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                  <button
                    onClick={() => { setSelectedSubIndustry(null); }}
                    className={`${selectedSubIndustry ? 'text-purple-600 hover:underline' : 'text-slate-700 dark:text-slate-300 font-medium'}`}
                  >
                    {selectedIndustry.name}
                  </button>
                </>
              )}
              {selectedSubIndustry && (
                <>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    {selectedSubIndustry.name}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Level 1: Sectors */}
          {!selectedSector && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {GICS_SECTORS.map((sector) => (
                <button
                  key={sector.code}
                  onClick={() => handleSelectSector(sector)}
                  className="p-3 bg-white dark:bg-slate-600 rounded-lg border border-slate-200 dark:border-slate-500 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-slate-500 transition-colors text-left"
                >
                  <span className="text-xs text-slate-400 dark:text-slate-400">{sector.code}</span>
                  <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">{sector.name}</p>
                </button>
              ))}
            </div>
          )}

          {/* Level 2: Industry Groups */}
          {selectedSector && !selectedIndustryGroup && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {selectedSector.industryGroups.map((group) => (
                <button
                  key={group.code}
                  onClick={() => handleSelectIndustryGroup(group)}
                  className="p-3 bg-white dark:bg-slate-600 rounded-lg border border-slate-200 dark:border-slate-500 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-slate-500 transition-colors text-left flex items-center justify-between"
                >
                  <div>
                    <span className="text-xs text-slate-400 dark:text-slate-400">{group.code}</span>
                    <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">{group.name}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              ))}
            </div>
          )}

          {/* Level 3: Industries */}
          {selectedIndustryGroup && !selectedIndustry && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {selectedIndustryGroup.industries.map((industry) => (
                <button
                  key={industry.code}
                  onClick={() => handleSelectIndustry(industry)}
                  className="p-3 bg-white dark:bg-slate-600 rounded-lg border border-slate-200 dark:border-slate-500 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-slate-500 transition-colors text-left flex items-center justify-between"
                >
                  <div>
                    <span className="text-xs text-slate-400 dark:text-slate-400">{industry.code}</span>
                    <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">{industry.name}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              ))}
            </div>
          )}

          {/* Level 4: Sub-Industries */}
          {selectedIndustry && !selectedSubIndustry && (
            <div className="grid grid-cols-1 gap-2">
              {selectedIndustry.subIndustries.map((subIndustry) => (
                <button
                  key={subIndustry.code}
                  onClick={() => handleSelectSubIndustry(subIndustry)}
                  className="p-3 bg-white dark:bg-slate-600 rounded-lg border border-slate-200 dark:border-slate-500 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-slate-500 transition-colors text-left"
                >
                  <span className="text-xs text-slate-400 dark:text-slate-400">{subIndustry.code}</span>
                  <p className="font-medium text-slate-800 dark:text-slate-100 text-sm">{subIndustry.name}</p>
                </button>
              ))}
            </div>
          )}

          {/* Selected Sub-Industry Info */}
          {selectedSubIndustry && (() => {
            const stocksInSubIndustry = getStocksBySubIndustry(selectedSubIndustry.code);
            return (
              <div className="bg-purple-50 dark:bg-purple-900/30 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200 px-2 py-0.5 rounded">
                    {selectedSubIndustry.code}
                  </span>
                </div>
                <p className="font-semibold text-purple-900 dark:text-purple-100 mb-3">{selectedSubIndustry.name}</p>
                {stocksInSubIndustry.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-purple-700 dark:text-purple-300">
                      {language === 'fr' ? `${stocksInSubIndustry.length} action(s) dans cette sous-industrie:` : `${stocksInSubIndustry.length} stock(s) in this sub-industry:`}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {stocksInSubIndustry.map((ticker) => {
                        const stock = findStockByTicker(ticker);
                        const logoUrl = getCompanyLogoUrl(ticker);
                        return (
                          <button
                            key={ticker}
                            onClick={() => handleSelectStock(ticker)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors bg-white dark:bg-slate-600 border-purple-200 dark:border-purple-700 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-800/50"
                            title={stock?.name || ticker}
                          >
                            <div className="w-5 h-5 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                              {logoUrl ? (
                                <img
                                  src={logoUrl}
                                  alt={`${ticker} logo`}
                                  className="w-5 h-5 object-contain"
                                  onError={(e) => {
                                    const parent = e.currentTarget.parentElement;
                                    if (parent) {
                                      parent.innerHTML = `<span class="text-[8px] font-bold text-slate-500">${ticker.slice(0, 2)}</span>`;
                                    }
                                  }}
                                />
                              ) : (
                                <span className="text-[8px] font-bold text-slate-500 dark:text-slate-300">{ticker.slice(0, 2)}</span>
                              )}
                            </div>
                            <span className="font-medium text-sm text-purple-800 dark:text-purple-100">{ticker}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-purple-600 dark:text-purple-400 italic">
                    {language === 'fr' ? 'Aucune action mappée dans cette sous-industrie' : 'No stocks mapped to this sub-industry'}
                  </p>
                )}
              </div>
            );
          })()}
        </div>
        )}
      </div>
    </div>
  );
}
