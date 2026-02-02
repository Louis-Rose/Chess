// Investing Welcome panel

import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Eye, Calendar, TrendingUp, Loader2, PartyPopper, X, Newspaper, Wallet, Flame, Briefcase, DollarSign } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PWAInstallPrompt } from '../../../components/PWAInstallPrompt';
import { getCompanyLogoUrl } from '../utils/companyLogos';
import stockResearchPreview from '../../../assets/stock-research-preview.png';

// Types
interface CompositionItem {
  ticker: string;
  quantity: number;
  current_price: number;
  current_value: number;
  cost_basis: number;
  gain: number;
  gain_pct: number;
  weight: number;
}

interface CompositionData {
  holdings: CompositionItem[];
  total_value_eur: number;
  total_value_usd: number;
  total_cost_basis_eur: number;
  total_gain_pct: number;
  eurusd_rate: number;
}

interface EarningsItem {
  ticker: string;
  next_earnings_date: string | null;
  remaining_days: number | null;
  date_confirmed: boolean;
  is_estimated?: boolean;
  source: 'portfolio' | 'watchlist';
}

interface EarningsResponse {
  earnings: EarningsItem[];
}

interface DividendItem {
  ticker: string;
  ex_dividend_date: string | null;
  remaining_days: number | null;
  dividend_amount: number | null;
  pays_dividends?: boolean;
  quantity?: number;
  total_dividend?: number | null;
  amount_source?: 'yfinance' | 'fmp' | 'estimate' | null;
  confirmed?: boolean;
}

interface DividendsResponse {
  dividends: DividendItem[];
}

interface PerformanceData {
  performance: number | null;
  performance_1m?: number | null;
  days: number;
  current_value: number;
  past_value: number;
}

interface TopMover {
  ticker: string;
  change_pct: number;
  current_price: number;
  past_price: number;
}

interface TopMoversData {
  movers: TopMover[];
  days: number;
}

interface Account {
  id: number;
  name: string;
}

// Card IDs
const ALL_CARD_IDS = [
  'portfolio',
  'top-movers',
  'earnings',
  'dividends',
  'watchlist',
  'stock-research',
  'news-feed',
] as const;

type CardId = typeof ALL_CARD_IDS[number];

// Grid has 9 slots (3x3), some can be empty (null)
const GRID_SIZE = 9;
type GridSlot = CardId | null;
const DEFAULT_GRID: GridSlot[] = [...ALL_CARD_IDS, null, null];

// API fetchers
const fetchComposition = async (accountIds: number[]): Promise<CompositionData> => {
  const params = accountIds.length > 0 ? `?account_ids=${accountIds.join(',')}` : '';
  const response = await axios.get(`/api/investing/portfolio/composition${params}`);
  return response.data;
};

const fetchPerformance = async (days: number, accountIds: number[]): Promise<PerformanceData> => {
  const params = new URLSearchParams({ days: String(days) });
  if (accountIds.length > 0) params.append('account_ids', accountIds.join(','));
  const response = await axios.get(`/api/investing/portfolio/performance-period?${params}`);
  return response.data;
};

const fetchTopMovers = async (days: number, accountIds: number[]): Promise<TopMoversData> => {
  const params = new URLSearchParams({ days: String(days) });
  if (accountIds.length > 0) params.append('account_ids', accountIds.join(','));
  const response = await axios.get(`/api/investing/portfolio/top-movers?${params}`);
  return response.data;
};

const fetchWatchlistMovers = async (days: number): Promise<TopMoversData> => {
  const response = await axios.get(`/api/investing/watchlist/top-movers?days=${days}`);
  return response.data;
};

type EarningsSourceFilter = 'portfolio' | 'watchlist' | 'both';

const fetchEarnings = async (sourceFilter: EarningsSourceFilter): Promise<EarningsResponse> => {
  const params = new URLSearchParams({
    include_portfolio: (sourceFilter === 'both' || sourceFilter === 'portfolio') ? 'true' : 'false',
    include_watchlist: (sourceFilter === 'both' || sourceFilter === 'watchlist') ? 'true' : 'false',
  });
  const response = await axios.get(`/api/investing/earnings-calendar?${params}`);
  return response.data;
};

