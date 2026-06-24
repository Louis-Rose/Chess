// Anonymous Focus identity. Logged-in users are scoped by their account; everyone
// else gets a random token stored in this browser, sent as the X-Focus-Token
// header so the backend can keep their block list. It doubles as the token the
// LUMNA Focus extension uses. No login required.
const KEY = 'lumna_focus_token';

export function getFocusToken(): string {
  let token = localStorage.getItem(KEY);
  if (!token) {
    token =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEY, token);
  }
  return token;
}

// The header every Focus request sends. Harmless for logged-in users (the server
// scopes them by account and ignores it).
export function focusHeaders(): Record<string, string> {
  return { 'X-Focus-Token': getFocusToken() };
}
