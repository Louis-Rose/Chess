import { useCallback, useSyncExternalStore } from 'react';

// The part (by reference) currently selected for the Étape 2 real-image search,
// shared between the parts table (where a column is clicked to select) and the
// image search below. Module scope, keyed by document, like the other notice
// stores; in-memory only (the selection doesn't need to survive a reload).
const selected = new Map<string, string>();
const listeners = new Map<string, Set<() => void>>();

function subs(docId: string): Set<() => void> {
  let set = listeners.get(docId);
  if (!set) {
    set = new Set();
    listeners.set(docId, set);
  }
  return set;
}

export function setSelectedPart(docId: string, ref: string) {
  if (selected.get(docId) === ref) return;
  selected.set(docId, ref);
  subs(docId).forEach((l) => l());
}

export function useSelectedPart(docId: string): string {
  const subscribe = useCallback(
    (cb: () => void) => {
      const set = subs(docId);
      set.add(cb);
      return () => {
        set.delete(cb);
      };
    },
    [docId],
  );
  const getSnapshot = useCallback(() => selected.get(docId) ?? '', [docId]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
