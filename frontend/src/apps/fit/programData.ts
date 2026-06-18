// Shared Programme data: training splits and the per-muscle exercise catalogue.
// Single source of truth for the split picker, the exercise picker, and the
// saved-state overview. Keep in sync with backend/blueprints/fit.py
// (VALID_SPLITS / MUSCLE_EXERCISES) — a variant is stored as `"<name> — <variant>"`.

// A training program: its name, splits and working-sets count. A user can have
// several; one is active (used everywhere in the app). A program may carry
// several splits (the user picks which one applies each week). Exercises are
// fetched separately, per program, from /api/fit/programs/<id>/exercises.
export interface FitProgram {
  id: number;
  name: string;
  splits: string[];
  work_sets: number | null;
  priorities: Priorities;
  // For a Body part split: the user's chosen day order, one muscle group per
  // day. Other splits use the fixed day->muscle mapping in splitDays.ts.
  body_part_order: string[];
  // Target reps per working set, per exercise category. The session averages the
  // working-set reps; reaching the goal cues a weight increase.
  rep_goals: RepGoals;
  // Muscle execution order, used to order the session's exercise picker within
  // each priority tier. May be partial/empty; normalizeMuscleOrder fills it.
  muscle_order: string[];
}

// Target reps per working set, by exercise category. Each category picks one of
// its allowed options. Keep in sync with backend/blueprints/fit.py.
export type RepCategory = 'upper' | 'lower' | 'isolation';
export type RepGoals = Record<RepCategory, number>;

export const REP_GOAL_OPTIONS: Record<RepCategory, number[]> = {
  upper: [8, 10, 12],
  lower: [10, 12, 15],
  isolation: [10, 12, 15],
};
export const REP_GOAL_DEFAULT: RepGoals = { upper: 10, lower: 12, isolation: 12 };
export const REP_CATEGORIES: { key: RepCategory; label: string; hint?: string }[] = [
  { key: 'upper', label: 'Haut du corps' },
  { key: 'lower', label: 'Bas du corps' },
  { key: 'isolation', label: 'Isolation' },
];

// Per-muscle training priority within a program. A muscle is 'weak' (a weak
// point to bring up — its exercises lead the session) or 'strong' (a strong
// point — its exercises close the session); muscles absent from the map are
// neutral. An empty map means "Pas de priorisation". Keep the muscle keys /
// states in sync with backend/blueprints/fit.py.
export type MusclePriority = 'weak' | 'strong';
export type Priorities = Record<string, MusclePriority>;

// Session muscle ordering rank: weak points first (-1), neutral (0), strong
// points last (1). Ties keep the caller's existing (catalogue/anatomical) order.
export const priorityRank = (priorities: Priorities, muscle: string): number =>
  priorities[muscle] === 'weak' ? -1 : priorities[muscle] === 'strong' ? 1 : 0;

// Option lists are shown alphabetically, with any "negative" option (e.g. "Pas
// de split") pinned last. sortLabels is the single helper enforcing that order.
const collator = new Intl.Collator('fr', { sensitivity: 'base' });
export const sortLabels = (labels: string[]) => [...labels].sort(collator.compare);

export interface Split {
  key: string;
  label: string;
  negative?: boolean;   // a "none" option (e.g. "Pas de split") — kept last
  sortLabel?: string;   // ordering-only override (an exception to the alpha order); an overridden split sorts just before the real one sharing its label
  // Shown under the split once selected. `sessions` is the per-session
  // breakdown (the UI prefixes each with "Séance N :"); `example` marks the
  // breakdown as one possible arrangement among many (Body part); `note` is a
  // free-form description used when there is no fixed session cycle.
  sessions?: string[];
  example?: boolean;
  note?: string;
}

