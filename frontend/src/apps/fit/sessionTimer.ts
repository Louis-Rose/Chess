import { useEffect, useState } from 'react';

// The whole-session stopwatch: the start timestamp (ms) of the active workout,
// tagged with its session id. Like the rest timer it lives outside the React
// tree and in localStorage, so it survives tab switches, FitSession unmounting
// and reloads. It runs from "Nouvelle séance" until "Terminer la séance".
// (The server's started_at is timezone-naive, so a client timestamp is used.)

const KEY = 'fit:session-start';
type Session = { sessionId: number; start: number };
type Listener = (v: Session | null) => void;
const listeners = new Set<Listener>();

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return typeof v?.sessionId === 'number' && Number.isFinite(v?.start) ? v : null;
  } catch { return null; }
}

export function startSession(sessionId: number, start: number): void {
  try { localStorage.setItem(KEY, JSON.stringify({ sessionId, start })); } catch { /* ignore */ }
  listeners.forEach(l => l({ sessionId, start }));
}

export function clearSession(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  listeners.forEach(l => l(null));
}

// Subscribe a React component to the active session timer.
export function useSession(): Session | null {
  const [v, setV] = useState<Session | null>(() => getSession());
  useEffect(() => {
    listeners.add(setV);
    return () => { listeners.delete(setV); };
  }, []);
  return v;
}
