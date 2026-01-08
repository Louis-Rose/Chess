// Portfolio panel with transactions, composition and performance

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Briefcase, Loader2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LoginButton } from '../../../components/LoginButton';
import { PWAInstallPrompt } from '../../../components/PWAInstallPrompt';

// Sub-components
import { AccountSelector } from './portfolio/AccountSelector';
import { TransactionForm } from './portfolio/TransactionForm';
import { PortfolioComposition } from './portfolio/PortfolioComposition';
import { PerformanceChart } from './portfolio/PerformanceChart';
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

const fetchComposition = async (accountId?: number): Promise<CompositionData> => {
  const params = accountId ? `?account_id=${accountId}` : '';
  const response = await axios.get(`/api/investing/portfolio/composition${params}`);
  return response.data;
};

const fetchPerformance = async (benchmark: string, currency: string, accountId?: number): Promise<PerformanceData> => {
  const params = new URLSearchParams({ benchmark, currency });
  if (accountId) params.append('account_id', String(accountId));
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
  const [selectedAccountId, setSelectedAccountId] = useState<number | undefined>(() => {
    const saved = localStorage.getItem('selectedAccountId');
    if (saved && saved !== 'none') return parseInt(saved, 10);
    return undefined;
  });

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

  const { data: accountsData } = useQuery({
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
    queryKey: ['composition', selectedAccountId],
    queryFn: () => fetchComposition(selectedAccountId),
    enabled: isAuthenticated && !!selectedAccountId,
  });

  const accountHasHoldings = (compositionData?.holdings?.length ?? 0) > 0;

  const { data: performanceData, isLoading: performanceLoading } = useQuery({
    queryKey: ['performance', benchmark, currency, selectedAccountId],
    queryFn: () => fetchPerformance(benchmark, currency, selectedAccountId),
    enabled: isAuthenticated && !!selectedAccountId && accountHasHoldings,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['composition'] });
      queryClient.invalidateQueries({ queryKey: ['performance'] });
    },
  });

  const createAccountMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      if (accounts.length <= 1) {
        setSelectedAccountId(undefined);
      }
    },
  });

  // Save selected account to localStorage
  useEffect(() => {
    if (selectedAccountId === undefined) {
      localStorage.setItem('selectedAccountId', 'none');
    } else {
      localStorage.setItem('selectedAccountId', String(selectedAccountId));
    }
  }, [selectedAccountId]);

  // Auto-select first account when accounts load
  useEffect(() => {
    if (accounts.length > 0 && selectedAccountId === undefined) {
      const saved = localStorage.getItem('selectedAccountId');
      if (saved === null) {
        setSelectedAccountId(accounts[0].id);
      }
    }
  }, [accounts, selectedAccountId]);

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
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col items-center justify-center py-20">
          <Briefcase className="w-16 h-16 text-slate-500 mb-4" />
          <h2 className="text-2xl font-bold text-slate-300 mb-2">{t('common.signInRequired')}</h2>
          <p className="text-slate-500 mb-6">{t('common.signInMessage')}</p>
          <LoginButton />
        </div>
      </div>
    );
  }

  if (transactionsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-green-500 animate-spin mb-4" />
        <p className="text-slate-400">{t('common.loading')}</p>
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
                className={`px-3 py-2 text-sm font-medium transition-colors ${currency === 'EUR' ? 'bg-green-600 text-white' : 'bg-slate-200 dark:bg-slate-100 text-slate-600 dark:text-slate-600 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
              >
                EUR €
              </button>
              <button
                onClick={() => setCurrency('USD')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${currency === 'USD' ? 'bg-green-600 text-white' : 'bg-slate-200 dark:bg-slate-100 text-slate-600 dark:text-slate-600 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
              >
                USD $
              </button>
            </div>
            <button
              onClick={() => setPrivateMode(!privateMode)}
              className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm ${privateMode ? 'bg-slate-300 dark:bg-slate-200 text-slate-700 dark:text-slate-700' : 'bg-slate-200 dark:bg-slate-100 text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-700'}`}
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
          selectedAccountId={selectedAccountId}
          onSelectAccount={setSelectedAccountId}
          banks={banks}
          accountTypes={accountTypes}
          onCreateAccount={(data) => createAccountMutation.mutate(data)}
          onDeleteAccount={(id) => deleteAccountMutation.mutate(id)}
          isCreating={createAccountMutation.isPending}
          isDeleting={deleteAccountMutation.isPending}
        />

        {/* Transaction Form - Only when account selected */}
        {selectedAccountId && (
          <TransactionForm
            transactions={transactions}
            selectedAccountId={selectedAccountId}
            onAddTransaction={(tx) => addMutation.mutate(tx)}
            onDeleteTransaction={(id) => deleteMutation.mutate(id)}
            isAdding={addMutation.isPending}
            isDeleting={deleteMutation.isPending}
            addError={addMutation.error as Error | null}
            privateMode={privateMode}
          />
        )}

        {/* Summary Cards */}
        {selectedAccountId && compositionData && accountHasHoldings && (
          <div className="bg-slate-50 dark:bg-slate-100 rounded-xl p-4">
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
                      <p className="text-xs md:text-sm font-medium text-slate-500 mb-1">{language === 'fr' ? 'Capital investi' : 'Invested Capital'}</p>
                      <p className="text-sm md:text-xl font-bold text-slate-800">
                        {currency === 'EUR'
                          ? `${formatEur(displayCostBasis)}€`
                          : `$${Math.round(displayCostBasis).toLocaleString('en-US')}`}
                      </p>
                    </div>
                    <div className="text-center border-r border-slate-300 last:border-r-0 pr-4 last:pr-0">
                      <p className="text-xs md:text-sm font-medium text-slate-500 mb-1">{language === 'fr' ? 'Valeur actuelle' : 'Current Value'}</p>
                      <p className="text-sm md:text-xl font-bold text-slate-800">
                        {currency === 'EUR'
                          ? `${formatEur(displayTotalValue)}€`
                          : `$${Math.round(displayTotalValue).toLocaleString('en-US')}`}
                      </p>
                    </div>
                    <div className="text-center border-r border-slate-300 last:border-r-0 pr-4 last:pr-0">
                      <p className="text-xs md:text-sm font-medium text-slate-500 mb-1">
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
                      <p className="text-xs md:text-sm font-medium text-slate-500 mb-1">
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

        {/* Portfolio Composition */}
        {selectedAccountId && accountHasHoldings && (
          <PortfolioComposition
            compositionData={compositionData}
            isLoading={compositionLoading}
            privateMode={privateMode}
            currency={currency}
          />
        )}

        {/* Performance Chart */}
        {selectedAccountId && accountHasHoldings && (
          <PerformanceChart
            performanceData={performanceData}
            isLoading={performanceLoading}
            benchmark={benchmark}
            currency={currency}
            privateMode={privateMode}
            showAnnualized={showAnnualized}
            onBenchmarkChange={setBenchmark}
            onShowAnnualizedChange={setShowAnnualized}
          />
        )}
      </div>
    </div>
  );
}
