import { useEffect, useState } from 'react';
import axios from 'axios';

export type BlockKind = 'site' | 'app';
export interface BlockItem {
  id: number;
  kind: BlockKind;
  value: string;
}

// Shared state for the site/app-blocking switch and its editable list
// (owner-only /api/workblock). Used by the profile-menu toggle (blocking only)
// and the Focus app (toggle + list editing), so they stay in sync.
export function useSiteBlock() {
  const [blocking, setBlocking] = useState(false);
  const [items, setItems] = useState<BlockItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    axios
      .get<{ blocking: boolean; items: BlockItem[] }>('/api/workblock')
      .then((r) => {
        if (!alive) return;
        setBlocking(r.data.blocking);
        setItems(r.data.items ?? []);
        setLoaded(true);
      })
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

  const addItem = async (kind: BlockKind, value: string) => {
    const v = value.trim();
    if (!v) return;
    const r = await axios.post<BlockItem>('/api/workblock/items', { kind, value: v });
    // Replace any existing entry with the same id (server dedupes), else append.
    setItems((prev) => (prev.some((i) => i.id === r.data.id) ? prev : [...prev, r.data]));
  };

  const removeItem = async (id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id)); // optimistic
    try {
      await axios.delete(`/api/workblock/items/${id}`);
    } catch {
      // best-effort; a reload will resync if it failed
    }
  };

  return { blocking, busy, loaded, toggle, items, addItem, removeItem };
}
