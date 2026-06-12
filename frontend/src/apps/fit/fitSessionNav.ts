// Remembers where the user was inside an in-progress session (which exercise
// was open, or whether the picker was showing), so leaving to Accueil and then
// tapping "Reprendre la séance" lands them back on the exact sub-view — even
// before any set is logged. Cleared when the session is finished. Survives a
// page reload too.

const KEY = 'fit:session-nav';

export interface SessionNav {
  sessionId: number;
  editing: string | null;   // stored leaf of the open exercise, else null
  picking: boolean;         // exercise picker open
}

export function loadSessionNav(): SessionNav | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && typeof v.sessionId === 'number') {
      return { sessionId: v.sessionId, editing: v.editing ?? null, picking: !!v.picking };
    }
  } catch { /* ignore malformed/unavailable storage */ }
  return null;
}

export function saveSessionNav(nav: SessionNav): void {
  try { localStorage.setItem(KEY, JSON.stringify(nav)); } catch { /* ignore */ }
}

export function clearSessionNav(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// Is the saved spot worth resuming (an open exercise or the picker), as opposed
// to a bare overview with nothing logged?
export function hasResumableNav(): boolean {
  const nav = loadSessionNav();
  return !!nav && (nav.editing != null || nav.picking);
}
