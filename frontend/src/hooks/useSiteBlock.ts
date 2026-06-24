import { useEffect, useState } from 'react';
import axios from 'axios';

// Shared state for the site-blocking switch (owner-only /api/workblock).
// Used by both the profile-menu toggle and the Focus app so they stay in sync.
export function useSiteBlock() {
  const [blocking, setBlocking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    axios
      .get<{ blocking: boolean }>('/api/workblock')
      .then((r) => alive && (setBlocking(r.data.blocking), setLoaded(true)))
      .catch(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  const toggle = async () => {
    if (busy) return;
    const next = !blocking;
    setBusy(true);
    setBlocking(next); // optimistic
    try {
      const r = await axios.post<{ blocking: boolean }>('/api/workblock', { blocking: next });
      setBlocking(r.data.blocking);
    } catch {
      setBlocking(!next); // revert on failure
    } finally {
      setBusy(false);
    }
  };

  return { blocking, busy, loaded, toggle };
}
