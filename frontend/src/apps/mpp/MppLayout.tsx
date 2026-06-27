import { useState } from 'react';
import { NavLink, Link, Outlet } from 'react-router-dom';
import axios from 'axios';
import { LogOut, Menu } from 'lucide-react';
import { LumnaLogo } from '../chesscoaches/components/LumnaBrand';
import { AppSidebar } from '../../components/AppSidebar';
import { AppTitle } from '../../components/AppTitle';
import { LangToggle } from '../../components/LangToggle';
import { useLanguage } from '../../contexts/LanguageContext';
import { MPP_NAV as NAV } from './mppNav';

function navClass(active: boolean): string {
  return [
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    active
      ? 'bg-emerald-500/15 text-emerald-300'
      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
  ].join(' ');
}

// Sidebar shell for the MPP section: the shared LUMNA rail plus the app's tabs.
// On desktop the rail is always visible; on mobile it collapses into a slide-out
// drawer opened from the top bar's menu button (the inline row overflowed once
// MPP grew past a couple of tabs). The LUMNA logo links back to the chooser.
export function MppLayout({ onDisconnect }: { onDisconnect: () => void }) {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const disconnect = () => {
    axios.post('/api/mpp/disconnect').then(onDisconnect);
  };
  const profileItems = [
    { icon: LogOut, label: t('mpp.common.disconnect'), onClick: disconnect, danger: true },
  ];

  // Same tab list for the desktop rail and the mobile drawer; `onNavigate` lets
  // the drawer close itself when a tab is tapped.
  const navList = (onNavigate?: () => void) => (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ to, labelKey, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) => navClass(isActive)}
        >
          <Icon className="h-4 w-4" />
          {t(labelKey)}
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
          className={`absolute left-0 top-0 h-dvh transition-transform duration-200 ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {navList(() => setMenuOpen(false))}
        </AppSidebar>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar: menu button, LUMNA logo (→ chooser), title, language */}
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
          <span className="text-lg font-bold tracking-wide">MPP</span>
          <LangToggle className="ml-auto" />
        </div>

        {/* Desktop title bar */}
        <div className="relative hidden border-b border-slate-800 px-6 py-5 md:block">
          <AppTitle title="MPP" />
          <div className="absolute right-6 top-1/2 -translate-y-1/2">
            <LangToggle />
          </div>
        </div>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