// Defined freely; SPLITS exposes them alphabetically with negatives last.
const SPLITS_RAW: Split[] = [
  { key: 'full_body', label: 'Full Body x2', sessions: ['Tout le corps', 'Tout le corps'] },
  { key: 'upper_lower', label: 'Upper / Lower', sessions: ['Haut du corps', 'Bas du corps'] },
  { key: 'upper_lower_upper', label: 'Upper / Lower / Upper', sessions: ['Haut du corps', 'Bas du corps', 'Haut du corps'] },
  // Grouped with the Upper/Lower variants: ordered just before "Upper / Lower".
  { key: 'lower_upper_lower', label: 'Lower / Upper / Lower', sortLabel: 'Upper / Lower', sessions: ['Bas du corps', 'Haut du corps', 'Bas du corps'] },
  { key: 'push_pull_legs', label: 'Push / Pull / Legs', sessions: ['Poussée (pectoraux, épaules, triceps)', 'Tirage (dos, biceps)', 'Jambes'] },
  { key: 'body_part', label: 'Body part', example: true, sessions: ['Pectoraux', 'Dorsaux', 'Jambes', 'Épaules', 'Bras'] },
  { key: 'no_split', label: 'Pas de split', negative: true, note: 'Aucun découpage : tu composes chaque séance comme tu veux.' },
];

