// Shared fetch wrapper that handles 401 → token refresh → retry (like the axios interceptor)

let refreshPromise: Promise<boolean> | null = null;

async function refreshToken(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function authFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...opts, credentials: 'include' });

  if (res.status !== 401) return res;

  // Token expired — refresh once (deduplicated)
  if (!refreshPromise) {
    refreshPromise = refreshToken().finally(() => { refreshPromise = null; });
  }
  const ok = await refreshPromise;
  if (!ok) return res;

  // Retry original request with new token
  return fetch(url, { ...opts, credentials: 'include' });
}
