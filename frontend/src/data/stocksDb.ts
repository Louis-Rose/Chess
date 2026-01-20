/**
 * Unified Stock Database
 * Single source of truth for all stock data (names, tickers, IR links, logos)
 */
import stocksData from './stocks.json';

export type Region = 'us' | 'europe' | 'swiss' | 'canada' | 'australia' | 'hongkong' | 'japan' | 'singapore';

export interface StockInfo {
  name: string;
  yfinance: string;
  region: Region;
  ir?: string;
  logo?: string;
}

export interface Stock {
  ticker: string;
  name: string;
}

export interface IndexFilter {
  sp500?: boolean;      // US stocks
  stoxx600?: boolean;   // European stocks
  swiss?: boolean;      // Swiss stocks
  canada?: boolean;     // Canadian stocks (TSX)
  australia?: boolean;  // Australian stocks (ASX)
  hongkong?: boolean;   // Hong Kong stocks (HKEX)
  japan?: boolean;      // Japanese stocks (TSE)
  singapore?: boolean;  // Singapore stocks (SGX)
}

// The unified database
export const STOCKS_DB: Record<string, StockInfo> = stocksData as Record<string, StockInfo>;

// All tickers
const ALL_TICKERS = Object.keys(STOCKS_DB);

/**
 * Get stock info by ticker
 */
export function getStock(ticker: string): StockInfo | undefined {
  return STOCKS_DB[ticker.toUpperCase()];
}

/**
 * Find stock by ticker, returns Stock format for compatibility
 */
export function findStockByTicker(ticker: string): Stock | undefined {
  const info = getStock(ticker);
  if (!info) return undefined;
  return { ticker: ticker.toUpperCase(), name: info.name };
}

/**
 * Get investor relations URL for a ticker
 */
export function getCompanyIRUrl(ticker: string): string | null {
  const info = getStock(ticker);
  return info?.ir || null;
}

/**
 * Get logo domain for Clearbit API
 */
export function getCompanyLogoDomain(ticker: string): string | null {
  const info = getStock(ticker);
  return info?.logo || null;
}

/**
 * Get logo URL using Google's favicon service (more reliable than Clearbit)
 */
export function getCompanyLogoUrl(ticker: string): string | null {
  const domain = getCompanyLogoDomain(ticker);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

/**
 * Map region filter to region values
 */
function getRegionsFromFilter(filter?: IndexFilter): Region[] | null {
  if (!filter) return null; // All regions

  const regions: Region[] = [];
  if (filter.sp500) regions.push('us');
  if (filter.stoxx600) regions.push('europe');
  if (filter.swiss) regions.push('swiss');
  if (filter.canada) regions.push('canada');
  if (filter.australia) regions.push('australia');
  if (filter.hongkong) regions.push('hongkong');
  if (filter.japan) regions.push('japan');
  if (filter.singapore) regions.push('singapore');

  return regions.length > 0 ? regions : null;
}

/**
 * Get all stocks, optionally filtered by region
 */
export function getAllStocks(filter?: IndexFilter): Stock[] {
  const regions = getRegionsFromFilter(filter);

  return ALL_TICKERS
    .filter(ticker => {
      if (!regions) return true;
      return regions.includes(STOCKS_DB[ticker].region);
    })
    .map(ticker => ({
      ticker,
      name: STOCKS_DB[ticker].name
    }));
}

/**
 * Search stocks by query, optionally filtered by region
 * Returns up to 10 results, prioritized by match quality
 */
export function searchStocks(query: string, filter?: IndexFilter): Stock[] {
  if (!query || query.length < 1) return [];

  const q = query.toUpperCase().trim();
  const regions = getRegionsFromFilter(filter);

  const exactMatches: Stock[] = [];
  const startsWithTicker: Stock[] = [];
  const startsWithName: Stock[] = [];
  const containsMatches: Stock[] = [];

  for (const ticker of ALL_TICKERS) {
    const info = STOCKS_DB[ticker];

    // Filter by region if specified
    if (regions && !regions.includes(info.region)) continue;

    const tickerUpper = ticker.toUpperCase();
    const nameUpper = info.name.toUpperCase();

    if (tickerUpper === q || nameUpper === q) {
      exactMatches.push({ ticker, name: info.name });
    } else if (tickerUpper.startsWith(q)) {
      startsWithTicker.push({ ticker, name: info.name });
    } else if (nameUpper.startsWith(q)) {
      startsWithName.push({ ticker, name: info.name });
    } else if (tickerUpper.includes(q) || nameUpper.includes(q)) {
      containsMatches.push({ ticker, name: info.name });
    }
  }

  return [
    ...exactMatches,
    ...startsWithTicker,
    ...startsWithName,
    ...containsMatches
  ].slice(0, 10);
}

/**
 * Legacy compatibility: search all stocks
 */
export function searchAllStocks(query: string, filter?: IndexFilter): Stock[] {
  return searchStocks(query, filter);
}

/**
 * Get filtered stocks list (for backwards compatibility)
 */
export function getFilteredStocks(filter?: IndexFilter): Stock[] {
  return getAllStocks(filter);
}

// Re-export Stock type for compatibility
export type { Stock as StockType };
