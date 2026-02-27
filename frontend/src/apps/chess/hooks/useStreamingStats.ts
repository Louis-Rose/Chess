// Custom hook for streaming stats with real-time progress + localStorage caching

import { useState, useRef, useCallback, useEffect } from 'react';
import type { ApiResponse, StreamProgress, PlayerData, TimeClass } from '../utils/types';

const CACHE_KEY_PREFIX = 'chess_stats_cache_';

interface CachedStats {
  data: Omit<ApiResponse, 'player'>;
  lastArchive: string;
  timestamp: number;
}

function getCachedStats(username: string, timeClass: TimeClass): CachedStats | null {
  try {
    const key = `${CACHE_KEY_PREFIX}${username.toLowerCase()}_${timeClass}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveCachedStats(username: string, timeClass: TimeClass, data: Omit<ApiResponse, 'player'>, lastArchive: string) {
  try {
    const key = `${CACHE_KEY_PREFIX}${username.toLowerCase()}_${timeClass}`;
    const entry: CachedStats = { data, lastArchive, timestamp: Date.now() };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // localStorage full — evict oldest cache entries and retry
    try {
      const entries: { key: string; timestamp: number }[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(CACHE_KEY_PREFIX)) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            entries.push({ key: k, timestamp: parsed.timestamp || 0 });
          }
        }
      }
      entries.sort((a, b) => a.timestamp - b.timestamp);
      // Remove oldest half
      const toRemove = Math.max(1, Math.floor(entries.length / 2));
      for (let i = 0; i < toRemove; i++) {
        localStorage.removeItem(entries[i].key);
      }
      // Retry save
      const key = `${CACHE_KEY_PREFIX}${username.toLowerCase()}_${timeClass}`;
      const entry: CachedStats = { data, lastArchive, timestamp: Date.now() };
      localStorage.setItem(key, JSON.stringify(entry));
    } catch {
      // Give up silently
    }
  }
}

export function useStreamingStats(username: string, timeClass: TimeClass) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<StreamProgress | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  // Track whether initial fetch has completed for this username
  const hasFetchedRef = useRef<string | null>(null);

  const fetchStats = useCallback(() => {
    if (!username) return;

    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Load client-side cache for instant display
    const cached = getCachedStats(username, timeClass);
    const clientLastArchive = cached?.lastArchive;

    setLoading(true);
    setError(null);
    setProgress(null);

    // If we have cached data, show it immediately (will be updated when stream completes)
    // Don't clear data if we have a cache
    if (!cached) {
      setData(null);
    }

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    let url = `/api/stats-stream?username=${encodeURIComponent(username)}&time_class=${timeClass}&tz=${encodeURIComponent(tz)}`;
    if (clientLastArchive) {
      url += `&client_last_archive=${encodeURIComponent(clientLastArchive)}`;
    }
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    let playerData: PlayerData | null = null;

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'player':
            playerData = message.player;
            // Show player card immediately (with cached stats if available)
            if (cached) {
              setData({ player: playerData!, ...cached.data });
            } else {
              setData(prev => prev ? { ...prev, player: playerData! } : {
                player: playerData!,
                time_class: '',
                history: [],
                elo_history: [],
                total_games: 0,
                total_rapid: 0,
                total_blitz: 0,
                openings: { white: [], black: [] },
                game_number_stats: [],
                hourly_stats: [],
                dow_stats: [],
                win_prediction: {} as ApiResponse['win_prediction'],
              });
            }
            break;

          case 'start':
            setProgress({ current: 0, total: message.total_archives, month: '', cached: message.cached });
            break;

          case 'progress':
            setProgress({
              current: message.current,
              total: message.total,
              month: message.month
            });
            break;

          case 'processing':
            // Optional: could show "Processing..." state
            break;

          case 'complete': {
            const completeData = message.data;
            if (playerData) {
              setData({
                player: playerData,
                ...completeData
              });
            }
            // Save to localStorage (strip player data, save lastArchive)
            if (completeData) {
              const { last_archive: lastArchive, ...statsOnly } = completeData;
              if (lastArchive) {
                saveCachedStats(username, timeClass, statsOnly, lastArchive);
              }
            }
            hasFetchedRef.current = username;
            setLoading(false);
            setProgress(null);
            eventSource.close();
            break;
          }

          case 'error':
            setError(message.error);
            setLoading(false);
            eventSource.close();
            break;
        }
      } catch (e) {
        console.error('Error parsing SSE message:', e);
      }
    };

    eventSource.onerror = () => {
      setError('Failed to fetch player data. Check the username and try again.');
      setLoading(false);
      eventSource.close();
    };
  }, [username, timeClass]);

  // When timeClass changes after initial fetch, swap from localStorage instantly
  useEffect(() => {
    if (!username || !hasFetchedRef.current) return;
    const cached = getCachedStats(username, timeClass);
    if (cached) {
      // Preserve current player data, swap stats
      setData(prev => prev ? { player: prev.player, ...cached.data } : null);
    } else {
      // Clear stale data immediately so panels don't flash old time class
      setData(null);
      setLoading(true);
      fetchStats();
    }
  }, [timeClass, fetchStats]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return { data, loading, error, progress, fetchStats };
}
