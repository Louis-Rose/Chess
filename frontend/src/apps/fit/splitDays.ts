import { MUSCLE_ORDER, SPLITS } from './programData';

// How each split breaks the week into sessions, and which muscle groups belong
// to each session. Drives the per-week plan (Calendrier) and the content filter
// applied to a session once the week's split is known.
//
// Fixed splits map by session index to a muscle list (Abdos kept available on
// every day — the core can be trained any day). The Body part split has no
// fixed order: its days come from the program's `body_part_order` (one muscle
// group per day, the user's chosen sequence).

const ALL = MUSCLE_ORDER;
const UPPER = ['Épaules', 'Pectoraux', 'Dorsaux', 'Trapèzes', 'Biceps', 'Triceps', 'Avant-bras', 'Abdos'];
const LOWER = ['Fessiers', 'Quadriceps', 'Ischio-jambiers', 'Mollets', 'Abdos'];
const PUSH = ['Pectoraux', 'Épaules', 'Triceps', 'Abdos'];
const PULL = ['Dorsaux', 'Trapèzes', 'Biceps', 'Avant-bras', 'Abdos'];
const LEGS = ['Fessiers', 'Quadriceps', 'Ischio-jambiers', 'Mollets', 'Abdos'];

// Muscle groups per session, by split key. Order matches the split's `sessions`
// labels in programData. Splits absent here (no_split, body_part) have no fixed
// mapping.
const SPLIT_DAY_MUSCLES: Record<string, string[][]> = {
  full_body: [ALL, ALL],
  upper_lower: [UPPER, LOWER],
  upper_lower_upper: [UPPER, LOWER, UPPER],
  lower_upper_lower: [LOWER, UPPER, LOWER],
  push_pull_legs: [PUSH, PULL, LEGS],
};

// Whether a split has a fixed, multi-muscle session breakdown the user can
// reorder/trim per session (i.e. not no_split, and not the single-muscle-per-day
// Body part split which the dedicated day-order step already handles).
export const hasFixedSessions = (split: string | null): boolean =>
  !!split && split in SPLIT_DAY_MUSCLES;

// A day's muscles arranged by the program's muscle order (then catalogue order
// for any the order omits). Keeps only the muscles belonging to the day.
function orderDayMuscles(dayMuscles: string[], muscleOrder: string[]): string[] {
  const ord = muscleOrder.length ? muscleOrder : ALL;
  const inDay = new Set(dayMuscles);
  const ordered = ord.filter(m => inDay.has(m));
  // Append any day muscle the order didn't mention (defensive).
  return [...ordered, ...dayMuscles.filter(m => !ordered.includes(m))];
}

// Muscle groups left out of a split's default sessions (the user can add them
// back per session). Forearms and calves are usually trained directly enough by
// the compound work to skip by default.
const DEFAULT_HIDDEN = new Set(['Avant-bras', 'Mollets']);

// A fixed split's default sessions: each day's muscles (minus the ones hidden by
// default), arranged by muscleOrder.
export function defaultSplitSessions(split: string, muscleOrder: string[] = []): string[][] {
  const byDay = SPLIT_DAY_MUSCLES[split];
  return byDay ? byDay.map(day => orderDayMuscles(day.filter(m => !DEFAULT_HIDDEN.has(m)), muscleOrder)) : [];
}

// The split's effective sessions: the user's per-session override when present
// and well-formed (same session count), else the muscleOrder-arranged default.
// An override is the user's freely curated list (any valid muscle, added or
// removed), kept in its stored order and de-duplicated.
export function effectiveSplitSessions(
  split: string | null,
  sessionOrder: Record<string, string[][]> = {},
  muscleOrder: string[] = [],
): string[][] {
  if (!split) return [];
  const defaults = defaultSplitSessions(split, muscleOrder);
  const override = sessionOrder[split];
  if (!override || override.length !== defaults.length) return defaults;
  return defaults.map((_day, i) => {
    const seen = new Set<string>();
    return (override[i] ?? []).filter(m => ALL.includes(m) && !seen.has(m) && (seen.add(m), true));
  });
}

export interface WeekDay {
  label: string;       // e.g. "Haut du corps" or, for Body part, the muscle name
  muscles: string[];   // muscle groups trained that day (empty = no filter)
}

// The split's session labels (per its breakdown in programData), or [].
export function splitSessionLabels(split: string | null): string[] {
  return split ? SPLITS.find(s => s.key === split)?.sessions ?? [] : [];
}

// The ordered list of sessions for a chosen split. Empty when there is no plan
// (no split, "Pas de split", or a Body part split with no order set yet). For a
// fixed split, the per-session muscle order/membership reflects the user's
// override (sessionOrder), arranged by muscleOrder otherwise.
export function weekDays(
  split: string | null,
  bodyPartOrder: string[] = [],
  sessionOrder: Record<string, string[][]> = {},
  muscleOrder: string[] = [],
): WeekDay[] {
  if (!split || split === 'no_split') return [];
  if (split === 'body_part') return bodyPartOrder.map(m => ({ label: m, muscles: [m] }));
  if (!SPLIT_DAY_MUSCLES[split]) return [];
  const labels = splitSessionLabels(split);
  return effectiveSplitSessions(split, sessionOrder, muscleOrder)
    .map((muscles, i) => ({ label: labels[i] ?? `Séance ${i + 1}`, muscles }));
}

// The session being done now, given how many are already done this week. Cycles
// once the week exceeds the split's length. Null when there is no plan.
export function currentDay(days: WeekDay[], doneThisWeek: number): WeekDay | null {
  if (days.length === 0) return null;
  return days[doneThisWeek % days.length];
}
