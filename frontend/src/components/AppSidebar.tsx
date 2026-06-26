import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ProfileMenu, type ProfileMenuItem } from './ProfileMenu';
import { LumnaLogo } from '../apps/chesscoaches/components/LumnaBrand';

// Shared left rail for the LUMNA sub-apps.
//   - top: LUMNA logo + wordmark, centered, links back to the app chooser;
//   - profile: avatar + name; click for a menu (app-specific actions via
//     `profileItems`, Sign out) — or a sign-in button when logged out;
//   - children: optional nav for apps that have sub-sections (e.g. Investing).
export function AppSidebar({
  className = '',
  children,
  profileItems,
}: {
  className?: string;
  children?: ReactNode;
  profileItems?: ProfileMenuItem[];
}) {
  return (
    <aside className={`w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-900 px-3 py-5 ${className}`}>
      <Link
        to="/"
        aria-label="LUMNA home"
        className="mb-6 flex items-center justify-center gap-2 transition-opacity hover:opacity-80"
      >
        <LumnaLogo className="h-7 w-7" />
        <span className="text-lg font-bold tracking-wide">LUMNA</span>
      </Link>

      <div className="mb-5">
        <ProfileMenu showName extraItems={profileItems} />
      </div>

      {children}
    </aside>
  );
}
