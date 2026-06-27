import {
  Crown,
  Dumbbell,
  Music,
  TrendingUp,
  Rocket,
  Shirt,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import { SoccerBall } from './mpp/SoccerBallIcon';

export interface AppEntry {
  path: string;
  // Canonical English name; also the lookup key used by appByLabel (don't
  // translate it). Use labelKey for what's shown to the user.
  label: string;
  labelKey: string;
  Icon: LucideIcon;
  ownerOnly?: boolean;
}

// The LUMNA sub-apps. Single source of truth for both the chooser tiles and the
// titled header (icon + name) shown at the top of each app.
export const APPS: AppEntry[] = [
  { path: '/chess', label: 'Chess', labelKey: 'app.chess', Icon: Crown },
  { path: '/fit', label: 'Gym', labelKey: 'app.gym', Icon: Dumbbell },
  { path: '/music', label: 'Music', labelKey: 'app.music', Icon: Music },
  { path: '/investing', label: 'Investing', labelKey: 'app.investing', Icon: TrendingUp },
  { path: '/yc', label: 'YC Advisor', labelKey: 'app.yc', Icon: Rocket },
  { path: '/clothing', label: 'Clothing', labelKey: 'app.clothing', Icon: Shirt },
  { path: '/notice', label: 'Notice.ai', labelKey: 'app.notice', Icon: FileText },
  { path: '/mpp', label: 'MPP', labelKey: 'app.mpp', Icon: SoccerBall as LucideIcon, ownerOnly: true },
];

export function appByLabel(label?: string): AppEntry | undefined {
  return label ? APPS.find((a) => a.label === label) : undefined;
}
