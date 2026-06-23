// A single portfolio transaction, as returned by GET /api/investing/transactions.
export interface Transaction {
  id: number;
  stock_ticker: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  transaction_date: string; // YYYY-MM-DD
  price_per_share: number;
  price_currency: string;
  account_id: number | null;
  account_name: string | null;
  account_type: string | null;
  bank: string | null;
}
