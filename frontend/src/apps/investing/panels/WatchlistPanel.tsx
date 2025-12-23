// Watchlist panel with PE ratios

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Eye, Plus, X, Loader2, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { LoginButton } from '../../../components/LoginButton';
import { searchStocks, SP500_STOCKS, type Stock } from '../utils/sp500';

interface StockInfo {
  ticker: string;
  name: string;
  price: number | null;
  pe_ratio: number | null;
  market_cap: number | null;
  sector: string | null;
  industry: string | null;
  net_income_ttm: number | null;
  net_income_2024: number | null;
  net_income_2021: number | null;
  net_income_2020: number | null;
  earnings_cagr: number | null;
  error?: string;
}

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

const fetchStockInfo = async (tickers: string[]): Promise<{ stocks: Record<string, StockInfo> }> => {
  if (tickers.length === 0) return { stocks: {} };
  const response = await axios.get(`/api/investing/stock-info?tickers=${tickers.join(',')}`);
  return response.data;
};

const formatMarketCap = (marketCap: number | null): string => {
  if (!marketCap) return '-';
  if (marketCap >= 1e12) return `$${(marketCap / 1e12).toFixed(1)}T`;
  if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(0)}B`;
  if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(0)}M`;
  return `$${marketCap.toLocaleString()}`;
};

const formatNetIncome = (netIncome: number | null): string => {
  if (netIncome === null) return '-';
  const isNegative = netIncome < 0;
  const abs = Math.abs(netIncome);
  let formatted: string;
  if (abs >= 1e9) {
    formatted = `$${(abs / 1e9).toFixed(1)}B`;
  } else if (abs >= 1e6) {
    formatted = `$${(abs / 1e6).toFixed(0)}M`;
  } else {
    formatted = `$${abs.toLocaleString()}`;
  }
  return isNegative ? `-${formatted}` : formatted;
};

type SortField = 'ticker' | 'price' | 'market_cap' | 'pe_ratio' | 'net_income_ttm' | 'net_income_2024' | 'net_income_2021' | 'net_income_2020' | 'earnings_cagr';
type SortDirection = 'asc' | 'desc';

