// Shared Programme data: training splits and the per-muscle exercise catalogue.
// Single source of truth for the split picker, the exercise picker, and the
// saved-state overview. Keep in sync with backend/blueprints/fit.py
// (VALID_SPLITS / MUSCLE_EXERCISES) — a variant is stored as `"<name> — <variant>"`.

// The user's single training program is named once, here.
export const PROGRAM_NAME = 'Programme de musculation';

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
  { key: 'body_part', label: 'Body part' },
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
  { name: 'Épaules', exercises: [{ name: 'Développé épaules', variants: [['Machine', 'Haltères'], ['Pronation', 'Prise neutre']] }, 'Développé militaire', { name: 'Élévations latérales', variants: [['Poulie basse', 'Haltères']] }] },
  { name: 'Pectoraux', exercises: [{ name: 'Développé couché', variants: [['Barre', 'Haltères']] }, { name: 'Développé incliné', variants: [['Barre', 'Haltères']] }, 'Dips', { name: 'Pec Deck', variants: [['Poignées', 'Boudins']] }] },
  { name: 'Dos', exercises: [{ name: 'Tractions', variants: [['Pronation', 'Supination', 'Prise neutre']] }, { name: 'Tirage vertical (poulie haute)', variants: [['Pronation', 'Supination', 'Prise neutre']] }, { name: 'Rowing assis', variants: [['Machine', 'Poulie basse'], ['Pronation', 'Supination', 'Prise neutre']] }] },
  { name: 'Biceps', exercises: [{ name: 'Curl incliné', variants: [['Supination', 'Rotation']] }, { name: 'Curl pupitre', variants: [['Machine', 'Haltères', 'Barre EZ']] }] },
  { name: 'Triceps', exercises: [{ name: 'Extension poulie haute', variants: [['Barre', 'Corde']] }, { name: 'Extension poulie basse (overhead)', variants: [['Barre', 'Corde']] }] },
  { name: 'Avant-bras', exercises: ['Curl marteau', 'Flexions de poignets', 'Extensions de poignets'] },
  { name: 'Abdos', exercises: ['Crunch', 'Enroulements de bassin', 'Gainage planche', 'Relevés de jambes'] },
  { name: 'Fessiers', exercises: ['Hip thrust', 'Squat gobelet', 'Soulevé de terre sumo'] },
  { name: 'Quadriceps', exercises: ['Soulevé de terre barre hex', 'Hack squat', 'Leg extension', 'Presse à cuisses', 'Presse à cuisses incliné', 'Presse à cuisses horizontale'] },
  { name: 'Ischio-jambiers', exercises: ['Soulevé de terre jambes tendues', 'Leg curl allongé', 'Leg curl assis'] },
  { name: 'Mollets', exercises: ['Extensions de mollets debout', 'Extensions de mollets assis', 'Extensions à la presse à cuisses'] },
];

export const MUSCLES = MUSCLES_RAW.map(m => ({
  name: m.name,
  exercises: m.exercises
    .map(ex => (typeof ex === 'string' ? ex : { name: ex.name, variants: ex.variants.map(sortLabels) }))
    .sort((a, b) => collator.compare(exLabel(a), exLabel(b))),
}));

export const variantId = (name: string, variant: string) => `${name} — ${variant}`;

// Display a single stored leaf: "Rowing assis — Machine" -> "Rowing assis (Machine)".
export const leafLabel = (leaf: string) => {
  const i = leaf.indexOf(' — ');
  return i === -1 ? leaf : `${leaf.slice(0, i)} (${leaf.slice(i + 3)})`;
};

// Group stored leaves by their base exercise, collecting variants. So "Rowing
// assis — Machine" + "Rowing assis — Prise neutre" become one entry
// { name: 'Rowing assis', variants: ['Machine', 'Prise neutre'] }.
// Pass a pre-sorted list (sortLabels) so bases and variants come out ordered.
export const groupExercises = (leaves: string[]): { name: string; variants: string[] }[] => {
  const order: string[] = [];
  const variantsByBase = new Map<string, string[]>();
  for (const leaf of leaves) {
    const i = leaf.indexOf(' — ');
    const base = i === -1 ? leaf : leaf.slice(0, i);
    if (!variantsByBase.has(base)) { variantsByBase.set(base, []); order.push(base); }
    if (i !== -1) variantsByBase.get(base)!.push(leaf.slice(i + 3));
  }
  return order.map(base => ({ name: base, variants: variantsByBase.get(base)! }));
};

// The valid stored leaves per muscle, derived from the catalogue. Used to hide
// orphaned selections left over after the catalogue changed (an exercise that
// was once a leaf and later became a variant group, etc.).
export const MUSCLE_LEAVES: Record<string, Set<string>> = Object.fromEntries(
  MUSCLES.map(m => [
    m.name,
    new Set(m.exercises.flatMap(ex =>
      typeof ex === 'string' ? [ex] : ex.variants.flat().map(v => variantId(ex.name, v))
    )),
  ]),
);

// Muscle groups in catalogue (anatomical) order.
export const MUSCLE_ORDER = MUSCLES.map(m => m.name);

// Reverse lookup: a stored leaf -> its muscle group (null if orphaned).
const LEAF_TO_MUSCLE: Record<string, string> = {};
for (const [muscle, leaves] of Object.entries(MUSCLE_LEAVES)) {
  for (const leaf of leaves) LEAF_TO_MUSCLE[leaf] = muscle;
}
export const muscleOf = (leaf: string): string | null => LEAF_TO_MUSCLE[leaf] ?? null;

