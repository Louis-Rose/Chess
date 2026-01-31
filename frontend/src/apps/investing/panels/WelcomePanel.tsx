// Investing Welcome panel

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Eye, Calendar, TrendingUp, Loader2, PartyPopper, X, GitCompare, Newspaper, Wallet, Flame, Briefcase } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PWAInstallPrompt } from '../../../components/PWAInstallPrompt';
import { getCompanyLogoUrl } from '../utils/companyLogos';

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

interface CardPosition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Card IDs
const ALL_CARD_IDS = [
  'portfolio',
  'top-movers',
  'earnings',
  'watchlist',
  'stock-research',
  'compare-stocks',
  'news-feed',
] as const;

type CardId = typeof ALL_CARD_IDS[number];

// API fetchers
const fetchComposition = async (): Promise<CompositionData> => {
  const response = await axios.get('/api/investing/portfolio/composition');
  return response.data;
};

const fetchPerformance = async (days: number): Promise<PerformanceData> => {
  const response = await axios.get(`/api/investing/portfolio/performance-period?days=${days}`);
  return response.data;
};

const fetchTopMovers = async (days: number): Promise<TopMoversData> => {
  const response = await axios.get(`/api/investing/portfolio/top-movers?days=${days}`);
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

const fetchCardOrder = async (): Promise<CardId[] | null> => {
  const response = await axios.get('/api/preferences/dashboard-card-order');
  return response.data.order;
};

const saveCardOrder = async (order: CardId[]): Promise<void> => {
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

  // Card order state
  const [cardOrder, setCardOrder] = useState<CardId[]>([...ALL_CARD_IDS]);

  // Summary card states
  const [valueCurrency, setValueCurrency] = useState<'EUR' | 'USD'>('EUR');
  const [moversPeriod, setMoversPeriod] = useState<7 | 30>(30);
  const [watchlistMoversPeriod, setWatchlistMoversPeriod] = useState<7 | 30>(30);
  const [earningsSource, setEarningsSource] = useState<EarningsSourceFilter>('both');

  // Drag & drop state
  const [draggedCardId, setDraggedCardId] = useState<CardId | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<CardId | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<CardId, HTMLDivElement>>(new Map());
  const initialPositions = useRef<CardPosition[]>([]);

  // Fetch card order
  const { data: savedCardOrder } = useQuery({
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

  // Update card order when loaded from server
  useEffect(() => {
    if (savedCardOrder && savedCardOrder.length > 0) {
      // Validate that all saved IDs are valid and add any missing ones
      const validOrder = savedCardOrder.filter((id): id is CardId => ALL_CARD_IDS.includes(id as CardId));
      const missingIds = ALL_CARD_IDS.filter(id => !validOrder.includes(id));
      setCardOrder([...validOrder, ...missingIds]);
    }
  }, [savedCardOrder]);

  // Fetch portfolio data
  const { data: compositionData, isLoading: compositionLoading } = useQuery({
    queryKey: ['composition-summary'],
    queryFn: fetchComposition,
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
  });

  const { data: earningsData, isLoading: earningsLoading } = useQuery({
    queryKey: ['earnings-summary', earningsSource],
    queryFn: () => fetchEarnings(earningsSource),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 30,
  });

  const { data: perf7Data, isLoading: perf7Loading } = useQuery({
    queryKey: ['performance-period', 7],
    queryFn: () => fetchPerformance(7),
    enabled: isAuthenticated && (compositionData?.holdings?.length ?? 0) > 0,
    staleTime: 1000 * 60 * 15,
  });

  const { data: perf30Data, isLoading: perf30Loading } = useQuery({
    queryKey: ['performance-period', 30],
    queryFn: () => fetchPerformance(30),
    enabled: isAuthenticated && (compositionData?.holdings?.length ?? 0) > 0,
    staleTime: 1000 * 60 * 15,
  });

  const { data: topMoversData, isLoading: topMoversLoading } = useQuery({
    queryKey: ['top-movers', moversPeriod],
    queryFn: () => fetchTopMovers(moversPeriod),
    enabled: isAuthenticated && (compositionData?.holdings?.length ?? 0) > 0,
    staleTime: 1000 * 60 * 15,
  });

  const { data: watchlistMoversData, isLoading: watchlistMoversLoading } = useQuery({
    queryKey: ['watchlist-movers', watchlistMoversPeriod],
    queryFn: () => fetchWatchlistMovers(watchlistMoversPeriod),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 15,
  });

  // Capture card positions on drag start
  const capturePositions = useCallback(() => {
    const positions: CardPosition[] = [];
    cardRefs.current.forEach((el, id) => {
      const rect = el.getBoundingClientRect();
      positions.push({ id, x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    });
    initialPositions.current = positions;
  }, []);

  // Calculate transform for a card based on preview position (swap behavior)
  const getTransform = useCallback((cardId: CardId, originalIndex: number): { x: number; y: number } => {
    if (draggedCardId === null || dragOverCardId === null) {
      return { x: 0, y: 0 };
    }

    const draggedIndex = cardOrder.findIndex(id => id === draggedCardId);
    const targetIndex = cardOrder.findIndex(id => id === dragOverCardId);

    if (draggedIndex === -1 || targetIndex === -1) return { x: 0, y: 0 };

    // Only the dragged card and target card move (swap)
    let visualIndex = originalIndex;
    if (cardId === draggedCardId) {
      visualIndex = targetIndex;
    } else if (cardId === dragOverCardId) {
      visualIndex = draggedIndex;
    }

    if (visualIndex === originalIndex) return { x: 0, y: 0 };

    const currentPos = initialPositions.current.find(p => p.id === cardId);
    const targetPos = initialPositions.current[visualIndex];
    if (!currentPos || !targetPos) return { x: 0, y: 0 };

    return {
      x: targetPos.x - currentPos.x,
      y: targetPos.y - currentPos.y,
    };
  }, [draggedCardId, dragOverCardId, cardOrder]);

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, cardId: CardId, node: HTMLDivElement) => {
    capturePositions();
    setDraggedCardId(cardId);
    dragNodeRef.current = node;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cardId);
    setTimeout(() => {
      if (dragNodeRef.current) {
        dragNodeRef.current.style.opacity = '0.4';
        dragNodeRef.current.style.pointerEvents = 'none';
      }
    }, 0);
  };

  const handleDragEnd = () => {
    if (dragNodeRef.current) {
      dragNodeRef.current.style.opacity = '1';
      dragNodeRef.current.style.pointerEvents = '';
    }
    setDraggedCardId(null);
    setDragOverCardId(null);
    dragNodeRef.current = null;
  };

  const handleDragOver = (e: React.DragEvent, cardId: CardId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (cardId !== draggedCardId && dragOverCardId !== cardId) {
      setDragOverCardId(cardId);
    }
  };

  const handleContainerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleContainerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragOverCardId !== null) {
      handleDrop(e, dragOverCardId);
    } else {
      handleDragEnd();
    }
  };

  const handleDrop = (e: React.DragEvent, targetCardId: CardId) => {
    e.preventDefault();

    const draggedId = draggedCardId;
    handleDragEnd();

    if (draggedId === null || draggedId === targetCardId) {
      return;
    }

    const newOrder = [...cardOrder];
    const draggedIndex = newOrder.findIndex(id => id === draggedId);
    const targetIndex = newOrder.findIndex(id => id === targetCardId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      // Swap the two cards
      [newOrder[draggedIndex], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[draggedIndex]];
      setCardOrder(newOrder);
      saveOrderMutation.mutate(newOrder);
    }
  };

  // Get upcoming earnings
  const getUpcomingEarnings = () => {
    if (!earningsData?.earnings) return [];
    return earningsData.earnings
      .filter(e => e.remaining_days === null || e.remaining_days >= 0)
      .sort((a, b) => (a.remaining_days ?? 999) - (b.remaining_days ?? 999))
      .slice(0, 15);
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
  const hasHoldings = (compositionData?.holdings?.length ?? 0) > 0;

  // Render individual card by ID
  const renderCard = (cardId: CardId, index: number) => {
    const transform = getTransform(cardId, index);
    const hasTransform = transform.x !== 0 || transform.y !== 0;
    const isDragging = draggedCardId === cardId;
    const isDragOver = dragOverCardId === cardId;

    const cardBaseClass = "bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 h-[200px] flex flex-col transition-colors group";
    const dragClass = isDragOver ? 'ring-2 ring-blue-500 ring-offset-2' : '';

    const cardProps = {
      ref: (el: HTMLDivElement | null) => {
        if (el) cardRefs.current.set(cardId, el);
        else cardRefs.current.delete(cardId);
      },
      draggable: true,
      onDragStart: (e: React.DragEvent<HTMLDivElement>) => handleDragStart(e, cardId, e.currentTarget),
      onDragEnd: handleDragEnd,
      onDragOver: (e: React.DragEvent<HTMLDivElement>) => handleDragOver(e, cardId),
      onDrop: (e: React.DragEvent<HTMLDivElement>) => handleDrop(e, cardId),
      style: {
        transform: hasTransform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        transition: draggedCardId ? 'transform 200ms ease-out' : undefined,
        zIndex: isDragging ? 10 : undefined,
      },
    };

    switch (cardId) {
      case 'portfolio':
        return (
          <div
            key={cardId}
            {...cardProps}
            onClick={() => !isDragging && navigate('/investing/portfolio')}
            className={`${cardBaseClass} ${dragClass} cursor-pointer hover:border-green-500`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                  <Wallet className="w-4 h-4 text-white" />
                </div>
                <span className="text-xl font-bold text-white">
                  {language === 'fr' ? 'Mon Portefeuille' : 'My Portfolio'}
                </span>
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
            className={`${cardBaseClass} ${dragClass} overflow-hidden`}
          >
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center">
                  <Flame className="w-4 h-4 text-white" />
                </div>
                <span className="text-xl font-bold text-white">
                  {language === 'fr' ? 'Top Mouvements' : 'Top Movers'}
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
            className={`${cardBaseClass} ${dragClass} cursor-pointer hover:border-amber-500`}
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
                    onClick={(e) => { e.stopPropagation(); setEarningsSource('both'); }}
                    className={`px-2 h-6 text-sm font-medium flex items-center justify-center rounded-l ${earningsSource === 'both' ? 'bg-amber-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                  >
                    {language === 'fr' ? 'Tout' : 'All'}
                  </button>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-600 text-white text-xs rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-75 z-50 w-max max-w-36 text-center pointer-events-none">
                    {language === 'fr' ? 'Portefeuille et watchlist' : 'Both owned stocks and watchlist stocks'}
                  </div>
                </div>
                <div className="relative group/tooltip">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEarningsSource('portfolio'); }}
                    className={`w-8 h-6 flex items-center justify-center ${earningsSource === 'portfolio' ? 'bg-green-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
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
                    className={`w-8 h-6 flex items-center justify-center rounded-r ${earningsSource === 'watchlist' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-600 text-white text-xs rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity duration-75 z-50 w-max max-w-36 text-center pointer-events-none">
                    {language === 'fr' ? 'Watchlist uniquement' : 'Watchlist stocks only'}
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
                        {earning.remaining_days !== null ? (
                          earning.remaining_days === 0
                            ? (language === 'fr' ? "Aujourd'hui" : 'Today')
                            : `${earning.remaining_days} ${language === 'fr' ? 'jours' : 'days'}`
                        ) : (language === 'fr' ? '~90 jours' : '~90 days')}
                        {earning.remaining_days !== null && !earning.date_confirmed && !earning.is_estimated && ' ~'}
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

      case 'watchlist':
        return (
          <div
            key={cardId}
            {...cardProps}
            onClick={() => !isDragging && navigate('/investing/watchlist')}
            className={`${cardBaseClass} ${dragClass} cursor-pointer hover:border-blue-500 overflow-hidden`}
          >
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Eye className="w-4 h-4 text-white" />
                </div>
                <span className="text-xl font-bold text-white">
                  {language === 'fr' ? 'Ma Watchlist' : 'My Watchlist'}
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
            className={`${cardBaseClass} ${dragClass} cursor-pointer hover:border-purple-500`}
          >
            <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white">
                {language === 'fr' ? 'Recherche d\'actions' : 'Stock Research'}
              </h3>
            </div>
            <p className="text-slate-400 text-sm flex-1">
              {language === 'fr' ? 'Données financières et analyses sur toute entreprise cotée.' : 'Financials and insights on any listed company.'}
            </p>
          </div>
        );

      case 'compare-stocks':
        return (
          <div
            key={cardId}
            {...cardProps}
            onClick={() => !isDragging && navigate('/investing/comparison')}
            className={`${cardBaseClass} ${dragClass} cursor-pointer hover:border-indigo-500`}
          >
            <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <GitCompare className="w-4 h-4 text-white" />
              </div>
              <h3 className="text-xl font-bold text-white">
                {language === 'fr' ? 'Comparer' : 'Compare Stocks'}
              </h3>
            </div>
            <p className="text-slate-400 text-sm flex-1">
              {language === 'fr' ? 'Comparez plusieurs actions côte à côte.' : 'Compare multiple stocks side by side.'}
            </p>
          </div>
        );

      case 'news-feed':
        return (
          <div
            key={cardId}
            {...cardProps}
            onClick={() => !isDragging && navigate('/investing/news-feed')}
            className={`${cardBaseClass} ${dragClass} cursor-pointer hover:border-red-500`}
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

        {/* Unified Card Grid - only for authenticated users */}
        {isAuthenticated && (
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-[10%] mb-8"
            onDragOver={handleContainerDragOver}
            onDrop={handleContainerDrop}
          >
            {cardOrder.map((cardId, index) => renderCard(cardId, index))}
          </div>
        )}

        {/* Feature cards for non-authenticated users */}
        {!isAuthenticated && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 px-[10%] mb-8">
            <div
              className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 h-[200px] flex flex-col"
            >
              <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  {language === 'fr' ? 'Recherche d\'actions' : 'Stock Research'}
                </h3>
              </div>
              <p className="text-slate-400 text-sm flex-1">
                {language === 'fr' ? 'Données financières et analyses sur toute entreprise cotée.' : 'Financials and insights on any listed company.'}
              </p>
            </div>
            <div
              className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 h-[200px] flex flex-col"
            >
              <div className="flex items-center gap-2 mb-3 flex-shrink-0">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                  <GitCompare className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  {language === 'fr' ? 'Comparer' : 'Compare Stocks'}
                </h3>
              </div>
              <p className="text-slate-400 text-sm flex-1">
                {language === 'fr' ? 'Comparez plusieurs actions côte à côte.' : 'Compare multiple stocks side by side.'}
              </p>
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
