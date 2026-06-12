import { useEffect, useState } from 'react';

// The workout rest timer: a single timestamp (ms) of the last logged set. Kept
// outside the React tree (and in localStorage) so it survives tab switches and
// FitSession unmounting, and a page reload. FitApp renders the pill from it;
// FitSession (re)starts it on each logged set and clears it when finishing.

const KEY = 'fit:rest-start';
type Listener = (v: number | null) => void;
const listeners = new Set<Listener>();

export function getRestStart(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    const n = raw == null ? null : Number(raw);
    return n != null && Number.isFinite(n) ? n : null;
  } catch { return null; }
}

export function startRest(ts: number): void {
  try { localStorage.setItem(KEY, String(ts)); } catch { /* ignore */ }
  listeners.forEach(l => l(ts));
}

export function clearRest(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  listeners.forEach(l => l(null));
}

// Subscribe a React component to the rest-start timestamp.
export function useRestStart(): number | null {
  const [v, setV] = useState<number | null>(() => getRestStart());
  useEffect(() => {
    listeners.add(setV);
    return () => { listeners.delete(setV); };
  }, []);
  return v;
}
