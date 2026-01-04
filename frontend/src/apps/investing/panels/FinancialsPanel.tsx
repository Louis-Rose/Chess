// Financials panel - search stocks and view market cap

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { TrendingUp, Search, X, Loader2, Eye, ChevronRight, Layers } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { searchAllStocks, findStockByTicker, type Stock, type IndexFilter } from '../utils/allStocks';
import { getCompanyLogoUrl } from '../utils/companyLogos';
import { GICS_SECTORS, getStocksBySubIndustry, type GICSSector, type GICSIndustryGroup, type GICSIndustry, type GICSSubIndustry } from '../utils/gics';

interface MarketCapData {
  ticker: string;
  name: string;
  market_cap: number | null;
  error?: string;
}

interface StockHistoryData {
  ticker: string;
  period: string;
  previous_close: number | null;
  data: { timestamp: string; price: number }[];
}

type ChartPeriod = '1D' | '5D' | '1M' | '6M' | 'YTD' | '1Y' | '5Y' | 'MAX';

const fetchMarketCap = async (tickers: string[]): Promise<{ stocks: Record<string, MarketCapData> }> => {
  if (tickers.length === 0) return { stocks: {} };
  const response = await axios.get(`/api/investing/market-cap?tickers=${tickers.join(',')}`);
  return response.data;
};

