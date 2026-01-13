import { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

interface UserPreferences {
  chess_username: string | null;
  preferred_time_class: 'rapid' | 'blitz' | 'bullet';
}

interface User {
  id: number;
  email: string;
  name: string;
  picture: string;
  is_admin: boolean;
  preferences: UserPreferences;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();
  const hasRecordedSettings = useRef(false);

  // Record theme and device for analytics (only once per session when user is authenticated)
  const recordUserSettings = () => {
    if (hasRecordedSettings.current) return;
    hasRecordedSettings.current = true;

    // Get theme from localStorage
    const theme = localStorage.getItem('theme') || 'system';
    const getSystemTheme = (): 'light' | 'dark' => {
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return 'dark';
    };
    const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
    axios.post('/api/theme', { theme, resolved_theme: resolvedTheme }).catch(() => {});

    // Get language from localStorage
    const language = localStorage.getItem('language') || 'en';
    axios.post('/api/language', { language }).catch(() => {});

    // Detect device type
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(userAgent);
    const deviceType = isMobile ? 'mobile' : 'desktop';
    axios.post('/api/device', { device_type: deviceType }).catch(() => {});
  };

  // Check auth status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Record settings when user becomes authenticated
  useEffect(() => {
    if (user && !isLoading) {
      recordUserSettings();
    }
  }, [user, isLoading]);

  // Heartbeat for activity tracking (every 60s when logged in and tab visible)
  useEffect(() => {
    if (!user) return;

    const getPageFromPath = (path: string): string => {
      // Extract page from path like /investing/portfolio -> portfolio
      const parts = path.split('/').filter(Boolean);
      if (parts[0] === 'investing' && parts[1]) {
        // Handle stock/:ticker -> stock/AAPL
        if (parts[1] === 'stock' && parts[2]) {
          return `stock/${parts[2]}`;
        }
        return parts[1];
      }
      return 'other';
    };

    const sendHeartbeat = () => {
      if (document.visibilityState === 'visible') {
        const page = getPageFromPath(window.location.pathname);
        fetch('/api/activity/heartbeat', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page })
        }).catch(() => {}); // Silently fail
      }
    };

    // Send initial heartbeat
    sendHeartbeat();

    // Set up interval
    const interval = setInterval(sendHeartbeat, 60000);

    return () => clearInterval(interval);
  }, [user]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include'
      });
      const data = await response.json();
      setUser(data.user);
    } catch (error) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credential: string) => {
    const response = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ credential })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    queryClient.clear(); // Clear cache from previous user
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
    setUser(null);
    queryClient.clear();
  };

  const updatePreferences = async (prefs: Partial<UserPreferences>) => {
    const response = await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(prefs)
    });

    if (!response.ok) {
      throw new Error('Failed to update preferences');
    }

    // Update local user state
    setUser(prev => prev ? {
      ...prev,
      preferences: { ...prev.preferences, ...prefs }
    } : null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      updatePreferences
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
