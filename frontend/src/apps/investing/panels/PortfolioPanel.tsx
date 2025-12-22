// Portfolio panel with transactions, composition and performance

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';
import { Briefcase, Plus, Trash2, Loader2, TrendingUp, TrendingDown, Search, ArrowUpCircle, ArrowDownCircle, Eye, EyeOff, Building2, Wallet } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LoginButton } from '../../../components/LoginButton';
import { searchStocks, SP500_STOCKS, type Stock } from '../utils/sp500';

interface Transaction {
  id: number;
  stock_ticker: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  transaction_date: string;
  price_per_share: number;
  account_id: number | null;
  account_name: string | null;
  account_type: string | null;
  bank: string | null;
}

interface BankInfo {
  name: string;
  order_fee_pct: number;
  order_fee_min: number;
  account_fee_pct_semester: number;
  account_fee_min_semester: number;
  account_fee_max_semester: number;
  custody_fee_pct: number;
  fx_fee_info_fr?: string;
  fx_fee_info_en?: string;
}

interface AccountTypeInfo {
  name: string;
  description_fr?: string;
  description_en?: string;
  tax_rate: number;
}

interface Account {
  id: number;
  name: string;
  account_type: string;
  bank: string;
  bank_info: BankInfo;
  type_info: AccountTypeInfo;
}

interface NewTransaction {
  stock_ticker: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  transaction_date: string;
  account_id?: number;
}

interface ComputedHolding {
  stock_ticker: string;
  quantity: number;
  cost_basis: number;
}

interface CompositionItem {
  ticker: string;
  quantity: number;
  current_price: number;
  current_value: number;
  cost_basis: number;
  gain_usd: number;
  gain_pct: number;
  weight: number;
  color: string;
}

interface CompositionData {
  holdings: CompositionItem[];
  total_value_usd: number;
  total_value_eur: number;
  total_cost_basis: number;
  total_gain_usd: number;
  total_gain_pct: number;
  eurusd_rate: number;
}

interface PerformanceDataPoint {
  date: string;
  portfolio_value_eur: number;
  benchmark_value_eur: number;
  cost_basis_eur: number;
  portfolio_growth_usd: number;
  portfolio_growth_eur: number;
  benchmark_growth_usd: number;
  benchmark_growth_eur: number;
}

interface TransactionEvent {
  date: string;
  ticker: string;
  type: 'BUY' | 'SELL';
  quantity: number;
}

interface PerformanceData {
  data: PerformanceDataPoint[];
  transactions: TransactionEvent[];
  summary: {
    start_date: string;
    end_date: string;
    total_cost_basis_eur: number;
    portfolio_return_eur: number;
    benchmark_return_eur: number;
    outperformance_eur: number;
    cagr_eur: number;
    cagr_benchmark_eur: number;
    years: number;
    benchmark: string;
  } | null;
  error?: string;
}

// Fetch functions
const fetchTransactions = async (): Promise<{ transactions: Transaction[] }> => {
  const response = await axios.get('/api/investing/transactions');
  return response.data;
};

const fetchHoldings = async (): Promise<{ holdings: ComputedHolding[] }> => {
  const response = await axios.get('/api/investing/holdings');
  return response.data;
};

const fetchComposition = async (): Promise<CompositionData> => {
  const response = await axios.get('/api/investing/portfolio/composition');
  return response.data;
};