export const SPLITS: Split[] = [...SPLITS_RAW].sort((a, b) => {
  if (!!a.negative !== !!b.negative) return a.negative ? 1 : -1;
  const c = collator.compare(a.sortLabel ?? a.label, b.sortLabel ?? b.label);
  if (c !== 0) return c;
  // Same ordering label: the overridden one (sortLabel set) comes first.
  return (a.sortLabel ? 0 : 1) - (b.sortLabel ? 0 : 1);
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
  { name: 'Épaules', exercises: [{ name: 'Développé épaules', variants: [['Machine', 'Haltères']] }, 'Développé militaire', { name: 'Élévations latérales', variants: [['Poulie basse', 'Haltères']] }] },
  { name: 'Pectoraux', exercises: [{ name: 'Développé couché', variants: [['Barre', 'Haltères']] }, { name: 'Développé incliné', variants: [['Barre', 'Haltères']] }, 'Dips (Pectoraux)', { name: 'Pec Deck', variants: [['Poignées', 'Boudins']] }] },
  { name: 'Dorsaux', exercises: [{ name: 'Tractions', variants: [['Pronation', 'Supination', 'Prise neutre']] }, { name: 'Tirage vertical (poulie haute)', variants: [['Pronation', 'Supination', 'Prise neutre']] }, { name: 'Rowing assis', variants: [['Machine', 'Poulie basse'], ['Pronation', 'Supination', 'Prise neutre']] }] },
  { name: 'Trapèzes', exercises: [{ name: 'Shrugs', variants: [['Haltères', 'Barre', 'Machine']] }] },
  { name: 'Biceps', exercises: [{ name: 'Curl incliné', variants: [['Supination', 'Rotation']] }, { name: 'Curl pupitre', variants: [['Machine', 'Haltères', 'Barre EZ']] }, 'Curl marteau'] },
  { name: 'Triceps', exercises: [{ name: 'Extension poulie haute', variants: [['Barre', 'Corde']] }, { name: 'Extension poulie basse (overhead)', variants: [['Barre', 'Corde']] }, 'Dips (Triceps)'] },
  { name: 'Avant-bras', exercises: ['Flexions de poignets', 'Extensions de poignets'] },
  { name: 'Abdos', exercises: ['Crunch', 'Enroulements de bassin', 'Gainage planche', 'Relevés de jambes'] },
  { name: 'Fessiers', exercises: ['Hip thrust', 'Soulevé de terre sumo'] },
  { name: 'Quadriceps', exercises: ['Soulevé de terre barre hex', 'Hack squat', 'Leg extension', 'Squat gobelet', 'Presse à cuisses', 'Presse à cuisses incliné', 'Presse à cuisses horizontale'] },
  { name: 'Ischio-jambiers', exercises: ['Soulevé de terre jambes tendues', 'Leg curl allongé', 'Leg curl assis'] },
  { name: 'Mollets', exercises: ['Extensions de mollets debout', 'Extensions de mollets assis', 'Extensions à la presse à cuisses'] },
];

export const MUSCLES = MUSCLES_RAW.map(m => ({
  name: m.name,
  exercises: m.exercises
    .map(ex => (typeof ex === 'string' ? ex : { name: ex.name, variants: ex.variants.map(sortLabels) }))
    .sort((a, b) => collator.compare(exLabel(a), exLabel(b))),
}));

// Per (base) exercise metadata: its English name and, for machines, the gym
// machine setting(s). Keyed by the catalogue base name. Shown in the program
// picker and the in-session add-exercise picker.
export interface ExerciseMeta { en: string; settings?: string }

export const EXERCISE_META: Record<string, ExerciseMeta> = {
  // Épaules
  'Développé épaules': { en: 'Shoulder Press', settings: '7' },
  'Développé militaire': { en: 'Military Press' },
  'Élévations latérales': { en: 'Lateral Raises', settings: '6' },
  // Pectoraux
  'Développé couché': { en: 'Bench Press' },
  'Développé incliné': { en: 'Incline Bench Press' },
  'Dips (Pectoraux)': { en: 'Dips' },
  'Dips (Triceps)': { en: 'Dips' },
  'Pec Deck': { en: 'Pec Deck', settings: '3, 2' },
  // Dorsaux
  'Tractions': { en: 'Pull-ups' },
  'Tirage vertical (poulie haute)': { en: 'Lat Pulldown' },
  'Rowing assis': { en: 'Seated Row', settings: '4, 7' },
  // Trapèzes
  'Shrugs': { en: 'Shrugs' },
  // Biceps
  'Curl incliné': { en: 'Incline Curl' },
  'Curl pupitre': { en: 'Preacher Curl', settings: '3' },
  // Triceps
  'Extension poulie haute': { en: 'Bar Pressdown', settings: '18' },
  'Extension poulie basse (overhead)': { en: 'Overhead Bar', settings: '12' },
  // Avant-bras
  'Curl marteau': { en: 'Hammer Curl' },
  'Flexions de poignets': { en: 'Wrist Curls' },
  'Extensions de poignets': { en: 'Reverse Wrist Curls' },
  // Abdos
  'Crunch': { en: 'Crunch' },
  'Enroulements de bassin': { en: 'Reverse Crunch' },
  'Gainage planche': { en: 'Plank' },
  'Relevés de jambes': { en: 'Leg Raises' },
  // Fessiers
  'Hip thrust': { en: 'Hip Thrust' },
  'Squat gobelet': { en: 'Goblet Squat' },
  'Soulevé de terre sumo': { en: 'Sumo Deadlift' },
  // Quadriceps
  'Soulevé de terre barre hex': { en: 'Trap Bar Deadlift' },
  'Hack squat': { en: 'Hack Squat' },
  'Leg extension': { en: 'Leg Extension' },
  'Presse à cuisses': { en: 'Leg Press' },
  'Presse à cuisses incliné': { en: 'Incline Leg Press' },
  'Presse à cuisses horizontale': { en: 'Horizontal Leg Press' },
  // Ischio-jambiers
  'Soulevé de terre jambes tendues': { en: 'Stiff-Leg Deadlift' },
  'Leg curl allongé': { en: 'Lying Leg Curl' },
  'Leg curl assis': { en: 'Seated Leg Curl' },
  // Mollets
  'Extensions de mollets debout': { en: 'Standing Calf Raise' },
  'Extensions de mollets assis': { en: 'Seated Calf Raise' },
  'Extensions à la presse à cuisses': { en: 'Calf Press' },
};

// An exercise's English name, when it differs from the French one (else '').
export const exerciseEnglish = (name: string): string => {
  const en = EXERCISE_META[name]?.en;
  return en && en.toLowerCase() !== name.toLowerCase() ? en : '';
};

// An exercise's default machine-setting value, e.g. "4 et 7" (else ''). The
// catalogue default; the user can override and persist it per exercise.
export const exerciseSettingsValue = (name: string): string => {
  const s = EXERCISE_META[name]?.settings;
  return s ? s.split(',').map(p => p.trim()).join(' et ') : '';
};

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

// A program's stored muscle order, completed into every muscle: keep the stored
// (valid) ones, then append any missing muscle in catalogue order. Empty input
// → the catalogue (anatomical, upper→lower) order.
export const normalizeMuscleOrder = (order: string[] | undefined): string[] => {
  const valid = (order ?? []).filter(m => MUSCLE_ORDER.includes(m));
  const seen = new Set(valid);
  return [...valid, ...MUSCLE_ORDER.filter(m => !seen.has(m))];
};

// Leg muscles, always trained last in the execution order.
export const LEG_MUSCLES = new Set(['Fessiers', 'Quadriceps', 'Ischio-jambiers', 'Mollets']);

// The order exercises are executed in: legs always last, then weak points first
// and strong points last, ties broken by the program's base muscle order. Shared
// by the program "Ordre" step and the in-session exercise picker.
export const sortMusclesForExecution = (muscles: string[], priorities: Priorities, baseOrder: string[]): string[] =>
  [...muscles].sort((a, b) =>
    (LEG_MUSCLES.has(a) ? 1 : 0) - (LEG_MUSCLES.has(b) ? 1 : 0)
    || priorityRank(priorities, a) - priorityRank(priorities, b)
    || baseOrder.indexOf(a) - baseOrder.indexOf(b)
  );

// The (leg, priority) bucket a muscle falls in — muscles can only be reordered
// within their bucket, since legs-last and the priority tiers are fixed.
export const muscleBucket = (priorities: Priorities, m: string): string =>
  `${LEG_MUSCLES.has(m) ? 1 : 0}:${priorities[m] ?? 'neutral'}`;

// Reverse lookup: a stored leaf -> its muscle group (null if orphaned).
const LEAF_TO_MUSCLE: Record<string, string> = {};
for (const [muscle, leaves] of Object.entries(MUSCLE_LEAVES)) {
  for (const leaf of leaves) LEAF_TO_MUSCLE[leaf] = muscle;
}

// ── Custom (user-defined) exercises ──────────────────────────────────────────
// A free-text exercise with manual muscle involvement and an optional single
// row of variants. Fetched per user (useCustomExercises) and merged into the
// catalogue here so the pickers, weighted volume and recency treat them exactly
// like built-ins. Held in module state, refreshed by the hook; the helpers read
// it at call time, so components that show custom data subscribe via the hook
// to re-render when it loads.
export interface CustomExercise {
  id: number;
  name: string;
  muscle: string;
  primary: string[];
  secondary: string[];
  variants: string[];   // single row of mutually-exclusive options ([] = none)
  isolation: boolean;    // isolation movement (vs compound) — feeds the rep goal
}

let CUSTOMS: CustomExercise[] = [];
export const setCustomExercises = (list: CustomExercise[]) => { CUSTOMS = list; };
export const getCustomExercises = () => CUSTOMS;

const baseOfLeaf = (leaf: string) => {
  const i = leaf.indexOf(' — ');
  return i === -1 ? leaf : leaf.slice(0, i);
};

// Custom exercises of a muscle, as catalogue `Exercise` entries (so MusclePicker
// renders them identically — a variant list becomes an expandable group).
export const customExercisesForMuscle = (muscle: string): Exercise[] =>
  CUSTOMS.filter(c => c.muscle === muscle).map(c =>
    c.variants.length ? { name: c.name, variants: [sortLabels(c.variants)] } : c.name
  );

// A stored leaf -> its muscle group (catalogue first, then customs; null if
// neither, i.e. an orphaned selection).
export const muscleOf = (leaf: string): string | null => {
  if (LEAF_TO_MUSCLE[leaf]) return LEAF_TO_MUSCLE[leaf];
  const c = CUSTOMS.find(c => c.name === baseOfLeaf(leaf));
  return c ? c.muscle : null;
};

// Isolation movements (by base name) — everything else is a compound. Used to
// pick an exercise's rep goal: upper-body compounds aim lower (8/10/12), upper
// isolations aim higher (10/12/15). Lower-body and abs use their own goals
// regardless. Custom exercises carry their own `isolation` flag.
const ISOLATION_EXERCISES = new Set<string>([
  'Élévations latérales', 'Pec Deck', 'Shrugs',
  'Curl incliné', 'Curl pupitre', 'Curl marteau',
  'Extension poulie haute', 'Extension poulie basse (overhead)',
  'Flexions de poignets', 'Extensions de poignets',
  'Crunch', 'Enroulements de bassin', 'Gainage planche', 'Relevés de jambes',
  'Leg extension', 'Leg curl allongé', 'Leg curl assis',
  'Extensions de mollets debout', 'Extensions de mollets assis', 'Extensions à la presse à cuisses',
]);

// Whether an exercise (stored leaf) is an isolation movement.
export const isIsolation = (leaf: string): boolean => {
  const base = baseOfLeaf(leaf);
  if (ISOLATION_EXERCISES.has(base)) return true;
  const c = CUSTOMS.find(c => c.name === base);
  return c ? c.isolation : false;
};

const LOWER_MUSCLES = new Set(['Fessiers', 'Quadriceps', 'Ischio-jambiers', 'Mollets']);

// Which rep goal an exercise follows: lower-body and abs go to 'lower'/'isolation';
// upper-body splits by movement type (compound -> 'upper', isolation -> 'isolation').
export const repGoalCategory = (leaf: string): RepCategory => {
  const muscle = muscleOf(leaf);
  if (muscle && LOWER_MUSCLES.has(muscle)) return 'lower';
  if (muscle === 'Abdos') return 'isolation';
  return isIsolation(leaf) ? 'isolation' : 'upper';
};

// Whether a stored leaf is still a valid pick for a muscle (catalogue or custom).
// Used to hide orphaned selections left after the catalogue/customs changed.
export const isValidLeaf = (muscle: string, leaf: string): boolean => {
  if (MUSCLE_LEAVES[muscle]?.has(leaf)) return true;
  const i = leaf.indexOf(' — ');
  const base = i === -1 ? leaf : leaf.slice(0, i);
  return CUSTOMS.some(c => c.muscle === muscle && c.name === base
    && (c.variants.length ? (i !== -1 && c.variants.includes(leaf.slice(i + 3))) : i === -1));
};

// Muscle involvement per exercise, used to weight training volume: each
// working set adds 1 to every `primary` group and 0.5 to every `secondary`
// group. Only the 12 tracked groups appear here (sub-muscles and untracked
// stabilisers like coiffe/adducteurs/érecteurs-as-such are folded into their
// group or dropped). Keyed by stored leaf, with base-name fallback for
// exercises whose variants share the same involvement.
interface Contribution { primary: string[]; secondary: string[] }

const Ep = 'Épaules', Pec = 'Pectoraux', Dor = 'Dorsaux', Trap = 'Trapèzes', Bi = 'Biceps', Tri = 'Triceps',
  AB = 'Avant-bras', Abdo = 'Abdos', Fes = 'Fessiers', Quad = 'Quadriceps',
  Isch = 'Ischio-jambiers', Mol = 'Mollets';

const CONTRIB: Record<string, Contribution> = {
  // Épaules
  'Développé épaules': { primary: [Ep], secondary: [Tri, Pec, Dor] },
  'Développé militaire': { primary: [Ep], secondary: [Tri, Pec, Abdo, Fes] },
  'Élévations latérales': { primary: [Ep], secondary: [Dor] },
  // Pectoraux
  'Développé couché': { primary: [Pec], secondary: [Tri, Ep] },
  'Développé incliné': { primary: [Pec], secondary: [Ep, Tri] },
  'Dips (Pectoraux)': { primary: [Pec], secondary: [Tri, Ep] },
  'Dips (Triceps)': { primary: [Tri], secondary: [Pec, Ep] },
  'Pec Deck — Poignées': { primary: [Pec], secondary: [Ep, Bi, AB] },
  'Pec Deck — Boudins': { primary: [Pec], secondary: [Ep] },
  // Dorsaux
  'Tractions — Pronation': { primary: [Dor], secondary: [Ep, Bi, AB] },
  'Tractions — Supination': { primary: [Dor], secondary: [Bi, AB] },
  'Tractions — Prise neutre': { primary: [Dor], secondary: [Bi, AB] },
  'Tirage vertical (poulie haute) — Pronation': { primary: [Dor], secondary: [Ep, Bi] },
  'Tirage vertical (poulie haute) — Supination': { primary: [Dor], secondary: [Bi, AB] },
  'Tirage vertical (poulie haute) — Prise neutre': { primary: [Dor], secondary: [Bi, AB] },
  // Rowing assis: the grip sets the dorsaux/trapèzes split — pronation leads the
  // traps, the neutral grip the lats; the machine/cable/supination stay lat-led.
  'Rowing assis — Machine': { primary: [Dor], secondary: [Trap, Bi, AB] },
  'Rowing assis — Poulie basse': { primary: [Dor], secondary: [Trap, Bi, AB] },
  'Rowing assis — Pronation': { primary: [Trap], secondary: [Dor, Ep] },
  'Rowing assis — Supination': { primary: [Dor], secondary: [Bi, AB] },
  'Rowing assis — Prise neutre': { primary: [Dor], secondary: [Trap, Bi, AB] },
  // Trapèzes
  'Shrugs': { primary: [Trap], secondary: [AB] },
  // Biceps
  'Curl incliné': { primary: [Bi], secondary: [AB] },
  'Curl pupitre': { primary: [Bi], secondary: [AB] },
  // Triceps
  'Extension poulie haute': { primary: [Tri], secondary: [Ep] },
  'Extension poulie basse (overhead)': { primary: [Tri], secondary: [Abdo] },
  // Avant-bras
  'Curl marteau': { primary: [Bi], secondary: [AB] },
  'Flexions de poignets': { primary: [AB], secondary: [] },
  'Extensions de poignets': { primary: [AB], secondary: [] },
  // Abdos
  'Crunch': { primary: [Abdo], secondary: [] },
  'Enroulements de bassin': { primary: [Abdo], secondary: [] },
  'Gainage planche': { primary: [Abdo], secondary: [Quad, Pec, Ep, Tri, Dor] },
  'Relevés de jambes': { primary: [Abdo], secondary: [] },
  // Fessiers
  'Hip thrust': { primary: [Fes], secondary: [Isch, Quad, Dor] },
  'Squat gobelet': { primary: [Quad], secondary: [Fes, Isch, Abdo] },
  'Soulevé de terre sumo': { primary: [Quad, Fes], secondary: [Isch, Dor, AB] },
  // Quadriceps
  'Soulevé de terre barre hex': { primary: [Quad, Fes], secondary: [Isch, Dor, AB, Abdo] },
  'Hack squat': { primary: [Quad], secondary: [Fes, Isch] },
  'Leg extension': { primary: [Quad], secondary: [] },
  'Presse à cuisses': { primary: [Quad], secondary: [Fes, Isch] },
  'Presse à cuisses incliné': { primary: [Quad], secondary: [Fes, Isch] },
  'Presse à cuisses horizontale': { primary: [Quad], secondary: [Fes, Isch] },
  // Ischio-jambiers
  'Soulevé de terre jambes tendues': { primary: [Isch], secondary: [Fes, Dor, AB] },
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
  const custom = CUSTOMS.find(c => c.name === base);
  if (custom) return { primary: custom.primary, secondary: custom.secondary };
  const m = muscleOf(leaf);
  return { primary: m ? [m] : [], secondary: [] };
};

// Catalogue + custom exercises for a muscle, alphabetically — the full pick
// list shown in the program editor.
export const exercisesForMuscle = (muscle: string): Exercise[] => {
  const cat = MUSCLES.find(m => m.name === muscle)?.exercises ?? [];
  return [...cat, ...customExercisesForMuscle(muscle)]
    .sort((a, b) => collator.compare(exLabel(a), exLabel(b)));
};
