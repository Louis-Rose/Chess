// Shared formatting helpers for the fit app.

// "8 × 14 kg" (or "8 reps" bodyweight); warmup sets are wrapped in parentheses.
// A unilateral set (repsRight given) shows both sides: "8/7 × 14 kg".
export const formatSet = (weight: number | null, reps: number, warmup: boolean, repsRight?: number | null) => {
  const r = repsRight != null ? `${reps}/${repsRight}` : `${reps}`;
  const body = weight != null ? `${r} × ${weight} kg` : `${r} reps`;
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

// "Séance 34 (11 juin)" — session title from its number + start date.
export const sessionTitle = (number: number | null | undefined, iso: string | null) => {
  const date = formatShortDate(iso);
  const head = number != null ? `Séance ${number}` : 'Séance';
  return date ? `${head} (${date})` : head;
};
