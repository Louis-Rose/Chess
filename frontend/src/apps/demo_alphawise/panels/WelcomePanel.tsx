// Demo AlphaWise Welcome panel - simplified dashboard with portfolio and top-movers

import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2, PartyPopper, X, Wallet, Flame, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { getCompanyLogoUrl } from '../../investing/utils/companyLogos';

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
  change_1d: number | null;
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

// Card IDs - only portfolio and top-movers for demo
const ALL_CARD_IDS = ['portfolio', 'top-movers'] as const;
type CardId = typeof ALL_CARD_IDS[number];

// Grid has 4 slots (2x2), some can be empty (null)
const GRID_SIZE = 4;
type GridSlot = CardId | null;
const DEFAULT_GRID: GridSlot[] = ['portfolio', 'top-movers', null, null];

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

export function WelcomePanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading, user, isNewUser, clearNewUserFlag } = useAuth();
  const { language } = useLanguage();

  // Grid slots state
  const [gridSlots, setGridSlots] = useState<GridSlot[]>([...DEFAULT_GRID]);

  // Summary card states
  const [valueCurrency, setValueCurrency] = useState<'EUR' | 'USD'>('EUR');
  const [moversPeriod, setMoversPeriod] = useState<1 | 7 | 30>(30);
  const [moversSortAsc, setMoversSortAsc] = useState(false);
  const [portfolioHeaderHovered, setPortfolioHeaderHovered] = useState(false);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(event.target as Node)) {
        setAccountDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // Sync with localStorage changes
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

    window.addEventListener('focus', syncFromStorage);
    window.addEventListener('storage', syncFromStorage);

    return () => {
      window.removeEventListener('focus', syncFromStorage);
      window.removeEventListener('storage', syncFromStorage);
    };
  }, []);

  // Handle account selection from dropdown
  const handleAccountSelect = (accountId: number | 'all') => {
    let newSelection: number[];
    if (accountId === 'all') {
      newSelection = accounts.map(a => a.id);
    } else {
      newSelection = [accountId];
    }
    setSelectedAccountIds(newSelection);
    localStorage.setItem('selectedAccountIds', JSON.stringify(newSelection));
    setAccountDropdownOpen(false);
  };

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
      // Filter to only include cards we support in this demo
      const demoCards: GridSlot[] = savedCardOrder
        .filter((slot): slot is CardId | null =>
          slot === null || ALL_CARD_IDS.includes(slot as CardId)
        )
        .slice(0, GRID_SIZE);

      // Pad with nulls if needed
      while (demoCards.length < GRID_SIZE) demoCards.push(null);

      // Make sure all demo cards are present
      for (const card of ALL_CARD_IDS) {
        if (!demoCards.includes(card)) {
          const emptyIndex = demoCards.findIndex(s => s === null);
          if (emptyIndex !== -1) demoCards[emptyIndex] = card;
        }
      }

      setGridSlots(demoCards);
    }
  }, [savedCardOrder]);

  // Fetch portfolio data
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

  const { data: perf1Data, isLoading: perf1Loading } = useQuery({
    queryKey: ['performance-period', 1, selectedAccountIds],
    queryFn: () => fetchPerformance(1, selectedAccountIds),
    enabled: isAuthenticated && selectedAccountIds.length > 0 && (compositionData?.holdings?.length ?? 0) > 0,
    staleTime: 1000 * 60 * 15,
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
    [newSlots[draggedSlotIndex], newSlots[targetSlotIndex]] = [newSlots[targetSlotIndex], newSlots[draggedSlotIndex]];
    setGridSlots(newSlots);
    saveOrderMutation.mutate(newSlots);
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
  const perf1Value = perf1Data?.performance;
  const perf7Value = perf7Data?.performance;
  const perf30Value = perf30Data?.performance;
  const perfLoading = perf1Loading || perf7Loading || perf30Loading;
  const topMovers = topMoversData?.movers ?? [];
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
            onClick={() => !isDragging && navigate('/demo-alphawise/portfolio')}
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
                  {accounts.length > 0 && (
                    <div className="relative" ref={accountDropdownRef}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setAccountDropdownOpen(!accountDropdownOpen); }}
                        className="text-xs text-slate-400 hover:text-slate-300 flex items-center gap-1 transition-colors"
                      >
                        <span className="truncate max-w-[120px]">
                          {selectedAccountIds.length === 0 || selectedAccountIds.length === accounts.length
                            ? (language === 'fr' ? 'Tous les comptes' : 'All accounts')
                            : accounts
                                .filter(a => selectedAccountIds.includes(a.id))
                                .map(a => a.name)
                                .join(', ')}
                        </span>
                        <ChevronDown className={`w-3 h-3 transition-transform ${accountDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {accountDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-lg py-1 min-w-[140px] z-50">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAccountSelect('all'); }}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-600 transition-colors ${
                              selectedAccountIds.length === accounts.length ? 'text-green-400' : 'text-slate-300'
                            }`}
                          >
                            {language === 'fr' ? 'Tous les comptes' : 'All accounts'}
                          </button>
                          {accounts.map(account => (
                            <button
                              key={account.id}
                              onClick={(e) => { e.stopPropagation(); handleAccountSelect(account.id); }}
                              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-600 transition-colors ${
                                selectedAccountIds.length === 1 && selectedAccountIds[0] === account.id ? 'text-green-400' : 'text-slate-300'
                              }`}
                            >
                              {account.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
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
                  <div className="w-full flex items-center justify-center">
                    {perfLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    ) : (perf1Value !== undefined && perf1Value !== null) || (perf7Value !== undefined && perf7Value !== null) || (perf30Value !== undefined && perf30Value !== null) ? (
                      <div className="w-full grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center text-lg font-semibold">
                        <div className={`text-center ${perf1Value !== undefined && perf1Value !== null ? (perf1Value >= 0 ? 'text-green-600' : 'text-red-600') : 'invisible'}`}>
                          1D<br />{perf1Value !== undefined && perf1Value !== null ? `${perf1Value >= 0 ? '+' : ''}${perf1Value.toFixed(1)}%` : ''}
                        </div>
                        <span className="text-slate-500 px-2">|</span>
                        <div className={`text-center ${perf7Value !== undefined && perf7Value !== null ? (perf7Value >= 0 ? 'text-green-600' : 'text-red-600') : 'invisible'}`}>
                          1W<br />{perf7Value !== undefined && perf7Value !== null ? `${perf7Value >= 0 ? '+' : ''}${perf7Value.toFixed(1)}%` : ''}
                        </div>
                        <span className="text-slate-500 px-2">|</span>
                        <div className={`text-center ${perf30Value !== undefined && perf30Value !== null ? (perf30Value >= 0 ? 'text-green-600' : 'text-red-600') : 'invisible'}`}>
                          1M<br />{perf30Value !== undefined && perf30Value !== null ? `${perf30Value >= 0 ? '+' : ''}${perf30Value.toFixed(1)}%` : ''}
                        </div>
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
            className={`${cardBaseClass} ${dragOverClass} overflow-hidden transition-colors ${portfolioHeaderHovered ? '!border-orange-500' : ''}`}
          >
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <div
                className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={(e) => { e.stopPropagation(); navigate('/demo-alphawise/portfolio'); }}
                onMouseEnter={() => setPortfolioHeaderHovered(true)}
                onMouseLeave={() => setPortfolioHeaderHovered(false)}
              >
                <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center">
                  <Flame className="w-4 h-4 text-white" />
                </div>
                <span className="text-xl font-bold text-white">
                  {language === 'fr' ? 'Top Movers' : 'Top Movers'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); setMoversSortAsc(!moversSortAsc); }}
                  className="p-1 rounded hover:bg-slate-700 transition-colors"
                  title={moversSortAsc ? 'Sort descending' : 'Sort ascending'}
                >
                  {moversSortAsc ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                <div className="flex rounded overflow-hidden border border-slate-300 dark:border-slate-600">
                  <button
                    onClick={(e) => { e.stopPropagation(); setMoversPeriod(1); }}
                    className={`px-2 h-6 text-xs font-medium flex items-center justify-center ${moversPeriod === 1 ? 'bg-orange-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                  >
                    1D
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setMoversPeriod(7); }}
                    className={`px-2 h-6 text-xs font-medium flex items-center justify-center ${moversPeriod === 7 ? 'bg-orange-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                  >
                    1W
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setMoversPeriod(30); }}
                    className={`px-2 h-6 text-xs font-medium flex items-center justify-center ${moversPeriod === 30 ? 'bg-orange-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                  >
                    1M
                  </button>
                </div>
              </div>
            </div>
            {compositionLoading || topMoversLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : topMovers.length > 0 ? (
              <div className="space-y-2 flex-1 overflow-y-auto scrollbar-hide">
                {[...topMovers].sort((a, b) => moversSortAsc ? a.change_pct - b.change_pct : b.change_pct - a.change_pct).map((stock) => {
                  const logoUrl = getCompanyLogoUrl(stock.ticker);
                  return (
                    <div
                      key={stock.ticker}
                      className="flex items-center justify-between px-2 -mx-2 rounded cursor-pointer hover:bg-slate-700/50 transition-colors"
                      onClick={(e) => { e.stopPropagation(); navigate(`/demo-alphawise/portfolio`); }}
                    >
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
      </div>

      {/* New user welcome banner */}
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
                {language === 'fr' ? 'Bienvenue sur AlphaWise !' : 'Welcome to AlphaWise!'}
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

        {/* Card Grid - only for authenticated users */}
        {isAuthenticated && cardOrderFetched && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 md:px-[10%] mb-8 max-w-4xl mx-auto w-full">
            {gridSlots.slice(0, 2).map((_, index) => renderSlot(index))}
          </div>
        )}

        {/* Blurred preview for unauthenticated users */}
        {!isAuthenticated && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 md:px-[10%] mb-8 max-w-4xl mx-auto w-full select-none pointer-events-none">
            {/* Portfolio Card Preview */}
            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 h-[200px] flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                  <Wallet className="w-4 h-4 text-white" />
                </div>
                <span className="text-xl font-bold text-white">
                  {language === 'fr' ? 'Mon Portefeuille' : 'My Portfolio'}
                </span>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-3 blur-[1.5px]">
                <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">
                  73 458€
                </p>
                <div className="w-full grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center text-lg font-semibold">
                  <div className="text-center text-red-600">1D<br />-0.3%</div>
                  <span className="text-slate-500 px-2">|</span>
                  <div className="text-center text-red-600">1W<br />-1.6%</div>
                  <span className="text-slate-500 px-2">|</span>
                  <div className="text-center text-green-600">1M<br />+1.7%</div>
                </div>
              </div>
            </div>

            {/* Top Movers Card Preview */}
            <div className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 h-[200px] flex flex-col overflow-hidden">
              <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center">
                  <Flame className="w-4 h-4 text-white" />
                </div>
                <span className="text-xl font-bold text-white">
                  {language === 'fr' ? 'Top Movers' : 'Top Movers'}
                </span>
              </div>
              <div className="space-y-2 flex-1 overflow-y-auto scrollbar-hide blur-[1.5px]">
                {[
                  { ticker: 'NVDA', change_pct: 4.2 },
                  { ticker: 'MSFT', change_pct: 2.1 },
                  { ticker: 'GOOGL', change_pct: 1.5 },
                  { ticker: 'META', change_pct: -1.3 },
                ].map((stock) => {
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
