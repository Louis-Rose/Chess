import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Minus, Trash2, Loader2, Search, ArrowUpCircle, ArrowDownCircle, Upload } from 'lucide-react';
import { useLanguage } from '../../../../contexts/LanguageContext';
import { searchAllStocks, findStockByTicker, type Stock, type IndexFilter } from '../../utils/allStocks';
import { STOCKS_DB } from '../../../../data/stocksDb';
import type { Transaction, NewTransaction } from './types';
import { RevolutImport } from './RevolutImport';
import { CreditMutuelImport } from './CreditMutuelImport';

// Currency symbols for display
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CHF: 'CHF ',
  DKK: 'kr ',
  SEK: 'kr ',
  NOK: 'kr ',
};

// Exchange suffix to currency mapping
const EXCHANGE_CURRENCY_MAP: Record<string, string> = {
  '.SW': 'CHF',
  '.DE': 'EUR',
  '.PA': 'EUR',
  '.AS': 'EUR',
  '.BR': 'EUR',
  '.LS': 'EUR',
  '.MI': 'EUR',
  '.MC': 'EUR',
  '.VI': 'EUR',
  '.HE': 'EUR',
  '.IR': 'EUR',
  '.L': 'GBP',
  '.CO': 'DKK',
  '.ST': 'SEK',
  '.OL': 'NOK',
};

// Get currency for a stock ticker
const getStockCurrency = (ticker: string): string => {
  const stockInfo = STOCKS_DB[ticker.toUpperCase()];
  if (stockInfo?.yfinance) {
    for (const [suffix, currency] of Object.entries(EXCHANGE_CURRENCY_MAP)) {
      if (stockInfo.yfinance.endsWith(suffix)) {
        return currency;
      }
    }
  }
  return 'USD';
};

const getCurrencySymbol = (currency: string): string => {
  return CURRENCY_SYMBOLS[currency] || `${currency} `;
};

interface TransactionFormProps {
  transactions: Transaction[];
  selectedAccountId: number | undefined;  // First selected account (for adding transactions)
  selectedAccountIds: number[];  // All selected accounts (for filtering)
  selectedAccountBank?: string;
  onAddTransaction: (transaction: NewTransaction) => void;
  onDeleteTransaction: (id: number) => void;
  onRefresh: () => void;
  isAdding: boolean;
  deletingId: number | null;
  addError?: Error | null;
  privateMode: boolean;
}