const fetchPerformance = async (benchmark: string): Promise<PerformanceData> => {
  const response = await axios.get(`/api/investing/portfolio/performance?benchmark=${benchmark}`);
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

  const [benchmark, setBenchmark] = useState<'QQQ' | 'SP500'>('QQQ');
  const [privateMode, setPrivateMode] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [filterTicker, setFilterTicker] = useState('');
  const [newTicker, setNewTicker] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newYear, setNewYear] = useState('');
  const [newMonth, setNewMonth] = useState('');
  const [newDay, setNewDay] = useState('');
  const [newType, setNewType] = useState<'BUY' | 'SELL'>('BUY');
  const [stockSearch, setStockSearch] = useState('');
  const [stockResults, setStockResults] = useState<Stock[]>([]);
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<number | undefined>(undefined);
  const [showAddAccountForm, setShowAddAccountForm] = useState(false);
  const [newAccountType, setNewAccountType] = useState('');
  const [newAccountBank, setNewAccountBank] = useState('');
  const stockDropdownRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Date picker options
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 2015 + 1 }, (_, i) => currentYear - i);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const dayPickerRef = useRef<HTMLDivElement>(null);
  const months = [
    { value: '01', label: 'January' },
    { value: '02', label: 'February' },
    { value: '03', label: 'March' },
    { value: '04', label: 'April' },
    { value: '05', label: 'May' },
    { value: '06', label: 'June' },
    { value: '07', label: 'July' },
    { value: '08', label: 'August' },
    { value: '09', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];

  // Calculate days in selected month
  const daysInMonth = useMemo(() => {
    if (!newYear || !newMonth) return [];
    const year = parseInt(newYear);
    const month = parseInt(newMonth);
    const days = new Date(year, month, 0).getDate();

    // Limit to today if current year/month
    const today = new Date();
    const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;
    const maxDay = isCurrentMonth ? today.getDate() : days;

    return Array.from({ length: maxDay }, (_, i) => i + 1);
  }, [newYear, newMonth]);

  // Combine into date string
  const newDate = newYear && newMonth && newDay ? `${newYear}-${newMonth}-${newDay.padStart(2, '0')}` : '';

  // Queries
  const { data: transactionsData, isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: fetchTransactions,
    enabled: isAuthenticated,
  });

  const { data: holdingsData } = useQuery({
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

  const hasHoldings = (holdingsData?.holdings?.length ?? 0) > 0;
  const accounts = accountsData?.accounts ?? [];
  const banks = banksData?.banks ?? {};
  const accountTypes = accountTypesData?.account_types ?? {};

  const { data: compositionData, isLoading: compositionLoading } = useQuery({
    queryKey: ['composition'],
    queryFn: fetchComposition,
    enabled: isAuthenticated && hasHoldings,
  });

  const { data: performanceData, isLoading: performanceLoading } = useQuery({
    queryKey: ['performance', benchmark],
    queryFn: () => fetchPerformance(benchmark),
    enabled: isAuthenticated && hasHoldings,
  });

  // Mutations
  const addMutation = useMutation({
    mutationFn: addTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['holdings'] });
      queryClient.invalidateQueries({ queryKey: ['composition'] });
      queryClient.invalidateQueries({ queryKey: ['performance'] });
      resetForm(true); // Keep the stock selected for adding more transactions
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
      setNewAccountType('');
      setNewAccountBank('');
      setShowAddAccountForm(false);
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

  // Auto-select first account when accounts load
  useEffect(() => {
    if (accounts.length > 0 && selectedAccountId === undefined) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts]);

  // Stock search effect
  useEffect(() => {
    const results = searchStocks(stockSearch);
    setStockResults(results);
    setShowStockDropdown(results.length > 0 && stockSearch.length > 0);
  }, [stockSearch]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (stockDropdownRef.current && !stockDropdownRef.current.contains(event.target as Node)) {
        setShowStockDropdown(false);
      }
      if (dayPickerRef.current && !dayPickerRef.current.contains(event.target as Node)) {
        setShowDayPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectStock = (stock: Stock) => {
    setNewTicker(stock.ticker);
    setStockSearch(stock.ticker);
    setShowStockDropdown(false);
    setFilterTicker(stock.ticker); // Auto-filter transactions for this stock
  };

  const resetForm = (keepStock = false) => {
    if (!keepStock) {
      setNewTicker('');
      setStockSearch('');
    }
    setNewQuantity('');
    setNewYear('');
    setNewMonth('');
    setNewDay('');
    setShowDayPicker(false);
    // Keep the transaction type (BUY/SELL) for convenience
  };

  const closeForm = () => {
    resetForm(false);
    setNewType('BUY');
    setShowAddForm(false);
  };

  const handleAddTransaction = () => {
    if (newTicker.trim() && newQuantity && parseInt(newQuantity) > 0 && newDate) {
      addMutation.mutate({
        stock_ticker: newTicker.toUpperCase().trim(),
        transaction_type: newType,
        quantity: parseInt(newQuantity),
        transaction_date: newDate,
        account_id: selectedAccountId,
      });
    }
  };

  const handleCreateAccount = () => {
    if (newAccountType && newAccountBank) {
      // Auto-generate name from type and bank
      const typeName = accountTypes[newAccountType]?.name || newAccountType;
      const bankName = banks[newAccountBank]?.name || newAccountBank;
      createAccountMutation.mutate({
        name: `${typeName} ${bankName}`,
        account_type: newAccountType,
        bank: newAccountBank,
      });
    }
  };

  // Show loading while auth is checking
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
  // Filter by selected account first
  const accountTransactions = selectedAccountId
    ? transactions.filter(t => t.account_id === selectedAccountId)
    : transactions;
  const uniqueTickers = [...new Set(accountTransactions.map(t => t.stock_ticker))].sort();
  const filteredTransactions = filterTicker
    ? accountTransactions.filter(t => t.stock_ticker === filterTicker)
    : accountTransactions;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-center mb-8 mt-12">
        <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
      </div>

      <div className="flex flex-col items-center gap-2 mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-bold text-slate-100">{t('portfolio.title')}</h2>
          <button
            onClick={() => setPrivateMode(!privateMode)}
            className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm ${privateMode ? 'bg-slate-600 text-slate-200' : 'bg-slate-700 text-slate-400 hover:text-slate-300'}`}
          >
            {privateMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>{t('portfolio.privateMode')}</span>
          </button>
        </div>
        <p className="text-slate-400 text-lg italic">{t('portfolio.subtitle')}</p>
      </div>

      <div className="max-w-6xl mx-auto space-y-8">
        {/* Summary Cards */}
        {selectedAccountId && compositionData && hasHoldings && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-100 rounded-xl p-6 text-center">
              <p className="text-3xl font-bold text-slate-800">
                {privateMode ? '•••' : `€${Math.round(compositionData.total_value_eur).toLocaleString()}`}
              </p>
              <p className="text-slate-500 text-sm">{t('portfolio.totalValue')}</p>
            </div>
            <div className="bg-slate-100 rounded-xl p-6 text-center">
              <p className="text-3xl font-bold text-slate-800">
                {privateMode ? '•••' : `€${Math.round(compositionData.total_cost_basis / compositionData.eurusd_rate).toLocaleString()}`}
              </p>
              <p className="text-slate-500 text-sm">{t('portfolio.costBasis')}</p>
            </div>
            <div className="bg-slate-100 rounded-xl p-6 text-center">
              <div className="flex items-center justify-center gap-1">
                {compositionData.total_gain_usd >= 0 ? (
                  <TrendingUp className="w-6 h-6 text-green-600" />
                ) : (
                  <TrendingDown className="w-6 h-6 text-red-600" />
                )}
                <p className={`text-3xl font-bold ${compositionData.total_gain_usd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {compositionData.total_gain_pct >= 0 ? '+' : ''}{compositionData.total_gain_pct}%
                </p>
              </div>
              <p className="text-slate-500 text-sm">
                {privateMode ? t('portfolio.totalGain') : `${compositionData.total_gain_usd >= 0 ? '+' : ''}€${Math.round(compositionData.total_gain_usd / compositionData.eurusd_rate).toLocaleString()}`}
              </p>
            </div>
          </div>
        )}

        {/* Investment Accounts Section - Always visible */}
        {accounts.length > 0 && (
          <div className="bg-slate-100 rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-slate-600" />
                <h3 className="text-xl font-bold text-slate-800">{t('accounts.title')}</h3>
                <span className="text-slate-500 text-sm">({accounts.length})</span>
              </div>
              {!showAddAccountForm && (
                <button
                  onClick={() => setShowAddAccountForm(true)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  {t('accounts.addAccount')}
                </button>
              )}
            </div>

            {/* Add Account Form */}
            {showAddAccountForm && (
              <div className="bg-white rounded-lg p-4 mb-4 border border-slate-200">
                <div className="flex gap-3 flex-wrap items-end">
                  <div className="min-w-[160px]">
                    <label className="block text-sm font-medium text-slate-600 mb-1">{t('accounts.accountType')}</label>
                    <select
                      value={newAccountType}
                      onChange={(e) => setNewAccountType(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">{t('accounts.selectType')}</option>
                      {Object.entries(accountTypes).map(([key, info]) => (
                        <option key={key} value={key}>{info.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-[180px]">
                    <label className="block text-sm font-medium text-slate-600 mb-1">{t('accounts.bank')}</label>
                    <select
                      value={newAccountBank}
                      onChange={(e) => setNewAccountBank(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">{t('accounts.selectBank')}</option>
                      {Object.entries(banks).map(([key, info]) => (
                        <option key={key} value={key}>{info.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleCreateAccount}
                    disabled={!newAccountType || !newAccountBank || createAccountMutation.isPending}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {createAccountMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {t('accounts.create')}
                  </button>
                  <button
                    onClick={() => { setShowAddAccountForm(false); setNewAccountType(''); setNewAccountBank(''); }}
                    className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
                  >
                    {t('accounts.cancel')}
                  </button>
                </div>
                {/* Fee explanation when both type and bank are selected */}
                {newAccountType && newAccountBank && banks[newAccountBank] && (
                  <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                    <p className="font-medium text-slate-700 mb-1">
                      {language === 'fr' ? 'Frais applicables:' : 'Applicable fees:'}
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>
                        {language === 'fr' ? 'Transaction' : 'Transaction'}: {banks[newAccountBank].order_fee_pct}% (min €{banks[newAccountBank].order_fee_min})
                      </li>
                      <li>
                        {language === 'fr' ? 'Tenue de compte' : 'Account fee'}: {banks[newAccountBank].account_fee_pct_semester}%/{language === 'fr' ? 'sem.' : 'sem.'} (€{banks[newAccountBank].account_fee_min_semester}-{banks[newAccountBank].account_fee_max_semester})
                      </li>
                      <li>
                        {language === 'fr' ? 'Change' : 'FX'}: {language === 'fr' ? banks[newAccountBank].fx_fee_info_fr : banks[newAccountBank].fx_fee_info_en}
                      </li>
                      <li>
                        {language === 'fr' ? 'Fiscalité' : 'Tax'}: {accountTypes[newAccountType]?.tax_rate}% PFU
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Accounts List */}
            {accounts.length === 0 ? (
              <p className="text-slate-500 text-center py-4">{t('accounts.noAccounts')}</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {accounts.map((account) => {
                  const isSelected = selectedAccountId === account.id;
                  return (
                    <div
                      key={account.id}
                      onClick={() => setSelectedAccountId(isSelected ? undefined : account.id)}
                      className={`rounded-lg p-4 relative group cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-green-50 border-2 border-green-500 shadow-md'
                          : 'bg-white border border-slate-200 hover:border-green-300 hover:shadow-sm'
                      }`}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteAccountMutation.mutate(account.id); }}
                        className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className="flex items-center gap-2 mb-2">
                        <Wallet className={`w-4 h-4 ${isSelected ? 'text-green-600' : 'text-slate-400'}`} />
                        <span className={`font-bold ${isSelected ? 'text-green-700' : 'text-slate-800'}`}>{account.name}</span>
                        {isSelected && (
                          <span className="ml-auto text-xs bg-green-600 text-white px-2 py-0.5 rounded">
                            {language === 'fr' ? 'Sélectionné' : 'Selected'}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-600 space-y-1">
                        <p><span className="text-slate-400">{t('accounts.type')}:</span> {account.type_info.name}</p>
                        <p><span className="text-slate-400">{t('accounts.bank')}:</span> {account.bank_info.name}</p>
                        <p className="text-xs text-slate-400">
                          {language === 'fr'
                            ? `${account.bank_info.order_fee_pct}% (min ${account.bank_info.order_fee_min}€)`
                            : `${account.bank_info.order_fee_pct}% (min €${account.bank_info.order_fee_min})`
                          }
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Prompt to select account */}
        {!selectedAccountId && accounts.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
            <p className="text-blue-800 text-lg">
              {language === 'fr'
                ? '👆 Cliquez sur un compte pour voir votre portefeuille, vos transactions et performances'
                : '👆 Click on an account to view your portfolio, transactions and performance'}
            </p>
          </div>
        )}

        {/* Fees Summary - Only visible when account selected */}
        {selectedAccountId && accounts.length > 0 && (() => {
          const selectedAccount = accounts.find(a => a.id === selectedAccountId) || accounts[0];
          const bankInfo = selectedAccount?.bank_info;
          if (!bankInfo) return null;

          // Calculate estimated account fees per semester
          const portfolioValueEur = compositionData?.total_value_eur || 0;
          const accountFeeSemester = Math.min(
            Math.max(
              portfolioValueEur * (bankInfo.account_fee_pct_semester / 100),
              bankInfo.account_fee_min_semester
            ),
            bankInfo.account_fee_max_semester
          );

          return (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Wallet className="w-5 h-5 text-amber-600" />
                <h4 className="font-semibold text-amber-800">
                  {language === 'fr' ? 'Frais et Impôts' : 'Fees & Taxes'} ({selectedAccount.bank_info.name})
                </h4>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-amber-600 font-medium">
                    {language === 'fr' ? 'Frais de transaction' : 'Transaction fees'}
                  </p>
                  <p className="text-amber-800">
                    {bankInfo.order_fee_pct}%
                    <span className="text-amber-600 text-xs ml-1">(min €{bankInfo.order_fee_min})</span>
                  </p>
                </div>
                <div>
                  <p className="text-amber-600 font-medium">
                    {language === 'fr' ? 'Tenue de compte (semestriels)' : 'Account fee (per semester)'}
                  </p>
                  <p className="text-amber-800">
                    {bankInfo.account_fee_pct_semester}% (min €{bankInfo.account_fee_min_semester} - max €{bankInfo.account_fee_max_semester})
                  </p>
                  {!privateMode && portfolioValueEur > 0 && (
                    <p className="text-amber-600 text-xs">
                      ~€{Math.round(accountFeeSemester)}/{language === 'fr' ? 'sem.' : 'sem.'}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-amber-600 font-medium">
                    {language === 'fr' ? 'Frais de change' : 'FX fees'}
                  </p>
                  <p className="text-amber-800 text-xs">
                    {language === 'fr' ? bankInfo.fx_fee_info_fr : bankInfo.fx_fee_info_en}
                  </p>
                </div>
                <div>
                  <p className="text-amber-600 font-medium">
                    {language === 'fr' ? 'Fiscalité (PFU)' : 'Tax (PFU)'}
                  </p>
                  <p className="text-amber-800">
                    {selectedAccount.type_info.tax_rate}% {language === 'fr' ? 'sur plus-values' : 'on gains'}
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Toggle Transactions Button - Only when account selected */}
        {selectedAccountId && !showTransactions && (
          <div className="bg-slate-100 rounded-xl p-6">
            <div className="flex justify-center">
              <button
                onClick={() => setShowTransactions(true)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {t('portfolio.editButton')}
              </button>
            </div>
          </div>
        )}

        {/* Transaction History - Only when account selected */}
        {selectedAccountId && showTransactions && (
        <div className="bg-slate-100 rounded-xl p-6">
          {/* Close Button - at top, same position as open button */}
          <div className="flex justify-center mb-6">
            <button
              onClick={() => { setShowTransactions(false); setShowAddForm(false); }}
              className="bg-slate-500 hover:bg-slate-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <span className="text-lg leading-none">−</span>
              {t('transactions.close')}
            </button>
          </div>

          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <h3 className="text-xl font-bold text-slate-800">{t('transactions.title')}</h3>
              {uniqueTickers.length > 0 && (
                <select
                  value={filterTicker}
                  onChange={(e) => setFilterTicker(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">{t('transactions.allStocks')}</option>
                  {uniqueTickers.map(ticker => {
                    const stock = SP500_STOCKS.find(s => s.ticker === ticker);
                    const label = stock ? `${stock.name} (${ticker})` : ticker;
                    return <option key={ticker} value={ticker}>{label}</option>;
                  })}
                </select>
              )}
            </div>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {t('transactions.addTransaction')}
              </button>
            )}
          </div>

          {/* Add Transaction Form */}
          {showAddForm && (
            <div className="bg-white rounded-lg p-4 mb-6 border border-slate-200">
              <div className="flex gap-3 flex-wrap items-start">
                {/* Stock search dropdown */}
                <div className="relative flex-1 min-w-[200px]" ref={stockDropdownRef}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder={t('transactions.searchStocks')}
                      value={stockSearch}
                      onChange={(e) => {
                        setStockSearch(e.target.value);
                        setNewTicker(e.target.value.toUpperCase());
                      }}
                      onFocus={() => stockSearch && setShowStockDropdown(stockResults.length > 0)}
                      className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  {showStockDropdown && stockResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-50 max-h-60 overflow-auto">
                      {stockResults.map((stock) => (
                        <button
                          key={stock.ticker}
                          type="button"
                          onClick={() => handleSelectStock(stock)}
                          className="w-full px-4 py-2 text-left hover:bg-green-50 flex items-center gap-3 border-b border-slate-100 last:border-b-0"
                        >
                          <span className="font-bold text-slate-800 w-16">{stock.ticker}</span>
                          <span className="text-slate-600 text-sm truncate">{stock.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Transaction Type */}
                <div className="flex rounded-lg overflow-hidden border border-slate-300">
                  <button
                    onClick={() => setNewType('BUY')}
                    className={`px-4 py-2 flex items-center gap-1 ${newType === 'BUY' ? 'bg-green-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    <ArrowDownCircle className="w-4 h-4" />
                    {t('transactions.buy')}
                  </button>
                  <button
                    onClick={() => setNewType('SELL')}
                    className={`px-4 py-2 flex items-center gap-1 ${newType === 'SELL' ? 'bg-red-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    <ArrowUpCircle className="w-4 h-4" />
                    {t('transactions.sell')}
                  </button>
                </div>

                <input
                  type="number"
                  placeholder={t('transactions.quantity')}
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(e.target.value)}
                  min="1"
                  className="w-28 px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                />

                {/* Date dropdowns: Year → Month → Day */}
                <select
                  value={newYear}
                  onChange={(e) => { setNewYear(e.target.value); setNewMonth(''); setNewDay(''); }}
                  className="w-24 px-2 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500 cursor-pointer"
                >
                  <option value="">{t('transactions.year')}</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>

                <select
                  value={newMonth}
                  onChange={(e) => { setNewMonth(e.target.value); setNewDay(''); }}
                  disabled={!newYear}
                  className="w-40 px-2 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">{t('transactions.month')}</option>
                  {months.map(m => <option key={m.value} value={m.value}>{m.value} - {m.label}</option>)}
                </select>

                {/* Custom day picker with 5 columns */}
                <div className="relative" ref={dayPickerRef}>
                  <button
                    type="button"
                    onClick={() => newMonth && setShowDayPicker(!showDayPicker)}
                    disabled={!newMonth}
                    className="w-20 px-2 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-left"
                  >
                    {newDay || t('transactions.day')}
                  </button>
                  {showDayPicker && daysInMonth.length > 0 && (
                    <div className="absolute top-full right-0 mt-1 bg-white border border-slate-300 rounded-xl shadow-xl z-50 p-4">
                      <div className="grid grid-cols-5 gap-2" style={{ width: '220px' }}>
                        {daysInMonth.map(d => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => { setNewDay(String(d)); setShowDayPicker(false); }}
                            className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${newDay === String(d) ? 'bg-green-600 text-white' : 'text-slate-700 hover:bg-green-50'}`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleAddTransaction}
                  disabled={!newTicker.trim() || !newQuantity || !newDate || addMutation.isPending}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {t('transactions.add')}
                </button>

                <button
                  onClick={closeForm}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  {t('transactions.done')}
                </button>
              </div>
              <p className="text-slate-500 text-sm mt-2">
                {t('transactions.priceNote')}
              </p>
              {addMutation.isError && (
                <p className="text-red-500 text-sm mt-2">
                  {t('common.error')}: {(addMutation.error as Error)?.message || 'Failed to add transaction'}
                </p>
              )}
            </div>
          )}

          {/* Transactions List */}
          {transactions.length === 0 ? (
            <p className="text-slate-500 text-center py-8">{t('transactions.noTransactions')}</p>
          ) : filteredTransactions.length === 0 ? (
            <p className="text-slate-500 text-center py-8">{language === 'fr' ? `Aucune transaction pour ${filterTicker}.` : `No transactions for ${filterTicker}.`}</p>
          ) : (
            <div className="space-y-2 max-h-[200px] overflow-auto">
              {filteredTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-4">
                    <div className={`px-2 py-1 rounded text-xs font-bold ${tx.transaction_type === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {tx.transaction_type === 'BUY' ? t('transactions.buy') : t('transactions.sell')}
                    </div>
                    <span className="font-bold text-slate-800 w-16">{tx.stock_ticker}</span>
                    <span className="text-slate-600">{privateMode ? '••' : tx.quantity} {t('transactions.shares')}</span>
                    <span className="text-slate-400">@</span>
                    <span className="text-slate-600">${tx.price_per_share.toFixed(2)}</span>
                    <span className="text-slate-400 text-sm">
                      {new Date(tx.transaction_date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate(tx.id)}
                    disabled={deleteMutation.isPending}
                    className="text-slate-400 hover:text-red-500 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

        </div>
        )}

        {/* Portfolio Composition */}
        {selectedAccountId && hasHoldings && (
          <div className="bg-slate-100 rounded-xl p-6">
            <h3 className="text-xl font-bold text-slate-800 mb-6">{t('holdings.title')}</h3>

            {compositionLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
              </div>
            ) : compositionData?.holdings && compositionData.holdings.length > 0 ? (
              <div className="flex items-center gap-8">
                {/* Pie Chart */}
                <div className="w-1/2 h-[380px] pt-8 pb-8">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={compositionData.holdings as unknown as Record<string, unknown>[]}
                        dataKey="weight"
                        nameKey="ticker"
                        cx="50%"
                        cy="50%"
                        outerRadius={120}
                        label={({ name, value }) => `${name} ${value}%`}
                        labelLine={true}
                      >
                        {compositionData.holdings.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, _name, props) => {
                          const payload = props.payload as CompositionItem;
                          const valueEur = Math.round(payload.current_value / compositionData.eurusd_rate);
                          return [privateMode ? `${value}%` : `€${valueEur.toLocaleString()} (${value}%)`, payload.ticker];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Holdings Table */}
                <div className="w-1/2">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-slate-600 text-sm border-b border-slate-300">
                        <th className="pb-2">{t('holdings.stock')}</th>
                        <th className="pb-2 text-right">{t('holdings.shares')}</th>
                        <th className="pb-2 text-right">{t('holdings.price')}</th>
                        <th className="pb-2 text-right">{privateMode ? t('holdings.weight') : t('holdings.value')}</th>
                        <th className="pb-2 text-right">{t('holdings.gain')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {compositionData.holdings.map((h) => {
                        const valueEur = Math.round(h.current_value / compositionData.eurusd_rate);
                        return (
                          <tr key={h.ticker} className="border-b border-slate-200">
                            <td className="py-2 font-bold" style={{ color: h.color }}>{h.ticker}</td>
                            <td className="py-2 text-right text-slate-600">{privateMode ? '••' : h.quantity}</td>
                            <td className="py-2 text-right text-slate-600">${h.current_price}</td>
                            <td className="py-2 text-right text-slate-800 font-medium">
                              {privateMode ? `${h.weight}%` : `€${valueEur.toLocaleString()}`}
                            </td>
                            <td className={`py-2 text-right font-medium ${h.gain_usd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {h.gain_usd >= 0 ? '+' : ''}{h.gain_pct}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8">No holdings data available.</p>
            )}
          </div>
        )}

        {/* Portfolio Performance */}
        {selectedAccountId && hasHoldings && (
          <div className="bg-slate-100 rounded-xl p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-4">
                <h3 className="text-xl font-bold text-slate-800">{t('performance.title')}</h3>
                {performanceData?.summary && (
                  <span className={`text-lg font-semibold ${performanceData.summary.cagr_eur >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {t('performance.cagr')}: {performanceData.summary.cagr_eur >= 0 ? '+' : ''}{performanceData.summary.cagr_eur}%/{language === 'fr' ? 'an' : 'year'}
                  </span>
                )}
              </div>
              <select
                value={benchmark}
                onChange={(e) => setBenchmark(e.target.value as 'QQQ' | 'SP500')}
                className="px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="QQQ">{t('performance.benchmark.qqq')}</option>
                <option value="SP500">{t('performance.benchmark.sp500')}</option>
              </select>
            </div>

            {performanceLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
              </div>
            ) : performanceData?.data && performanceData.data.length > 0 ? (
              <>
                {/* Summary Stats */}
                {performanceData.summary && (
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-white rounded-lg p-4 text-center">
                      <span className="text-lg text-slate-600">
                        {(() => {
                          const y = performanceData.summary.years;
                          const fullYears = Math.floor(y);
                          const months = Math.round((y - fullYears) * 12);
                          if (months === 0) return `${fullYears} ${fullYears !== 1 ? t('performance.years') : t('performance.year')}`;
                          if (fullYears === 0) return `${months} ${t('performance.months')}`;
                          return `${fullYears} ${fullYears !== 1 ? t('performance.years') : t('performance.year')} ${months} ${t('performance.months')}`;
                        })()}
                      </span>
                      <p className="text-slate-500 text-sm">{t('performance.since')} {new Date(performanceData.summary.start_date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        {performanceData.summary.portfolio_return_eur >= 0 ? (
                          <TrendingUp className="w-5 h-5 text-green-600" />
                        ) : (
                          <TrendingDown className="w-5 h-5 text-red-600" />
                        )}
                        <span className={`text-2xl font-bold ${performanceData.summary.portfolio_return_eur >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {performanceData.summary.portfolio_return_eur >= 0 ? '+' : ''}{performanceData.summary.portfolio_return_eur}%
                        </span>
                      </div>
                      <p className="text-slate-500 text-sm">{t('performance.totalReturn')}</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 text-center">
                      <span className={`text-2xl font-bold ${performanceData.summary.benchmark_return_eur >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {performanceData.summary.benchmark_return_eur >= 0 ? '+' : ''}{performanceData.summary.benchmark_return_eur}%
                      </span>
                      <p className="text-slate-500 text-sm">{language === 'fr' ? 'Indice' : 'Benchmark'} ({benchmark})</p>
                    </div>
                  </div>
                )}

                {/* Performance Chart */}
                <div className="h-[400px] relative" ref={chartContainerRef}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={performanceData.data} margin={{ top: 20, right: 30, left: 20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(date) => {
                          const d = new Date(date);
                          return d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', year: '2-digit' });
                        }}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        interval={Math.floor(performanceData.data.length / 8)}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        tickFormatter={(val) => {
                          if (privateMode) {
                            const costBasis = performanceData.data[performanceData.data.length - 1]?.cost_basis_eur || 1;
                            const pct = Math.round((val / costBasis) * 100);
                            return `${pct}%`;
                          }
                          return `€${(val / 1000).toFixed(0)}k`;
                        }}
                        domain={['dataMin - 1000', 'dataMax + 1000']}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                        labelStyle={{ color: '#1e293b', fontWeight: 'bold', marginBottom: '4px' }}
                        labelFormatter={(date) => new Date(String(date)).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        formatter={(value, name) => {
                          const numValue = Math.round(Number(value));
                          const nameStr = String(name);
                          let label: string = benchmark;
                          if (nameStr.includes('Portfolio')) label = t('performance.portfolio');
                          else if (nameStr.includes('Invested')) label = t('performance.invested');
                          if (privateMode) {
                            const costBasis = performanceData.data[performanceData.data.length - 1]?.cost_basis_eur || 1;
                            const pct = Math.round((numValue / costBasis) * 100);
                            return [`${pct}%`, label];
                          }
                          return [`€${numValue.toLocaleString()}`, label];
                        }}
                        wrapperStyle={{ zIndex: 100 }}
                        allowEscapeViewBox={{ x: true, y: true }}
                        offset={20}
                      />
                      <Legend
                        content={() => (
                          <div className="flex justify-center gap-6 mt-2 text-sm">
                            <div className="flex items-center gap-1.5">
                              <div className="w-4 h-0.5 bg-green-600"></div>
                              <span className="text-slate-600">{t('performance.portfolio')}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-4 h-0.5 bg-[#8A8EFF]" style={{ borderStyle: 'dashed', borderWidth: '1px', borderColor: '#8A8EFF', height: 0 }}></div>
                              <span className="text-slate-600">{benchmark}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-4 h-0.5 bg-slate-400"></div>
                              <span className="text-slate-600">{t('performance.invested')}</span>
                            </div>
                          </div>
                        )}
                      />
                      <Line
                        type="monotone"
                        dataKey="portfolio_value_eur"
                        name="Portfolio (EUR)"
                        stroke="#16a34a"
                        strokeWidth={2.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="benchmark_value_eur"
                        name={`${benchmark} (EUR)`}
                        stroke="#8A8EFF"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                      />
                      <Line
                        type="stepAfter"
                        dataKey="cost_basis_eur"
                        name="Amount Invested (EUR)"
                        stroke="#94a3b8"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : (
              <p className="text-slate-500 text-center py-8">
                {performanceData?.error || 'No performance data available.'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