const fetchDividends = async (accountIds: number[]): Promise<DividendsResponse> => {
  const params = accountIds.length > 0 ? `?account_ids=${accountIds.join(',')}` : '';
  const response = await axios.get(`/api/investing/dividends-calendar${params}`);
  return response.data;
};

const fetchAccounts = async (): Promise<{ accounts: Account[] }> => {
  const response = await axios.get('/api/investing/accounts');
  return response.data;
};

const fetchCardOrder = async (): Promise<GridSlot[] | null> => {
  const response = await axios.get('/api/preferences/dashboard-card-order');
  return response.data.order;
};

const saveCardOrder = async (order: GridSlot[]): Promise<void> => {
  await axios.put('/api/preferences/dashboard-card-order', { order });
};

// Helper to format currency - always show complete numbers
const formatCurrency = (value: number, currency: 'EUR' | 'USD'): string => {
  const rounded = Math.round(value);
  if (currency === 'EUR') {
    return `${rounded.toLocaleString('fr-FR')}€`;
  }
  return `$${rounded.toLocaleString('en-US')}`;
};

export function InvestingWelcomePanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading, user, isNewUser, clearNewUserFlag } = useAuth();
  const { language } = useLanguage();

  // Grid slots state (9 slots, some can be empty)
  const [gridSlots, setGridSlots] = useState<GridSlot[]>([...DEFAULT_GRID]);

  // Summary card states
  const [valueCurrency, setValueCurrency] = useState<'EUR' | 'USD'>('EUR');
  const [moversPeriod, setMoversPeriod] = useState<7 | 30>(30);
  const [watchlistMoversPeriod, setWatchlistMoversPeriod] = useState<7 | 30>(30);
  const [earningsSource, setEarningsSource] = useState<EarningsSourceFilter>('portfolio');

  // Selected accounts from localStorage (shared with PortfolioPanel)
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>(() => {
    const saved = localStorage.getItem('selectedAccountIds');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  // Sync with localStorage changes (when user changes selection on PortfolioPanel)
  useEffect(() => {
    const syncFromStorage = () => {
      const saved = localStorage.getItem('selectedAccountIds');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setSelectedAccountIds(parsed);
        } catch {
          // ignore parse errors
        }
      }
    };

    // Check on focus (when returning to this tab/page)
    window.addEventListener('focus', syncFromStorage);
    // Also listen for storage events from other tabs
    window.addEventListener('storage', syncFromStorage);

    return () => {
      window.removeEventListener('focus', syncFromStorage);
      window.removeEventListener('storage', syncFromStorage);
    };
  }, []);

  // Drag & drop state
  const [draggedCardId, setDraggedCardId] = useState<CardId | null>(null);
  const [dragOverSlotIndex, setDragOverSlotIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  // Fetch card order
  const { data: savedCardOrder, isFetched: cardOrderFetched } = useQuery({
    queryKey: ['dashboard-card-order'],
    queryFn: fetchCardOrder,
    enabled: isAuthenticated,
    staleTime: Infinity,
  });

  // Save card order mutation
  const saveOrderMutation = useMutation({
    mutationFn: saveCardOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-card-order'] });
    },
  });

  // Update grid slots when loaded from server
  useEffect(() => {
    if (savedCardOrder && savedCardOrder.length > 0) {
      // Validate slots - keep valid card IDs and nulls
      const validSlots: GridSlot[] = savedCardOrder.map(slot =>
        slot === null || ALL_CARD_IDS.includes(slot as CardId) ? slot as GridSlot : null
      );
      // Ensure we have exactly GRID_SIZE slots
      while (validSlots.length < GRID_SIZE) validSlots.push(null);
      // Find any missing cards and add them to empty slots
      const presentCards = validSlots.filter((s): s is CardId => s !== null);
      const missingCards = ALL_CARD_IDS.filter(id => !presentCards.includes(id));
      for (const card of missingCards) {
        const emptyIndex = validSlots.findIndex(s => s === null);
        if (emptyIndex !== -1) validSlots[emptyIndex] = card;
      }
      setGridSlots(validSlots.slice(0, GRID_SIZE));
    }
  }, [savedCardOrder]);

  // Fetch portfolio data (filtered by selected accounts)
  const { data: accountsData } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
    enabled: isAuthenticated,
  });
  const accounts = accountsData?.accounts ?? [];

  const { data: compositionData, isLoading: compositionLoading } = useQuery({
    queryKey: ['composition-summary', selectedAccountIds],
    queryFn: () => fetchComposition(selectedAccountIds),
    enabled: isAuthenticated && selectedAccountIds.length > 0,
    staleTime: 1000 * 60 * 5,
  });

  const { data: earningsData, isLoading: earningsLoading } = useQuery({
    queryKey: ['earnings-summary', earningsSource],
    queryFn: () => fetchEarnings(earningsSource),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 30,
  });

  const { data: dividendsData, isLoading: dividendsLoading } = useQuery({
    queryKey: ['dividends-summary', selectedAccountIds],
    queryFn: () => fetchDividends(selectedAccountIds),
    enabled: isAuthenticated && selectedAccountIds.length > 0,
    staleTime: 1000 * 60 * 30,
  });

  const { data: perf7Data, isLoading: perf7Loading } = useQuery({
    queryKey: ['performance-period', 7, selectedAccountIds],
    queryFn: () => fetchPerformance(7, selectedAccountIds),
    enabled: isAuthenticated && selectedAccountIds.length > 0 && (compositionData?.holdings?.length ?? 0) > 0,
    staleTime: 1000 * 60 * 15,
  });

  const { data: perf30Data, isLoading: perf30Loading } = useQuery({
    queryKey: ['performance-period', 30, selectedAccountIds],
    queryFn: () => fetchPerformance(30, selectedAccountIds),
    enabled: isAuthenticated && selectedAccountIds.length > 0 && (compositionData?.holdings?.length ?? 0) > 0,
    staleTime: 1000 * 60 * 15,
  });

  const { data: topMoversData, isLoading: topMoversLoading } = useQuery({
    queryKey: ['top-movers', moversPeriod, selectedAccountIds],
    queryFn: () => fetchTopMovers(moversPeriod, selectedAccountIds),
    enabled: isAuthenticated && selectedAccountIds.length > 0 && (compositionData?.holdings?.length ?? 0) > 0,
    staleTime: 1000 * 60 * 15,
  });

  const { data: watchlistMoversData, isLoading: watchlistMoversLoading } = useQuery({
    queryKey: ['watchlist-movers', watchlistMoversPeriod],
    queryFn: () => fetchWatchlistMovers(watchlistMoversPeriod),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 15,
  });

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, cardId: CardId, node: HTMLDivElement) => {
    setDraggedCardId(cardId);
    dragNodeRef.current = node;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cardId);
    setTimeout(() => {
      if (dragNodeRef.current) {
        dragNodeRef.current.style.opacity = '0.4';
      }
    }, 0);
  };

  const handleDragEnd = () => {
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = '1';
    }
    setDraggedCardId(null);
    setDragOverSlotIndex(null);
    dragNodeRef.current = null;
  };

  const handleSlotDragOver = (e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverSlotIndex !== slotIndex) {
      setDragOverSlotIndex(slotIndex);
    }
  };

  const handleSlotDrop = (e: React.DragEvent, targetSlotIndex: number) => {
    e.preventDefault();

    const draggedId = draggedCardId;
    handleDragEnd();

    if (draggedId === null) return;

    const draggedSlotIndex = gridSlots.findIndex(slot => slot === draggedId);
    if (draggedSlotIndex === -1 || draggedSlotIndex === targetSlotIndex) return;

    const newSlots = [...gridSlots];
    // Swap: dragged card goes to target slot, target slot content goes to dragged slot
    [newSlots[draggedSlotIndex], newSlots[targetSlotIndex]] = [newSlots[targetSlotIndex], newSlots[draggedSlotIndex]];
    setGridSlots(newSlots);
    saveOrderMutation.mutate(newSlots);
  };

  // Get upcoming earnings
  const getUpcomingEarnings = () => {
    if (!earningsData?.earnings) return [];
    return earningsData.earnings
      .filter(e => e.remaining_days === null || e.remaining_days >= 0)
      .sort((a, b) => (a.remaining_days ?? 999) - (b.remaining_days ?? 999))
      .slice(0, 15);
  };

  const getUpcomingDividends = () => {
    if (!dividendsData?.dividends) return [];
    // Sort: dividend payers with upcoming dates first, then non-payers
    return dividendsData.dividends
      .filter(d => d.pays_dividends !== false ? (d.remaining_days === null || d.remaining_days >= 0) : true)
      .sort((a, b) => {
        // Non-payers go to the end
        if (a.pays_dividends === false && b.pays_dividends !== false) return 1;
        if (a.pays_dividends !== false && b.pays_dividends === false) return -1;
        if (a.pays_dividends === false && b.pays_dividends === false) return a.ticker.localeCompare(b.ticker);
        return (a.remaining_days ?? 999) - (b.remaining_days ?? 999);
      })
      .slice(0, 10);
  };

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-green-500 animate-spin mb-4" />
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  const portfolioValue = valueCurrency === 'EUR'
    ? compositionData?.total_value_eur
    : compositionData?.total_value_usd;
  const perf7Value = perf7Data?.performance;
  const perf30Value = perf30Data?.performance;
  const perfLoading = perf7Loading || perf30Loading;
  const topMovers = topMoversData?.movers ?? [];
  const watchlistMovers = watchlistMoversData?.movers ?? [];
  const upcomingEarnings = getUpcomingEarnings();
  const upcomingDividends = getUpcomingDividends();
  const hasHoldings = (compositionData?.holdings?.length ?? 0) > 0;

  // Render a grid slot (card or empty)
  const renderSlot = (slotIndex: number) => {
    const cardId = gridSlots[slotIndex];
    const isDragOver = dragOverSlotIndex === slotIndex;
    const dragOverClass = isDragOver ? 'ring-2 ring-blue-500 ring-offset-2' : '';

    // Empty slot
    if (cardId === null) {
      return (
        <div
          key={`empty-${slotIndex}`}
          className={`rounded-xl h-[200px] transition-colors ${isDragOver ? 'bg-slate-700/50 ring-2 ring-blue-500' : ''}`}
          onDragOver={(e) => handleSlotDragOver(e, slotIndex)}
          onDrop={(e) => handleSlotDrop(e, slotIndex)}
        />
      );
    }

    const isDragging = draggedCardId === cardId;
    const cardBaseClass = "bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 h-[200px] flex flex-col transition-colors group";

    const cardProps = {
      draggable: true,
      onDragStart: (e: React.DragEvent<HTMLDivElement>) => handleDragStart(e, cardId, e.currentTarget),
      onDragEnd: handleDragEnd,
      onDragOver: (e: React.DragEvent<HTMLDivElement>) => handleSlotDragOver(e, slotIndex),
      onDrop: (e: React.DragEvent<HTMLDivElement>) => handleSlotDrop(e, slotIndex),
    };

    switch (cardId) {
      case 'portfolio':
        return (
          <div
            key={cardId}
            {...cardProps}
            onClick={() => !isDragging && navigate('/investing/portfolio')}
            className={`${cardBaseClass} ${dragOverClass} cursor-pointer hover:border-green-500`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Wallet className="w-4 h-4 text-white" />
                </div>
                <div className="min-w-0">
                  <span className="text-xl font-bold text-white block">
                    {language === 'fr' ? 'Mon Portefeuille' : 'My Portfolio'}
                  </span>
                  {selectedAccountIds.length > 0 && accounts.length > 0 && (
                    <span className="text-xs text-slate-400 truncate block">
                      {accounts
                        .filter(a => selectedAccountIds.includes(a.id))
                        .map(a => a.name)
                        .join(', ')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex rounded overflow-hidden border border-slate-300 dark:border-slate-600">
                <button
                  onClick={(e) => { e.stopPropagation(); setValueCurrency('EUR'); }}
                  className={`w-8 h-6 text-base font-medium flex items-center justify-center ${valueCurrency === 'EUR' ? 'bg-green-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                >
                  €
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setValueCurrency('USD'); }}
                  className={`w-8 h-6 text-base font-medium flex items-center justify-center ${valueCurrency === 'USD' ? 'bg-green-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                >
                  $
                </button>
              </div>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              {compositionLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              ) : hasHoldings && portfolioValue !== undefined ? (
                <>
                  <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                    {formatCurrency(portfolioValue, valueCurrency)}
                  </p>
                  <div className="h-7 flex items-center justify-center">
                    {perfLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    ) : (perf7Value !== undefined && perf7Value !== null) || (perf30Value !== undefined && perf30Value !== null) ? (
                      <div className="flex items-center gap-3 text-lg font-semibold">
                        {perf7Value !== undefined && perf7Value !== null && (
                          <span className={perf7Value >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {language === 'fr' ? 'Semaine' : 'Last week'}: {perf7Value >= 0 ? '+' : ''}{perf7Value.toFixed(1)}%
                          </span>
                        )}
                        {perf7Value !== undefined && perf7Value !== null && perf30Value !== undefined && perf30Value !== null && (
                          <span className="text-slate-500">|</span>
                        )}
                        {perf30Value !== undefined && perf30Value !== null && (
                          <span className={perf30Value >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {language === 'fr' ? 'Mois' : 'Last month'}: {perf30Value >= 0 ? '+' : ''}{perf30Value.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400 italic">
                  {language === 'fr' ? 'Aucune position' : 'No holdings'}
                </p>
              )}
            </div>
          </div>
        );

      case 'top-movers':
        return (
          <div
            key={cardId}
            {...cardProps}
            className={`${cardBaseClass} ${dragOverClass} overflow-hidden`}
          >
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center">
                  <Flame className="w-4 h-4 text-white" />
                </div>
                <span className="text-xl font-bold text-white">
                  {language === 'fr' ? 'Mouvements Portefeuille' : 'Portfolio Moves'}
                </span>
              </div>
              <div className="flex rounded overflow-hidden border border-slate-300 dark:border-slate-600">
                <button
                  onClick={(e) => { e.stopPropagation(); setMoversPeriod(7); }}
                  className={`px-2 h-6 text-xs font-medium flex items-center justify-center ${moversPeriod === 7 ? 'bg-orange-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                >
                  {language === 'fr' ? 'Sem. préc.' : 'Prev. week'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setMoversPeriod(30); }}
                  className={`px-2 h-6 text-xs font-medium flex items-center justify-center ${moversPeriod === 30 ? 'bg-orange-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                >
                  {language === 'fr' ? 'Mois préc.' : 'Prev. month'}
                </button>
              </div>
            </div>
            {compositionLoading || topMoversLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : topMovers.length > 0 ? (
              <div className="space-y-2 flex-1 overflow-y-auto scrollbar-hide">
                {topMovers.map((stock) => {
                  const logoUrl = getCompanyLogoUrl(stock.ticker);
                  return (
                    <div key={stock.ticker} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                          {logoUrl ? (
                            <img src={logoUrl} alt={stock.ticker} className="w-4 h-4 object-contain" />
                          ) : (
                            <span className="text-[8px] font-bold text-slate-500">{stock.ticker.slice(0, 2)}</span>
                          )}
                        </div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{stock.ticker}</span>
                      </div>
                      <span className={`text-sm font-bold ${stock.change_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">
                {language === 'fr' ? 'Aucune position' : 'No holdings'}
              </p>
            )}
          </div>
        );

      case 'earnings':
        return (
          <div
            key={cardId}
            {...cardProps}
            onClick={() => !isDragging && navigate('/investing/earnings')}
            className={`${cardBaseClass} ${dragOverClass} cursor-pointer hover:border-amber-500`}
          >
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-amber-600 rounded-lg flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-white" />
                </div>
                <span className="text-xl font-bold text-white">
                  {language === 'fr' ? 'Résultats à venir' : 'Upcoming Earnings'}
                </span>
              </div>
              <div className="flex rounded border border-slate-300 dark:border-slate-600">
                <div className="relative group/tooltip">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEarningsSource('portfolio'); }}
                    className={`w-8 h-6 flex items-center justify-center rounded-l ${earningsSource === 'portfolio' ? 'bg-green-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                  >
                    <Briefcase className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-600 text-white text-xs rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-75 z-50 w-max max-w-36 text-center pointer-events-none">
                    {language === 'fr' ? 'Portefeuille uniquement' : 'Portfolio stocks only'}
                  </div>
                </div>
                <div className="relative group/tooltip">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEarningsSource('watchlist'); }}
                    className={`w-8 h-6 flex items-center justify-center ${earningsSource === 'watchlist' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-600 text-white text-xs rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-75 z-50 w-max max-w-36 text-center pointer-events-none">
                    {language === 'fr' ? 'Watchlist uniquement' : 'Watchlist stocks only'}
                  </div>
                </div>
                <div className="relative group/tooltip">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEarningsSource('both'); }}
                    className={`px-2 h-6 text-sm font-medium flex items-center justify-center rounded-r ${earningsSource === 'both' ? 'bg-amber-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                  >
                    {language === 'fr' ? 'Tout' : 'All'}
                  </button>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-600 text-white text-xs rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-75 z-50 w-max max-w-36 text-center pointer-events-none">
                    {language === 'fr' ? 'Portefeuille et watchlist' : 'Both owned stocks and watchlist stocks'}
                  </div>
                </div>
              </div>
            </div>
            {earningsLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : upcomingEarnings.length > 0 ? (
              <div className="space-y-2 flex-1 overflow-y-auto scrollbar-hide pr-1">
                {upcomingEarnings.map((earning) => {
                  const logoUrl = getCompanyLogoUrl(earning.ticker);
                  return (
                    <div key={earning.ticker} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                          {logoUrl ? (
                            <img src={logoUrl} alt={earning.ticker} className="w-4 h-4 object-contain" />
                          ) : (
                            <span className="text-[8px] font-bold text-slate-500">{earning.ticker.slice(0, 2)}</span>
                          )}
                        </div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{earning.ticker}</span>
                      </div>
                      <span className="text-sm font-bold text-white">
                        {earning.next_earnings_date ? (
                          <>
                            {new Date(earning.next_earnings_date).toLocaleDateString(
                              language === 'fr' ? 'fr-FR' : 'en-US',
                              { day: 'numeric', month: 'short', year: 'numeric' }
                            )}
                            {earning.remaining_days !== null && (
                              <span className="text-slate-400 font-normal">
                                {' '}({earning.remaining_days === 0
                                  ? (language === 'fr' ? "aujourd'hui" : 'today')
                                  : `${earning.remaining_days} ${language === 'fr' ? 'jours' : 'days'}`})
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-500 font-normal italic">
                            {language === 'fr' ? 'Non annoncé' : 'Not announced'}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">
                {language === 'fr' ? 'Aucun résultat prévu' : 'No upcoming earnings'}
              </p>
            )}
          </div>
        );

      case 'dividends':
        return (
          <div
            key={cardId}
            {...cardProps}
            onClick={() => !isDragging && navigate('/investing/dividends')}
            className={`${cardBaseClass} ${dragOverClass} cursor-pointer hover:border-emerald-500`}
          >
            <div className="flex items-center gap-2 mb-3 flex-shrink-0">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-white" />
              </div>
              <span className="text-xl font-bold text-white">
                {language === 'fr' ? 'Dividendes' : 'Dividends'}
              </span>
            </div>
            {dividendsLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : upcomingDividends.length > 0 ? (
              <div className="space-y-2 flex-1 overflow-y-auto scrollbar-hide pr-1">
                {upcomingDividends.map((dividend) => {
                  const logoUrl = getCompanyLogoUrl(dividend.ticker);
                  const paysDividends = dividend.pays_dividends !== false;
                  return (
                    <div key={dividend.ticker} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-1">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                          {logoUrl ? (
                            <img src={logoUrl} alt={dividend.ticker} className="w-4 h-4 object-contain" />
                          ) : (
                            <span className="text-[8px] font-bold text-slate-500">{dividend.ticker.slice(0, 2)}</span>
                          )}
                        </div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 w-12">{dividend.ticker}</span>
                      </div>
                      {paysDividends ? (
                        <>
                          <span className="text-sm text-emerald-500 font-bold text-right tabular-nums">
                            {(() => {
                              const fxRate = compositionData?.eurusd_rate || 1.0;
                              const amount = dividend.total_dividend ?? dividend.dividend_amount;
                              if (amount === null) return null;
                              const displayAmount = valueCurrency === 'EUR' ? amount / fxRate : amount;
                              // Pad to align: $05.35 instead of $5.35
                              const formatted = displayAmount.toFixed(2).padStart(5, '0');
                              return valueCurrency === 'EUR'
                                ? <>{formatted}€</>
                                : <>${formatted}</>;
                            })()}
                          </span>
                          <span className="text-sm text-emerald-500 tabular-nums">
                            {dividend.total_dividend !== null && dividend.quantity && dividend.dividend_amount && (
                              <>({dividend.quantity} × ${dividend.dividend_amount.toFixed(2)})</>
                            )}
                          </span>
                          <span className="text-sm text-slate-400 text-right tabular-nums ml-1">
                            {dividend.remaining_days !== null && (
                              <>
                                ({dividend.remaining_days === 0
                                  ? (language === 'fr' ? "aujourd'hui" : 'today')
                                  : `${dividend.remaining_days} ${language === 'fr' ? 'jours' : 'days'}`})
                              </>
                            )}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm text-slate-400 col-span-3 text-right">
                          {valueCurrency === 'EUR' ? '0€' : '$0'} ({language === 'fr' ? 'Pas de dividendes' : 'No dividends'})
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">
                {language === 'fr' ? 'Aucun dividende prévu' : 'No upcoming dividends'}
              </p>
            )}
          </div>
        );

      case 'watchlist':
        return (
          <div
            key={cardId}
            {...cardProps}
            onClick={() => !isDragging && navigate('/investing/watchlist')}
            className={`${cardBaseClass} ${dragOverClass} cursor-pointer hover:border-blue-500 overflow-hidden`}
          >
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Eye className="w-4 h-4 text-white" />
                </div>
                <span className="text-xl font-bold text-white">
                  {language === 'fr' ? 'Mouvements Watchlist' : 'Watchlist Moves'}
                </span>
              </div>
              <div className="flex rounded overflow-hidden border border-slate-300 dark:border-slate-600">
                <button
                  onClick={(e) => { e.stopPropagation(); setWatchlistMoversPeriod(7); }}
                  className={`px-2 h-6 text-xs font-medium flex items-center justify-center ${watchlistMoversPeriod === 7 ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                >
                  {language === 'fr' ? 'Sem. préc.' : 'Prev. week'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setWatchlistMoversPeriod(30); }}
                  className={`px-2 h-6 text-xs font-medium flex items-center justify-center ${watchlistMoversPeriod === 30 ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                >
                  {language === 'fr' ? 'Mois préc.' : 'Prev. month'}
                </button>
              </div>
            </div>
            {watchlistMoversLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : watchlistMovers.length > 0 ? (
              <div className="space-y-2 flex-1 overflow-y-auto scrollbar-hide">
                {watchlistMovers.map((stock) => {
                  const logoUrl = getCompanyLogoUrl(stock.ticker);
                  return (
                    <div key={stock.ticker} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                          {logoUrl ? (
                            <img src={logoUrl} alt={stock.ticker} className="w-4 h-4 object-contain" />
                          ) : (
                            <span className="text-[8px] font-bold text-slate-500">{stock.ticker.slice(0, 2)}</span>
                          )}
                        </div>
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{stock.ticker}</span>
                      </div>
                      <span className={`text-sm font-bold ${stock.change_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {stock.change_pct >= 0 ? '+' : ''}{stock.change_pct.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">
                {language === 'fr' ? 'Aucune action suivie' : 'No stocks in watchlist'}
              </p>
            )}
          </div>
        );

      case 'stock-research':
        return (
          <div
            key={cardId}
            {...cardProps}
            onClick={() => !isDragging && navigate('/investing/financials')}
            className={`${cardBaseClass} ${dragOverClass} cursor-pointer hover:border-purple-500 overflow-hidden !p-0`}
          >
            <div className="flex items-center gap-2 p-3 pb-2 flex-shrink-0">
              <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white">
                {language === 'fr' ? 'Recherche & Comparaison' : 'Research & Compare Stocks'}
              </h3>
            </div>
            <div className="flex-1 overflow-hidden flex items-start justify-center">
              <img
                src={stockResearchPreview}
                alt="Stock research preview"
                className="w-[70%] -mt-1"
              />
            </div>
          </div>
        );

      case 'news-feed':
        return (
          <div
            key={cardId}
            {...cardProps}
            onClick={() => !isDragging && navigate('/investing/news-feed')}
            className={`${cardBaseClass} ${dragOverClass} cursor-pointer hover:border-red-500`}
          >
            <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
                <Newspaper className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white">
                {language === 'fr' ? 'Fil d\'actualités' : 'News Feed'}
              </h3>
            </div>
            <p className="text-slate-400 text-sm flex-1">
              {language === 'fr' ? 'Vidéos YouTube de chaînes financières vérifiées.' : 'YouTube videos from verified financial channels.'}
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">
          {language === 'fr' ? 'Tableau de Bord' : 'Your Investment Dashboard'}
        </h1>
        <PWAInstallPrompt className="max-w-md mx-auto" />
      </div>

      {/* New user welcome banner - only when authenticated */}
      {isAuthenticated && isNewUser && (
        <div className="max-w-2xl mx-auto mt-6 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-xl p-6 relative">
          <button
            onClick={clearNewUserFlag}
            className="absolute top-3 right-3 p-1 rounded-lg hover:bg-green-500/20 transition-colors"
          >
            <X className="w-4 h-4 text-green-400" />
          </button>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-green-500/30 rounded-xl flex items-center justify-center flex-shrink-0">
              <PartyPopper className="w-6 h-6 text-green-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-green-400 mb-1">
                {language === 'fr' ? 'Bienvenue sur LUMNA !' : 'Welcome to LUMNA!'}
              </h3>
              <p className="text-slate-300 text-sm">
                {language === 'fr'
                  ? 'Votre compte a été créé avec succès. Commencez par ajouter vos transactions pour suivre la performance de votre portefeuille.'
                  : 'Your account has been created successfully. Start by adding your transactions to track your portfolio performance.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="md:animate-in md:fade-in md:slide-in-from-bottom-4 md:duration-700 mt-8 flex flex-col min-h-[calc(100vh-200px)]">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {language === 'fr' ? 'Bienvenue' : 'Welcome'}{isAuthenticated && user?.name ? `, ${user.name}` : ''} !
          </h2>
        </div>

        {/* Unified Card Grid - only for authenticated users, wait for card order to load */}
        {isAuthenticated && cardOrderFetched && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-[10%] mb-8">
            {gridSlots.map((_, index) => renderSlot(index))}
          </div>
        )}

        {/* Feature cards for non-authenticated users */}
        {!isAuthenticated && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-[10%] mb-8">
            <div
              className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl h-[200px] flex flex-col overflow-hidden"
            >
              <div className="flex items-center gap-2 p-3 pb-2 flex-shrink-0">
                <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  {language === 'fr' ? 'Recherche & Comparaison' : 'Research & Compare Stocks'}
                </h3>
              </div>
              <div className="flex-1 overflow-hidden flex items-start justify-center">
                <img
                  src={stockResearchPreview}
                  alt="Stock research preview"
                  className="w-[70%] -mt-1"
                />
              </div>
            </div>
            <div
              className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 h-[200px] flex flex-col"
            >
              <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
                  <Newspaper className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  {language === 'fr' ? 'Fil d\'actualités' : 'News Feed'}
                </h3>
              </div>
              <p className="text-slate-400 text-sm flex-1">
                {language === 'fr' ? 'Vidéos YouTube de chaînes financières vérifiées.' : 'YouTube videos from verified financial channels.'}
              </p>
            </div>
          </div>
        )}

        {/* Legal notices */}
        <div className="text-center mt-auto pb-2">
          <Link
            to="/cgu"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-sm transition-colors"
          >
            {language === 'fr' ? 'Mentions légales' : 'Legal notices'}
          </Link>
        </div>
      </div>
    </>
  );
}
