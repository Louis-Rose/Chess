import { useState, type ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Menu, type LucideIcon } from 'lucide-react';
import { LumnaLogo } from '../apps/chesscoaches/components/LumnaBrand';
import { AppSidebar } from './AppSidebar';
import { AppTitle } from './AppTitle';
import type { ProfileMenuItem } from './ProfileMenu';

export interface TabNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

function navClass(active: boolean): string {
  return [
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    active
      ? 'bg-emerald-500/15 text-emerald-300'
      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
  ].join(' ');
}

// Shared shell for LUMNA sub-apps that have their own tabs: a fixed left rail on
// desktop, and a collapsible slide-out drawer on mobile (opened from the top
// bar's menu button) so the tab list never overflows the top of the screen. The
// drawer reuses the same AppSidebar — including its profile menu — so the mobile
// bar doesn't need to duplicate avatar/sign-out. The LUMNA logo (rail, drawer,
// and mobile top bar) links back to the chooser.
//   title       — English app label (drives AppTitle + its chooser icon)
//   titleLabel  — optional translated label shown instead of `title`
//   nav         — the app's tabs (label already resolved/translated)
//   profileItems— extra items appended to the rail's profile menu
//   headerRight — controls shown top-right on both the desktop and mobile bars
export function TabbedSidebarLayout({
  title,
  titleLabel,
  nav,
  profileItems,
  headerRight,
  children,
}: {
  title: string;
  titleLabel?: string;
  nav: TabNavItem[];
  profileItems?: ProfileMenuItem[];
  headerRight?: ReactNode;
  children?: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Same tab list for the desktop rail and the mobile drawer; `onNavigate` lets
  // the drawer close itself when a tab is tapped.
  const navList = (onNavigate?: () => void) => (
    <nav className="flex flex-col gap-1">
      {nav.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) => navClass(isActive)}
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-slate-900 text-slate-100">
      {/* Desktop rail */}
      <AppSidebar className="sticky top-0 hidden h-dvh md:flex" profileItems={profileItems}>
        {navList()}
      </AppSidebar>

      {/* Mobile collapsible drawer (backdrop + sliding rail) */}
      <div className={`fixed inset-0 z-50 md:hidden ${menuOpen ? '' : 'pointer-events-none'}`}>
        <div
          onClick={() => setMenuOpen(false)}
          className={`absolute inset-0 bg-black/60 transition-opacity ${
            menuOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <AppSidebar
          profileItems={profileItems}
          className={`absolute left-0 top-0 flex h-dvh transition-transform duration-200 ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {navList(() => setMenuOpen(false))}
        </AppSidebar>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar: menu button, LUMNA logo (→ chooser), title, controls */}
        <div className="flex items-center gap-3 border-b border-slate-800 px-3 py-3 md:hidden">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" aria-label="LUMNA home" className="transition-opacity hover:opacity-80">
            <LumnaLogo className="h-7 w-7" />
          </Link>
          <span className="text-lg font-bold tracking-wide">{titleLabel ?? title}</span>
          {headerRight && <div className="ml-auto flex items-center gap-2">{headerRight}</div>}
        </div>

        {/* Desktop title bar */}
        <div className="relative hidden border-b border-slate-800 px-6 py-5 md:block">
          <AppTitle title={title} label={titleLabel} />
          {headerRight && (
            <div className="absolute right-6 top-1/2 flex -translate-y-1/2 items-center gap-2">
              {headerRight}
            </div>
          )}
        </div>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
