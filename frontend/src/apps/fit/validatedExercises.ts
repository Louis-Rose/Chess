import { getSession } from './sessionTimer';

// Exercises the user has explicitly validated ("Valider l'exercice") during the
// current in-progress session. They count as done *today* in the per-exercise
// recency views (Accueil average, the detail list, the add-exercise picker)
// before the session is even finished. Kept in localStorage so it survives tab
// switches and resuming, tagged with the session id so a stale set from a past
// session can't leak in.

const KEY = 'fit:validated-exercises';
type Store = { sessionId: number; leaves: string[] };

function read(): Store | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return typeof v?.sessionId === 'number' && Array.isArray(v?.leaves) ? v : null;
  } catch { return null; }
}

function write(store: Store): void {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* ignore */ }
}

export function markValidated(sessionId: number, leaf: string): void {
  const cur = read();
  const leaves = cur && cur.sessionId === sessionId ? cur.leaves : [];
  if (leaves.includes(leaf)) return;
  write({ sessionId, leaves: [...leaves, leaf] });
}

// Drop a leaf (e.g. its exercise was deleted, or its last set removed), so it
// stops counting as done today.
export function unmarkValidated(sessionId: number, leaf: string): void {
  const cur = read();
  if (!cur || cur.sessionId !== sessionId || !cur.leaves.includes(leaf)) return;
  write({ sessionId, leaves: cur.leaves.filter(l => l !== leaf) });
}

export function clearValidated(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// Leaves validated in the *current* live session, or [] when there is none.
// Gating on the live session means the overlay disappears on its own the moment
// the session ends (finished or emptied).
export function validatedLeaves(): string[] {
  const store = read();
  const session = getSession();
  if (!store || !session || store.sessionId !== session.sessionId) return [];
  return store.leaves;
}
