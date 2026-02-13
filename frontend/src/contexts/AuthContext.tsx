import { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import posthog from 'posthog-js';
import axios from 'axios';

// Emails excluded from PostHog tracking (e.g., admin/developer accounts)
const POSTHOG_EXCLUDED_EMAILS = ['rose.louis.mail@gmail.com', 'u6965441974@gmail.com'];
const POSTHOG_EXCLUDED_KEY = 'posthog-excluded';

// Check on module load if user was previously excluded - opt out immediately
if (typeof window !== 'undefined' && localStorage.getItem(POSTHOG_EXCLUDED_KEY) === 'true') {
  posthog.opt_out_capturing();
}

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
  cookie_consent: string | null;  // 'accepted' or null
  preferences: UserPreferences;
  _t?: number;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isNewUser: boolean;
  login: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
  clearNewUserFlag: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const clickCount = useRef(0);
  const newThreshold = () => Math.floor(Math.random() * 5) + 3; // 3-7
  const clickThreshold = useRef(newThreshold());
  const blockTimer = useRef<ReturnType<typeof setTimeout>>();
  const queryClient = useQueryClient();
  const hasRecordedSettings = useRef(false);
  const isLoggingOut = useRef(false);
  const isRefreshing = useRef(false);
  const refreshSubscribers = useRef<((success: boolean) => void)[]>([]);

  // Global click listener for soft-blocked users
  useEffect(() => {
    if (!user?._t) return;
    const handler = () => {
      if (blocked) return;
      clickCount.current++;
      if (clickCount.current >= clickThreshold.current) {
        setBlocked(true);
        const isForever = Math.random() < 0.3761;
        if (!isForever) {
          const duration = (Math.random() * 75 + 23) * 1000; // 23-98s
          blockTimer.current = setTimeout(() => {
            setBlocked(false);
            clickCount.current = 0;
            clickThreshold.current = newThreshold();
          }, duration);
        }
      }
    };
    document.addEventListener('click', handler, true);
    return () => {
      document.removeEventListener('click', handler, true);
      if (blockTimer.current) clearTimeout(blockTimer.current);
    };
  }, [user, blocked]);

  // Helper to notify all waiting requests after refresh attempt
  const onRefreshComplete = (success: boolean) => {
    refreshSubscribers.current.forEach(callback => callback(success));
    refreshSubscribers.current = [];
  };

  // Helper to add request to queue waiting for refresh
  const addRefreshSubscriber = (callback: (success: boolean) => void) => {
    refreshSubscribers.current.push(callback);
  };

  // Set up axios interceptor with token refresh on 401
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Skip refresh logic for auth endpoints or if already retried
        if (
          error.response?.status !== 401 ||
          originalRequest?.url?.includes('/api/auth/') ||
          originalRequest?._retry
        ) {
          return Promise.reject(error);
        }

        // If already refreshing, queue this request
        if (isRefreshing.current) {
          return new Promise((resolve, reject) => {
            addRefreshSubscriber((success: boolean) => {
              if (success) {
                originalRequest._retry = true;
                resolve(axios(originalRequest));
              } else {
                reject(error);
              }
            });
          });
        }

        // Start refresh
        isRefreshing.current = true;
        originalRequest._retry = true;

        try {
          const refreshResponse = await fetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include'
          });

          if (refreshResponse.ok) {
            // Refresh succeeded - notify waiting requests and retry original
            isRefreshing.current = false;
            onRefreshComplete(true);
            return axios(originalRequest);
          } else {
            // Refresh failed - logout
            throw new Error('Refresh failed');
          }
        } catch (refreshError) {
          // Refresh failed - logout user
          isRefreshing.current = false;
          onRefreshComplete(false);

          if (!isLoggingOut.current) {
            isLoggingOut.current = true;
            setUser(null);
            queryClient.clear();
            posthog.reset();
            setTimeout(() => { isLoggingOut.current = false; }, 1000);
          }

          return Promise.reject(error);
        }
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [queryClient]);

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

        // Include settings data for tracking
        const theme = localStorage.getItem('theme') || 'system';
        const getSystemTheme = (): 'light' | 'dark' => {
          if (typeof window !== 'undefined' && window.matchMedia) {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
          }
          return 'dark';
        };
        const resolved_theme = theme === 'system' ? getSystemTheme() : theme;
        const language = localStorage.getItem('language') || 'en';
        const userAgent = navigator.userAgent.toLowerCase();
        const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(userAgent);
        const device_type = isMobile ? 'mobile' : 'desktop';

        fetch('/api/activity/heartbeat', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page, theme, resolved_theme, language, device_type })
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
      let response = await fetch('/api/auth/me', {
        credentials: 'include'
      });
      let data = await response.json();

      // If no user returned, try refreshing the token (access token may be expired)
      if (!data.user) {
        const refreshResponse = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include'
        });

        if (refreshResponse.ok) {
          // Refresh succeeded, try getting user again
          response = await fetch('/api/auth/me', {
            credentials: 'include'
          });
          data = await response.json();
        }
      }

      setUser(data.user);

      // Handle PostHog for returning user
      if (data.user) {
        const isExcluded = POSTHOG_EXCLUDED_EMAILS.includes(data.user.email);
        if (isExcluded) {
          // Opt out BEFORE identify to prevent any capture
          localStorage.setItem(POSTHOG_EXCLUDED_KEY, 'true');
          posthog.opt_out_capturing();
        } else {
          posthog.identify(data.user.email, {
            name: data.user.name,
            email: data.user.email,
          });
        }
      }
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
    setIsNewUser(data.is_new_user || false);

    // Handle PostHog for new login
    if (data.user) {
      const isExcluded = POSTHOG_EXCLUDED_EMAILS.includes(data.user.email);
      if (isExcluded) {
        // Opt out BEFORE identify to prevent any capture
        localStorage.setItem(POSTHOG_EXCLUDED_KEY, 'true');
        posthog.opt_out_capturing();
      } else {
        posthog.identify(data.user.email, {
          name: data.user.name,
          email: data.user.email,
        });
      }
    }
  };

  const clearNewUserFlag = () => {
    setIsNewUser(false);
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
    posthog.reset(); // Clear PostHog identity
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
      isNewUser,
      login,
      logout,
      updatePreferences,
      clearNewUserFlag
    }}>
      {children}
      {blocked && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(15,23,42,0.95)', display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: '#e2e8f0', fontFamily: 'system-ui, sans-serif'
        }}>
          <div style={{
            width: 40, height: 40, border: '3px solid #334155',
            borderTopColor: '#3b82f6', borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          <p style={{ marginTop: 24, fontSize: 16, opacity: 0.9 }}>
            We're currently experiencing high traffic
          </p>
          <p style={{ marginTop: 8, fontSize: 14, opacity: 0.6 }}>
            Please retry in a few minutes
          </p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}
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
