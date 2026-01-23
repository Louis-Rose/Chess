// Portfolio panel with transactions, composition and performance

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Briefcase, Loader2, Eye, EyeOff, ChevronRight, ChevronDown, ArrowUpDown, Download, Building2, Wallet, Minus, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PWAInstallPrompt } from '../../../components/PWAInstallPrompt';

// Sub-components
import { AccountSelector } from './portfolio/AccountSelector';
import { TransactionForm } from './portfolio/TransactionForm';
import { PortfolioComposition, type PortfolioCompositionHandle } from './portfolio/PortfolioComposition';
import { PerformanceChart, type PerformanceChartHandle } from './portfolio/PerformanceChart';
import { formatEur } from './portfolio/utils';

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

  const compositionRef = useRef<PortfolioCompositionHandle>(null);
  const performanceRef = useRef<PerformanceChartHandle>(null);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      if (accounts.length <= 1) {
        setSelectedAccountIds([]);
      }
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
            {/* Summary Cards */}
            <div className="px-4 pb-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center border-r border-slate-300 dark:border-slate-600 last:border-r-0 pr-4 last:pr-0">
                  <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Capital investi' : 'Invested Capital'}</p>
                  <p className="text-sm md:text-xl font-bold text-slate-800 dark:text-slate-100">20 000€</p>
                </div>
                <div className="text-center border-r border-slate-300 dark:border-slate-600 last:border-r-0 pr-4 last:pr-0">
                  <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Valeur actuelle' : 'Current Value'}</p>
                  <p className="text-sm md:text-xl font-bold text-slate-800 dark:text-slate-100">27 050€</p>
                </div>
                <div className="text-center border-r border-slate-300 dark:border-slate-600 last:border-r-0 pr-4 last:pr-0">
                  <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Plus-value latente (brut)' : 'Unrealized Gains (gross)'}</p>
                  <p className="text-sm md:text-xl font-bold text-green-600">+7 050€ (+35.2%)</p>
                </div>
                <div className="text-center">
                  <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Plus-value réalisée (brut)' : 'Realized Gains (gross)'}</p>
                  <p className="text-sm md:text-xl font-bold text-green-600">+590€ (+3%)</p>
                </div>
              </div>
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

        {/* Summary Cards */}
        {selectedAccountIds.length > 0 && compositionData && accountHasHoldings && (
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(() => {
                const PRIVATE_COST_BASIS = 10000;
                const actualCostBasis = currency === 'EUR' ? compositionData.total_cost_basis_eur : compositionData.total_cost_basis;
                const scaleFactor = privateMode && actualCostBasis > 0 ? PRIVATE_COST_BASIS / actualCostBasis : 1;

                const displayCostBasis = privateMode ? PRIVATE_COST_BASIS : (currency === 'EUR' ? compositionData.total_cost_basis_eur : compositionData.total_cost_basis);
                const displayTotalValue = (currency === 'EUR' ? compositionData.total_value_eur : compositionData.total_value_eur * compositionData.eurusd_rate) * scaleFactor;

                const unrealizedGainEur = compositionData.total_value_eur - compositionData.total_cost_basis_eur;
                const unrealizedGainPctEur = compositionData.total_cost_basis_eur > 0
                  ? Math.round(100 * unrealizedGainEur / compositionData.total_cost_basis_eur * 10) / 10
                  : 0;
                const rawGain = currency === 'EUR' ? unrealizedGainEur : compositionData.total_gain_usd;
                const displayGain = rawGain * scaleFactor;
                const displayPct = currency === 'EUR' ? unrealizedGainPctEur : compositionData.total_gain_pct;

                const rawRealizedGain = currency === 'EUR'
                  ? compositionData.realized_gains_eur
                  : compositionData.realized_gains_usd;
                const displayRealizedGain = rawRealizedGain * scaleFactor;
                const investedCapital = compositionData.total_cost_basis_eur || 0;
                const realizedGainPct = investedCapital > 0
                  ? Math.round(100 * compositionData.realized_gains_eur / investedCapital * 10) / 10
                  : 0;

                return (
                  <>
                    <div className="text-center border-r border-slate-300 last:border-r-0 pr-4 last:pr-0">
                      <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Capital investi' : 'Invested Capital'}</p>
                      <p className="text-sm md:text-xl font-bold text-slate-800 dark:text-slate-100">
                        {currency === 'EUR'
                          ? `${formatEur(displayCostBasis)}€`
                          : `$${Math.round(displayCostBasis).toLocaleString('en-US')}`}
                      </p>
                    </div>
                    <div className="text-center border-r border-slate-300 last:border-r-0 pr-4 last:pr-0">
                      <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Valeur actuelle' : 'Current Value'}</p>
                      <p className="text-sm md:text-xl font-bold text-slate-800 dark:text-slate-100">
                        {currency === 'EUR'
                          ? `${formatEur(displayTotalValue)}€`
                          : `$${Math.round(displayTotalValue).toLocaleString('en-US')}`}
                      </p>
                    </div>
                    <div className="text-center border-r border-slate-300 last:border-r-0 pr-4 last:pr-0">
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
                  </>
                );
              })()}
            </div>
          </div>
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
        {selectedAccountIds.length > 0 && accountHasHoldings && panelOrder.map((panel) => {
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
