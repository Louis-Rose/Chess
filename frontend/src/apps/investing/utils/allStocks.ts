// Combined stock indices for global search
import { SP500_STOCKS, type Stock } from './sp500';
import { STOXX600_STOCKS } from './stoxx600';

// Re-export the Stock type
export type { Stock };

// Combined list of all stocks (S&P 500 + STOXX Europe 600)
// Note: Some companies may appear in both indices (e.g., dual-listed)
export const ALL_STOCKS: Stock[] = [...SP500_STOCKS, ...STOXX600_STOCKS];

// Export individual indices for reference
export { SP500_STOCKS, STOXX600_STOCKS };

// Unified search function across all indices
export function searchAllStocks(query: string): Stock[] {
  if (!query.trim()) return [];

  const q = query.toLowerCase();

  // Separate matches into priority groups
  const exact: Stock[] = [];
  const startsWith: Stock[] = [];
  const contains: Stock[] = [];

  // Use a Set to avoid duplicates (same ticker from different indices)
  const seenTickers = new Set<string>();

  for (const stock of ALL_STOCKS) {
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
