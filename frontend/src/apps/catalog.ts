import {
  Crown,
  Dumbbell,
  Music,
  TrendingUp,
  Rocket,
  Shirt,
  Focus,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import { SoccerBall } from './mpp/SoccerBallIcon';

export interface AppEntry {
  path: string;
  label: string;
  Icon: LucideIcon;
  ownerOnly?: boolean;
}

// The LUMNA sub-apps. Single source of truth for both the chooser tiles and the
// titled header (icon + name) shown at the top of each app.
export const APPS: AppEntry[] = [
  { path: '/focus', label: 'Focus', Icon: Focus },
  { path: '/chess', label: 'Chess', Icon: Crown },
  { path: '/fit', label: 'Gym', Icon: Dumbbell },
  { path: '/music', label: 'Music', Icon: Music },
  { path: '/investing', label: 'Investing', Icon: TrendingUp },
  { path: '/yc', label: 'YC Advisor', Icon: Rocket },
  { path: '/clothing', label: 'Clothing', Icon: Shirt },
  { path: '/notice', label: 'Notice.ai', Icon: FileText },
  { path: '/mpp', label: 'MPP', Icon: SoccerBall as LucideIcon, ownerOnly: true },
];

export function appByLabel(label?: string): AppEntry | undefined {
  return label ? APPS.find((a) => a.label === label) : undefined;
}
