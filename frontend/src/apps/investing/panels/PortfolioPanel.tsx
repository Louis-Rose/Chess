// Portfolio panel with transactions, composition and performance

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Briefcase, Loader2, Eye, EyeOff, ChevronRight, ChevronDown, ArrowUpDown, Download, Building2, Wallet, Minus, Plus, Trash2, MousePointerClick, Info, AlertCircle } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PWAInstallPrompt } from '../../../components/PWAInstallPrompt';

// Sub-components
import { AccountSelector } from './portfolio/AccountSelector';
import { TransactionForm } from './portfolio/TransactionForm';
import { PortfolioComposition, type PortfolioCompositionHandle } from './portfolio/PortfolioComposition';
import { PerformanceChart, type PerformanceChartHandle } from './portfolio/PerformanceChart';
import { formatEur } from './portfolio/utils';
import { calculateSimpleReturn, calculateCAGR, calculateMWR, calculateTWRDetailed, type CashFlow, type ValuationPoint, type TWRSubPeriod } from '../utils/performanceUtils';

// Types
import type {
  Transaction,
  Account,
  BankInfo,
  AccountTypeInfo,
  NewTransaction,
  ComputedHolding,
  CompositionData,
  PerformanceData,
  PerformanceDataPoint,
  CompositionItem,
} from './portfolio/types';

// Generate demo composition data for unauthenticated preview
// This ensures the preview uses the exact same PortfolioComposition component as authenticated users
const generateDemoCompositionData = (): CompositionData => {
  const holdings: CompositionItem[] = [
    { ticker: 'NVDA', quantity: 40, native_currency: 'USD', current_price_native: 178.07, current_price: 178.07, current_value: 7490, cost_basis: 5150, cost_basis_eur: 5150, gain: 2340, gain_eur: 2340, gain_pct: 45.4, weight: 27.7, color: '#22c55e' },
    { ticker: 'GOOGL', quantity: 18, native_currency: 'USD', current_price_native: 322.00, current_price: 322.00, current_value: 6090, cost_basis: 4480, cost_basis_eur: 4480, gain: 1610, gain_eur: 1610, gain_pct: 35.9, weight: 22.5, color: '#ef4444' },
    { ticker: 'AMZN', quantity: 22, native_currency: 'USD', current_price_native: 231.00, current_price: 231.00, current_value: 5300, cost_basis: 4210, cost_basis_eur: 4210, gain: 1090, gain_eur: 1090, gain_pct: 25.9, weight: 19.6, color: '#f59e0b' },
    { ticker: 'META', quantity: 8, native_currency: 'USD', current_price_native: 604.12, current_price: 604.12, current_value: 4700, cost_basis: 4050, cost_basis_eur: 4050, gain: 650, gain_eur: 650, gain_pct: 16.0, weight: 17.4, color: '#06b6d4' },
    { ticker: 'MSFT', quantity: 7, native_currency: 'USD', current_price_native: 454.52, current_price: 454.52, current_value: 3440, cost_basis: 3160, cost_basis_eur: 3160, gain: 280, gain_eur: 280, gain_pct: 8.9, weight: 12.7, color: '#3b82f6' },
  ];

  const totalValue = holdings.reduce((sum, h) => sum + h.current_value, 0);
  const totalCostBasis = holdings.reduce((sum, h) => sum + h.cost_basis, 0);

  return {
    holdings,
    total_value_usd: totalValue,
    total_value_eur: totalValue,
    total_cost_basis: totalCostBasis,
    total_cost_basis_eur: totalCostBasis,
    total_gain_usd: totalValue - totalCostBasis,
    total_gain_pct: Math.round((totalValue - totalCostBasis) / totalCostBasis * 1000) / 10,
    realized_gains_usd: 590,
    realized_gains_eur: 590,
    sold_cost_basis_eur: 0,
    eurusd_rate: 1.0,
  };
};

