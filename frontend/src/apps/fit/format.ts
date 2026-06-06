// Shared formatting helpers for the fit app.

// "samedi 6 juin" — French long date for a session timestamp (naive ISO string).
export const formatSessionDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
};
