import { useEffect, useRef } from 'react';

function getChessPage(): string {
  const parts = window.location.pathname.split('/').filter(Boolean);
  // paths: /chess, /chess/elo, /chess/today, /chess/daily-volume, /chess/game-number, /chess/streak, /chess/admin
  if (parts[0] !== 'chess') return 'chess_other';
  if (!parts[1]) return 'chess_home';
  const slug = parts[1].replace(/-/g, '_'); // daily-volume -> daily_volume
  return `chess_${slug}`;
}

export function useChessHeartbeat(username: string) {
  const isActiveRef = useRef(true); // Start active on mount

  useEffect(() => {
    if (!username) return;

    const markActive = () => { isActiveRef.current = true; };

    const events: (keyof WindowEventMap)[] = ['mousemove', 'click', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, markActive, { passive: true }));

    const sendHeartbeat = () => {
      if (document.visibilityState !== 'visible') return;
      if (!isActiveRef.current) return;

      isActiveRef.current = false;

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
    const interval = setInterval(sendHeartbeat, 15000);

    return () => {
      clearInterval(interval);
      events.forEach(e => window.removeEventListener(e, markActive));
    };
  }, [username]);
}
