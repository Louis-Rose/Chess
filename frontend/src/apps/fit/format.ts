// Shared formatting helpers for the fit app.

// "8 × 14 kg" (or "8 reps" bodyweight); warmup sets are wrapped in parentheses.
export const formatSet = (weight: number | null, reps: number, warmup: boolean) => {
  const body = weight != null ? `${reps} × ${weight} kg` : `${reps} reps`;
  return warmup ? `(${body})` : body;
};

// "samedi 6 juin" — French long date for a session timestamp (naive ISO string).
export const formatSessionDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
};

// "13 mai" — short date (day + month, no weekday).
export const formatShortDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
};
