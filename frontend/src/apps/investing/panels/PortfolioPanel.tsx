// Portfolio panel with transactions, composition and performance

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Briefcase, Loader2, Eye, EyeOff, ChevronRight, ArrowUpDown, Download } from 'lucide-react';
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
} from './portfolio/types';

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
    // Show exact same view as authenticated users with mock data (it's blurred anyway)
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
                <div className="px-3 py-2 text-sm font-medium bg-green-600 text-white">EUR \u20ac</div>
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
          {/* Mock Account Selector */}
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Briefcase className="w-5 h-5 text-green-500" />
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {language === 'fr' ? 'Mes comptes' : 'My Accounts'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium">PEA Boursorama</div>
              <div className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm">CTO Trade Republic</div>
            </div>
          </div>

          {/* Mock Summary Cards - same structure as authenticated */}
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center border-r border-slate-300 last:border-r-0 pr-4 last:pr-0">
                <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Capital investi' : 'Invested Capital'}</p>
                <p className="text-sm md:text-xl font-bold text-slate-800 dark:text-slate-100">20 000\u20ac</p>
              </div>
              <div className="text-center border-r border-slate-300 last:border-r-0 pr-4 last:pr-0">
                <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Valeur actuelle' : 'Current Value'}</p>
                <p className="text-sm md:text-xl font-bold text-slate-800 dark:text-slate-100">24 350\u20ac</p>
              </div>
              <div className="text-center border-r border-slate-300 last:border-r-0 pr-4 last:pr-0">
                <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Gain latent' : 'Unrealized Gain'}</p>
                <p className="text-sm md:text-xl font-bold text-green-500">+4 350\u20ac</p>
                <p className="text-xs text-green-500">+21.8%</p>
              </div>
              <div className="text-center">
                <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Gain r\u00e9alis\u00e9' : 'Realized Gain'}</p>
                <p className="text-sm md:text-xl font-bold text-green-500">+1 200\u20ac</p>
                <p className="text-xs text-green-500">+6.0%</p>
              </div>
            </div>
          </div>

          {/* Mock Composition - same structure as authenticated (pie chart + table) */}
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4">
            <div className="flex items-center justify-center gap-3 mb-6">
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{language === 'fr' ? 'Positions' : 'Holdings'}</h3>
              <div className="flex items-center gap-1.5 px-2 py-1 text-slate-500 dark:text-slate-300 text-sm">
                <Download className="w-4 h-4" />
                <span>{language === 'fr' ? 'T\u00e9l\u00e9charger' : 'Download'}</span>
              </div>
            </div>
            <div className="bg-slate-100 dark:bg-slate-700 rounded-xl p-4">
              <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8">
                {/* Pie Chart placeholder */}
                <div className="w-full md:w-1/2 h-[280px] flex items-center justify-center">
                  <svg viewBox="0 0 200 200" className="w-48 h-48">
                    <circle cx="100" cy="100" r="80" fill="none" stroke="#22c55e" strokeWidth="30" strokeDasharray="125 377" transform="rotate(-90 100 100)" />
                    <circle cx="100" cy="100" r="80" fill="none" stroke="#3b82f6" strokeWidth="30" strokeDasharray="100 377" strokeDashoffset="-125" transform="rotate(-90 100 100)" />
                    <circle cx="100" cy="100" r="80" fill="none" stroke="#a855f7" strokeWidth="30" strokeDasharray="80 377" strokeDashoffset="-225" transform="rotate(-90 100 100)" />
                    <circle cx="100" cy="100" r="80" fill="none" stroke="#f59e0b" strokeWidth="30" strokeDasharray="72 377" strokeDashoffset="-305" transform="rotate(-90 100 100)" />
                  </svg>
                </div>
                {/* Holdings Table */}
                <div className="w-full md:w-1/2">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-slate-600 dark:text-slate-300 text-sm border-b border-slate-300 dark:border-slate-500">
                        <th className="pb-2">{language === 'fr' ? 'Action' : 'Stock'}</th>
                        <th className="pb-2 text-right">{language === 'fr' ? 'Qt\u00e9' : 'Shares'}</th>
                        <th className="pb-2 text-right">{language === 'fr' ? 'Prix' : 'Price'}</th>
                        <th className="pb-2 text-right">{language === 'fr' ? 'Valeur' : 'Value'}</th>
                        <th className="pb-2 text-right">{language === 'fr' ? 'Gain' : 'Gain'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { ticker: 'AAPL', qty: 15, price: '$227.50', value: '3 200\u20ac', gain: '+18.2%', color: '#22c55e' },
                        { ticker: 'MSFT', qty: 8, price: '$415.80', value: '3 100\u20ac', gain: '+24.5%', color: '#3b82f6' },
                        { ticker: 'MC.PA', qty: 4, price: '\u20ac785.40', value: '3 140\u20ac', gain: '+12.1%', color: '#a855f7' },
                        { ticker: 'NVDA', qty: 25, price: '$138.25', value: '3 230\u20ac', gain: '+45.3%', color: '#f59e0b' },
                      ].map((h) => (
                        <tr key={h.ticker} className="border-b border-slate-200 dark:border-slate-600">
                          <td className="py-2 font-bold" style={{ color: h.color }}>{h.ticker}</td>
                          <td className="py-2 text-right text-slate-600 dark:text-slate-300">{h.qty}</td>
                          <td className="py-2 text-right text-slate-600 dark:text-slate-300">{h.price}</td>
                          <td className="py-2 text-right text-slate-800 dark:text-slate-100 font-medium">{h.value}</td>
                          <td className="py-2 text-right font-medium text-green-600">{h.gain}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Mock Performance Chart - same structure as authenticated */}
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1"></div>
              <h3 className="text-lg md:text-xl font-bold text-slate-800 dark:text-slate-100">{language === 'fr' ? 'Performance' : 'Performance'}</h3>
              <div className="flex-1 flex justify-end">
                <div className="flex items-center gap-1.5 px-2 py-1 text-slate-500 dark:text-slate-300 text-sm">
                  <Download className="w-4 h-4" />
                </div>
              </div>
            </div>
            {/* Benchmark toggle */}
            <div className="flex justify-center gap-2 mb-4">
              <div className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 text-white">NASDAQ</div>
              <div className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300">S&P 500</div>
            </div>
            {/* Chart placeholder - line chart style */}
            <div className="bg-slate-100 dark:bg-slate-600 rounded-xl p-4 h-[300px] relative">
              <svg viewBox="0 0 400 200" className="w-full h-full" preserveAspectRatio="none">
                {/* Grid lines */}
                <line x1="0" y1="50" x2="400" y2="50" stroke="#94a3b8" strokeWidth="0.5" />
                <line x1="0" y1="100" x2="400" y2="100" stroke="#94a3b8" strokeWidth="0.5" />
                <line x1="0" y1="150" x2="400" y2="150" stroke="#94a3b8" strokeWidth="0.5" />
                {/* Portfolio line (green) */}
                <path d="M0,180 Q50,170 100,150 T200,120 T300,80 T400,40" fill="none" stroke="#22c55e" strokeWidth="2" />
                {/* Benchmark line (gray) */}
                <path d="M0,180 Q50,175 100,160 T200,140 T300,110 T400,70" fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5,5" />
              </svg>
              {/* Legend */}
              <div className="absolute bottom-2 right-2 flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-0.5 bg-green-500"></div>
                  <span className="text-slate-600 dark:text-slate-300">{language === 'fr' ? 'Portefeuille' : 'Portfolio'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-0.5 bg-slate-400 border-dashed"></div>
                  <span className="text-slate-600 dark:text-slate-300">NASDAQ</span>
                </div>
              </div>
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
          isCreating={createAccountMutation.isPending}
          isDeleting={deleteAccountMutation.isPending}
        />

        {/* Transaction Form - Only when at least one account selected */}
        {selectedAccountIds.length > 0 && (
          <TransactionForm
            transactions={transactions}
            selectedAccountId={selectedAccountIds[0]}
            selectedAccountIds={selectedAccountIds}
            selectedAccountBank={accounts.find(a => a.id === selectedAccountIds[0])?.bank}
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
