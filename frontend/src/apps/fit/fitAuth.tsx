import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import axios from 'axios';

// Independent auth for the fit app — separate cookie session from the main
// lumna.co login, talking only to /api/fit/auth/*.

export interface FitUser {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
}

interface FitAuthValue {
  user: FitUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
}

const FitAuthContext = createContext<FitAuthValue | undefined>(undefined);

// Run a fit API call; on a 401, attempt one refresh then retry once.
export async function fitRequest<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 401) {
      await axios.post('/api/fit/auth/refresh'); // throws if the refresh is invalid
      return await fn();
    }
    throw e;
  }
}

export function FitAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FitUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        let res = await axios.get<{ user: FitUser | null }>('/api/fit/auth/me');
        if (!res.data.user) {
          // Access token may have expired — try a refresh, then re-check.
          try {
            await axios.post('/api/fit/auth/refresh');
            res = await axios.get<{ user: FitUser | null }>('/api/fit/auth/me');
          } catch { /* no valid refresh — stay logged out */ }
        }
        setUser(res.data.user);
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (credential: string) => {
    const res = await axios.post<{ user: FitUser | null }>('/api/fit/auth/google', { credential });
    setUser(res.data.user);
  }, []);

  const logout = useCallback(async () => {
    try { await axios.post('/api/fit/auth/logout'); } catch { /* ignore */ }
    setUser(null);
  }, []);

  return (
    <FitAuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout }}>
      {children}
    </FitAuthContext.Provider>
  );
}

export function useFitAuth() {
  const ctx = useContext(FitAuthContext);
  if (!ctx) throw new Error('useFitAuth must be used within FitAuthProvider');
  return ctx;
}
