import { useCallback, useSyncExternalStore } from 'react';
import { detectBrand, loadBrand, saveBrand } from './realImages';

// The manual's brand, shared (and reactive) across Étape 1 (where it is detected
// and editable) and Étape 3 (where it qualifies the part image search). Module
// scope + localStorage so it survives navigation, like the other notice stores.
type Snapshot = { brand: string; detecting: boolean };
type Entry = { snapshot: Snapshot; listeners: Set<() => void>; tried: boolean };

const entries = new Map<string, Entry>();

function getEntry(docId: string): Entry {
  let entry = entries.get(docId);
  if (!entry) {
    entry = { snapshot: { brand: loadBrand(docId), detecting: false }, listeners: new Set(), tried: false };
    entries.set(docId, entry);
  }
  return entry;
}

function update(docId: string, patch: Partial<Snapshot>) {
  const entry = getEntry(docId);
  entry.snapshot = { ...entry.snapshot, ...patch };
  entry.listeners.forEach((l) => l());
}

export function setBrand(docId: string, brand: string) {
  saveBrand(docId, brand);
  update(docId, { brand });
}

export async function runDetect(docId: string, file: Blob) {
  const entry = getEntry(docId);
  if (entry.snapshot.detecting) return;
  update(docId, { detecting: true });
  try {
    const b = await detectBrand(file);
    if (b) setBrand(docId, b);
  } catch {
    // non-fatal: leave the field as is
  } finally {
    update(docId, { detecting: false });
  }
}

// Auto-detect once per document if we have no brand yet.
export function ensureBrand(docId: string, file: Blob) {
  const entry = getEntry(docId);
  if (entry.tried || entry.snapshot.brand || entry.snapshot.detecting) return;
  entry.tried = true;
  void runDetect(docId, file);
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
