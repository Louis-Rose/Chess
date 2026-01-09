// Manage recently searched stocks in localStorage

const STORAGE_KEY = 'recent-stocks';
const MAX_RECENT = 10;

export function getRecentStocks(): string[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function addRecentStock(ticker: string): void {
  const recent = getRecentStocks();
  // Remove if already exists (will re-add at front)
  const filtered = recent.filter(t => t !== ticker);
  // Add to front
  filtered.unshift(ticker);
  // Keep only MAX_RECENT
  const trimmed = filtered.slice(0, MAX_RECENT);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function removeRecentStock(ticker: string): void {
  const recent = getRecentStocks();
  const filtered = recent.filter(t => t !== ticker);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}
