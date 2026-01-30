// Manage recently searched stocks in localStorage (per user)

const STORAGE_KEY_PREFIX = 'recent-stocks';
const MAX_RECENT = 12;

function getStorageKey(userId?: number): string {
  return userId ? `${STORAGE_KEY_PREFIX}-${userId}` : STORAGE_KEY_PREFIX;
}

export function getRecentStocks(userId?: number): string[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(getStorageKey(userId));
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function addRecentStock(ticker: string, userId?: number): void {
  const recent = getRecentStocks(userId);
  // Remove if already exists (will re-add at front)
  const filtered = recent.filter(t => t !== ticker);
  // Add to front
  filtered.unshift(ticker);
  // Keep only MAX_RECENT
  const trimmed = filtered.slice(0, MAX_RECENT);
  localStorage.setItem(getStorageKey(userId), JSON.stringify(trimmed));
  // Notify listeners that recent stocks changed
  window.dispatchEvent(new CustomEvent('recent-stocks-updated'));
}

export function removeRecentStock(ticker: string, userId?: number): void {
  const recent = getRecentStocks(userId);
  const filtered = recent.filter(t => t !== ticker);
  localStorage.setItem(getStorageKey(userId), JSON.stringify(filtered));
}
