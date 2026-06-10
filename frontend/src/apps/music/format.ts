// Small, dependency-free formatting helpers shared across the Music dashboard.

/** Turn a millisecond total into a compact human label, e.g. "12.4 h" or "37 min". */
export function formatListeningTime(ms: number): string {
  const minutes = ms / 60000;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return `${hours.toFixed(1)} h`;
}

/** Compact seconds label for a single play, e.g. "3:24". */
export function formatClockDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Relative time for a timestamp, e.g. "just now", "5 min ago", "3 days ago". */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, (Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)} h ago`;
  const days = hours / 24;
  if (days < 30) return `${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

/** Format a day key (YYYY-MM-DD) as a short axis label, e.g. "Jun 10". */
export function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Thousands-separated integer. */
export function formatCount(n: number): string {
  return n.toLocaleString();
}
