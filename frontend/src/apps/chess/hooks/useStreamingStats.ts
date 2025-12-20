// Custom hook for streaming stats with real-time progress

import { useState, useRef, useCallback, useEffect } from 'react';
import type { ApiResponse, StreamProgress, PlayerData, TimeClass } from '../utils/types';

export function useStreamingStats(username: string, timeClass: TimeClass) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<StreamProgress | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchStats = useCallback(() => {
    if (!username) return;

    // Close any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setLoading(true);
    setError(null);
    setProgress(null);
    setData(null);

    const url = `/api/stats-stream?username=${encodeURIComponent(username)}&time_class=${timeClass}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    let playerData: PlayerData | null = null;

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        switch (message.type) {
          case 'player':
            playerData = message.player;
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

          case 'complete':
            if (playerData) {
              setData({
                player: playerData,
                ...message.data
              });
            }
            setLoading(false);
            setProgress(null);
            eventSource.close();
            break;

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