export function WatchlistPanel() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [stockSearch, setStockSearch] = useState('');
  const [stockResults, setStockResults] = useState<Stock[]>([]);
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const stockDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch watchlist from database
  const { data: watchlistData, isLoading: watchlistLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: fetchWatchlist,
    enabled: isAuthenticated,
  });

  const watchlist = watchlistData?.symbols ?? [];

  // Fetch stock info for all watchlist items
  const { data: stockInfoData, isLoading: stockInfoLoading } = useQuery({
    queryKey: ['stockInfo', watchlist],
    queryFn: () => fetchStockInfo(watchlist),
    enabled: watchlist.length > 0,
  });

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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New field, default to descending for numeric fields, ascending for ticker
      setSortField(field);
      setSortDirection(field === 'ticker' ? 'asc' : 'desc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-400" />;
    }
    return sortDirection === 'asc'
      ? <ArrowUp className="w-3 h-3 text-blue-600" />
      : <ArrowDown className="w-3 h-3 text-blue-600" />;
  };

  // Sort the watchlist based on current sort settings
  const sortedWatchlist = [...watchlist].sort((a, b) => {
    if (!sortField) return 0;

    const infoA = stockInfoData?.stocks?.[a];
    const infoB = stockInfoData?.stocks?.[b];

    let valueA: number | string | null = null;
    let valueB: number | string | null = null;

    switch (sortField) {
      case 'ticker':
        valueA = a;
        valueB = b;
        break;
      case 'price':
        valueA = infoA?.price ?? null;
        valueB = infoB?.price ?? null;
        break;
      case 'market_cap':
        valueA = infoA?.market_cap ?? null;
        valueB = infoB?.market_cap ?? null;
        break;
      case 'pe_ratio':
        valueA = infoA?.pe_ratio ?? null;
        valueB = infoB?.pe_ratio ?? null;
        break;
      case 'net_income_ttm':
        valueA = infoA?.net_income_ttm ?? null;
        valueB = infoB?.net_income_ttm ?? null;
        break;
      case 'net_income_2024':
        valueA = infoA?.net_income_2024 ?? null;
        valueB = infoB?.net_income_2024 ?? null;
        break;
      case 'net_income_2021':
        valueA = infoA?.net_income_2021 ?? null;
        valueB = infoB?.net_income_2021 ?? null;
        break;
      case 'net_income_2020':
        valueA = infoA?.net_income_2020 ?? null;
        valueB = infoB?.net_income_2020 ?? null;
        break;
      case 'earnings_cagr':
        valueA = infoA?.earnings_cagr ?? null;
        valueB = infoB?.earnings_cagr ?? null;
        break;
    }

    // Handle nulls - push them to the end
    if (valueA === null && valueB === null) return 0;
    if (valueA === null) return 1;
    if (valueB === null) return -1;

    // Compare values
    let comparison = 0;
    if (typeof valueA === 'string' && typeof valueB === 'string') {
      comparison = valueA.localeCompare(valueB);
    } else {
      comparison = (valueA as number) - (valueB as number);
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  if (authLoading || (isAuthenticated && watchlistLoading)) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col items-center justify-center py-20">
          <Eye className="w-16 h-16 text-slate-500 mb-4" />
          <h2 className="text-2xl font-bold text-slate-300 mb-2">Sign In Required</h2>
          <p className="text-slate-500 mb-6">Please sign in to view your watchlist.</p>
          <LoginButton />
        </div>
      </div>
    );
  }

  const stockInfo = stockInfoData?.stocks || {};

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col items-center gap-2 mb-6 mt-8">
        <h2 className="text-3xl font-bold text-slate-100">Watchlist</h2>
        <p className="text-slate-400 text-lg italic">Monitor stocks you're interested in</p>
      </div>

      {/* Definitions */}
      <div className="max-w-4xl mx-auto mb-6 space-y-3">
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-300 text-sm">
            <span className="font-semibold text-slate-100">P/E Ratio</span> (Price-to-Earnings) measures how much investors pay per dollar of earnings.
            A lower P/E may indicate undervaluation, while a higher P/E suggests growth expectations. Compare within the same industry for meaningful insights.
          </p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-300 text-sm">
            <span className="font-semibold text-slate-100">CAGR</span> (Compound Annual Growth Rate) measures the average annual growth rate of net income from 2020 (or 2021) to TTM.
            It shows how fast a company's earnings are growing on a smoothed, year-over-year basis.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* Add Symbol */}
        <div className="bg-slate-100 rounded-xl p-6">
          <h3 className="text-xl font-bold text-slate-800 mb-4">Add Symbol</h3>
          <form onSubmit={handleAddSymbol} className="flex gap-2">
            <div className="relative flex-1" ref={stockDropdownRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search S&P 500 stocks..."
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
                    return (
                      <button
                        key={stock.ticker}
                        type="button"
                        onClick={() => handleSelectStock(stock)}
                        disabled={isInWatchlist}
                        className={`w-full px-4 py-2 text-left flex items-center gap-3 border-b border-slate-100 last:border-b-0 ${isInWatchlist ? 'bg-slate-50 text-slate-400 cursor-not-allowed' : 'hover:bg-blue-50'}`}
                      >
                        <span className="font-bold text-slate-800 w-16">{stock.ticker}</span>
                        <span className="text-slate-600 text-sm truncate">{stock.name}</span>
                        {isInWatchlist && <span className="text-xs text-slate-400 ml-auto">Added</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={!stockSearch.trim()}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </form>
        </div>

        {/* Watchlist Table */}
        <div className="bg-slate-100 rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-slate-800">Your Watchlist</h3>
            {watchlist.length > 0 && stockInfoLoading && (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Fetching data...</span>
              </div>
            )}
          </div>
          {watchlist.length === 0 ? (
            <div className="text-center py-12">
              <Eye className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-500">Your watchlist is empty.</p>
              <p className="text-slate-400 text-sm mt-2">
                Search for stocks above to start tracking.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-slate-600 text-sm border-b border-slate-300">
                    <th className="pb-3 pl-2">
                      <button
                        onClick={() => handleSort('ticker')}
                        className="flex items-center gap-1 hover:text-slate-800 transition-colors"
                      >
                        Stock {getSortIcon('ticker')}
                      </button>
                    </th>
                    <th className="pb-3 text-right">
                      <button
                        onClick={() => handleSort('price')}
                        className="flex items-center gap-1 ml-auto hover:text-slate-800 transition-colors"
                      >
                        Price {getSortIcon('price')}
                      </button>
                    </th>
                    <th className="pb-3 text-right">
                      <button
                        onClick={() => handleSort('market_cap')}
                        className="flex items-center gap-1 ml-auto hover:text-slate-800 transition-colors"
                      >
                        Market Cap {getSortIcon('market_cap')}
                      </button>
                    </th>
                    <th className="pb-3 text-right">
                      <button
                        onClick={() => handleSort('pe_ratio')}
                        className="flex items-center gap-1 ml-auto hover:text-slate-800 transition-colors"
                      >
                        P/E Ratio {getSortIcon('pe_ratio')}
                      </button>
                    </th>
                    <th className="pb-3 text-right">
                      <button
                        onClick={() => handleSort('net_income_2020')}
                        className="flex items-center gap-1 ml-auto hover:text-slate-800 transition-colors"
                      >
                        2020 {getSortIcon('net_income_2020')}
                      </button>
                    </th>
                    <th className="pb-3 text-right">
                      <button
                        onClick={() => handleSort('net_income_2021')}
                        className="flex items-center gap-1 ml-auto hover:text-slate-800 transition-colors"
                      >
                        2021 {getSortIcon('net_income_2021')}
                      </button>
                    </th>
                    <th className="pb-3 text-right">
                      <button
                        onClick={() => handleSort('net_income_2024')}
                        className="flex items-center gap-1 ml-auto hover:text-slate-800 transition-colors"
                      >
                        2024 {getSortIcon('net_income_2024')}
                      </button>
                    </th>
                    <th className="pb-3 text-right">
                      <button
                        onClick={() => handleSort('net_income_ttm')}
                        className="flex items-center gap-1 ml-auto hover:text-slate-800 transition-colors"
                      >
                        TTM {getSortIcon('net_income_ttm')}
                      </button>
                    </th>
                    <th className="pb-3 text-right pr-2">
                      <button
                        onClick={() => handleSort('earnings_cagr')}
                        className="flex items-center gap-1 ml-auto hover:text-slate-800 transition-colors"
                      >
                        CAGR {getSortIcon('earnings_cagr')}
                      </button>
                    </th>
                    <th className="pb-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedWatchlist.map((ticker) => {
                    const info = stockInfo[ticker];
                    const sp500Stock = SP500_STOCKS.find(s => s.ticker === ticker);
                    const displayName = info?.name || sp500Stock?.name || ticker;
                    const isLoading = !info && stockInfoLoading;

                    return (
                      <tr key={ticker} className="border-b border-slate-200 hover:bg-slate-50">
                        <td className="py-3 pl-2">
                          <div>
                            <p className="font-bold text-slate-800">{ticker}</p>
                            <p className="text-slate-500 text-sm truncate max-w-[200px]">{displayName}</p>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-slate-400 ml-auto" />
                          ) : info?.price ? (
                            <span className="font-medium text-slate-800">${info.price.toFixed(2)}</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-slate-400 ml-auto" />
                          ) : (
                            <span className="text-slate-600">{formatMarketCap(info?.market_cap ?? null)}</span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-slate-400 ml-auto" />
                          ) : info?.pe_ratio ? (
                            <span className="font-medium text-slate-800">
                              {info.pe_ratio.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-slate-400 ml-auto" />
                          ) : (
                            <span className="font-medium text-slate-800">
                              {formatNetIncome(info?.net_income_2020 ?? null)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-slate-400 ml-auto" />
                          ) : (
                            <span className="font-medium text-slate-800">
                              {formatNetIncome(info?.net_income_2021 ?? null)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-slate-400 ml-auto" />
                          ) : (
                            <span className="font-medium text-slate-800">
                              {formatNetIncome(info?.net_income_2024 ?? null)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-slate-400 ml-auto" />
                          ) : (
                            <span className="font-medium text-slate-800">
                              {formatNetIncome(info?.net_income_ttm ?? null)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-right pr-2">
                          {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin text-slate-400 ml-auto" />
                          ) : info?.earnings_cagr !== null && info?.earnings_cagr !== undefined ? (
                            <span className={`font-medium ${info.earnings_cagr >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {info.earnings_cagr >= 0 ? '+' : ''}{info.earnings_cagr.toFixed(1)}%
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => handleRemoveSymbol(ticker)}
                            className="text-slate-400 hover:text-red-500 p-1"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
