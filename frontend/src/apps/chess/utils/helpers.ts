// Chess app helper functions

import type { TimePeriod } from '../components/TimePeriodToggle';
import { getDateCutoff } from '../components/TimePeriodToggle';
import type { GameLogEntry, HourlyStats, DayOfWeekStats, StreakStats, HeatmapCell } from './types';

/** Filter game_log entries by time period */
export function filterGameLog(log: GameLogEntry[], period: TimePeriod): GameLogEntry[] {
  if (period === 'ALL') return log;
  const cutoff = getDateCutoff(period);
  if (!cutoff) return log;
  const cutoffTs = new Date(cutoff).getTime() / 1000;
  return log.filter(([ts]) => ts >= cutoffTs);
}

/** Compute hourly stats (2-hour groups) from game log */
export function computeHourlyStats(log: GameLogEntry[]): HourlyStats[] {
  const buckets: Record<number, { wins: number; draws: number; total: number }> = {};
  for (const [ts, r] of log) {
    const hour = new Date(ts * 1000).getHours();
    const hg = Math.floor(hour / 2);
    if (!buckets[hg]) buckets[hg] = { wins: 0, draws: 0, total: 0 };
    buckets[hg].total += 1;
    if (r === 'w') buckets[hg].wins += 1;
    else if (r === 'd') buckets[hg].draws += 1;
  }
  const result: HourlyStats[] = [];
  for (const hg of Object.keys(buckets).map(Number).sort((a, b) => a - b)) {
    const b = buckets[hg];
    if (b.total > 0) {
      result.push({
        hour_group: hg,
        start_hour: hg * 2,
        end_hour: hg * 2 + 2,
        win_rate: Math.round(((b.wins + 0.5 * b.draws) / b.total) * 1000) / 10,
        sample_size: b.total,
      });
    }
  }
  return result;
}

/** Compute day-of-week stats from game log */
export function computeDowStats(log: GameLogEntry[]): DayOfWeekStats[] {
  const buckets: Record<number, { wins: number; draws: number; total: number }> = {};
  for (const [ts, r] of log) {
    // JS getDay(): 0=Sun..6=Sat → convert to 0=Mon..6=Sun
    const jsDay = new Date(ts * 1000).getDay();
    const dow = jsDay === 0 ? 6 : jsDay - 1;
    if (!buckets[dow]) buckets[dow] = { wins: 0, draws: 0, total: 0 };
    buckets[dow].total += 1;
    if (r === 'w') buckets[dow].wins += 1;
    else if (r === 'd') buckets[dow].draws += 1;
  }
  const result: DayOfWeekStats[] = [];
  for (let day = 0; day < 7; day++) {
    const b = buckets[day];
    if (b && b.total > 0) {
      result.push({
        day,
        win_rate: Math.round(((b.wins + 0.5 * b.draws) / b.total) * 1000) / 10,
        sample_size: b.total,
      });
    }
  }
  return result;
}

/** Compute day×hour heatmap stats from game log */
export function computeHeatmapStats(log: GameLogEntry[]): HeatmapCell[] {
  const buckets: Record<string, { wins: number; draws: number; total: number }> = {};
  for (const [ts, r] of log) {
    const d = new Date(ts * 1000);
    const jsDay = d.getDay();
    const dow = jsDay === 0 ? 6 : jsDay - 1; // Mon=0..Sun=6
    const hg = Math.floor(d.getHours() / 2);
    const key = `${dow}-${hg}`;
    if (!buckets[key]) buckets[key] = { wins: 0, draws: 0, total: 0 };
    buckets[key].total += 1;
    if (r === 'w') buckets[key].wins += 1;
    else if (r === 'd') buckets[key].draws += 1;
  }
  const cells: HeatmapCell[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hg = 0; hg < 12; hg++) {
      const b = buckets[`${day}-${hg}`];
      const total = b?.total ?? 0;
      cells.push({
        day,
        hour_group: hg,
        win_rate: total >= 20 ? Math.round(((b.wins + 0.5 * b.draws) / total) * 1000) / 10 : null,
        sample_size: total,
      });
    }
  }
  return cells;
}

