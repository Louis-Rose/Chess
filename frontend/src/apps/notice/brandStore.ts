import { useCallback, useSyncExternalStore } from 'react';
import { detectInfo, loadInfo, saveInfo, type NoticeInfo } from './realImages';

// The manual's general info (brand + estimated time + number of people), read off
// the cover page and shared (reactively) across Étape 1 — where it is detected as
// a parallel call when the classification run starts, shown read-only — and the
// real-image search, which uses the brand to qualify the query. Module scope +
// localStorage so it survives navigation, like the other notice stores.
type Snapshot = NoticeInfo & { detecting: boolean };
type Entry = { snapshot: Snapshot; listeners: Set<() => void> };

const entries = new Map<string, Entry>();

function getEntry(docId: string): Entry {
  let entry = entries.get(docId);
  if (!entry) {
    entry = { snapshot: { ...loadInfo(docId), detecting: false }, listeners: new Set() };
    entries.set(docId, entry);
  }
  return entry;
}

function update(docId: string, patch: Partial<Snapshot>) {
  const entry = getEntry(docId);
  entry.snapshot = { ...entry.snapshot, ...patch };
  entry.listeners.forEach((l) => l());
}

export async function runDetect(docId: string, file: Blob) {
  const entry = getEntry(docId);
  if (entry.snapshot.detecting) return;
  update(docId, { detecting: true });
  try {
    const info = await detectInfo(file);
    if (info.brand || info.time || info.people) {
      saveInfo(docId, info);
      update(docId, info);
    }
  } catch {
    // non-fatal: leave the fields as is
  } finally {
    update(docId, { detecting: false });
  }
}

export function useBrand(docId: string): Snapshot {
  const subscribe = useCallback(
    (cb: () => void) => {
      const entry = getEntry(docId);
      entry.listeners.add(cb);
      return () => {
        entry.listeners.delete(cb);
      };
    },
    [docId],
  );
  const getSnapshot = useCallback(() => getEntry(docId).snapshot, [docId]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
