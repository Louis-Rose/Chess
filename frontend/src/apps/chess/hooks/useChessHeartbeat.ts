import { useEffect } from 'react';

function getChessPage(): string {
  const parts = window.location.pathname.split('/').filter(Boolean);
  // paths: /chess, /chess/elo, /chess/today, /chess/daily-volume, /chess/game-number, /chess/streak, /chess/admin
  if (parts[0] !== 'chess') return 'chess_other';
  if (!parts[1]) return 'chess_home';
  const slug = parts[1].replace(/-/g, '_'); // daily-volume -> daily_volume
  return `chess_${slug}`;
}

export function useChessHeartbeat(username: string) {
  useEffect(() => {
    if (!username) return;

    const sendHeartbeat = () => {
      if (document.visibilityState !== 'visible') return;

      const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini|mobile/i.test(
        navigator.userAgent
      );

      fetch('/api/chess/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chess_username: username,
          page: getChessPage(),
          language: localStorage.getItem('language') || 'en',
          device_type: isMobile ? 'mobile' : 'desktop',
        }),
      }).catch(() => {});
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 60000);
    return () => clearInterval(interval);
  }, [username]);
}