// Muscle involvement per exercise, used to weight training volume: each
// working set adds 1 to every `primary` group and 0.5 to every `secondary`
// group. Only the 11 tracked groups appear here (sub-muscles and untracked
// stabilisers like coiffe/adducteurs/érecteurs-as-such are folded into their
// group or dropped). Keyed by stored leaf, with base-name fallback for
// exercises whose variants share the same involvement.
interface Contribution { primary: string[]; secondary: string[] }

const Ep = 'Épaules', Pec = 'Pectoraux', Dos = 'Dos', Bi = 'Biceps', Tri = 'Triceps',
  AB = 'Avant-bras', Abdo = 'Abdos', Fes = 'Fessiers', Quad = 'Quadriceps',
  Isch = 'Ischio-jambiers', Mol = 'Mollets';

const CONTRIB: Record<string, Contribution> = {
  // Épaules
  'Développé épaules': { primary: [Ep], secondary: [Tri, Pec, Dos] },
  'Développé militaire': { primary: [Ep], secondary: [Tri, Pec, Abdo, Fes] },
  'Élévations latérales': { primary: [Ep], secondary: [Dos] },
  // Pectoraux
  'Développé couché': { primary: [Pec], secondary: [Tri, Ep] },
  'Développé incliné': { primary: [Pec], secondary: [Ep, Tri] },
  'Dips': { primary: [Pec], secondary: [Tri, Ep] },
  'Pec Deck — Poignées': { primary: [Pec], secondary: [Ep, Bi, AB] },
  'Pec Deck — Boudins': { primary: [Pec], secondary: [Ep] },
  // Dos
  'Tractions — Pronation': { primary: [Dos], secondary: [Ep, Bi, AB] },
  'Tractions — Supination': { primary: [Dos], secondary: [Bi, AB] },
  'Tractions — Prise neutre': { primary: [Dos], secondary: [Bi, AB] },
  'Tirage vertical (poulie haute) — Pronation': { primary: [Dos], secondary: [Ep, Bi] },
  'Tirage vertical (poulie haute) — Supination': { primary: [Dos], secondary: [Bi, AB] },
  'Tirage vertical (poulie haute) — Prise neutre': { primary: [Dos], secondary: [Bi, AB] },
  'Rowing assis — Machine': { primary: [Dos], secondary: [Bi, AB] },
  'Rowing assis — Poulie basse': { primary: [Dos], secondary: [Bi, AB] },
  'Rowing assis — Pronation': { primary: [Dos], secondary: [Ep] },
  'Rowing assis — Supination': { primary: [Dos], secondary: [Bi, AB] },
  'Rowing assis — Prise neutre': { primary: [Dos], secondary: [Bi, AB] },
  // Biceps
  'Curl incliné': { primary: [Bi], secondary: [AB] },
  'Curl pupitre': { primary: [Bi], secondary: [AB] },
  // Triceps
  'Extension poulie haute': { primary: [Tri], secondary: [Ep] },
  'Extension poulie basse (overhead)': { primary: [Tri], secondary: [Abdo] },
  // Avant-bras
  'Curl marteau': { primary: [AB], secondary: [Bi] },
  'Flexions de poignets': { primary: [AB], secondary: [] },
  'Extensions de poignets': { primary: [AB], secondary: [] },
  // Abdos
  'Crunch': { primary: [Abdo], secondary: [] },
  'Enroulements de bassin': { primary: [Abdo], secondary: [] },
  'Gainage planche': { primary: [Abdo], secondary: [Quad, Pec, Ep, Tri, Dos] },
  'Relevés de jambes': { primary: [Abdo], secondary: [] },
  // Fessiers
  'Hip thrust': { primary: [Fes], secondary: [Isch, Quad, Dos] },
  'Squat gobelet': { primary: [Fes, Quad], secondary: [Isch, Abdo, Ep, Bi] },
  'Soulevé de terre sumo': { primary: [Fes], secondary: [Quad, Isch, Dos, AB] },
  // Quadriceps
  'Soulevé de terre barre hex': { primary: [Quad, Fes], secondary: [Isch, Dos, AB, Abdo] },
  'Hack squat': { primary: [Quad], secondary: [Fes, Isch] },
  'Leg extension': { primary: [Quad], secondary: [] },
  'Presse à cuisses': { primary: [Quad], secondary: [Fes, Isch] },
  'Presse à cuisses incliné': { primary: [Quad], secondary: [Fes, Isch] },
  'Presse à cuisses horizontale': { primary: [Quad], secondary: [Fes, Isch] },
  // Ischio-jambiers
  'Soulevé de terre jambes tendues': { primary: [Isch], secondary: [Fes, Dos, AB] },
  'Leg curl allongé': { primary: [Isch], secondary: [Mol] },
  'Leg curl assis': { primary: [Isch], secondary: [Mol] },
  // Mollets
  'Extensions de mollets debout': { primary: [Mol], secondary: [] },
  'Extensions de mollets assis': { primary: [Mol], secondary: [] },
  'Extensions à la presse à cuisses': { primary: [Mol], secondary: [] },
};

// Muscle involvement of a stored leaf, falling back to the base exercise name
// (for variants that share it) then to its catalogue group as sole primary.
export const muscleContribution = (leaf: string): Contribution => {
  if (CONTRIB[leaf]) return CONTRIB[leaf];
  const i = leaf.indexOf(' — ');
  const base = i === -1 ? leaf : leaf.slice(0, i);
  if (CONTRIB[base]) return CONTRIB[base];
  const m = muscleOf(leaf);
  return { primary: m ? [m] : [], secondary: [] };
};
