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

          {/* Summary Cards - fake data: 20,000€ invested */}
          <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center border-r border-slate-300 last:border-r-0 pr-4 last:pr-0">
                <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Capital investi' : 'Invested Capital'}</p>
                <p className="text-sm md:text-xl font-bold text-slate-800 dark:text-slate-100">20 000€</p>
              </div>
              <div className="text-center border-r border-slate-300 last:border-r-0 pr-4 last:pr-0">
                <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Valeur actuelle' : 'Current Value'}</p>
                <p className="text-sm md:text-xl font-bold text-slate-800 dark:text-slate-100">27 050€</p>
              </div>
              <div className="text-center border-r border-slate-300 last:border-r-0 pr-4 last:pr-0">
                <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Plus-value latente (brut)' : 'Unrealized Gains (gross)'}</p>
                <p className="text-sm md:text-xl font-bold text-green-600">+7 050€ (+35.2%)</p>
              </div>
              <div className="text-center">
                <p className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{language === 'fr' ? 'Plus-value réalisée (brut)' : 'Realized Gains (gross)'}</p>
                <p className="text-sm md:text-xl font-bold text-green-600">+590€ (+3%)</p>
              </div>
            </div>
          </div>

          {/* Current Holdings - collapsible panel */}
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
              <div className="bg-slate-100 dark:bg-slate-700 rounded-xl p-4">
                <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8">
                  {/* Filled Pie Chart with labels */}
                  <div className="w-full md:w-1/2 h-[300px] flex items-center justify-center relative">
                    <svg viewBox="0 0 200 200" className="w-48 h-48">
                      {/* Filled pie slices using path elements */}
                      <path d="M100,100 L100,20 A80,80 0 0,1 169,65 Z" fill="#22c55e" />
                      <path d="M100,100 L169,65 A80,80 0 0,1 169,135 Z" fill="#3b82f6" />
                      <path d="M100,100 L169,135 A80,80 0 0,1 100,180 Z" fill="#f59e0b" />
                      <path d="M100,100 L100,180 A80,80 0 0,1 31,135 Z" fill="#06b6d4" />
                      <path d="M100,100 L31,135 A80,80 0 0,1 100,20 Z" fill="#94a3b8" />
                    </svg>
                    {/* Labels positioned around the pie */}
                    <span className="absolute top-2 right-0 text-sm font-bold text-green-500">NVDA 27.4%</span>
                    <span className="absolute top-1/3 -right-4 text-sm font-bold text-blue-500">MSFT 13.1%</span>
                    <span className="absolute bottom-1/4 right-0 text-sm font-bold text-amber-500">AMZN 19.9%</span>
                    <span className="absolute bottom-4 left-1/4 text-sm font-bold text-cyan-500">META 17.4%</span>
                    <span className="absolute top-1/3 -left-4 text-sm font-bold text-red-500">GOOGL 22.2%</span>
                  </div>
                  {/* Holdings Table */}
                  <div className="w-full md:w-1/2 overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-slate-600 dark:text-slate-300 text-sm border-b border-slate-300 dark:border-slate-500">
                          <th className="pb-2">{language === 'fr' ? 'Action' : 'Stock'}</th>
                          <th className="pb-2 text-right">{language === 'fr' ? 'Qté' : 'Shares'}</th>
                          <th className="pb-2 text-right">{language === 'fr' ? 'Prix' : 'Price'}</th>
                          <th className="pb-2 text-right">{language === 'fr' ? 'Valeur (EUR)' : 'Value (EUR)'}</th>
                          <th className="pb-2 text-right">{language === 'fr' ? 'Gain' : 'Gain'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { ticker: 'NVDA', qty: 40, price: '$178.07', value: '7 410€', gain: '+45.5%', color: '#22c55e' },
                          { ticker: 'GOOGL', qty: 18, price: '$322.00', value: '6 000€', gain: '+35.9%', color: '#ef4444' },
                          { ticker: 'AMZN', qty: 22, price: '$231.00', value: '5 380€', gain: '+25.9%', color: '#f59e0b' },
                          { ticker: 'META', qty: 8, price: '$604.12', value: '4 700€', gain: '+16%', color: '#06b6d4' },
                          { ticker: 'MSFT', qty: 7, price: '$454.52', value: '3 560€', gain: '+8.9%', color: '#3b82f6' },
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
                {/* LUMNA branding */}
                <div className="flex items-center justify-end gap-2 mt-3 mr-2">
                  <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-end">
                    <svg viewBox="0 0 128 128" className="w-6 h-6 mr-0.5">
                      <rect x="28" y="64" width="16" height="40" rx="2" fill="white" />
                      <rect x="56" y="48" width="16" height="56" rx="2" fill="white" />
                      <rect x="84" y="32" width="16" height="72" rx="2" fill="white" />
                    </svg>
                  </div>
                  <span className="text-lg font-bold text-slate-300">LUMNA</span>
                </div>
              </div>
            </div>
          </div>

          {/* Portfolio Performance - collapsible panel */}
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
              {/* Toggles */}
              <div className="flex flex-wrap justify-center gap-4 mb-4">
                <div className="text-center">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Benchmark:</p>
                  <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-500">
                    <div className="px-3 py-1 text-sm bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300">All</div>
                    <div className="px-3 py-1 text-sm bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border-l border-slate-300 dark:border-slate-500">Annualized</div>
                  </div>
                </div>
                <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-500">
                  <div className="px-3 py-1 text-sm bg-green-600 text-white">Nasdaq</div>
                  <div className="px-3 py-1 text-sm bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300">S&P 500</div>
                </div>
              </div>
              <div className="flex justify-center mb-4">
                <div className="px-3 py-1.5 bg-slate-200 dark:bg-slate-600 rounded-lg text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Private mode (base: 100€)
                </div>
              </div>
              {/* Metrics cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-slate-100 dark:bg-slate-600 rounded-xl p-4 text-center">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Holding period</p>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">2 years, 4 months and 12 days</p>
                  <p className="text-xs text-slate-400 mt-2">Weighted period</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">1 year, 3 months and 8 days</p>
                </div>
                <div className="bg-slate-100 dark:bg-slate-600 rounded-xl p-4 text-center">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Portfolio Gains</p>
                  <p className="text-xl font-bold text-green-500">+35€ (+35.2%)</p>
                </div>
                <div className="bg-slate-100 dark:bg-slate-600 rounded-xl p-4 text-center">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Benchmark (Nasdaq)</p>
                  <p className="text-xl font-bold text-green-500">+22€ (+22.3%)</p>
                </div>
              </div>
              {/* Chart with axis labels */}
              <div className="bg-slate-100 dark:bg-slate-600 rounded-xl p-4 relative">
                {/* Y-axis labels */}
                <div className="absolute left-2 top-4 bottom-16 flex flex-col justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>150€</span>
                  <span>100€</span>
                  <span>50€</span>
                  <span>0€</span>
                </div>
                {/* Chart area */}
                <div className="ml-10 h-[220px]">
                  <svg viewBox="0 0 400 200" className="w-full h-full" preserveAspectRatio="none">
                    <line x1="0" y1="50" x2="400" y2="50" stroke="#94a3b8" strokeWidth="0.5" />
                    <line x1="0" y1="100" x2="400" y2="100" stroke="#94a3b8" strokeWidth="0.5" />
                    <line x1="0" y1="150" x2="400" y2="150" stroke="#94a3b8" strokeWidth="0.5" />
                    <path d="M0,180 Q50,170 100,150 T200,100 T300,60 T400,30" fill="none" stroke="#22c55e" strokeWidth="2" />
                    <path d="M0,180 Q50,175 100,155 T200,120 T300,90 T400,60" fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,5" />
                  </svg>
                </div>
                {/* X-axis labels */}
                <div className="ml-10 flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1">
                  <span>Jan 2023</span>
                  <span>Jul 2023</span>
                  <span>Jan 2024</span>
                  <span>Jul 2024</span>
                  <span>Jan 2025</span>
                </div>
                {/* Legend */}
                <div className="flex justify-center items-center gap-6 text-xs mt-3">
                  <div className="flex items-center gap-1"><div className="w-4 h-0.5 bg-green-500"></div><span className="text-slate-500 dark:text-slate-400">Portfolio</span></div>
                  <div className="flex items-center gap-1"><div className="w-4 h-0.5 bg-blue-500 border-dashed"></div><span className="text-slate-500 dark:text-slate-400">Benchmark (EQQQ)</span></div>
                </div>
              </div>
              {/* LUMNA branding */}
              <div className="flex items-center justify-end gap-2 mt-3 mr-2">
                <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-end">
                  <svg viewBox="0 0 128 128" className="w-6 h-6 mr-0.5">
                    <rect x="28" y="64" width="16" height="40" rx="2" fill="white" />
                    <rect x="56" y="48" width="16" height="56" rx="2" fill="white" />
                    <rect x="84" y="32" width="16" height="72" rx="2" fill="white" />
                  </svg>
                </div>
                <span className="text-lg font-bold text-slate-300">LUMNA</span>
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
