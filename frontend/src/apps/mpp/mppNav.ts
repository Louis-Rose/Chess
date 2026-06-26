import {
  ListOrdered,
  CalendarDays,
  FlaskConical,
  ScrollText,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';

// Single source of truth for the MPP tabs: the sidebar nav AND each page's
// title read from this list, so a tab and its page title can never drift. To
// rename or reorder a tab, edit here only.
export interface MppNavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
}

export const MPP_NAV: MppNavItem[] = [
  { to: '/mpp/matches', labelKey: 'mpp.nav.matches', icon: CalendarDays },
  { to: '/mpp/tests', labelKey: 'mpp.nav.tests', icon: FlaskConical },
  { to: '/mpp/rules', labelKey: 'mpp.nav.rules', icon: ScrollText },
  { to: '/mpp/leaderboard', labelKey: 'mpp.nav.leaderboard', icon: ListOrdered },
  { to: '/mpp/docs', labelKey: 'mpp.nav.docs', icon: BookOpen },
];

// The labelKey for the tab matching a given path (used for the page title).
export function mppTitleKey(pathname: string): string | null {
  const item = MPP_NAV.find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  return item ? item.labelKey : null;
}
