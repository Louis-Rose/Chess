// Portfolio panel with transactions, composition and performance

// Format number with wider spacing for EUR (e.g., "1 234 567")
const formatEur = (num: number): string => {
  return Math.round(num).toLocaleString('fr-FR').replace(/\u202F/g, ' ');
};

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';
import { Briefcase, Plus, Trash2, Loader2, Search, ArrowUpCircle, ArrowDownCircle, Eye, EyeOff, Building2, Wallet, Download } from 'lucide-react';
import html2canvas from 'html2canvas';
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
  custody_fee_pct_year: number;
  custody_fee_pct_year_pea: number;
  fx_fee_info_fr?: string;
  fx_fee_info_en?: string;
  note_fr?: string;
  note_en?: string;
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
  total_cost_basis_eur: number;
  total_gain_usd: number;
  total_gain_pct: number;
  realized_gains_usd: number;
  realized_gains_eur: number;
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

const fetchPerformance = async (benchmark: string, currency: string): Promise<PerformanceData> => {
  // Send benchmark name (NASDAQ/SP500) and currency, backend handles ticker mapping
  const response = await axios.get(`/api/investing/portfolio/performance?benchmark=${benchmark}&currency=${currency}`);
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

  const [currency, setCurrency] = useState<'EUR' | 'USD'>('EUR');
  const [benchmark, setBenchmark] = useState<'NASDAQ' | 'SP500'>('NASDAQ');
  const [privateMode, setPrivateMode] = useState(false);
  const [showAnnualized, setShowAnnualized] = useState(false);
  const [yearFilter, setYearFilter] = useState<'all' | number>('all');
  const [showFees, setShowFees] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
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
  const [isDownloading, setIsDownloading] = useState(false);

  // Download chart as image
  const downloadChart = async () => {
    if (!chartContainerRef.current) {
      console.error('Chart container ref not found');
      return;
    }
    setIsDownloading(true);
    try {
      const canvas = await html2canvas(chartContainerRef.current, {
        backgroundColor: '#f1f5f9',
        scale: 2,
        useCORS: true,
        logging: false,
        allowTaint: true,
      });

      // Create download link
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `portfolio-performance-${new Date().toISOString().split('T')[0]}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to download chart:', error);
      alert(language === 'fr' ? 'Erreur lors du téléchargement' : 'Download failed');
    } finally {
      setIsDownloading(false);
    }
  };

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
    queryKey: ['performance', benchmark, currency],
    queryFn: () => fetchPerformance(benchmark, currency),
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
      <div className="sticky top-0 z-20 bg-slate-800 py-4 -mx-4 px-4 mt-8">
        <div className="flex flex-col items-center gap-2">
          <h2 className="text-3xl font-bold text-slate-100">{t('portfolio.title')}</h2>
          <p className="text-slate-400 text-lg italic">{t('portfolio.subtitle')}</p>
          <div className="flex items-center gap-4 mt-2">
            {/* Currency Toggle */}
            <div className="flex rounded-lg overflow-hidden border border-slate-600">
              <button
                onClick={() => setCurrency('EUR')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${currency === 'EUR' ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
              >
                EUR €
              </button>
              <button
                onClick={() => setCurrency('USD')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${currency === 'USD' ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
              >
                USD $
              </button>
            </div>
            <button
              onClick={() => setPrivateMode(!privateMode)}
              className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm ${privateMode ? 'bg-slate-600 text-slate-200' : 'bg-slate-700 text-slate-400 hover:text-slate-300'}`}
            >
              {privateMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span>{t('portfolio.privateMode')}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto space-y-8">
        {/* Summary Cards - 2 cols mobile, 4 cols desktop */}
        {selectedAccountId && compositionData && hasHoldings && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
            {(() => {
              // In private mode, scale all values to assume 10,000 cost basis
              const PRIVATE_COST_BASIS = 10000;
              const actualCostBasis = currency === 'EUR' ? compositionData.total_cost_basis_eur : compositionData.total_cost_basis;
              const scaleFactor = privateMode && actualCostBasis > 0 ? PRIVATE_COST_BASIS / actualCostBasis : 1;

              const displayCostBasis = privateMode ? PRIVATE_COST_BASIS : (currency === 'EUR' ? compositionData.total_cost_basis_eur : compositionData.total_cost_basis);
              const displayTotalValue = (currency === 'EUR' ? compositionData.total_value_eur : compositionData.total_value_eur * compositionData.eurusd_rate) * scaleFactor;

              return (
                <>
                  {/* Prix de revient (Cost Basis) */}
                  <div className="bg-slate-100 rounded-xl p-3 md:p-5 text-center">
                    <p className="text-sm md:text-base font-medium text-slate-600 mb-1">{language === 'fr' ? 'Prix de revient' : 'Cost Basis'}</p>
                    <p className="text-base md:text-2xl font-bold text-slate-800">
                      {currency === 'EUR'
                        ? `${formatEur(displayCostBasis)}€`
                        : `$${Math.round(displayCostBasis).toLocaleString('en-US')}`}
                    </p>
                  </div>
                  {/* Valeur totale (Total Value) */}
                  <div className="bg-slate-100 rounded-xl p-3 md:p-5 text-center">
                    <p className="text-sm md:text-base font-medium text-slate-600 mb-1">{language === 'fr' ? 'Valeur totale' : 'Total Value'}</p>
                    <p className="text-base md:text-2xl font-bold text-slate-800">
                      {currency === 'EUR'
                        ? `${formatEur(displayTotalValue)}€`
                        : `$${Math.round(displayTotalValue).toLocaleString('en-US')}`}
                    </p>
                  </div>
                </>
              );
            })()}
            {/* Gains non réalisés (Unrealized Gains) */}
            {(() => {
              // In private mode, scale all values to assume 10,000 cost basis
              const PRIVATE_COST_BASIS = 10000;
              const actualCostBasis = currency === 'EUR' ? compositionData.total_cost_basis_eur : compositionData.total_cost_basis;
              const scaleFactor = privateMode && actualCostBasis > 0 ? PRIVATE_COST_BASIS / actualCostBasis : 1;

              // Calculate EUR gain: current value EUR - cost basis EUR (historical)
              const unrealizedGainEur = compositionData.total_value_eur - compositionData.total_cost_basis_eur;
              const unrealizedGainPctEur = compositionData.total_cost_basis_eur > 0
                ? Math.round(100 * unrealizedGainEur / compositionData.total_cost_basis_eur * 10) / 10
                : 0;
              const rawGain = currency === 'EUR' ? unrealizedGainEur : compositionData.total_gain_usd;
              const displayGain = rawGain * scaleFactor;
              const displayPct = currency === 'EUR' ? unrealizedGainPctEur : compositionData.total_gain_pct;
              return (
                <div className="bg-slate-100 rounded-xl p-3 md:p-5 text-center">
                  <p className="text-sm md:text-base font-medium text-slate-600 mb-1">
                    {language === 'fr' ? 'Plus-value latente (brut)' : 'Unrealized Gains (gross)'}
                  </p>
                  <p className={`text-base md:text-2xl font-bold ${displayGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {displayPct >= 0 ? '+' : ''}{displayPct}%
                  </p>
                  <p className={`text-base md:text-2xl font-bold ${displayGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {currency === 'EUR'
                      ? `${displayGain >= 0 ? '+' : ''}${formatEur(displayGain)}€`
                      : `${displayGain >= 0 ? '+' : ''}$${Math.round(displayGain).toLocaleString('en-US')}`}
                  </p>
                </div>
              );
            })()}
            {/* Gains réalisés (Realized Gains) */}
            {(() => {
              // In private mode, scale all values to assume 10,000 cost basis
              const PRIVATE_COST_BASIS = 10000;
              const actualCostBasis = currency === 'EUR' ? compositionData.total_cost_basis_eur : compositionData.total_cost_basis;
              const scaleFactor = privateMode && actualCostBasis > 0 ? PRIVATE_COST_BASIS / actualCostBasis : 1;

              const rawRealizedGain = currency === 'EUR'
                ? compositionData.realized_gains_eur
                : compositionData.realized_gains_usd;
              const displayRealizedGain = rawRealizedGain * scaleFactor;
              return (
                <div className="bg-slate-100 rounded-xl p-3 md:p-5 text-center">
                  <p className="text-sm md:text-base font-medium text-slate-600 mb-1">
                    {language === 'fr' ? 'Plus-value réalisée (brut)' : 'Realized Gains (gross)'}
                  </p>
                  <p className={`text-base md:text-2xl font-bold ${displayRealizedGain >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {currency === 'EUR'
                      ? `${displayRealizedGain >= 0 ? '+' : ''}${formatEur(displayRealizedGain)}€`
                      : `${displayRealizedGain >= 0 ? '+' : ''}$${Math.round(displayRealizedGain).toLocaleString('en-US')}`}
                  </p>
                </div>
              );
            })()}
          </div>
        )}

        {/* Investment Accounts Section */}
        <div className="bg-slate-100 rounded-xl p-6">
            <div className="flex justify-center">
              <button
                onClick={() => setShowAccounts(!showAccounts)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
              >
                <Building2 className="w-4 h-4" />
                {showAccounts
                  ? (language === 'fr' ? 'Masquer comptes d\'investissement' : 'Hide investment accounts')
                  : (language === 'fr' ? 'Afficher comptes d\'investissement' : 'Show investment accounts')}
              </button>
            </div>
            {showAccounts && (
              <>
                <div className="flex justify-between items-center mb-4 mt-6">
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
                            {language === 'fr' ? 'Transaction' : 'Transaction'}: {banks[newAccountBank].order_fee_pct}% (min {banks[newAccountBank].order_fee_min}€)
                          </li>
                          <li>
                            {language === 'fr' ? 'Droits de garde' : 'Custody fees'}: {newAccountType === 'PEA' ? banks[newAccountBank].custody_fee_pct_year_pea : banks[newAccountBank].custody_fee_pct_year}%/{language === 'fr' ? 'an' : 'year'}
                          </li>
                          <li>
                            {language === 'fr' ? 'Change' : 'FX'}: {language === 'fr' ? banks[newAccountBank].fx_fee_info_fr : banks[newAccountBank].fx_fee_info_en}
                          </li>
                          <li>
                            {language === 'fr' ? 'Fiscalité' : 'Tax'}: {accountTypes[newAccountType]?.tax_rate}% {newAccountType === 'PEA' ? (language === 'fr' ? 'prél. sociaux' : 'social contrib.') : 'PFU'}
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
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

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

        {/* Fees Button & Content - Always visible when account selected */}
        {selectedAccountId && (
          <div className="bg-slate-100 rounded-xl p-6 sticky top-4 z-10">
            <div className="flex justify-center">
              <button
                onClick={() => setShowFees(!showFees)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
              >
                <Wallet className="w-4 h-4" />
                {showFees
                  ? (language === 'fr' ? 'Masquer frais et impôts' : 'Hide fees & taxes')
                  : (language === 'fr' ? 'Afficher frais et impôts' : 'Show fees & taxes')}
              </button>
            </div>

            {/* Fees Summary - Inside the button container when visible */}
            {showFees && accounts.length > 0 && (() => {
              const selectedAccount = accounts.find(a => a.id === selectedAccountId) || accounts[0];
              const bankInfo = selectedAccount?.bank_info;
              const typeInfo = selectedAccount?.type_info;
              const isPEA = selectedAccount?.account_type === 'PEA';
              if (!bankInfo) return null;

              const custodyFeeRate = isPEA ? bankInfo.custody_fee_pct_year_pea : bankInfo.custody_fee_pct_year;

              return (
                <div className="bg-white rounded-xl p-4 mt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Wallet className="w-5 h-5 text-amber-600" />
                    <h4 className="font-semibold text-amber-800">
                      {language === 'fr' ? 'Frais et Impôts' : 'Fees & Taxes'} ({selectedAccount.bank_info.name} - {selectedAccount.account_type})
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-amber-600 font-medium">
                        {language === 'fr' ? 'Frais de transaction' : 'Transaction fees'}
                      </p>
                      <p className="text-amber-800">
                        {bankInfo.order_fee_pct}%
                        <span className="text-amber-600 text-xs ml-1">(min {bankInfo.order_fee_min}€)</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-amber-600 font-medium">
                        {language === 'fr' ? 'Droits de garde (annuels)' : 'Custody fees (yearly)'}
                      </p>
                      <p className="text-amber-800">
                        {custodyFeeRate}%{isPEA ? ` (${language === 'fr' ? 'plafonné' : 'capped'})` : ''}
                      </p>
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
                        {language === 'fr' ? 'Fiscalité' : 'Taxation'}
                      </p>
                      <p className="text-amber-800">
                        {typeInfo?.tax_rate}% {language === 'fr' ? 'sur plus-values' : 'on gains'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Transactions Button - Only when transactions not open */}
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
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              {language === 'fr' ? 'Masquer les transactions' : 'Hide transactions'}
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

          {/* Done button - centered below transactions */}
          <div className="flex justify-center mt-6">
            <button
              onClick={closeForm}
              className="px-6 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
            >
              {t('transactions.done')}
            </button>
          </div>

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
              <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8">
                {/* Pie Chart */}
                <div className="w-full md:w-1/2 h-[280px] md:h-[380px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 20, right: 40, bottom: 20, left: 40 }}>
                      <Pie
                        data={compositionData.holdings as unknown as Record<string, unknown>[]}
                        dataKey="weight"
                        nameKey="ticker"
                        cx="50%"
                        cy="50%"
                        outerRadius="60%"
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
                          // In private mode, scale to 10,000 cost basis
                          const PRIVATE_COST_BASIS = 10000;
                          const actualCostBasis = compositionData.total_cost_basis_eur;
                          const scaleFactor = privateMode && actualCostBasis > 0 ? PRIVATE_COST_BASIS / actualCostBasis : 1;
                          const displayValue = Math.round(valueEur * scaleFactor);
                          return [`${formatEur(displayValue)}€ (${value}%)`, payload.ticker];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Holdings Table */}
                <div className="w-full md:w-1/2 overflow-x-auto">
                  {(() => {
                    // In private mode, scale all values to assume 10,000 cost basis
                    const PRIVATE_COST_BASIS = 10000;
                    const actualCostBasis = compositionData.total_cost_basis_eur;
                    const scaleFactor = privateMode && actualCostBasis > 0 ? PRIVATE_COST_BASIS / actualCostBasis : 1;

                    return (
                      <table className="w-full">
                        <thead>
                          <tr className="text-left text-slate-600 text-sm border-b border-slate-300">
                            <th className="pb-2">{t('holdings.stock')}</th>
                            <th className="pb-2 text-right">{t('holdings.shares')}</th>
                            <th className="pb-2 text-right">{t('holdings.price')}</th>
                            <th className="pb-2 text-right">{t('holdings.value')}</th>
                            <th className="pb-2 text-right">{t('holdings.gain')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {compositionData.holdings.map((h) => {
                            const valueEur = Math.round(h.current_value / compositionData.eurusd_rate);
                            const displayValue = Math.round(valueEur * scaleFactor);
                            const displayQuantity = privateMode ? Math.round(h.quantity * scaleFactor) : h.quantity;
                            return (
                              <tr key={h.ticker} className="border-b border-slate-200">
                                <td className="py-2 font-bold" style={{ color: h.color }}>{h.ticker}</td>
                                <td className="py-2 text-right text-slate-600">{displayQuantity}</td>
                                <td className="py-2 text-right text-slate-600">${h.current_price}</td>
                                <td className="py-2 text-right text-slate-800 font-medium">
                                  {`${formatEur(displayValue)}€`}
                                </td>
                                <td className={`py-2 text-right font-medium ${h.gain_usd >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {h.gain_usd >= 0 ? '+' : ''}{h.gain_pct}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <p className="text-slate-500 text-center py-8">No holdings data available.</p>
            )}
          </div>
        )}

        {/* Portfolio Performance */}
        {selectedAccountId && hasHoldings && (
          <div className="bg-slate-100 rounded-xl p-4 md:p-6">
            <div className="flex items-center justify-center gap-3 mb-4">
              <h3 className="text-lg md:text-xl font-bold text-slate-800">{t('performance.title')}</h3>
              <button
                onClick={downloadChart}
                disabled={isDownloading}
                className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                title={language === 'fr' ? 'Télécharger le graphique' : 'Download chart'}
              >
                {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex flex-wrap items-end justify-center gap-3 md:gap-4 mb-4 md:mb-6">
              {/* Year Filter */}
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                className="px-2 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
              >
                <option value="all">{language === 'fr' ? 'Tout' : 'All'}</option>
                {(() => {
                  const currentYear = new Date().getFullYear();
                  const years = [];
                  for (let y = currentYear; y >= 2020; y--) {
                    years.push(<option key={y} value={y}>{y}</option>);
                  }
                  return years;
                })()}
              </select>
              {/* Toggle: Total vs Annualized */}
              <div className="flex rounded-lg overflow-hidden border border-slate-300">
                <button
                  onClick={() => setShowAnnualized(false)}
                  className={`px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium transition-colors ${!showAnnualized ? 'bg-green-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  Total
                </button>
                <button
                  onClick={() => setShowAnnualized(true)}
                  className={`px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium transition-colors ${showAnnualized ? 'bg-green-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {language === 'fr' ? 'Annuel' : 'Annual'}
                </button>
              </div>
              {/* Benchmark Toggle */}
              <div className="flex flex-col items-center">
                <span className="text-xs text-slate-500 mb-1">Benchmark:</span>
                <div className="flex rounded-lg overflow-hidden border border-slate-300">
                  <button
                    onClick={() => setBenchmark('NASDAQ')}
                    className={`px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium transition-colors ${benchmark === 'NASDAQ' ? 'bg-green-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    Nasdaq
                  </button>
                  <button
                    onClick={() => setBenchmark('SP500')}
                    className={`px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium transition-colors ${benchmark === 'SP500' ? 'bg-green-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    S&P 500
                  </button>
                </div>
              </div>
            </div>

            {performanceLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-green-500 animate-spin" />
              </div>
            ) : performanceData?.data && performanceData.data.length > 0 ? (() => {
              // Filter data by year if a specific year is selected
              const filteredData = yearFilter === 'all'
                ? performanceData.data
                : performanceData.data.filter(d => new Date(d.date).getFullYear() === yearFilter);

              if (filteredData.length === 0) {
                return <p className="text-slate-500 text-center py-8">{language === 'fr' ? 'Aucune donnée pour cette année' : 'No data for this year'}</p>;
              }

              // In private mode, scale all values to assume 10,000 cost basis
              const PRIVATE_COST_BASIS = 10000;
              const lastDataPoint = filteredData[filteredData.length - 1];
              const firstDataPoint = filteredData[0];
              const actualCostBasis = lastDataPoint?.cost_basis_eur || 1;
              const scaleFactor = privateMode && actualCostBasis > 0 ? PRIVATE_COST_BASIS / actualCostBasis : 1;

              // Calculate summary for filtered data
              const startDate = firstDataPoint.date;
              const endDate = lastDataPoint.date;
              const endPortfolioValue = lastDataPoint.portfolio_value_eur;
              const endCostBasis = lastDataPoint.cost_basis_eur;
              const endBenchmarkValue = lastDataPoint.benchmark_value_eur;

              // Portfolio return = (current value - cost basis) / cost basis
              const portfolioReturn = endCostBasis > 0
                ? Math.round(((endPortfolioValue - endCostBasis) / endCostBasis) * 1000) / 10
                : 0;
              // Benchmark return = (benchmark value - cost basis) / cost basis (fair comparison)
              const benchmarkReturn = endCostBasis > 0
                ? Math.round(((endBenchmarkValue - endCostBasis) / endCostBasis) * 1000) / 10
                : 0;

              const daysDiff = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24);
              const years = daysDiff / 365;

              // CAGR = annualized total return: (1 + totalReturn)^(1/years) - 1
              // For periods close to 1 year (0.9-1.1), just use total return to avoid confusing differences
              const shouldAnnualize = years > 0 && (years < 0.9 || years > 1.1);
              const cagrPortfolio = shouldAnnualize
                ? Math.round((Math.pow(1 + portfolioReturn / 100, 1 / years) - 1) * 1000) / 10
                : portfolioReturn;
              const cagrBenchmark = shouldAnnualize
                ? Math.round((Math.pow(1 + benchmarkReturn / 100, 1 / years) - 1) * 1000) / 10
                : benchmarkReturn;

              const filteredSummary = yearFilter === 'all' ? performanceData.summary : {
                start_date: startDate,
                end_date: endDate,
                years: years,
                portfolio_return_eur: portfolioReturn,
                benchmark_return_eur: benchmarkReturn,
                cagr_eur: cagrPortfolio,
                cagr_benchmark_eur: cagrBenchmark,
              };

              // Compute chart data with fill areas for outperformance/underperformance
              const chartData = filteredData.map(d => {
                const scaledPortfolioValue = d.portfolio_value_eur * scaleFactor;
                const scaledBenchmarkValue = d.benchmark_value_eur * scaleFactor;
                const scaledCostBasis = d.cost_basis_eur * scaleFactor;
                const isOutperforming = scaledPortfolioValue >= scaledBenchmarkValue;
                return {
                  ...d,
                  portfolio_value_eur: scaledPortfolioValue,
                  benchmark_value_eur: scaledBenchmarkValue,
                  cost_basis_eur: scaledCostBasis,
                  // For stacked areas: base is the minimum, fill is the difference
                  area_base: Math.min(scaledPortfolioValue, scaledBenchmarkValue),
                  outperformance_fill: isOutperforming ? scaledPortfolioValue - scaledBenchmarkValue : 0,
                  underperformance_fill: !isOutperforming ? scaledBenchmarkValue - scaledPortfolioValue : 0,
                };
              });

              return (
              <>
                {/* Summary Stats */}
                {filteredSummary && (
                  <div className="grid grid-cols-3 gap-2 md:gap-4 mb-4 md:mb-6">
                    <div className="bg-white rounded-lg p-2 md:p-4 text-center">
                      <p className="text-slate-500 text-xs md:text-sm mb-1">{language === 'fr' ? 'Période de détention' : 'Holding period'}</p>
                      <span className="text-sm md:text-lg font-bold text-slate-800">
                        {(() => {
                          const y = filteredSummary.years;
                          const fullYears = Math.floor(y);
                          const months = Math.round((y - fullYears) * 12);
                          if (months === 0) return `${fullYears} ${fullYears !== 1 ? t('performance.years') : t('performance.year')}`;
                          if (fullYears === 0) return `${months} ${t('performance.months')}`;
                          return `${fullYears} ${fullYears !== 1 ? t('performance.years') : t('performance.year')} ${months} ${language === 'fr' ? 'mois' : (months !== 1 ? 'months' : 'month')}`;
                        })()}
                      </span>
                    </div>
                    <div className="bg-white rounded-lg p-2 md:p-4 text-center">
                      <p className="text-slate-500 text-xs md:text-sm mb-1">{showAnnualized ? 'CAGR' : t('performance.totalReturn')}</p>
                      <span className={`text-base md:text-2xl font-bold ${(showAnnualized ? filteredSummary.cagr_eur : filteredSummary.portfolio_return_eur) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {(showAnnualized ? filteredSummary.cagr_eur : filteredSummary.portfolio_return_eur) >= 0 ? '+' : ''}{showAnnualized ? filteredSummary.cagr_eur : filteredSummary.portfolio_return_eur}%
                      </span>
                    </div>
                    <div className="bg-white rounded-lg p-2 md:p-4 text-center">
                      <p className="text-slate-500 text-xs md:text-sm mb-1">Benchmark</p>
                      <span className={`text-base md:text-2xl font-bold ${(showAnnualized ? filteredSummary.cagr_benchmark_eur : filteredSummary.benchmark_return_eur) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {(showAnnualized ? filteredSummary.cagr_benchmark_eur : filteredSummary.benchmark_return_eur) >= 0 ? '+' : ''}{showAnnualized ? filteredSummary.cagr_benchmark_eur : filteredSummary.benchmark_return_eur}%
                      </span>
                    </div>
                  </div>
                )}

                {/* Performance Chart */}
                <div className="h-[300px] md:h-[400px] relative" ref={chartContainerRef}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="outperformanceGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#16a34a" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#16a34a" stopOpacity={0.1} />
                        </linearGradient>
                        <linearGradient id="underperformanceGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#dc2626" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#dc2626" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(date) => {
                          const d = new Date(date);
                          const formatted = d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', year: '2-digit' });
                          // Capitalize first letter
                          return formatted.charAt(0).toUpperCase() + formatted.slice(1);
                        }}
                        tick={{ fontSize: 14, fill: '#64748b' }}
                        ticks={(() => {
                          // Desktop: ~10 ticks, Mobile: ~5 ticks
                          const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
                          const targetTicks = isMobile ? 5 : 10;

                          if (chartData.length <= targetTicks) {
                            return chartData.map(d => d.date);
                          }

                          // Calculate interval to evenly space ticks
                          const interval = Math.ceil(chartData.length / (targetTicks - 1));
                          const ticks: string[] = [];

                          for (let i = 0; i < chartData.length; i += interval) {
                            ticks.push(chartData[i].date);
                          }

                          // Always include the last data point (current month)
                          const lastDate = chartData[chartData.length - 1]?.date;
                          if (lastDate && !ticks.includes(lastDate)) {
                            ticks.push(lastDate);
                          }

                          return ticks;
                        })()}
                      />
                      <YAxis
                        tick={{ fontSize: 14, fill: '#64748b' }}
                        tickFormatter={(val) => {
                          return `${formatEur(val / 1000)}k€`;
                        }}
                        domain={[
                          (dataMin: number) => {
                            const increment = privateMode ? 5000 : 10000;
                            return Math.floor(dataMin / increment) * increment;
                          },
                          (dataMax: number) => {
                            const increment = privateMode ? 5000 : 10000;
                            return Math.ceil(dataMax / increment) * increment;
                          }
                        ]}
                        allowDecimals={false}
                        ticks={(() => {
                          const increment = privateMode ? 5000 : 10000;
                          const values = chartData.map(d => Math.max(d.portfolio_value_eur, d.benchmark_value_eur, d.cost_basis_eur));
                          const minVal = Math.floor(Math.min(...values) / increment) * increment;
                          const maxVal = Math.ceil(Math.max(...values) / increment) * increment;
                          const ticks = [];
                          for (let i = minVal; i <= maxVal; i += increment) {
                            ticks.push(i);
                          }
                          return ticks;
                        })()}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e2e8f0', padding: '6px 10px', fontSize: '12px' }}
                        labelStyle={{ color: '#1e293b', fontWeight: 'bold', marginBottom: '2px', fontSize: '11px' }}
                        itemStyle={{ padding: '1px 0', fontSize: '11px' }}
                        labelFormatter={(date) => new Date(String(date)).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                        formatter={(value, name) => {
                          const numValue = Math.round(Number(value));
                          const nameStr = String(name);
                          // Skip fill areas in tooltip
                          if (nameStr.includes('outperformance') || nameStr.includes('underperformance') || nameStr.includes('area_base') || nameStr.includes('fill')) {
                            return null;
                          }
                          const benchmarkTicker = benchmark === 'NASDAQ' ? (currency === 'EUR' ? 'EQQQ' : 'QQQ') : (currency === 'EUR' ? 'CSPX' : 'SPY');
                          let label: string = benchmarkTicker;
                          if (nameStr.includes('Portfolio')) label = t('performance.portfolio');
                          else if (nameStr.includes('Invested')) label = t('performance.invested');
                          return [`${formatEur(numValue)}€`, label];
                        }}
                        wrapperStyle={{ zIndex: 100 }}
                        allowEscapeViewBox={{ x: false, y: true }}
                        offset={10}
                      />
                      <Legend
                        content={() => (
                          <div className="flex justify-center gap-6 mt-2 text-sm flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <div className="w-4 h-0.5 bg-green-600"></div>
                              <span className="text-slate-600">{t('performance.portfolio')}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-4 h-0.5 bg-[#8A8EFF]" style={{ borderStyle: 'dashed', borderWidth: '1px', borderColor: '#8A8EFF', height: 0 }}></div>
                              <span className="text-slate-600">{language === 'fr' ? 'Indice de réf.' : 'Benchmark'} ({benchmark === 'NASDAQ' ? (currency === 'EUR' ? 'EQQQ' : 'QQQ') : (currency === 'EUR' ? 'CSPX' : 'SPY')})</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-4 h-0.5 bg-slate-400"></div>
                              <span className="text-slate-600">{t('performance.invested')}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-3 h-3 bg-green-500/30 border border-green-500"></div>
                              <span className="text-slate-600">{language === 'fr' ? 'Surperformance' : 'Outperformance'}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-3 h-3 bg-red-500/30 border border-red-500"></div>
                              <span className="text-slate-600">{language === 'fr' ? 'Sous-performance' : 'Underperformance'}</span>
                            </div>
                          </div>
                        )}
                      />
                      {/* Stacked areas for outperformance/underperformance fill */}
                      <Area
                        type="monotone"
                        dataKey="area_base"
                        stackId="performance"
                        stroke="none"
                        fill="transparent"
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="outperformance_fill"
                        stackId="performance"
                        stroke="none"
                        fill="url(#outperformanceGradient)"
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="underperformance_fill"
                        stackId="underperf"
                        stroke="none"
                        fill="url(#underperformanceGradient)"
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="area_base"
                        stackId="underperf"
                        stroke="none"
                        fill="transparent"
                        isAnimationActive={false}
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
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </>
              );
            })() : (
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
