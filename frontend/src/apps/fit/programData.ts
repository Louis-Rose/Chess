// Shared Programme data: training splits and the per-muscle exercise catalogue.
// Single source of truth for the split picker, the exercise picker, and the
// saved-state overview. Keep in sync with backend/blueprints/fit.py
// (VALID_SPLITS / MUSCLE_EXERCISES) — a variant is stored as `"<name> — <variant>"`.

export interface Split {
  key: string;
  label: string;
}

export const SPLITS: Split[] = [
  { key: 'full_body', label: 'Full Body' },
  { key: 'upper_lower', label: 'Upper / Lower' },
  { key: 'push_pull_legs', label: 'Push / Pull / Legs' },
  { key: 'body_part', label: 'Body Part Split' },
  { key: 'no_split', label: 'Pas de split' },
];

export const splitLabel = (key: string | null) =>
  SPLITS.find(s => s.key === key)?.label ?? '';

export type Exercise = string | { name: string; variants: string[] };

export const MUSCLES: { name: string; exercises: Exercise[] }[] = [
  { name: 'Pectoraux', exercises: ['Développé couché barre', 'Développé couché haltères', 'Développé incliné barre', 'Développé incliné haltères'] },
  { name: 'Dos', exercises: [{ name: 'Tractions', variants: ['Pronation', 'Supination', 'Prise neutre'] }, 'Tirage vertical à la poulie haute', 'Rowing barre', 'Rowing assis'] },
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

export const variantId = (name: string, variant: string) => `${name} — ${variant}`;
