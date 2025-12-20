// Chess app helper functions

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