const fetchStockHistory = async (ticker: string, period: ChartPeriod): Promise<StockHistoryData> => {
  const response = await axios.get(`/api/investing/stock-history/${ticker}?period=${period}`);
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
  const [indexFilter, setIndexFilter] = useState<IndexFilter>({ sp500: true, stoxx600: true });
  const stockDropdownRef = useRef<HTMLDivElement>(null);

  // GICS state
  const [showGICS, setShowGICS] = useState(false);
  const [selectedSector, setSelectedSector] = useState<GICSSector | null>(null);
  const [selectedIndustryGroup, setSelectedIndustryGroup] = useState<GICSIndustryGroup | null>(null);
  const [selectedIndustry, setSelectedIndustry] = useState<GICSIndustry | null>(null);
  const [selectedSubIndustry, setSelectedSubIndustry] = useState<GICSSubIndustry | null>(null);

  // Chart state
  const [chartTicker, setChartTicker] = useState<string | null>(null);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('1M');

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

  // Fetch stock history for chart
  const { data: stockHistoryData, isLoading: stockHistoryLoading } = useQuery({
    queryKey: ['stockHistory', chartTicker, chartPeriod],
    queryFn: () => fetchStockHistory(chartTicker!, chartPeriod),
    enabled: !!chartTicker,
  });

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

  const handleSelectStock = (stock: Stock) => {
    if (!selectedTickers.includes(stock.ticker)) {
      setSelectedTickers([...selectedTickers, stock.ticker]);
    }
    setStockSearch('');
    setShowStockDropdown(false);
  };

  const handleRemoveStock = (ticker: string) => {
    setSelectedTickers(selectedTickers.filter(t => t !== ticker));
    if (chartTicker === ticker) {
      setChartTicker(null);
    }
  };

  const handleToggleChart = (ticker: string) => {
    if (chartTicker === ticker) {
      setChartTicker(null);
    } else {
      setChartTicker(ticker);
      setChartPeriod('1M'); // Reset to default period
    }
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

  const marketCaps = marketCapData?.stocks || {};

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col items-center gap-2 mb-6 mt-8">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Stocks Research</h2>
        <p className="text-slate-500 dark:text-slate-400 text-lg italic">
          {language === 'fr' ? 'Recherchez des actions' : 'Search stocks'}
        </p>
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
                onFocus={() => setShowStockDropdown(true)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            {showStockDropdown && ((stockSearch.length === 0 && watchlist.length > 0) || (stockSearch.length > 0 && stockResults.length > 0)) && (
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
                      const stock = findStockByTicker(ticker);
                      const displayName = stock?.name || ticker;
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

        {/* GICS Industry Search Toggle */}
        {!showGICS && (
          <button
            onClick={() => setShowGICS(true)}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-50 dark:bg-slate-700 rounded-xl border border-dashed border-slate-300 dark:border-slate-500 text-slate-500 dark:text-slate-400 hover:border-purple-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
          >
            <Layers className="w-4 h-4" />
            <span className="text-sm font-medium">
              {language === 'fr' ? 'Rechercher par industrie (GICS)' : 'Search by industry (GICS)'}
            </span>
          </button>
        )}

        {/* GICS Industry Search */}
        {showGICS && (
        <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-purple-600" />
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                {language === 'fr' ? 'Rechercher par industrie (GICS)' : 'Search by industry (GICS)'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {selectedSector && (
                <button
                  onClick={handleResetGICS}
                  className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                >
                  {language === 'fr' ? 'Réinitialiser' : 'Reset'}
                </button>
              )}
              <button
                onClick={() => { setShowGICS(false); handleResetGICS(); }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1"
                title={language === 'fr' ? 'Fermer' : 'Close'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
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
                            onClick={() => {
                              if (!selectedTickers.includes(ticker)) {
                                setSelectedTickers([...selectedTickers, ticker]);
                              }
                            }}
                            disabled={selectedTickers.includes(ticker)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                              selectedTickers.includes(ticker)
                                ? 'bg-purple-100 dark:bg-purple-800 border-purple-300 dark:border-purple-600 text-purple-400 dark:text-purple-500 cursor-not-allowed'
                                : 'bg-white dark:bg-slate-600 border-purple-200 dark:border-purple-700 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-800/50'
                            }`}
                            title={stock?.name || ticker}
                          >
                            <div className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-500 flex items-center justify-center overflow-hidden flex-shrink-0">
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

        {/* Selected Stocks */}
        {selectedTickers.length > 0 && (
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6 shadow-sm dark:shadow-none">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                {language === 'fr' ? 'Actions sélectionnées' : 'Selected Stocks'}
                <span className="text-slate-500 dark:text-slate-400 font-normal ml-2">({selectedTickers.length})</span>
              </h3>
              {marketCapLoading && (
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">{language === 'fr' ? 'Chargement...' : 'Loading...'}</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              {selectedTickers.map((ticker) => {
                const stock = findStockByTicker(ticker);
                const marketCapInfo = marketCaps[ticker];
                const displayName = marketCapInfo?.name || stock?.name || ticker;
                const logoUrl = getCompanyLogoUrl(ticker);
                const isLoading = !marketCapInfo && marketCapLoading;
                const isChartOpen = chartTicker === ticker;

                return (
                  <div key={ticker}>
                    <div
                      className={`flex items-center bg-slate-100 dark:bg-slate-600 rounded-lg px-4 py-3 border gap-3 cursor-pointer transition-colors ${
                        isChartOpen
                          ? 'border-green-400 dark:border-green-500 bg-slate-200 dark:bg-slate-500'
                          : 'border-slate-300 dark:border-slate-500 hover:border-slate-400 dark:hover:border-slate-400'
                      }`}
                      onClick={() => handleToggleChart(ticker)}
                    >
                      <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-500 flex items-center justify-center overflow-hidden flex-shrink-0">
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
                      <span className="text-slate-600 dark:text-slate-300 text-sm truncate flex-1">{displayName}</span>
                      <span className="text-slate-800 dark:text-slate-100 font-semibold flex-shrink-0">
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                        ) : (
                          formatMarketCap(marketCapInfo?.market_cap ?? null)
                        )}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveStock(ticker); }}
                        className="text-slate-400 hover:text-red-500 p-1 transition-colors flex-shrink-0"
                        title={language === 'fr' ? 'Supprimer' : 'Remove'}
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Price Chart */}
                    {isChartOpen && (
                      <div className="mt-2 bg-slate-800 dark:bg-slate-900 rounded-lg p-4 border border-slate-700">
                        {/* Period Selectors */}
                        <div className="flex gap-2 mb-4">
                          {(['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'MAX'] as ChartPeriod[]).map((period) => (
                            <button
                              key={period}
                              onClick={(e) => { e.stopPropagation(); setChartPeriod(period); }}
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
                          <div className="h-[250px] flex items-center justify-center text-slate-400">
                            {language === 'fr' ? 'Aucune donnée disponible' : 'No data available'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {selectedTickers.length === 0 && (
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-12 text-center shadow-sm dark:shadow-none">
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
