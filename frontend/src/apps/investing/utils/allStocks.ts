// Combined stock indices for global search
import { SP500_STOCKS, type Stock } from './sp500';
import { STOXX600_STOCKS } from './stoxx600';

// Re-export the Stock type
export type { Stock };

// Index filter options
export interface IndexFilter {
  sp500: boolean;
  stoxx600: boolean;
}

// Combined list of all stocks (S&P 500 + STOXX Europe 600)
// Note: Some companies may appear in both indices (e.g., dual-listed)
export const ALL_STOCKS: Stock[] = [...SP500_STOCKS, ...STOXX600_STOCKS];

// Export individual indices for reference
export { SP500_STOCKS, STOXX600_STOCKS };

// Get stocks based on filter
function getFilteredStocks(filter?: IndexFilter): Stock[] {
  // Default to all if no filter provided
  if (!filter) {
    return ALL_STOCKS;
  }

  // Return empty if both are unchecked
  if (!filter.sp500 && !filter.stoxx600) {
    return [];
  }

  const stocks: Stock[] = [];
  if (filter.sp500) stocks.push(...SP500_STOCKS);
  if (filter.stoxx600) stocks.push(...STOXX600_STOCKS);
  return stocks;
}

// Unified search function across selected indices
export function searchAllStocks(query: string, filter?: IndexFilter): Stock[] {
  if (!query.trim()) return [];

  const q = query.toLowerCase();
  const stocksToSearch = getFilteredStocks(filter);

  // Separate matches into priority groups
  const exact: Stock[] = [];
  const startsWith: Stock[] = [];
  const contains: Stock[] = [];

  // Use a Set to avoid duplicates (same ticker from different indices)
  const seenTickers = new Set<string>();

  for (const stock of stocksToSearch) {
    if (seenTickers.has(stock.ticker)) continue;

    const tickerLower = stock.ticker.toLowerCase();
    const nameLower = stock.name.toLowerCase();

    if (tickerLower === q || nameLower === q) {
      exact.push(stock);
      seenTickers.add(stock.ticker);
    } else if (tickerLower.startsWith(q) || nameLower.startsWith(q)) {
      startsWith.push(stock);
      seenTickers.add(stock.ticker);
    } else if (tickerLower.includes(q) || nameLower.includes(q)) {
      contains.push(stock);
      seenTickers.add(stock.ticker);
    }
  }

  // Return prioritized results: exact > starts with > contains
  return [...exact, ...startsWith, ...contains].slice(0, 10);
}

// Find stock by ticker across all indices
export function findStockByTicker(ticker: string): Stock | undefined {
  return ALL_STOCKS.find(s => s.ticker === ticker);
}
