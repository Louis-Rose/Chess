// Shared types for Portfolio components (copy from investing app)

export interface Transaction {
  id: number;
  stock_ticker: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  transaction_date: string;
  price_per_share: number;
  price_currency: string;  // Currency of the price (EUR, USD, etc.)
  account_id: number | null;
  account_name: string | null;
  account_type: string | null;
  bank: string | null;
}

export interface BankInfo {
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

export interface AccountTypeInfo {
  name: string;
  description_fr?: string;
  description_en?: string;
  tax_rate: number;
}

export interface Account {
  id: number;
  name: string;
  account_type: string;
  bank: string;
  bank_info: BankInfo;
  type_info: AccountTypeInfo;
}

export interface NewTransaction {
  stock_ticker: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  transaction_date: string;
  account_id?: number;
  price_per_share?: number;  // Optional: if not provided, will be fetched from market data
}

export interface ComputedHolding {
  stock_ticker: string;
  quantity: number;
  cost_basis: number;
}

export interface CompositionItem {
  ticker: string;
  quantity: number;
  native_currency: string;
  current_price_native: number;
  current_price: number;  // In EUR
  current_value: number;  // In EUR
  cost_basis: number;
  cost_basis_eur: number;
  gain: number;  // In EUR
  gain_eur: number;
  gain_pct: number;
  weight: number;
  color: string;
}

export interface CompositionData {
  holdings: CompositionItem[];
  total_value_usd: number;
  total_value_eur: number;
  total_cost_basis: number;
  total_cost_basis_eur: number;
  total_gain_usd: number;
  total_gain_pct: number;
  realized_gains_usd: number;
  realized_gains_eur: number;
  sold_cost_basis_eur: number;
  eurusd_rate: number;
}

export interface StockBreakdown {
  value_eur: number;
  cost_basis_eur: number;
  quantity: number;
  benchmark_value_eur?: number;
}

export interface PerformanceDataPoint {
  date: string;
  portfolio_value_eur: number;
  benchmark_value_eur: number;
  cost_basis_eur: number;
  portfolio_growth_usd: number;
  portfolio_growth_eur: number;
  benchmark_growth_usd: number;
  benchmark_growth_eur: number;
  stocks?: Record<string, StockBreakdown>;
}

export interface TransactionEvent {
  date: string;
  ticker: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  amount_eur?: number;
}

export interface PerformanceData {
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
