// Demo AlphaWise Welcome panel - with model portfolio pie chart and user portfolio cards

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Loader2, PartyPopper, X, Flame, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useTheme } from '../../../contexts/ThemeContext';
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

interface ModelPortfolioHolding {
  ticker: string;
  weight: number;
  current_price: number;
  change_1d: number | null;
  color: string;
}

interface ModelPortfolioData {
  holdings: ModelPortfolioHolding[];
  total_allocation: number;
  eurusd_rate: number;
}

// Card IDs - only top-movers for demo (no portfolio card)
const ALL_CARD_IDS = ['top-movers'] as const;
type CardId = typeof ALL_CARD_IDS[number];

// Grid has 2 slots (1x2), some can be empty (null)
const GRID_SIZE = 2;
type GridSlot = CardId | null;
const DEFAULT_GRID: GridSlot[] = ['top-movers', null];

// API fetchers - use /api/demo for demo app (separate database)
const fetchModelPortfolio = async (): Promise<ModelPortfolioData> => {
  const response = await axios.get('/api/demo/model-portfolio');
  return response.data;
};

const fetchComposition = async (accountIds: number[]): Promise<CompositionData> => {
  const params = accountIds.length > 0 ? `?account_ids=${accountIds.join(',')}` : '';
  const response = await axios.get(`/api/demo/portfolio/composition${params}`);
  return response.data;
};

const fetchTopMovers = async (days: number, accountIds: number[]): Promise<TopMoversData> => {
  const params = new URLSearchParams({ days: String(days) });
  if (accountIds.length > 0) params.append('account_ids', accountIds.join(','));
  const response = await axios.get(`/api/demo/portfolio/top-movers?${params}`);
  return response.data;
};

const fetchCardOrder = async (): Promise<GridSlot[] | null> => {
  const response = await axios.get('/api/preferences/dashboard-card-order');
  return response.data.order;
};

const saveCardOrder = async (order: GridSlot[]): Promise<void> => {
  await axios.put('/api/preferences/dashboard-card-order', { order });
};

