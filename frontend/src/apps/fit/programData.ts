// Shared Programme data: training splits and the per-muscle exercise catalogue.
// Single source of truth for the split picker, the exercise picker, and the
// saved-state overview. Keep in sync with backend/blueprints/fit.py
// (VALID_SPLITS / MUSCLE_EXERCISES) — a variant is stored as `"<name> — <variant>"`.

// Option lists are shown alphabetically, with any "negative" option (e.g. "Pas
// de split") pinned last. sortLabels is the single helper enforcing that order.
const collator = new Intl.Collator('fr', { sensitivity: 'base' });
export const sortLabels = (labels: string[]) => [...labels].sort(collator.compare);

export interface Split {
  key: string;
  label: string;
  negative?: boolean;   // a "none" option (e.g. "Pas de split") — kept last
}

// Defined freely; SPLITS exposes them alphabetically with negatives last.
const SPLITS_RAW: Split[] = [
  { key: 'full_body', label: 'Full Body' },
  { key: 'upper_lower', label: 'Upper / Lower' },
  { key: 'push_pull_legs', label: 'Push / Pull / Legs' },
  { key: 'body_part', label: 'Body Part Split' },
  { key: 'no_split', label: 'Pas de split', negative: true },
];

export const SPLITS: Split[] = [...SPLITS_RAW].sort((a, b) => {
  if (!!a.negative !== !!b.negative) return a.negative ? 1 : -1;
  return collator.compare(a.label, b.label);
});

export const splitLabel = (key: string | null) =>
  SPLITS.find(s => s.key === key)?.label ?? '';

// An exercise with variants expands into one or more rows of sub-options
// (`variants` is an array of rows). Each leaf is stored as `"<name> — <variant>"`.
export type Exercise = string | { name: string; variants: string[][] };

const exLabel = (ex: Exercise) => (typeof ex === 'string' ? ex : ex.name);

// Defined freely; MUSCLES exposes each group's exercises (and the variants
// within each row) alphabetically. Row order is preserved as written. Muscle
// order itself is anatomical, left as-is.
const MUSCLES_RAW: { name: string; exercises: Exercise[] }[] = [
  { name: 'Pectoraux', exercises: ['Développé couché barre', 'Développé couché haltères', 'Développé incliné barre', 'Développé incliné haltères'] },
  { name: 'Dos', exercises: [{ name: 'Tractions', variants: [['Pronation', 'Supination', 'Prise neutre']] }, 'Tirage vertical à la poulie haute', 'Rowing barre', { name: 'Rowing assis', variants: [['Machine', 'Poulie basse'], ['Pronation', 'Supination', 'Prise neutre']] }] },
  { name: 'Quadriceps', exercises: ['Squat arrière', 'Hack squat', 'Presse à cuisses'] },
  { name: 'Ischio-jambiers', exercises: ['Soulevé de terre jambes tendues', 'Leg curl allongé', 'Leg curl assis'] },
  { name: 'Fessiers', exercises: ['Hip thrust', 'Squat gobelet', 'Soulevé de terre sumo'] },
  { name: 'Épaules', exercises: ['Développé militaire', 'Élévations latérales', 'Oiseau'] },
  { name: 'Triceps', exercises: ['Extensions à la poulie', 'Développé couché prise serrée', 'Extensions barre au front'] },
  { name: 'Biceps', exercises: ['Curl barre', 'Curl incliné', 'Curl pupitre'] },
  { name: 'Avant-bras', exercises: ['Curl marteau', 'Flexions de poignets', 'Extensions de poignets'] },
  { name: 'Mollets', exercises: ['Extensions de mollets debout', 'Extensions de mollets assis', 'Extensions à la presse à cuisses'] },
  { name: 'Sangle Abdominale', exercises: ['Crunch', 'Enroulements de bassin', 'Gainage planche'] },
];

export const MUSCLES = MUSCLES_RAW.map(m => ({
  name: m.name,
  exercises: m.exercises
    .map(ex => (typeof ex === 'string' ? ex : { name: ex.name, variants: ex.variants.map(sortLabels) }))
    .sort((a, b) => collator.compare(exLabel(a), exLabel(b))),
}));

export const variantId = (name: string, variant: string) => `${name} — ${variant}`;
