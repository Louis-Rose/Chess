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

export interface WeekDay {
  label: string;       // e.g. "Haut du corps" or, for Body part, the muscle name
  muscles: string[];   // muscle groups trained that day (empty = no filter)
}

// The ordered list of sessions for a chosen split. Empty when there is no plan
// (no split, "Pas de split", or a Body part split with no order set yet).
export function weekDays(split: string | null, bodyPartOrder: string[] = []): WeekDay[] {
  if (!split || split === 'no_split') return [];
  if (split === 'body_part') return bodyPartOrder.map(m => ({ label: m, muscles: [m] }));
  const byDay = SPLIT_DAY_MUSCLES[split];
  if (!byDay) return [];
  const labels = SPLITS.find(s => s.key === split)?.sessions ?? [];
  return byDay.map((muscles, i) => ({ label: labels[i] ?? `Séance ${i + 1}`, muscles }));
}

// The session being done now, given how many are already done this week. Cycles
// once the week exceeds the split's length. Null when there is no plan.
export function currentDay(days: WeekDay[], doneThisWeek: number): WeekDay | null {
  if (days.length === 0) return null;
  return days[doneThisWeek % days.length];
}