/** Compute streak stats from game log (chronological order required) */
export function computeStreakStats(log: GameLogEntry[]): StreakStats[] {
  if (log.length < 2) return [];

  // Map results: "w" -> "win", "l" -> "loss", "d" -> "draw"
  const results = log.map(([, r]) => r === 'w' ? 'win' : r === 'l' ? 'loss' : 'draw');

  // Find max streak lengths
  const maxStreak: Record<string, number> = { win: 0, loss: 0 };
  let curLen = 0, curType: string | null = null;
  for (const r of results) {
    if (r === curType) curLen++;
    else { curLen = 1; curType = r; }
    if (r in maxStreak) maxStreak[r] = Math.max(maxStreak[r], curLen);
  }
  const maxLen = Math.max(maxStreak.win || 1, maxStreak.loss || 1);
  const streakRange = Array.from({ length: maxLen }, (_, i) => i + 1);

  // Build streak buckets
  const buckets: Record<string, { wins: number; draws: number; total: number }> = {};
  for (const len of streakRange) {
    for (const type of ['win', 'loss']) {
      buckets[`${len}-${type}`] = { wins: 0, draws: 0, total: 0 };
    }
  }

  for (let i = 1; i < results.length; i++) {
    for (const streakLen of streakRange) {
      if (i < streakLen) continue;
      for (const streakType of ['win', 'loss']) {
        const isStreak = Array.from({ length: streakLen }, (_, j) => results[i - j - 1] === streakType).every(Boolean);
        if (!isStreak) continue;
        const beforeIdx = i - streakLen - 1;
        const isExact = beforeIdx < 0 || results[beforeIdx] !== streakType;
        if (isExact) {
          const b = buckets[`${streakLen}-${streakType}`];
          b.total += 1;
          if (results[i] === 'win') b.wins += 1;
          else if (results[i] === 'draw') b.draws += 1;
        }
      }
    }
  }

  const stats: StreakStats[] = [];
  for (const len of streakRange) {
    for (const type of ['win', 'loss'] as const) {
      const b = buckets[`${len}-${type}`];
      if (b.total === 0) continue;
      stats.push({
        streak_type: type,
        streak_length: len,
        win_rate: Math.round(((b.wins + 0.5 * b.draws) / b.total) * 1000) / 10,
        sample_size: b.total,
      });
    }
  }
  return stats;
}

export const formatMonth = (date: Date) => {
  const fullMonth = date.toLocaleString('en-US', { month: 'long' });
  // 3-letter months (May): no period
  // 4-letter months (June, July): show all 4 letters, no period
  // Others: 3-letter abbreviation with period
  if (fullMonth.length <= 3) return fullMonth;
  if (fullMonth.length === 4) return fullMonth;
  return fullMonth.slice(0, 3) + '.';
};

export const formatNumber = (num: number) => {
  // European formatting with space as thousand separator
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

export const getBarColor = (winRate: number) => {
  if (winRate >= 55) return "#4ade80"; // Green
  if (winRate >= 45) return "#facc15"; // Yellow
  return "#f87171"; // Red
};

// Helper to format ISO week to "Aug. W2" (week of month based on first Monday)
export const formatWeekYear = (year: number, isoWeek: number) => {
  // Get the Monday of this ISO week
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const firstMonday = new Date(jan4);
  firstMonday.setDate(jan4.getDate() - dayOfWeek + 1);

  const weekMonday = new Date(firstMonday);
  weekMonday.setDate(firstMonday.getDate() + (isoWeek - 1) * 7);

  // Get month name using our formatter
  const monthName = formatMonth(weekMonday);

  // Find the first Monday of this month
  const firstOfMonth = new Date(weekMonday.getFullYear(), weekMonday.getMonth(), 1);
  const firstMondayOfMonth = new Date(firstOfMonth);
  const dow = firstOfMonth.getDay();
  const daysUntilMonday = dow === 0 ? 1 : (dow === 1 ? 0 : 8 - dow);
  firstMondayOfMonth.setDate(1 + daysUntilMonday);

  // Calculate week of month
  const diffDays = Math.floor((weekMonday.getTime() - firstMondayOfMonth.getTime()) / (1000 * 60 * 60 * 24));
  const weekOfMonth = Math.floor(diffDays / 7) + 1;

  const yearShort = weekMonday.getFullYear().toString().slice(-2);
  return `W${weekOfMonth} ${monthName} ${yearShort}`;
};