export function WelcomePanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading, user, isNewUser, clearNewUserFlag } = useAuth();
  const { language } = useLanguage();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Grid slots state
  const [gridSlots, setGridSlots] = useState<GridSlot[]>([...DEFAULT_GRID]);

  // Summary card states
  const [moversPeriod, setMoversPeriod] = useState<1 | 7 | 30>(30);
  const [moversSortAsc, setMoversSortAsc] = useState(false);
  const [portfolioHeaderHovered, setPortfolioHeaderHovered] = useState(false);

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

  // Drag & drop state
  const [draggedCardId, setDraggedCardId] = useState<CardId | null>(null);
  const [dragOverSlotIndex, setDragOverSlotIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  // Fetch model portfolio (public, no auth needed)
  const { data: modelPortfolioData, isLoading: modelPortfolioLoading } = useQuery({
    queryKey: ['model-portfolio'],
    queryFn: fetchModelPortfolio,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

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

  // Fetch portfolio data for top movers
  const { data: compositionData } = useQuery({
    queryKey: ['composition-summary', selectedAccountIds],
    queryFn: () => fetchComposition(selectedAccountIds),
    enabled: isAuthenticated && selectedAccountIds.length > 0,
    staleTime: 1000 * 60 * 5,
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

  const topMovers = topMoversData?.movers ?? [];
  const modelHoldings = modelPortfolioData?.holdings ?? [];

  // Pre-calculate "Others" for small slices in model portfolio
  const smallSlices = modelHoldings.filter(h => h.weight < 5);
  const othersTotal = smallSlices.reduce((sum, h) => sum + h.weight, 0);
  const middleSmallSliceIndex = Math.floor(smallSlices.length / 2);
  const middleSmallSliceTicker = smallSlices.length > 0 ? smallSlices[middleSmallSliceIndex].ticker : null;

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

    const cardBaseClass = "bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-5 h-[200px] flex flex-col transition-colors group";

    const cardProps = {
      draggable: true,
      onDragStart: (e: React.DragEvent<HTMLDivElement>) => handleDragStart(e, cardId, e.currentTarget),
      onDragEnd: handleDragEnd,
      onDragOver: (e: React.DragEvent<HTMLDivElement>) => handleSlotDragOver(e, slotIndex),
      onDrop: (e: React.DragEvent<HTMLDivElement>) => handleSlotDrop(e, slotIndex),
    };

    switch (cardId) {
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
            {topMoversLoading ? (
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
      {/* Welcome Header */}
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
          {language === 'fr' ? 'Bienvenue' : 'Welcome'}{isAuthenticated && user?.name ? `, ${user.name}` : ''} !
        </h1>
      </div>

      {/* AlphaWise Model Portfolio Section */}
      <div className="mt-8 px-4 md:px-8 max-w-5xl mx-auto w-full">
        <div className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {language === 'fr' ? 'Portefeuille Modèle' : 'Model Portfolio'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {language === 'fr'
                  ? `${modelHoldings.length} actions US & EU - allocation équilibrée`
                  : `${modelHoldings.length} US & EU stocks - balanced allocation`}
              </p>
            </div>
          </div>

          {modelPortfolioLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : modelHoldings.length > 0 ? (
            <div className="flex flex-col lg:flex-row items-center gap-6">
              {/* Pie Chart */}
              <div className="w-full lg:w-1/2 h-[380px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 40, right: 80, bottom: 40, left: 80 }}>
                    <Pie
                      data={modelHoldings as unknown as Record<string, unknown>[]}
                      dataKey="weight"
                      nameKey="ticker"
                      cx="50%"
                      cy="50%"
                      outerRadius="60%"
                      label={({ name, value, x, y, textAnchor, fill }) => {
                        // For small slices (<5%), show "OTHERS X%" only on the middle one
                        if (value < 5) {
                          if (name === middleSmallSliceTicker && othersTotal > 0) {
                            return (
                              <text
                                x={x}
                                y={y}
                                textAnchor={textAnchor}
                                dominantBaseline="central"
                                fontSize={13}
                                fontWeight="bold"
                                fill={isDark ? '#94a3b8' : '#64748b'}
                              >
                                {language === 'fr' ? 'AUTRES' : 'OTHERS'} {othersTotal.toFixed(0)}%
                              </text>
                            );
                          }
                          return null;
                        }
                        return (
                          <text
                            x={x}
                            y={y}
                            textAnchor={textAnchor}
                            dominantBaseline="central"
                            fontSize={13}
                            fontWeight="bold"
                            fill={fill}
                          >
                            {name} {value}%
                          </text>
                        );
                      }}
                      labelLine={({ percent, name }) => {
                        if (percent >= 0.05) return <path />;
                        if (name === middleSmallSliceTicker && othersTotal > 0) return <path />;
                        return <path style={{ display: 'none' }} />;
                      }}
                    >
                      {modelHoldings.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', borderRadius: '6px', border: '1px solid #334155', padding: '8px 12px' }}
                      itemStyle={{ color: '#f1f5f9' }}
                      formatter={(value, _name, props) => {
                        const payload = props.payload as ModelPortfolioHolding;
                        const change = payload.change_1d;
                        const changeStr = change !== null ? ` (${change >= 0 ? '+' : ''}${change.toFixed(1)}%)` : '';
                        return [`${value}%${changeStr}`, payload.ticker];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Holdings Table */}
              <div className="w-full lg:w-1/2 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-slate-600 dark:text-slate-300 text-sm border-b border-slate-300 dark:border-slate-500">
                      <th className="pb-2">{language === 'fr' ? 'Action' : 'Stock'}</th>
                      <th className="pb-2 text-right">{language === 'fr' ? 'Allocation' : 'Allocation'}</th>
                      <th className="pb-2 text-right">{language === 'fr' ? 'Prix' : 'Price'}</th>
                      <th className="pb-2 text-right">1D</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelHoldings.map((h) => {
                      const logoUrl = getCompanyLogoUrl(h.ticker);
                      return (
                        <tr
                          key={h.ticker}
                          className="border-b border-slate-200 dark:border-slate-600"
                        >
                          <td className="py-2">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                                {logoUrl ? (
                                  <img src={logoUrl} alt={h.ticker} className="w-5 h-5 object-contain" />
                                ) : (
                                  <span className="text-[8px] font-bold text-slate-500">{h.ticker.slice(0, 2)}</span>
                                )}
                              </div>
                              <span className="font-bold" style={{ color: h.color }}>{h.ticker}</span>
                            </div>
                          </td>
                          <td className="py-2 text-right text-slate-700 dark:text-slate-300 font-medium">{h.weight}%</td>
                          <td className="py-2 text-right text-slate-600 dark:text-slate-300">${h.current_price.toFixed(2)}</td>
                          <td className={`py-2 text-right font-medium ${h.change_1d !== null ? (h.change_1d >= 0 ? 'text-green-600' : 'text-red-600') : 'text-slate-400'}`}>
                            {h.change_1d !== null ? `${h.change_1d >= 0 ? '+' : ''}${h.change_1d.toFixed(1)}%` : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-slate-500 text-center py-8">
              {language === 'fr' ? 'Aucune donnée de portefeuille modèle' : 'No model portfolio data'}
            </p>
          )}
        </div>
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

      <div className="md:animate-in md:fade-in md:slide-in-from-bottom-4 md:duration-700 mt-8 flex flex-col">
        {/* Card Grid - only for authenticated users */}
        {isAuthenticated && cardOrderFetched && (
          <div className="grid grid-cols-1 gap-4 px-4 md:px-[10%] mb-8 max-w-md mx-auto w-full">
            {gridSlots.slice(0, 1).map((_, index) => renderSlot(index))}
          </div>
        )}

        {/* Blurred preview for unauthenticated users */}
        {!isAuthenticated && (
          <div className="grid grid-cols-1 gap-4 px-4 md:px-[10%] mb-8 max-w-md mx-auto w-full select-none pointer-events-none">
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

      </div>
    </>
  );
}