// Generate demo performance data for unauthenticated preview
// This ensures the preview uses the exact same PerformanceChart component as authenticated users
const generateDemoPerformanceData = (): PerformanceData => {
  const data: PerformanceDataPoint[] = [];
  const today = new Date();
  const startDate = new Date(today);
  startDate.setMonth(startDate.getMonth() - 28); // ~2 years 4 months ago

  let costBasis = 5000; // Start with 5k invested
  let portfolioValue = 5000;
  let benchmarkValue = 5000;

  // Generate monthly data points
  const currentDate = new Date(startDate);
  while (currentDate <= today) {
    // Add capital every few months (simulating DCA)
    if (data.length > 0 && data.length % 3 === 0 && costBasis < 20000) {
      costBasis += 2500;
    }

    // Portfolio grows faster than benchmark (outperformance)
    const monthsElapsed = data.length;
    const portfolioGrowthRate = 1 + (0.015 + Math.sin(monthsElapsed * 0.3) * 0.01); // ~1.5% monthly with variation
    const benchmarkGrowthRate = 1 + (0.01 + Math.sin(monthsElapsed * 0.25) * 0.008); // ~1% monthly with variation

    if (data.length > 0) {
      portfolioValue = portfolioValue * portfolioGrowthRate;
      benchmarkValue = benchmarkValue * benchmarkGrowthRate;
      // Adjust for new capital added
      if (data.length % 3 === 0 && costBasis <= 20000) {
        portfolioValue += 2500;
        benchmarkValue += 2500;
      }
    }

    data.push({
      date: currentDate.toISOString().split('T')[0],
      portfolio_value_eur: Math.round(portfolioValue),
      benchmark_value_eur: Math.round(benchmarkValue),
      cost_basis_eur: costBasis,
      portfolio_growth_usd: 0,
      portfolio_growth_eur: portfolioValue - costBasis,
      benchmark_growth_usd: 0,
      benchmark_growth_eur: benchmarkValue - costBasis,
    });

    // Move to next month
    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  const lastPoint = data[data.length - 1];
  const firstPoint = data[0];

  return {
    data,
    transactions: [],
    summary: {
      start_date: firstPoint.date,
      end_date: lastPoint.date,
      total_cost_basis_eur: lastPoint.cost_basis_eur,
      portfolio_return_eur: Math.round((lastPoint.portfolio_value_eur - lastPoint.cost_basis_eur) / lastPoint.cost_basis_eur * 1000) / 10,
      benchmark_return_eur: Math.round((lastPoint.benchmark_value_eur - lastPoint.cost_basis_eur) / lastPoint.cost_basis_eur * 1000) / 10,
      outperformance_eur: Math.round((lastPoint.portfolio_value_eur - lastPoint.benchmark_value_eur) / lastPoint.cost_basis_eur * 1000) / 10,
      cagr_eur: 15.2,
      cagr_benchmark_eur: 10.5,
      years: 2.33,
      benchmark: 'NASDAQ',
    },
  };
};

// Fetch functions
const fetchTransactions = async (): Promise<{ transactions: Transaction[] }> => {
  const response = await axios.get('/api/investing/transactions');
  return response.data;
};

const fetchHoldings = async (): Promise<{ holdings: ComputedHolding[] }> => {
  const response = await axios.get('/api/investing/holdings');
  return response.data;
};

const fetchComposition = async (accountIds: number[]): Promise<CompositionData> => {
  const params = accountIds.length > 0 ? `?account_ids=${accountIds.join(',')}` : '';
  const response = await axios.get(`/api/investing/portfolio/composition${params}`);
  return response.data;
};

const fetchPerformance = async (benchmark: string, currency: string, accountIds: number[]): Promise<PerformanceData> => {
  const params = new URLSearchParams({ benchmark, currency });
  if (accountIds.length > 0) params.append('account_ids', accountIds.join(','));
  const response = await axios.get(`/api/investing/portfolio/performance?${params}`);
  return response.data;
};

const addTransaction = async (transaction: NewTransaction): Promise<Transaction> => {
  const response = await axios.post('/api/investing/transactions', transaction);
  return response.data;
};

const deleteTransaction = async (id: number): Promise<void> => {
  await axios.delete(`/api/investing/transactions/${id}`);
};

const fetchAccounts = async (): Promise<{ accounts: Account[] }> => {
  const response = await axios.get('/api/investing/accounts');
  return response.data;
};

const fetchBanks = async (): Promise<{ banks: Record<string, BankInfo> }> => {
  const response = await axios.get('/api/investing/banks');
  return response.data;
};

const fetchAccountTypes = async (): Promise<{ account_types: Record<string, AccountTypeInfo> }> => {
  const response = await axios.get('/api/investing/account-types');
  return response.data;
};

const createAccount = async (data: { name: string; account_type: string; bank: string }): Promise<Account> => {
  const response = await axios.post('/api/investing/accounts', data);
  return response.data;
};

const deleteAccount = async (id: number): Promise<void> => {
  await axios.delete(`/api/investing/accounts/${id}`);
};

const reorderAccounts = async (accountIds: number[]): Promise<void> => {
  await axios.put('/api/investing/accounts/reorder', { account_ids: accountIds });
};

export function PortfolioPanel() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { language, t } = useLanguage();
  const queryClient = useQueryClient();

  // Global state
  const [currency, setCurrency] = useState<'EUR' | 'USD'>('EUR');
  const [benchmark, setBenchmark] = useState<'NASDAQ' | 'SP500'>('NASDAQ');
  const [privateMode, setPrivateMode] = useState(false);
  const [showAnnualized, setShowAnnualized] = useState(false);
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

  // Toggle account selection
  const toggleAccountSelection = (id: number) => {
    setSelectedAccountIds(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : [...prev, id]
    );
  };

  // Panel state: collapsed and order
  const [isHoldingsExpanded, setIsHoldingsExpanded] = useState(true);
  const [isPerformanceExpanded, setIsPerformanceExpanded] = useState(true);

  // Advanced metrics section collapsed state - persisted in localStorage
  const [isAdvancedMetricsExpanded, setIsAdvancedMetricsExpanded] = useState(() => {
    const saved = localStorage.getItem('advancedMetricsExpanded');
    return saved !== 'false'; // Default to expanded
  });

  const toggleAdvancedMetrics = () => {
    const newState = !isAdvancedMetricsExpanded;
    setIsAdvancedMetricsExpanded(newState);
    localStorage.setItem('advancedMetricsExpanded', String(newState));
  };

  // Advanced metrics All/Annualized toggle
  const [showAnnualizedMetrics, setShowAnnualizedMetrics] = useState(false);

  const compositionRef = useRef<PortfolioCompositionHandle>(null);
  const performanceRef = useRef<PerformanceChartHandle>(null);

  // Stock selection for filtering - shared between PerformanceChart and summary cards
  const [selectedStocks, setSelectedStocks] = useState<Set<string>>(new Set());
  const [panelOrder, setPanelOrder] = useState<['holdings' | 'performance', 'holdings' | 'performance']>(() => {
    const saved = localStorage.getItem('portfolioPanelOrder');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return ['holdings', 'performance'];
      }
    }
    return ['holdings', 'performance'];
  });
  // Save panel order to localStorage
  useEffect(() => {
    localStorage.setItem('portfolioPanelOrder', JSON.stringify(panelOrder));
  }, [panelOrder]);

  const swapPanels = () => {
    setPanelOrder(prev => [prev[1], prev[0]]);
  };

  // Derive render order: insert 'summary' right after 'holdings'
  const renderOrder = panelOrder.flatMap(panel =>
    panel === 'holdings' ? ['holdings', 'summary'] : [panel]
  ) as ('holdings' | 'summary' | 'performance')[];

  // Queries
  const { data: transactionsData, isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: fetchTransactions,
    enabled: isAuthenticated,
  });

  useQuery({
    queryKey: ['holdings'],
    queryFn: fetchHoldings,
    enabled: isAuthenticated,
  });

  const { data: accountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
    enabled: isAuthenticated,
  });

  const { data: banksData } = useQuery({
    queryKey: ['banks'],
    queryFn: fetchBanks,
  });

  const { data: accountTypesData } = useQuery({
    queryKey: ['accountTypes'],
    queryFn: fetchAccountTypes,
  });

  const accounts = accountsData?.accounts ?? [];
  const banks = banksData?.banks ?? {};
  const accountTypes = accountTypesData?.account_types ?? {};

  const { data: compositionData, isLoading: compositionLoading } = useQuery({
    queryKey: ['composition', selectedAccountIds],
    queryFn: () => fetchComposition(selectedAccountIds),
    enabled: isAuthenticated && selectedAccountIds.length > 0,
  });

  const accountHasHoldings = (compositionData?.holdings?.length ?? 0) > 0;

  const { data: performanceData, isLoading: performanceLoading } = useQuery({
    queryKey: ['performance', benchmark, currency, selectedAccountIds],
    queryFn: () => fetchPerformance(benchmark, currency, selectedAccountIds),
    enabled: isAuthenticated && selectedAccountIds.length > 0 && accountHasHoldings,
  });

  // Track if we've initialized the stock selection
  const hasInitializedStocks = useRef(false);

  // Initialize selectedStocks to all stocks when performance data first loads
  useEffect(() => {
    if (performanceData?.data && performanceData.data.length > 0 && !hasInitializedStocks.current) {
      const lastPoint = performanceData.data[performanceData.data.length - 1];
      if (lastPoint.stocks) {
        hasInitializedStocks.current = true;
        setSelectedStocks(new Set(Object.keys(lastPoint.stocks)));
      }
    }
  }, [performanceData?.data]);

  // Mutations
  const addMutation = useMutation({
    mutationFn: addTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['composition'] });
      queryClient.invalidateQueries({ queryKey: ['performance'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onMutate: async (deletedId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['transactions'] });
      // Snapshot previous value
      const previousTransactions = queryClient.getQueryData(['transactions']);
      // Optimistically remove the transaction
      queryClient.setQueryData(['transactions'], (old: { transactions: Transaction[] } | undefined) => {
        if (!old) return old;
        return { transactions: old.transactions.filter(t => t.id !== deletedId) };
      });
      return { previousTransactions };
    },
    onError: (error, _deletedId, context) => {
      // Rollback on error
      if (context?.previousTransactions) {
        queryClient.setQueryData(['transactions'], context.previousTransactions);
      }
      console.error('Failed to delete transaction:', error);
    },
    onSettled: () => {
      // Refetch to ensure sync with server
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['composition'] });
      queryClient.invalidateQueries({ queryKey: ['performance'] });
    },
  });

  const createAccountMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: (newAccount) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setSelectedAccountIds([newAccount.id]);
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      // Remove deleted account from selection
      setSelectedAccountIds(prev => prev.filter(id => id !== deletedId));
    },
  });

  const reorderAccountsMutation = useMutation({
    mutationFn: reorderAccounts,
    onMutate: async (newOrder) => {
      // Optimistically update the accounts order
      await queryClient.cancelQueries({ queryKey: ['accounts'] });
      const previousAccounts = queryClient.getQueryData(['accounts']);
      queryClient.setQueryData(['accounts'], (old: { accounts: Account[] } | undefined) => {
        if (!old) return old;
        const reordered = newOrder.map(id => old.accounts.find(a => a.id === id)).filter(Boolean) as Account[];
        return { accounts: reordered };
      });
      return { previousAccounts };
    },
    onError: (_err, _newOrder, context) => {
      // Rollback on error
      if (context?.previousAccounts) {
        queryClient.setQueryData(['accounts'], context.previousAccounts);
      }
    },
    onSettled: () => {
      // Refetch to ensure sync with server
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  // Track if initial load has happened
  const hasInitializedRef = useRef(false);

  // Save selected accounts to localStorage
  useEffect(() => {
    if (hasInitializedRef.current) {
      localStorage.setItem('selectedAccountIds', JSON.stringify(selectedAccountIds));
    }
  }, [selectedAccountIds]);

  // Auto-select first account only on initial load when nothing saved
  useEffect(() => {
    if (accounts.length > 0 && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      const saved = localStorage.getItem('selectedAccountIds');
      if (!saved || saved === '[]') {
        setSelectedAccountIds([accounts[0].id]);
      }
    }
  }, [accounts]);

  // Loading states
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-green-500 animate-spin mb-4" />
        <p className="text-slate-400">{t('common.loading')}</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Show exact same view as authenticated users with fake data
    return (
      <div>
        {/* Header - same as authenticated */}
        <div className="md:sticky md:top-0 z-20 bg-slate-200 dark:bg-slate-800 py-4 md:-mx-4 md:px-4 mt-8">
          <div className="flex flex-col items-center gap-2">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{t('portfolio.title')}</h2>
            <p className="text-slate-500 dark:text-slate-400 text-lg italic">{t('portfolio.subtitle')}</p>
            <div className="flex items-center gap-4 mt-2">
              {/* Currency Toggle */}
              <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-white/20">
                <div className="px-3 py-2 text-sm font-medium bg-green-600 text-white">EUR €</div>
                <div className="px-3 py-2 text-sm font-medium bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-200">USD $</div>
              </div>
              <div className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-300 flex items-center gap-2 text-sm">
                <Eye className="w-4 h-4" />
                <span>{t('portfolio.privateMode')}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto space-y-8">
          {/* Account Selector - same structure as authenticated */}
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6">
            {/* Toggle button */}
            <div className="flex justify-center mb-4">
              <div className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm">
                <Minus className="w-4 h-4" />
                {language === 'fr' ? 'Masquer comptes' : 'Hide accounts'}
              </div>
            </div>
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t('accounts.title')}</h3>
              </div>
              <div className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm">
                <Plus className="w-4 h-4" />
                {t('accounts.addAccount')}
              </div>
            </div>
            {/* Account cards grid - only 2 accounts */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { name: 'PEA Boursorama', type: 'PEA', bank: 'Boursorama', selected: true },
                { name: 'CTO Trade Republic', type: 'CTO', bank: 'Trade Republic', selected: false },
              ].map((account) => (
                <div
                  key={account.name}
                  className={`rounded-lg p-4 relative ${
                    account.selected
                      ? 'bg-green-50 dark:bg-green-900/30 border-2 border-green-500 shadow-md'
                      : 'bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className={`w-4 h-4 ${account.selected ? 'text-green-600' : 'text-slate-400'}`} />
                    <span className={`font-bold ${account.selected ? 'text-green-700 dark:text-green-400' : 'text-slate-800 dark:text-slate-200'}`}>{account.name}</span>
                    <div className="ml-auto flex items-center gap-2">
                      {account.selected && (
                        <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                          {language === 'fr' ? 'Sélectionné' : 'Selected'}
                        </span>
                      )}
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </div>
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                    <p><span className="text-slate-400">{t('accounts.type')}:</span> {account.type}</p>
                    <p><span className="text-slate-400">{t('accounts.bank')}:</span> {account.bank}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Transaction Form - collapsed state */}
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6">
            <div className="flex justify-center">
              <div className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm">
                <Plus className="w-4 h-4" />
                {language === 'fr' ? 'Afficher transactions' : 'Show transactions'}
              </div>
            </div>
          </div>

          {/* Current Holdings - using actual PortfolioComposition component with demo data */}
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl shadow-sm dark:shadow-none">
            <div className="flex items-center p-4">
              <div className="flex items-center gap-3 flex-1">
                <ChevronDown className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {language === 'fr' ? 'Positions actuelles' : 'Current Holdings'}
                </h3>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 text-slate-500 dark:text-slate-400 text-sm">
                <Download className="w-4 h-4" />
                <span>{language === 'fr' ? 'Télécharger' : 'Download'}</span>
              </div>
              <ArrowUpDown className="w-5 h-5 text-slate-400 ml-2" />
            </div>
            <div className="px-4 pb-4">
              <PortfolioComposition
                compositionData={generateDemoCompositionData()}
                isLoading={false}
                privateMode={false}
                currency="EUR"
                hideTitle
                hideDownloadButton
              />
            </div>
          </div>

          {/* Summary Cards */}
          <div className="space-y-4">
            {/* Card 1: Capital & Gains */}
            <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center border-r border-slate-300 dark:border-slate-600 pr-4">
                  <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Capital investi' : 'Invested Capital'}</p>
                  <p className="text-sm md:text-xl font-bold text-slate-800 dark:text-slate-100">20 000€</p>
                </div>
                <div className="text-center border-r border-slate-300 dark:border-slate-600 md:border-r pr-4">
                  <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Valeur actuelle' : 'Current Value'}</p>
                  <p className="text-sm md:text-xl font-bold text-slate-800 dark:text-slate-100">27 050€</p>
                </div>
                <div className="text-center border-r border-slate-300 dark:border-slate-600 pr-4">
                  <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Plus-value latente (brut)' : 'Unrealized Gains (gross)'}</p>
                  <p className="text-sm md:text-xl font-bold text-green-600">+7 050€ (+35.2%)</p>
                </div>
                <div className="text-center">
                  <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Plus-value réalisée (brut)' : 'Realized Gains (gross)'}</p>
                  <p className="text-sm md:text-xl font-bold text-green-600">+590€ (+3%)</p>
                </div>
              </div>
            </div>

            {/* Card 2: Advanced Performance Metrics (Collapsible - demo shows expanded) */}
            <div className="bg-slate-50 dark:bg-slate-700 rounded-xl">
              {/* Header */}
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <ChevronDown className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                  <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    {t('performance.advancedMetrics')}
                  </h4>
                </div>
              </div>

              {/* Content */}
              <div className="px-4 pb-4 space-y-4">
                {/* Row 1: Simple Return & CAGR */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Simple Return */}
                  <div className="text-center relative group border-r border-slate-300 dark:border-slate-600 pr-4">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400">
                        {t('performance.simpleReturn')}
                      </p>
                      <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                    </div>
                    <p className="text-sm md:text-xl font-bold text-green-600">+35.2%</p>
                  </div>

                  {/* CAGR */}
                  <div className="text-center relative group">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400">
                        {t('performance.cagr')}
                      </p>
                      <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                    </div>
                    <p className="text-sm md:text-xl font-bold text-green-600">+15.2% {t('performance.perYear')}</p>
                  </div>
                </div>

                {/* SR/CAGR Example */}
                <div className="bg-slate-100 dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg p-3">
                  <div className="flex gap-2.5">
                    <AlertCircle className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0 mt-0.5" />
                    <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-line">
                      {t('performance.srCagrExample')}
                    </p>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-slate-200 dark:border-slate-600" />

                {/* Annualization toggle for TWR/MWR/IRR */}
                <div className="flex justify-center">
                  <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-600 rounded-lg p-1">
                    <span className="px-2 py-1 text-xs font-medium rounded bg-green-600 text-white">
                      {t('performance.allTime')}
                    </span>
                    <span className="px-2 py-1 text-xs font-medium rounded text-slate-600 dark:text-slate-300">
                      {t('performance.annualized')}
                    </span>
                  </div>
                </div>

                {/* Row 2: TWR, MWR */}
                <div className="grid grid-cols-2 gap-4">
                  {/* TWR */}
                  <div className="text-center relative group border-r border-slate-300 dark:border-slate-600 pr-4">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400">
                        {t('performance.twr')}
                      </p>
                      <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                    </div>
                    <p className="text-sm md:text-xl font-bold text-green-600">+32.8%</p>
                  </div>

                  {/* MWR */}
                  <div className="text-center relative group">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400">
                        {t('performance.mwr')}
                      </p>
                      <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                    </div>
                    <p className="text-sm md:text-xl font-bold text-green-600">+14.8%</p>
                  </div>
                </div>

                {/* Example for TWR/MWR/IRR */}
                <div className="bg-slate-100 dark:bg-slate-600 border border-slate-200 dark:border-slate-500 rounded-lg p-3">
                  <div className="flex gap-2.5">
                    <AlertCircle className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0 mt-0.5" />
                    <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-line">
                      {t('performance.twrMwrExample')}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Portfolio Performance - using actual PerformanceChart component with demo data */}
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl shadow-sm dark:shadow-none">
            <div className="flex items-center p-4">
              <div className="flex items-center gap-3 flex-1">
                <ChevronDown className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {language === 'fr' ? 'Performance du portefeuille' : 'Portfolio Performance'}
                </h3>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 text-slate-500 dark:text-slate-400 text-sm">
                <Download className="w-4 h-4" />
                <span>{language === 'fr' ? 'Télécharger' : 'Download'}</span>
              </div>
              <ArrowUpDown className="w-5 h-5 text-slate-400 ml-2" />
            </div>
            <div className="px-4 pb-4">
              <PerformanceChart
                performanceData={generateDemoPerformanceData()}
                isLoading={false}
                benchmark="NASDAQ"
                currency="EUR"
                privateMode={false}
                showAnnualized={false}
                onBenchmarkChange={() => {}}
                onShowAnnualizedChange={() => {}}
                hideTitle
                hideDownloadButton
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (transactionsLoading || accountsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-12 h-12 text-green-500 animate-spin mb-4" />
        <p className="text-slate-400 text-lg">{language === 'fr' ? 'Chargement de votre portefeuille...' : 'Loading your portfolio...'}</p>
      </div>
    );
  }

  const transactions = transactionsData?.transactions ?? [];

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="md:sticky md:top-0 z-20 bg-slate-200 dark:bg-slate-800 py-4 md:-mx-4 md:px-4 mt-8">
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{t('portfolio.title')}</h2>
          <p className="text-slate-500 dark:text-slate-400 text-lg italic">{t('portfolio.subtitle')}</p>
          <PWAInstallPrompt className="max-w-md w-full mt-2" />
          <div className="flex items-center gap-4 mt-2">
            {/* Currency Toggle */}
            <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-white/20">
              <button
                onClick={() => setCurrency('EUR')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${currency === 'EUR' ? 'bg-green-600 text-white' : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500'}`}
              >
                EUR €
              </button>
              <button
                onClick={() => setCurrency('USD')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${currency === 'USD' ? 'bg-green-600 text-white' : 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500'}`}
              >
                USD $
              </button>
            </div>
            <button
              onClick={() => setPrivateMode(!privateMode)}
              className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm ${privateMode ? 'bg-slate-300 dark:bg-slate-500 text-slate-700 dark:text-slate-200' : 'bg-slate-200 dark:bg-slate-600 text-slate-500 dark:text-slate-300 hover:text-slate-700 dark:hover:text-slate-100'}`}
            >
              {privateMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span>{t('portfolio.privateMode')}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto space-y-8">
        {/* Account Selector */}
        <AccountSelector
          accounts={accounts}
          selectedAccountIds={selectedAccountIds}
          onToggleAccount={toggleAccountSelection}
          banks={banks}
          accountTypes={accountTypes}
          onCreateAccount={(data) => createAccountMutation.mutate(data)}
          onDeleteAccount={(id) => deleteAccountMutation.mutate(id)}
          onReorderAccounts={(ids) => reorderAccountsMutation.mutate(ids)}
          isCreating={createAccountMutation.isPending}
          isDeleting={deleteAccountMutation.isPending}
        />

        {/* Prompt to select account when none selected */}
        {accounts.length > 0 && selectedAccountIds.length === 0 && (
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-8 text-center">
            <MousePointerClick className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">
              {language === 'fr' ? 'Sélectionnez un compte' : 'Select an account'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400">
              {language === 'fr'
                ? 'Cliquez sur un compte ci-dessus pour voir vos positions, transactions et performance.'
                : 'Click on an account above to see your holdings, transactions and performance.'}
            </p>
          </div>
        )}

        {/* Transaction Form - Only when at least one account selected */}
        {selectedAccountIds.length > 0 && (
          <TransactionForm
            transactions={transactions}
            selectedAccountIds={selectedAccountIds}
            selectedAccountsWithBanks={accounts
              .filter(a => selectedAccountIds.includes(a.id))
              .map(account => ({ id: account.id, bank: account.bank, name: account.name }))}
            onAddTransaction={(tx) => addMutation.mutate(tx)}
            onDeleteTransaction={(id) => deleteMutation.mutate(id)}
            onRefresh={() => {
              queryClient.invalidateQueries({ queryKey: ['transactions'] });
              queryClient.invalidateQueries({ queryKey: ['holdings'] });
              queryClient.invalidateQueries({ queryKey: ['composition'] });
              queryClient.invalidateQueries({ queryKey: ['performance'] });
            }}
            isAdding={addMutation.isPending}
            deletingId={deleteMutation.isPending ? deleteMutation.variables : null}
            addError={addMutation.error as Error | null}
            privateMode={privateMode}
            displayCurrency={currency}
          />
        )}

        {/* Loading state for composition/performance */}
        {selectedAccountIds.length > 0 && compositionLoading && !compositionData && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-12 h-12 text-green-500 animate-spin mb-4" />
            <p className="text-slate-400 text-lg">{language === 'fr' ? 'Chargement des données...' : 'Loading data...'}</p>
          </div>
        )}

        {/* Empty state - accounts selected but no holdings */}
        {selectedAccountIds.length > 0 && !compositionLoading && !accountHasHoldings && (
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-8 text-center">
            <Briefcase className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-2">
              {language === 'fr' ? 'Aucune position' : 'No holdings'}
            </h3>
            <p className="text-slate-500 dark:text-slate-400">
              {language === 'fr'
                ? 'Ce compte ne contient aucune position. Ajoutez des transactions pour commencer.'
                : 'This account has no holdings. Add transactions to get started.'}
            </p>
          </div>
        )}

        {/* Portfolio Composition & Performance - Reorderable panels */}
        {selectedAccountIds.length > 0 && accountHasHoldings && renderOrder.map((panel) => {
          if (panel === 'holdings') {
            return (
              <div
                key="holdings"
                className="bg-slate-50 dark:bg-slate-700 rounded-xl shadow-sm dark:shadow-none"
              >
                <div className="flex items-center p-4">
                  <button
                    onClick={() => setIsHoldingsExpanded(!isHoldingsExpanded)}
                    className="flex items-center gap-3 text-left flex-1"
                  >
                    <ChevronRight className={`w-5 h-5 text-slate-500 dark:text-slate-400 transition-transform ${isHoldingsExpanded ? 'rotate-90' : ''}`} />
                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                      {language === 'fr' ? 'Positions actuelles' : 'Current Holdings'}
                    </h3>
                  </button>
                  <button
                    onClick={() => compositionRef.current?.download()}
                    disabled={compositionRef.current?.isDownloading}
                    className="flex items-center gap-1.5 px-2 py-1 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors text-sm"
                    title={language === 'fr' ? 'Télécharger' : 'Download'}
                  >
                    <Download className="w-4 h-4" />
                    <span>{language === 'fr' ? 'Télécharger' : 'Download'}</span>
                  </button>
                  <button
                    onClick={swapPanels}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
                    title={language === 'fr' ? 'Inverser l\'ordre des panneaux' : 'Swap panel order'}
                  >
                    <ArrowUpDown className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
                {isHoldingsExpanded && (
                  <div className="px-4 pb-4">
                    <PortfolioComposition
                      ref={compositionRef}
                      compositionData={compositionData}
                      isLoading={compositionLoading}
                      privateMode={privateMode}
                      currency={currency}
                      hideTitle
                      hideDownloadButton
                    />
                  </div>
                )}
              </div>
            );
          } else if (panel === 'summary') {
            // Summary Cards panel - show loading when performance data is loading
            if (!compositionData) return null;

            // Show loading state when performance data is loading
            if (performanceLoading) {
              return (
                <div key="summary" className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4">
                  <div className="flex flex-col items-center justify-center py-4">
                    <Loader2 className="w-8 h-8 text-green-500 animate-spin mb-2" />
                    <p className="text-slate-400 text-sm">{language === 'fr' ? 'Chargement...' : 'Loading...'}</p>
                  </div>
                </div>
              );
            }

            // Filter holdings based on selected stocks from performance chart
            const availableStocksFromComposition = compositionData.holdings?.map(h => h.ticker) || [];
            const isFilteringStocks = selectedStocks.size > 0 && selectedStocks.size < availableStocksFromComposition.length;

            // Calculate filtered totals if filtering
            let filteredTotalValue = compositionData.total_value_eur;
            let filteredCostBasis = compositionData.total_cost_basis_eur;

            if (isFilteringStocks && compositionData.holdings) {
              const filteredHoldings = compositionData.holdings.filter(h => selectedStocks.has(h.ticker));
              filteredTotalValue = filteredHoldings.reduce((sum, h) => sum + h.current_value, 0);
              filteredCostBasis = filteredHoldings.reduce((sum, h) => sum + h.cost_basis_eur, 0);
            } else if (selectedStocks.size === 0 && availableStocksFromComposition.length > 0) {
              // If no stocks selected, show 0
              filteredTotalValue = 0;
              filteredCostBasis = 0;
            }

            const PRIVATE_COST_BASIS = 10000;
            const actualCostBasis = currency === 'EUR' ? filteredCostBasis : filteredCostBasis;
            const scaleFactor = privateMode && actualCostBasis > 0 ? PRIVATE_COST_BASIS / actualCostBasis : 1;

            const displayCostBasis = privateMode ? PRIVATE_COST_BASIS : filteredCostBasis;
            const displayTotalValue = filteredTotalValue * scaleFactor;

            const unrealizedGainEur = filteredTotalValue - filteredCostBasis;
            const unrealizedGainPctEur = filteredCostBasis > 0
              ? Math.round(100 * unrealizedGainEur / filteredCostBasis * 10) / 10
              : 0;
            const rawGain = currency === 'EUR' ? unrealizedGainEur : unrealizedGainEur * compositionData.eurusd_rate;
            const displayGain = rawGain * scaleFactor;
            const displayPct = unrealizedGainPctEur;

            // Realized gains don't change with stock filtering (they're historical)
            const rawRealizedGain = currency === 'EUR'
              ? compositionData.realized_gains_eur
              : compositionData.realized_gains_usd;
            const displayRealizedGain = rawRealizedGain * scaleFactor;
            const investedCapital = compositionData.total_cost_basis_eur || 0;
            const realizedGainPct = investedCapital > 0
              ? Math.round(100 * compositionData.realized_gains_eur / investedCapital * 10) / 10
              : 0;

            // Calculate Simple Return using utility
            const simpleReturnResult = calculateSimpleReturn(filteredCostBasis, filteredTotalValue);
            const simpleReturnPct = simpleReturnResult.success ? simpleReturnResult.percentage : 0;

            // Calculate CAGR using utility (need performance data for dates)
            let cagrPct = 0;
            let cagrSuccess = false;
            let startDate = '';
            let endDate = '';
            if (performanceData?.data && performanceData.data.length > 1) {
              // Filter data to only include dates when selected stocks have non-zero cost basis
              const filteredData = isFilteringStocks
                ? performanceData.data.filter(d => {
                    if (!d.stocks) return false;
                    const filteredCb = Object.entries(d.stocks)
                      .filter(([ticker]) => selectedStocks.has(ticker))
                      .reduce((sum, [, stock]) => sum + stock.cost_basis_eur, 0);
                    return filteredCb > 0;
                  })
                : performanceData.data;

              if (filteredData.length > 1) {
                startDate = filteredData[0].date;
                endDate = filteredData[filteredData.length - 1].date;
                // Use filtered cost basis to respect stock selection
                const cagrResult = calculateCAGR(
                  filteredCostBasis,
                  filteredTotalValue,
                  startDate,
                  endDate,
                  { shortPeriodBehavior: 'extrapolate', minimumDays: 30 }
                );
                if (cagrResult.success) {
                  cagrPct = cagrResult.percentage;
                  cagrSuccess = true;
                }
              }
            }

            // Calculate MWR/IRR and TWR using transaction data as cash flows
            let mwrPct = 0;
            let mwrSuccess = false;
            let twrPct = 0;
            let twrSuccess = false;
            let twrSubPeriods: TWRSubPeriod[] = [];
            let periodYears = 0;
            if (performanceData?.data && performanceData.data.length > 1 && performanceData.transactions && startDate && endDate) {
              // Filter transactions by selected stocks
              const filteredTransactions = isFilteringStocks
                ? performanceData.transactions.filter(tx => selectedStocks.has(tx.ticker))
                : performanceData.transactions;

              // Convert transactions to cash flows format
              // BUY = negative (money going in), SELL = positive (money coming out)
              const cashFlows: CashFlow[] = filteredTransactions
                .filter(tx => tx.date > startDate) // Exclude initial transactions
                .map(tx => ({
                  date: new Date(tx.date),
                  amount: tx.type === 'BUY' ? -(tx.amount_eur || 0) : (tx.amount_eur || 0),
                }))
                .filter(cf => cf.amount !== 0);

              // Get filtered data for the selected stocks period
              const filteredPerfData = isFilteringStocks
                ? performanceData.data.filter(d => {
                    if (!d.stocks) return false;
                    const filteredCb = Object.entries(d.stocks)
                      .filter(([ticker]) => selectedStocks.has(ticker))
                      .reduce((sum, [, stock]) => sum + stock.cost_basis_eur, 0);
                    return filteredCb > 0;
                  })
                : performanceData.data;

              // Get initial investment - filtered by selected stocks if applicable
              const getFilteredValue = (dataPoint: typeof performanceData.data[0]) => {
                if (!isFilteringStocks || !dataPoint.stocks) {
                  return dataPoint.portfolio_value_eur;
                }
                return Object.entries(dataPoint.stocks)
                  .filter(([ticker]) => selectedStocks.has(ticker))
                  .reduce((sum, [, stock]) => sum + stock.value_eur, 0);
              };

              const getFilteredCostBasis = (dataPoint: typeof performanceData.data[0]) => {
                if (!isFilteringStocks || !dataPoint.stocks) {
                  return dataPoint.cost_basis_eur;
                }
                return Object.entries(dataPoint.stocks)
                  .filter(([ticker]) => selectedStocks.has(ticker))
                  .reduce((sum, [, stock]) => sum + stock.cost_basis_eur, 0);
              };

              const initialInvestment = filteredPerfData.length > 0
                ? getFilteredCostBasis(filteredPerfData[0])
                : 0;

              // Calculate period in years for annualization
              const msPerYear = 365 * 24 * 60 * 60 * 1000;
              periodYears = (new Date(endDate).getTime() - new Date(startDate).getTime()) / msPerYear;

              if (initialInvestment > 0) {
                const mwrResult = calculateMWR(
                  initialInvestment,
                  cashFlows,
                  filteredTotalValue,
                  endDate,
                  startDate
                );
                if (mwrResult.success) {
                  mwrPct = mwrResult.percentage;
                  mwrSuccess = true;
                }
              }

              // Calculate TWR - only use valuations at cash flow dates + start/end
              // This prevents chain-linking many daily returns
              // Use filtered data to respect stock selection
              const cashFlowDates = new Set(cashFlows.map(cf => cf.date.toISOString().split('T')[0]));
              const relevantValuations: ValuationPoint[] = filteredPerfData
                .filter((d, i) =>
                  i === 0 || // Start date
                  i === filteredPerfData.length - 1 || // End date
                  cashFlowDates.has(d.date) // Cash flow dates
                )
                .map(d => ({
                  date: new Date(d.date),
                  value: getFilteredValue(d),
                }));

              if (relevantValuations.length >= 2) {
                const twrResult = calculateTWRDetailed(relevantValuations, cashFlows);
                if (twrResult.success) {
                  twrPct = twrResult.percentage;
                  twrSuccess = true;
                  twrSubPeriods = twrResult.subPeriods;
                }
              }
            }

            // MWR from calculateMWR is already annualized (XIRR)
            // For "All Time" display, we need to convert annualized rate to cumulative return
            // Cumulative = (1 + annualized_rate)^years - 1
            const annualizedMwrPct = mwrPct; // This is the IRR (annualized)
            const cumulativeMwrPct = mwrSuccess && periodYears > 0
              ? Math.round((Math.pow(1 + mwrPct / 100, periodYears) - 1) * 1000) / 10
              : mwrPct;

            // Calculate annualized TWR if period > 1 year
            const canAnnualize = periodYears >= 1;
            const annualizedTwrPct = canAnnualize && twrSuccess
              ? Math.round((Math.pow(1 + twrPct / 100, 1 / periodYears) - 1) * 1000) / 10
              : twrPct;

            return (
              <div key="summary" className="space-y-4">
                {/* Card 1: Capital & Gains */}
                <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center border-r border-slate-300 dark:border-slate-600 pr-4">
                      <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Capital investi' : 'Invested Capital'}</p>
                      <p className="text-sm md:text-xl font-bold text-slate-800 dark:text-slate-100">
                        {currency === 'EUR'
                          ? `${formatEur(displayCostBasis)}€`
                          : `$${Math.round(displayCostBasis).toLocaleString('en-US')}`}
                      </p>
                    </div>
                    <div className="text-center border-r border-slate-300 dark:border-slate-600 md:border-r pr-4">
                      <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Valeur actuelle' : 'Current Value'}</p>
                      <p className="text-sm md:text-xl font-bold text-slate-800 dark:text-slate-100">
                        {currency === 'EUR'
                          ? `${formatEur(displayTotalValue)}€`
                          : `$${Math.round(displayTotalValue).toLocaleString('en-US')}`}
                      </p>
                    </div>
                    <div className="text-center border-r border-slate-300 dark:border-slate-600 pr-4">
                      <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                        {language === 'fr' ? 'Plus-value latente (brut)' : 'Unrealized Gains (gross)'}
                      </p>
                      <p className={`text-sm md:text-xl font-bold ${displayGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {currency === 'EUR'
                          ? `${displayGain >= 0 ? '+' : ''}${formatEur(displayGain)}€`
                          : `${displayGain >= 0 ? '+' : ''}$${Math.round(displayGain).toLocaleString('en-US')}`}
                        {' '}
                        ({displayPct >= 0 ? '+' : ''}{displayPct}%)
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">
                        {language === 'fr' ? 'Plus-value realisee (brut)' : 'Realized Gains (gross)'}
                      </p>
                      <p className={`text-sm md:text-xl font-bold ${displayRealizedGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {currency === 'EUR'
                          ? `${displayRealizedGain >= 0 ? '+' : ''}${formatEur(displayRealizedGain)}€`
                          : `${displayRealizedGain >= 0 ? '+' : ''}$${Math.round(displayRealizedGain).toLocaleString('en-US')}`}
                        {' '}
                        ({realizedGainPct >= 0 ? '+' : ''}{realizedGainPct}%)
                      </p>
                    </div>
                  </div>
                </div>

                {/* Card 2: Advanced Performance Metrics (Collapsible) */}
                <div className="bg-slate-50 dark:bg-slate-700 rounded-xl">
                  {/* Header - clickable to expand/collapse */}
                  <div className="p-4">
                    <button
                      onClick={toggleAdvancedMetrics}
                      className="flex items-center gap-2"
                    >
                      <ChevronRight className={`w-5 h-5 text-slate-500 dark:text-slate-400 transition-transform ${isAdvancedMetricsExpanded ? 'rotate-90' : ''}`} />
                      <h4 className="text-base font-bold text-slate-800 dark:text-slate-100">
                        {t('performance.advancedMetrics')}
                      </h4>
                    </button>
                  </div>

                  {/* Content */}
                  {isAdvancedMetricsExpanded && (
                    <div className="px-4 pb-4 space-y-4">
                      {/* Row 1: Simple Return & CAGR */}
                      <div className="grid grid-cols-2 gap-4">
                        {/* Simple Return */}
                        <div className="text-center relative group border-r border-slate-300 dark:border-slate-600 pr-4">
                          <div className="flex items-center justify-center gap-1.5 mb-1">
                            <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400">
                              {t('performance.simpleReturn')}
                            </p>
                            <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                          </div>
                          <p className={`text-sm md:text-xl font-bold ${simpleReturnPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {simpleReturnResult.success
                              ? `${simpleReturnPct >= 0 ? '+' : ''}${simpleReturnPct}%`
                              : '—'}
                          </p>
                          {/* Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 w-80 text-left whitespace-pre-line">
                            {(() => {
                              const currentValueLabel = language === 'fr' ? 'Valeur actuelle' : 'Current Value';
                              const investedLabel = language === 'fr' ? 'Capital investi' : 'Invested Capital';
                              const gainsLabel = language === 'fr' ? 'Plus-value' : 'Gains';
                              const gains = filteredTotalValue - filteredCostBasis;
                              return `${t('performance.simpleReturnTooltip')}\n\n━━━ ${language === 'fr' ? 'Votre portefeuille' : 'Your portfolio'} ━━━\n${currentValueLabel} = ${formatEur(filteredTotalValue)}€\n${investedLabel} = ${formatEur(filteredCostBasis)}€\n${gainsLabel} = ${formatEur(filteredTotalValue)}€ − ${formatEur(filteredCostBasis)}€ = ${gains >= 0 ? '+' : ''}${formatEur(gains)}€\n\nSR = ${gainsLabel} / ${investedLabel}\n= ${gains >= 0 ? '+' : ''}${formatEur(gains)}€ / ${formatEur(filteredCostBasis)}€\n= ${simpleReturnPct >= 0 ? '+' : ''}${simpleReturnPct}%`;
                            })()}
                          </div>
                        </div>

                        {/* CAGR */}
                        <div className="text-center relative group">
                          <div className="flex items-center justify-center gap-1.5 mb-1">
                            <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400">
                              {t('performance.cagr')}
                            </p>
                            <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                          </div>
                          <p className={`text-sm md:text-xl font-bold ${cagrPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {cagrSuccess
                              ? `${cagrPct >= 0 ? '+' : ''}${cagrPct}% ${t('performance.perYear')}`
                              : '—'}
                          </p>
                          {/* Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 w-80 text-left whitespace-pre-line">
                            {(() => {
                              const currentValueLabel = language === 'fr' ? 'Valeur actuelle' : 'Current Value';
                              const investedLabel = language === 'fr' ? 'Capital investi' : 'Invested Capital';
                              const periodLabel = language === 'fr' ? 'Période' : 'Period';
                              const yearsLabel = language === 'fr' ? 'ans' : 'years';
                              const ratio = filteredCostBasis > 0 ? (filteredTotalValue / filteredCostBasis).toFixed(3) : '0';
                              const exponent = (1/periodYears).toFixed(3);
                              const resultValue = filteredCostBasis > 0 ? Math.pow(filteredTotalValue / filteredCostBasis, 1/periodYears).toFixed(3) : '0';
                              return `${t('performance.cagrTooltip')}\n\n━━━ ${language === 'fr' ? 'Votre portefeuille' : 'Your portfolio'} ━━━\n${currentValueLabel} = ${formatEur(filteredTotalValue)}€\n${investedLabel} = ${formatEur(filteredCostBasis)}€\n${periodLabel} = ${periodYears.toFixed(2)} ${yearsLabel}\n\nCAGR = (${currentValueLabel} / ${investedLabel})^(1/${periodLabel}) − 1\n= (${formatEur(filteredTotalValue)}€ / ${formatEur(filteredCostBasis)}€)^(1/${periodYears.toFixed(2)}) − 1\n= ${ratio}^${exponent} − 1\n= ${resultValue} − 1\n= ${cagrPct >= 0 ? '+' : ''}${cagrPct}% (${t('performance.perYear')})`;
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="border-t border-slate-200 dark:border-slate-600" />

                      {/* Annualization toggle for TWR/MWR/IRR */}
                      <div className="flex justify-center">
                        <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-600 rounded-lg p-1">
                          <button
                            onClick={() => setShowAnnualizedMetrics(false)}
                            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                              !showAnnualizedMetrics
                                ? 'bg-green-600 text-white'
                                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500'
                            }`}
                          >
                            {t('performance.allTime')}
                          </button>
                          <button
                            onClick={() => setShowAnnualizedMetrics(true)}
                            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                              showAnnualizedMetrics
                                ? 'bg-green-600 text-white'
                                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500'
                            }`}
                          >
                            {t('performance.annualized')}
                          </button>
                        </div>
                      </div>

                      {/* Row 2: TWR, MWR/IRR */}
                      <div className="grid grid-cols-2 gap-4">
                        {/* TWR */}
                        <div className="text-center relative group border-r border-slate-300 dark:border-slate-600 pr-4">
                          <div className="flex items-center justify-center gap-1.5 mb-1">
                            <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400">
                              {t('performance.twr')}
                            </p>
                            <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                          </div>
                          <p className={`text-sm md:text-xl font-bold ${(showAnnualizedMetrics ? annualizedTwrPct : twrPct) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {twrSuccess
                              ? `${(showAnnualizedMetrics ? annualizedTwrPct : twrPct) >= 0 ? '+' : ''}${showAnnualizedMetrics ? annualizedTwrPct : twrPct}%${showAnnualizedMetrics ? ` ${t('performance.perYear')}` : ''}`
                              : '—'}
                          </p>
                          {/* Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 w-80 text-left whitespace-pre-line">
                            {(() => {
                              const header = t('performance.twrTooltip');
                              const filteredLabel = isFilteringStocks
                                ? (language === 'fr' ? `${selectedStocks.size} action(s)` : `${selectedStocks.size} stock(s)`)
                                : (language === 'fr' ? 'Portefeuille complet' : 'Full portfolio');
                              const currentValueLabel = language === 'fr' ? 'Valeur actuelle' : 'Current Value';
                              const investedLabel = language === 'fr' ? 'Capital investi' : 'Invested Capital';
                              const periodLabel = language === 'fr' ? 'Période' : 'Period';
                              const yearsLabel = language === 'fr' ? 'ans' : 'years';

                              if (!twrSuccess || twrSubPeriods.length === 0) {
                                return `${header}\n\n━━━ ${filteredLabel} ━━━\n${language === 'fr' ? 'Données insuffisantes' : 'Insufficient data'}`;
                              }

                              // Intermediary variables
                              const varsSection = `${currentValueLabel} = ${formatEur(filteredTotalValue)}€\n${investedLabel} = ${formatEur(filteredCostBasis)}€\n${periodLabel} = ${periodYears.toFixed(2)} ${yearsLabel}`;

                              // Build sub-period details (all periods) with start/end values for debugging
                              const periodDetails = twrSubPeriods.map(sp => {
                                const startStr = sp.startDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                const endStr = sp.endDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                                const sign = sp.returnPct >= 0 ? '+' : '';
                                return `${startStr} (${formatEur(sp.startValue)}€) → ${endStr} (${formatEur(sp.endValue)}€): ${sign}${sp.returnPct}%`;
                              }).join('\n');

                              // Format chain-linking formula with decimal multipliers: 1.084 × 1.242 × ...
                              const chainParts = twrSubPeriods.map(sp => (1 + sp.return).toFixed(3));
                              const chainFormula = chainParts.join(' × ') + ' − 1';

                              // Calculate product for display
                              const totalProduct = 1 + twrPct / 100;

                              const resultLine = `= ${totalProduct.toFixed(4)} − 1 = ${twrPct >= 0 ? '+' : ''}${twrPct}%`;

                              const annualizedLine = showAnnualizedMetrics && periodYears >= 1
                                ? `\n${language === 'fr' ? 'Annualisé' : 'Annualized'}: (1 + ${twrPct / 100})^(1/${periodYears.toFixed(2)}) − 1\n= ${annualizedTwrPct >= 0 ? '+' : ''}${annualizedTwrPct}%/${language === 'fr' ? 'an' : 'y'}`
                                : '';

                              return `${header}\n\n━━━ ${filteredLabel} ━━━\n${varsSection}\n\n(${twrSubPeriods.length} ${language === 'fr' ? 'périodes' : 'periods'})\n${periodDetails}\n\n${chainFormula}\n${resultLine}${annualizedLine}`;
                            })()}
                          </div>
                        </div>

                        {/* MWR (shows as IRR when annualized) */}
                        <div className="text-center relative group">
                          <div className="flex items-center justify-center gap-1.5 mb-1">
                            <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400">
                              {showAnnualizedMetrics ? t('performance.irr') : t('performance.mwr')}
                            </p>
                            <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                          </div>
                          <p className={`text-sm md:text-xl font-bold ${(showAnnualizedMetrics ? annualizedMwrPct : cumulativeMwrPct) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {mwrSuccess
                              ? `${(showAnnualizedMetrics ? annualizedMwrPct : cumulativeMwrPct) >= 0 ? '+' : ''}${showAnnualizedMetrics ? annualizedMwrPct : cumulativeMwrPct}%${showAnnualizedMetrics ? ` ${t('performance.perYear')}` : ''}`
                              : '—'}
                          </p>
                          {/* Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 w-80 text-left whitespace-pre-line">
                            {(() => {
                              const currentValueLabel = language === 'fr' ? 'Valeur actuelle' : 'Current Value';
                              const investedLabel = language === 'fr' ? 'Capital investi' : 'Invested Capital';
                              const periodLabel = language === 'fr' ? 'Période' : 'Period';
                              const yearsLabel = language === 'fr' ? 'ans' : 'years';
                              const portfolioLabel = language === 'fr' ? 'Votre portefeuille' : 'Your portfolio';

                              if (showAnnualizedMetrics) {
                                return `${t('performance.irrTooltip')}\n\n━━━ ${portfolioLabel} ━━━\n${currentValueLabel} = ${formatEur(filteredTotalValue)}€\n${investedLabel} = ${formatEur(filteredCostBasis)}€\n${periodLabel} = ${periodYears.toFixed(2)} ${yearsLabel}\n\nIRR = ${annualizedMwrPct >= 0 ? '+' : ''}${annualizedMwrPct}% (${t('performance.perYear')})`;
                              } else {
                                return `${t('performance.mwrTooltip')}\n\n━━━ ${portfolioLabel} ━━━\n${currentValueLabel} = ${formatEur(filteredTotalValue)}€\n${investedLabel} = ${formatEur(filteredCostBasis)}€\n${periodLabel} = ${periodYears.toFixed(2)} ${yearsLabel}\nIRR = ${annualizedMwrPct >= 0 ? '+' : ''}${annualizedMwrPct}%/${language === 'fr' ? 'an' : 'y'}\n\nMWR = (1 + IRR)^${periodLabel.toLowerCase()} − 1\n= (1 + ${annualizedMwrPct}%)^${periodYears.toFixed(2)} − 1\n= (${(1 + annualizedMwrPct / 100).toFixed(3)})^${periodYears.toFixed(2)} − 1\n= ${cumulativeMwrPct >= 0 ? '+' : ''}${cumulativeMwrPct}%`;
                              }
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          } else {
            return (
              <div
                key="performance"
                className="bg-slate-50 dark:bg-slate-700 rounded-xl shadow-sm dark:shadow-none"
              >
                <div className="flex items-center p-4">
                  <button
                    onClick={() => setIsPerformanceExpanded(!isPerformanceExpanded)}
                    className="flex items-center gap-3 text-left flex-1"
                  >
                    <ChevronRight className={`w-5 h-5 text-slate-500 dark:text-slate-400 transition-transform ${isPerformanceExpanded ? 'rotate-90' : ''}`} />
                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                      {language === 'fr' ? 'Performance du portefeuille' : 'Portfolio Performance'}
                    </h3>
                  </button>
                  <button
                    onClick={() => performanceRef.current?.download()}
                    disabled={performanceRef.current?.isDownloading}
                    className="flex items-center gap-1.5 px-2 py-1 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors text-sm"
                    title={language === 'fr' ? 'Télécharger' : 'Download'}
                  >
                    <Download className="w-4 h-4" />
                    <span>{language === 'fr' ? 'Télécharger' : 'Download'}</span>
                  </button>
                  <button
                    onClick={swapPanels}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
                    title={language === 'fr' ? 'Inverser l\'ordre des panneaux' : 'Swap panel order'}
                  >
                    <ArrowUpDown className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
                {isPerformanceExpanded && (
                  <div className="px-4 pb-4">
                    <PerformanceChart
                      ref={performanceRef}
                      performanceData={performanceData}
                      isLoading={performanceLoading}
                      benchmark={benchmark}
                      currency={currency}
                      privateMode={privateMode}
                      showAnnualized={showAnnualized}
                      onBenchmarkChange={setBenchmark}
                      onShowAnnualizedChange={setShowAnnualized}
                      hideTitle
                      hideDownloadButton
                      selectedStocks={selectedStocks}
                      onSelectedStocksChange={setSelectedStocks}
                    />
                  </div>
                )}
              </div>
            );
          }
        })}
      </div>
    </div>
  );
}