export function TransactionForm({
  transactions,
  selectedAccountId,
  selectedAccountIds,
  selectedAccountBank,
  onAddTransaction,
  onDeleteTransaction,
  onRefresh,
  isAdding,
  deletingId,
  addError,
  privateMode,
}: TransactionFormProps) {
  const navigate = useNavigate();
  const { language, t } = useLanguage();

  // UI state
  const [showTransactions, setShowTransactions] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showRevolutImport, setShowRevolutImport] = useState(false);
  const [showCreditMutuelImport, setShowCreditMutuelImport] = useState(false);
  const [filterTicker, setFilterTicker] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');

  // Form state
  const [newTicker, setNewTicker] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newYear, setNewYear] = useState('');
  const [newMonth, setNewMonth] = useState('');
  const [newDay, setNewDay] = useState('');
  const [newType, setNewType] = useState<'BUY' | 'SELL'>('BUY');

  // Stock search state
  const [stockSearch, setStockSearch] = useState('');
  const [stockResults, setStockResults] = useState<Stock[]>([]);
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const [indexFilter, setIndexFilter] = useState<IndexFilter>({
    sp500: true, stoxx600: true, swiss: true,
    canada: true, australia: true, hongkong: true, japan: true, singapore: true
  });

  // Day picker state
  const [showDayPicker, setShowDayPicker] = useState(false);

  // Refs
  const stockDropdownRef = useRef<HTMLDivElement>(null);
  const dayPickerRef = useRef<HTMLDivElement>(null);

  // Date picker options
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 2015 + 1 }, (_, i) => currentYear - i);
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

  // Calculate calendar grid for selected month (Mon-Sun layout)
  const calendarGrid = useMemo(() => {
    if (!newYear || !newMonth) return [];
    const year = parseInt(newYear);
    const month = parseInt(newMonth);
    const daysInCurrentMonth = new Date(year, month, 0).getDate();
    const daysInPrevMonth = new Date(year, month - 1, 0).getDate();

    // Get first day of month (0 = Sunday, 1 = Monday, etc.)
    const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
    // Convert to Monday-based (0 = Monday, 6 = Sunday)
    const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    // Limit to today if current year/month
    const today = new Date();
    const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;
    const maxDay = isCurrentMonth ? today.getDate() : daysInCurrentMonth;

    const grid: Array<{ day: number; isCurrentMonth: boolean; isSelectable: boolean; isWeekend: boolean }> = [];

    // Add previous month's days (greyed out)
    for (let i = startOffset - 1; i >= 0; i--) {
      const gridPosition = startOffset - 1 - i;
      const isWeekend = gridPosition % 7 === 5 || gridPosition % 7 === 6; // Sat or Sun
      grid.push({ day: daysInPrevMonth - i, isCurrentMonth: false, isSelectable: false, isWeekend });
    }

    // Add current month's days
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const gridPosition = startOffset + d - 1;
      const isWeekend = gridPosition % 7 === 5 || gridPosition % 7 === 6; // Sat or Sun (market closed)
      const isSelectable = d <= maxDay && !isWeekend;
      grid.push({ day: d, isCurrentMonth: true, isSelectable, isWeekend });
    }

    return grid;
  }, [newYear, newMonth]);

  // Combine into date string
  const newDate = newYear && newMonth && newDay ? `${newYear}-${newMonth}-${newDay.padStart(2, '0')}` : '';

  // Stock search effect
  useEffect(() => {
    const results = searchAllStocks(stockSearch, indexFilter);
    setStockResults(results);
    setShowStockDropdown(results.length > 0 && stockSearch.length > 0);
  }, [stockSearch, indexFilter]);

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
    setFilterTicker(stock.ticker);
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
  };

  const closeForm = () => {
    resetForm(false);
    setNewType('BUY');
    setShowAddForm(false);
    setShowRevolutImport(false);
    setShowCreditMutuelImport(false);
  };

  const handleAddTransaction = () => {
    if (newTicker.trim() && newQuantity && parseInt(newQuantity) > 0 && newDate) {
      onAddTransaction({
        stock_ticker: newTicker.toUpperCase().trim(),
        transaction_type: newType,
        quantity: parseInt(newQuantity),
        transaction_date: newDate,
        account_id: selectedAccountId,
      });
      resetForm(true);
    }
  };

  // Filter transactions by selected accounts, ticker, and type
  const accountTransactions = selectedAccountIds.length > 0
    ? transactions.filter(t => t.account_id && selectedAccountIds.includes(t.account_id))
    : transactions;
  const uniqueTickers = [...new Set(accountTransactions.map(t => t.stock_ticker))].sort();
  const filteredTransactions = accountTransactions.filter(t => {
    const matchesTicker = !filterTicker || t.stock_ticker === filterTicker;
    const matchesType = filterType === 'ALL' || t.transaction_type === filterType;
    return matchesTicker && matchesType;
  });

  return (
    <div className="bg-slate-50 dark:bg-slate-700 rounded-xl p-6">
      {/* Toggle button - centered */}
      <div className="flex justify-center mb-4">
        <button
          onClick={(e) => {
            setShowTransactions(!showTransactions);
            setTimeout(() => e.currentTarget?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 10);
          }}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
        >
          {showTransactions ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showTransactions
            ? (language === 'fr' ? 'Masquer transactions' : 'Hide transactions')
            : (language === 'fr' ? 'Afficher transactions' : 'Show transactions')}
        </button>
      </div>

      {showTransactions && (
        <>
          {/* Header with title */}
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">{t('transactions.title')}</h3>

          {/* Action buttons - Import from bank and Add manually */}
          {!showAddForm && !showRevolutImport && !showCreditMutuelImport && (
            <div className="flex flex-col items-center gap-3 mb-4">
              {selectedAccountBank?.toUpperCase() === 'REVOLUT' && (
                <button
                  onClick={() => setShowRevolutImport(true)}
                  className="w-80 bg-[#0666eb] text-white px-6 py-3 rounded-xl hover:bg-[#0555cc] flex items-center justify-center gap-3 text-lg font-medium shadow-lg hover:shadow-xl transition-all"
                >
                  <Upload className="w-5 h-5" />
                  {t('transactions.importRevolut')}
                </button>
              )}
              {(selectedAccountBank?.toLowerCase().includes('crédit mutuel') || selectedAccountBank?.toLowerCase().includes('credit mutuel')) && (
                <button
                  onClick={() => setShowCreditMutuelImport(true)}
                  className="w-80 bg-[#0b4a3e] text-white px-6 py-3 rounded-xl hover:bg-[#093d33] flex items-center justify-center gap-3 text-lg font-medium shadow-lg hover:shadow-xl transition-all"
                >
                  <Upload className="w-5 h-5" />
                  {language === 'fr' ? 'Importer depuis Crédit Mutuel' : 'Import from Crédit Mutuel'}
                </button>
              )}
              <button
                onClick={() => setShowAddForm(true)}
                className="w-80 bg-green-600 text-white px-6 py-3 rounded-xl hover:bg-green-700 flex items-center justify-center gap-3 text-lg font-medium shadow-lg hover:shadow-xl transition-all"
              >
                <Plus className="w-5 h-5" />
                {t('transactions.addTransaction')}
              </button>
            </div>
          )}

          {/* Filters - shown below buttons when not adding/importing */}
          {!showAddForm && !showRevolutImport && !showCreditMutuelImport && uniqueTickers.length > 0 && (
            <div className="flex justify-center gap-3 mb-6">
              <select
                value={filterTicker}
                onChange={(e) => setFilterTicker(e.target.value)}
                className="px-3 py-1.5 border border-slate-300 dark:border-slate-500 rounded-lg bg-white dark:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">{t('transactions.allStocks')}</option>
                {uniqueTickers.map(ticker => {
                  const stock = findStockByTicker(ticker);
                  const label = stock ? `${stock.name} (${ticker})` : ticker;
                  return <option key={ticker} value={ticker}>{label}</option>;
                })}
              </select>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as 'ALL' | 'BUY' | 'SELL')}
                className="px-3 py-1.5 border border-slate-300 dark:border-slate-500 rounded-lg bg-white dark:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="ALL">{language === 'fr' ? 'Achats & Ventes' : 'Buys & Sells'}</option>
                <option value="BUY">{language === 'fr' ? 'Achats' : 'Buys only'}</option>
                <option value="SELL">{language === 'fr' ? 'Ventes' : 'Sells only'}</option>
              </select>
            </div>
          )}

          {/* Add Transaction Form */}
          {showAddForm && (
            <div className="bg-white rounded-lg p-4 mb-6 border border-slate-200">
              {/* Market Filter Toggles */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
                <span className="text-sm text-slate-500">{language === 'fr' ? 'Marchés:' : 'Markets:'}</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={indexFilter.sp500}
                    onChange={(e) => setIndexFilter({ ...indexFilter, sp500: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-slate-700">US</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={indexFilter.stoxx600}
                    onChange={(e) => setIndexFilter({ ...indexFilter, stoxx600: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-slate-700">Europe</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={indexFilter.swiss}
                    onChange={(e) => setIndexFilter({ ...indexFilter, swiss: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-slate-700">Swiss</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={indexFilter.canada}
                    onChange={(e) => setIndexFilter({ ...indexFilter, canada: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-slate-700">Canada</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={indexFilter.australia}
                    onChange={(e) => setIndexFilter({ ...indexFilter, australia: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-slate-700">Australia</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={indexFilter.japan}
                    onChange={(e) => setIndexFilter({ ...indexFilter, japan: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-slate-700">Japan</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={indexFilter.hongkong}
                    onChange={(e) => setIndexFilter({ ...indexFilter, hongkong: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-slate-700">Hong Kong</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={indexFilter.singapore}
                    onChange={(e) => setIndexFilter({ ...indexFilter, singapore: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-slate-700">Singapore</span>
                </label>
              </div>
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
                        // Clear filter when search is cleared
                        if (!e.target.value) {
                          setFilterTicker('');
                        }
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

                {/* Date dropdowns: Year - Month - Day */}
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

                {/* Calendar day picker (Mon-Sun) */}
                <div className="relative" ref={dayPickerRef}>
                  <button
                    type="button"
                    onClick={() => newMonth && setShowDayPicker(!showDayPicker)}
                    disabled={!newMonth}
                    className="w-20 px-2 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-green-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-left"
                  >
                    {newDay || t('transactions.day')}
                  </button>
                  {showDayPicker && calendarGrid.length > 0 && (
                    <div className="absolute top-full right-0 mt-1 bg-white border border-slate-300 rounded-xl shadow-xl z-50 p-3" style={{ width: '280px' }}>
                      {/* Day headers */}
                      <div className="grid grid-cols-7 gap-1 mb-2">
                        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(day => (
                          <div key={day} className="h-6 flex items-center justify-center text-xs font-medium text-slate-400">
                            {day}
                          </div>
                        ))}
                      </div>
                      {/* Calendar grid */}
                      <div className="grid grid-cols-7 gap-1">
                        {calendarGrid.map((cell, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              if (cell.isCurrentMonth && cell.isSelectable) {
                                setNewDay(String(cell.day));
                                setShowDayPicker(false);
                              }
                            }}
                            disabled={!cell.isCurrentMonth || !cell.isSelectable}
                            className={`h-9 rounded-lg text-sm font-medium transition-colors ${
                              !cell.isCurrentMonth
                                ? 'text-slate-300 cursor-default'
                                : !cell.isSelectable
                                  ? 'text-slate-300 cursor-not-allowed'
                                  : newDay === String(cell.day)
                                    ? 'bg-green-600 text-white'
                                    : 'text-slate-700 hover:bg-green-50'
                            }`}
                          >
                            {cell.day}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleAddTransaction}
                  disabled={!newTicker.trim() || !newQuantity || !newDate || isAdding}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {t('transactions.add')}
                </button>
              </div>
              <p className="text-slate-500 text-sm mt-2">
                {t('transactions.priceNote')}
              </p>
              {addError && (
                <p className="text-red-500 text-sm mt-2">
                  {t('common.error')}: {addError.message || 'Failed to add transaction'}
                </p>
              )}
            </div>
          )}

          {/* Revolut Import */}
          {showRevolutImport && (
            <div className="mb-6">
              <RevolutImport
                selectedAccountId={selectedAccountId}
                onImportComplete={() => {
                  setShowRevolutImport(false);
                  onRefresh();
                }}
                onClose={() => setShowRevolutImport(false)}
              />
            </div>
          )}

          {/* Crédit Mutuel Import */}
          {showCreditMutuelImport && (
            <div className="mb-6">
              <CreditMutuelImport
                selectedAccountId={selectedAccountId}
                onImportComplete={() => {
                  setShowCreditMutuelImport(false);
                  onRefresh();
                }}
                onClose={() => setShowCreditMutuelImport(false)}
              />
            </div>
          )}

          {/* Done button - right after the form */}
          {(showAddForm || showRevolutImport || showCreditMutuelImport) && (
            <div className="flex justify-center mb-6">
              <button
                onClick={closeForm}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                {t('transactions.done')}
              </button>
            </div>
          )}

          {/* Transactions List */}
          {accountTransactions.length === 0 ? (
            <p className="text-slate-500 text-center py-8">{t('transactions.noTransactions')}</p>
          ) : filteredTransactions.length === 0 ? (
            <p className="text-slate-500 text-center py-8">{language === 'fr' ? `Aucune transaction pour ${filterTicker}.` : `No transactions for ${filterTicker}.`}</p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-auto">
              {filteredTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-4">
                    <div className={`px-2 py-1 rounded text-xs font-bold ${tx.transaction_type === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {tx.transaction_type === 'BUY' ? t('transactions.buy') : t('transactions.sell')}
                    </div>
                    <button
                      onClick={() => navigate(`/investing/stock/${tx.stock_ticker}`)}
                      className="font-bold text-slate-800 w-16 hover:text-green-600 hover:underline text-left"
                    >
                      {tx.stock_ticker}
                    </button>
                    <span className="text-slate-600">{privateMode ? '**' : tx.quantity} {t('transactions.shares')}</span>
                    <span className="text-slate-400">@</span>
                    <span className="text-slate-600">{getCurrencySymbol(getStockCurrency(tx.stock_ticker))}{tx.price_per_share.toFixed(2)}</span>
                    <span className="text-slate-400 text-sm">
                      {new Date(tx.transaction_date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <button
                    onClick={() => onDeleteTransaction(tx.id)}
                    disabled={deletingId === tx.id}
                    className={`p-1 ${deletingId === tx.id ? 'text-slate-300' : 'text-slate-400 hover:text-red-500'}`}
                  >
                    {deletingId === tx.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
