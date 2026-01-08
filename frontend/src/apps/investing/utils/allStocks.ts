/**
 * Combined stock indices for global search
 * Now powered by the unified stocks database
 */
import {
  STOCKS_DB,
  getAllStocks,
  searchStocks,
  findStockByTicker as findStock,
  type Stock,
  type IndexFilter,
  type StockInfo,
} from '../../../data/stocksDb';

// Re-export types
export type { Stock, IndexFilter, StockInfo };

// Combined list of all stocks (for backward compatibility)
export const ALL_STOCKS: Stock[] = getAllStocks();

// Legacy exports for backward compatibility
// These create arrays from the unified DB filtered by region
export const SP500_STOCKS: Stock[] = getAllStocks({ sp500: true });
export const STOXX600_STOCKS: Stock[] = getAllStocks({ stoxx600: true });
export const swissStocks: Stock[] = getAllStocks({ swiss: true });

// Get stocks based on filter
export function getFilteredStocks(filter?: IndexFilter): Stock[] {
  return getAllStocks(filter);
}

// Unified search function across selected indices
export function searchAllStocks(query: string, filter?: IndexFilter): Stock[] {
  return searchStocks(query, filter);
}

// Find stock by ticker across all indices
export function findStockByTicker(ticker: string): Stock | undefined {
  return findStock(ticker);
}

// Re-export the database for direct access if needed
export { STOCKS_DB };
