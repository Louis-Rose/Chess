// Portfolio panel with transactions, composition and performance

import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ReferenceDot
} from 'recharts';
import { Briefcase, Plus, Trash2, Loader2, TrendingUp, TrendingDown, Search, ArrowUpCircle, ArrowDownCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { LoginButton } from '../../../components/LoginButton';
import { searchStocks, SP500_STOCKS, type Stock } from '../utils/sp500';

interface Transaction {
  id: number;
  stock_ticker: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  transaction_date: string;
  price_per_share: number;
}

interface NewTransaction {
  stock_ticker: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  transaction_date: string;
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

export function PortfolioPanel() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
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
  const [hoveredTransactions, setHoveredTransactions] = useState<{ txs: TransactionEvent[]; x: number; y: number } | null>(null);
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

  const hasHoldings = (holdingsData?.holdings?.length ?? 0) > 0;

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
      });
    }
  };

  // Show loading while auth is checking
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-green-500 animate-spin mb-4" />
        <p className="text-slate-400">Checking authentication...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col items-center justify-center py-20">
          <Briefcase className="w-16 h-16 text-slate-500 mb-4" />
          <h2 className="text-2xl font-bold text-slate-300 mb-2">Sign In Required</h2>
          <p className="text-slate-500 mb-6">Please sign in to view your portfolio.</p>
          <LoginButton />
        </div>
      </div>
    );
  }

  if (transactionsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 text-green-500 animate-spin mb-4" />
        <p className="text-slate-400">Loading portfolio...</p>
      </div>
    );
  }

  const transactions = transactionsData?.transactions ?? [];
  const uniqueTickers = [...new Set(transactions.map(t => t.stock_ticker))].sort();
  const filteredTransactions = filterTicker
    ? transactions.filter(t => t.stock_ticker === filterTicker)
    : transactions;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex justify-center mb-8 mt-12">
        <div className="h-1 w-[90%] bg-slate-100 rounded-full"></div>
      </div>

      <div className="flex flex-col items-center gap-2 mb-6">
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-bold text-slate-100">My Portfolio</h2>
          <button
            onClick={() => setPrivateMode(!privateMode)}
            className={`px-3 py-2 rounded-lg transition-colors flex items-center gap-2 text-sm ${privateMode ? 'bg-slate-600 text-slate-200' : 'bg-slate-700 text-slate-400 hover:text-slate-300'}`}
          >
            {privateMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>Private mode</span>
          </button>
        </div>
        <p className="text-slate-400 text-lg italic">Track your investment transactions and performance</p>
        {!showTransactions && (
          <button
            onClick={() => setShowTransactions(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl flex items-center gap-2 text-lg font-medium shadow-md mt-2"
          >
            <Plus className="w-5 h-5" />
            Edit transaction history
          </button>
        )}
      </div>

      <div className="max-w-6xl mx-auto space-y-8">
        {/* Summary Cards */}
        {compositionData && hasHoldings && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-100 rounded-xl p-6 text-center">
              <p className="text-3xl font-bold text-slate-800">
                {privateMode ? '€10,000' : `€${Math.round(compositionData.total_value_eur).toLocaleString()}`}
              </p>
              <p className="text-slate-500 text-sm">Total Value (EUR)</p>
            </div>
            <div className="bg-slate-100 rounded-xl p-6 text-center">
              <p className="text-3xl font-bold text-slate-800">
                {privateMode ? '€10,000' : `€${Math.round(compositionData.total_cost_basis / compositionData.eurusd_rate).toLocaleString()}`}
              </p>
              <p className="text-slate-500 text-sm">Cost Basis (EUR)</p>
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
                {privateMode ? 'Total Gain' : `${compositionData.total_gain_usd >= 0 ? '+' : ''}€${Math.round(compositionData.total_gain_usd / compositionData.eurusd_rate).toLocaleString()}`}
              </p>
            </div>
          </div>
        )}

        {/* Transaction History */}
        {showTransactions && (
        <div className="bg-slate-100 rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <h3 className="text-xl font-bold text-slate-800">Transaction History</h3>
              {uniqueTickers.length > 0 && (
                <select
                  value={filterTicker}
                  onChange={(e) => setFilterTicker(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">All stocks</option>
                  {uniqueTickers.map(ticker => {
                    const stock = SP500_STOCKS.find(s => s.ticker === ticker);
                    const label = stock ? `${stock.name} (${ticker})` : ticker;
                    return <option key={ticker} value={ticker}>{label}</option>;
                  })}
                </select>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Transaction
                </button>
              )}
              <button
                onClick={() => { setShowTransactions(false); setShowAddForm(false); }}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
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
                      placeholder="Search S&P 500 stocks..."
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
                    Buy
                  </button>
                  <button
                    onClick={() => setNewType('SELL')}
                    className={`px-4 py-2 flex items-center gap-1 ${newType === 'SELL' ? 'bg-red-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    <ArrowUpCircle className="w-4 h-4" />
                    Sell
                  </button>
                </div>

                <input
                  type="number"
                  placeholder="Quantity"
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
                  <option value="">Year</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>

                <select
                  value={newMonth}
                  onChange={(e) => { setNewMonth(e.target.value); setNewDay(''); }}
                  disabled={!newYear}
                  className="w-40 px-2 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Month</option>
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
                    {newDay || 'Day'}
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
                  Add
                </button>

                <button
                  onClick={closeForm}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
                >
                  Done
                </button>
              </div>
              <p className="text-slate-500 text-sm mt-2">
                The price will be fetched automatically from market data for the selected date.
              </p>
              {addMutation.isError && (
                <p className="text-red-500 text-sm mt-2">
                  Error: {(addMutation.error as Error)?.message || 'Failed to add transaction'}
                </p>
              )}
            </div>
          )}

          {/* Transactions List */}
          {transactions.length === 0 ? (
            <p className="text-slate-500 text-center py-8">No transactions yet. Add your first transaction to get started.</p>
          ) : filteredTransactions.length === 0 ? (
            <p className="text-slate-500 text-center py-8">No transactions for {filterTicker}.</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-auto">
              {filteredTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-4">
                    <div className={`px-2 py-1 rounded text-xs font-bold ${tx.transaction_type === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {tx.transaction_type}
                    </div>
                    <span className="font-bold text-slate-800 w-16">{tx.stock_ticker}</span>
                    <span className="text-slate-600">{privateMode ? '••' : tx.quantity} shares</span>
                    <span className="text-slate-400">@</span>
                    <span className="text-slate-600">${tx.price_per_share.toFixed(2)}</span>
                    <span className="text-slate-400 text-sm">
                      {new Date(tx.transaction_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
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
        {hasHoldings && (
          <div className="bg-slate-100 rounded-xl p-6">
            <h3 className="text-xl font-bold text-slate-800 mb-6">Current Holdings</h3>

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
                        <th className="pb-2">Stock</th>
                        <th className="pb-2 text-right">Shares</th>
                        <th className="pb-2 text-right">Price</th>
                        <th className="pb-2 text-right">{privateMode ? 'Weight' : 'Value (EUR)'}</th>
                        <th className="pb-2 text-right">Gain</th>
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
        {hasHoldings && (
          <div className="bg-slate-100 rounded-xl p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-4">
                <h3 className="text-xl font-bold text-slate-800">Portfolio Performance</h3>
                {performanceData?.summary && (
                  <span className={`text-lg font-semibold ${performanceData.summary.cagr_eur >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    CAGR: {performanceData.summary.cagr_eur >= 0 ? '+' : ''}{performanceData.summary.cagr_eur}%/year
                  </span>
                )}
              </div>
              <select
                value={benchmark}
                onChange={(e) => setBenchmark(e.target.value as 'QQQ' | 'SP500')}
                className="px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="QQQ">Benchmark: QQQ (Nasdaq-100)</option>
                <option value="SP500">Benchmark: S&P 500</option>
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
                          if (months === 0) return `${fullYears} year${fullYears !== 1 ? 's' : ''}`;
                          if (fullYears === 0) return `${months} month${months !== 1 ? 's' : ''}`;
                          return `${fullYears} year${fullYears !== 1 ? 's' : ''} ${months} month${months !== 1 ? 's' : ''}`;
                        })()}
                      </span>
                      <p className="text-slate-500 text-sm">Since {new Date(performanceData.summary.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
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
                      <p className="text-slate-500 text-sm">Total Return</p>
                    </div>
                    <div className="bg-white rounded-lg p-4 text-center">
                      <span className={`text-2xl font-bold ${performanceData.summary.benchmark_return_eur >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {performanceData.summary.benchmark_return_eur >= 0 ? '+' : ''}{performanceData.summary.benchmark_return_eur}%
                      </span>
                      <p className="text-slate-500 text-sm">{benchmark}</p>
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
                          return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                        }}
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        interval={Math.floor(performanceData.data.length / 8)}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        tickFormatter={(val) => `€${(val / 1000).toFixed(0)}k`}
                        domain={['dataMin - 1000', 'dataMax + 1000']}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                        labelStyle={{ color: '#1e293b', fontWeight: 'bold', marginBottom: '4px' }}
                        labelFormatter={(date) => new Date(String(date)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        formatter={(value, name) => {
                          const numValue = Math.round(Number(value));
                          const nameStr = String(name);
                          let label: string = benchmark;
                          if (nameStr.includes('Portfolio')) label = 'Portfolio';
                          else if (nameStr.includes('Invested')) label = 'Invested';
                          return [`€${numValue.toLocaleString()}`, label];
                        }}
                        wrapperStyle={{ display: hoveredTransactions ? 'none' : 'block' }}
                      />
                      <Legend
                        content={() => (
                          <div className="flex justify-center gap-6 mt-2 text-sm">
                            <div className="flex items-center gap-1.5">
                              <div className="w-4 h-0.5 bg-green-600"></div>
                              <span className="text-slate-600">Portfolio</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-4 h-0.5 bg-[#8A8EFF]" style={{ borderStyle: 'dashed', borderWidth: '1px', borderColor: '#8A8EFF', height: 0 }}></div>
                              <span className="text-slate-600">{benchmark}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-4 h-0.5 bg-slate-400"></div>
                              <span className="text-slate-600">Invested</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full bg-green-600"></div>
                              <span className="text-slate-600">Buy</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full bg-red-600"></div>
                              <span className="text-slate-600">Sell</span>
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
                      {/* Transaction markers - grouped by week */}
                      {(() => {
                        // Group transactions by their chart data point
                        const grouped = new Map<string, { dataPoint: PerformanceDataPoint; txs: TransactionEvent[] }>();
                        performanceData.transactions?.forEach(tx => {
                          const dataPoint = performanceData.data.find(d => d.date >= tx.date) || performanceData.data[performanceData.data.length - 1];
                          if (!dataPoint) return;
                          const key = dataPoint.date;
                          if (!grouped.has(key)) {
                            grouped.set(key, { dataPoint, txs: [] });
                          }
                          grouped.get(key)!.txs.push(tx);
                        });

                        return Array.from(grouped.entries()).map(([key, { dataPoint, txs }]) => {
                          const hasBuy = txs.some(t => t.type === 'BUY');
                          const hasSell = txs.some(t => t.type === 'SELL');
                          const isMixed = hasBuy && hasSell;

                          return (
                            <ReferenceDot
                              key={`tx-group-${key}`}
                              x={dataPoint.date}
                              y={dataPoint.portfolio_value_eur}
                              r={6}
                              ifOverflow="extendDomain"
                              shape={(props: { cx?: number; cy?: number }) => {
                                const { cx = 0, cy = 0 } = props;
                                return (
                                  <g
                                    style={{ cursor: 'pointer' }}
                                    onMouseEnter={() => setHoveredTransactions({ txs, x: cx, y: cy })}
                                    onMouseLeave={() => setHoveredTransactions(null)}
                                  >
                                    {/* Larger invisible hit area */}
                                    <circle cx={cx} cy={cy} r={24} fill="transparent" />
                                    {/* Visible dot - half/half if mixed */}
                                    {isMixed ? (
                                      <>
                                        <clipPath id={`clip-left-${key}`}>
                                          <rect x={cx - 6} y={cy - 6} width={6} height={12} />
                                        </clipPath>
                                        <clipPath id={`clip-right-${key}`}>
                                          <rect x={cx} y={cy - 6} width={6} height={12} />
                                        </clipPath>
                                        <circle cx={cx} cy={cy} r={6} fill="#16a34a" clipPath={`url(#clip-left-${key})`} />
                                        <circle cx={cx} cy={cy} r={6} fill="#dc2626" clipPath={`url(#clip-right-${key})`} />
                                        <circle cx={cx} cy={cy} r={6} fill="none" stroke="white" strokeWidth={2} />
                                      </>
                                    ) : (
                                      <circle
                                        cx={cx}
                                        cy={cy}
                                        r={6}
                                        fill={hasBuy ? '#16a34a' : '#dc2626'}
                                        stroke="white"
                                        strokeWidth={2}
                                      />
                                    )}
                                  </g>
                                );
                              }}
                            />
                          );
                        });
                      })()}
                    </LineChart>
                  </ResponsiveContainer>
                  {/* Custom tooltip for transaction markers */}
                  {hoveredTransactions && (
                    <div
                      className="absolute pointer-events-none bg-white border border-slate-200 rounded-lg shadow-lg p-3 z-50"
                      style={{
                        left: hoveredTransactions.x + 10,
                        top: hoveredTransactions.y - (hoveredTransactions.txs.length > 1 ? 40 * hoveredTransactions.txs.length : 60),
                        transform: hoveredTransactions.x > (chartContainerRef.current?.offsetWidth || 0) - 200 ? 'translateX(-100%)' : 'none',
                      }}
                    >
                      {hoveredTransactions.txs.map((tx, idx) => (
                        <div key={idx} className={idx > 0 ? 'mt-2 pt-2 border-t border-slate-100' : ''}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${tx.type === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {tx.type}
                            </span>
                            <span className="font-bold text-slate-800">{tx.quantity} shares</span>
                          </div>
                          <p className="text-slate-700 font-medium">
                            {SP500_STOCKS.find(s => s.ticker === tx.ticker)?.name || tx.ticker}
                          </p>
                          <p className="text-slate-500 text-sm">
                            {new Date(tx.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
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
