import { NavLink, Outlet } from 'react-router-dom';
import axios from 'axios';
import { ListOrdered, LineChart, LogOut, type LucideIcon } from 'lucide-react';
import { LumnaLogo } from '../chesscoaches/components/LumnaBrand';
import { AppSidebar } from '../../components/AppSidebar';
import { AppTitle } from '../../components/AppTitle';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { to: '/mpp/leaderboard', label: 'Leaderboard', icon: ListOrdered },
  { to: '/mpp/graph', label: 'Progression', icon: LineChart },
];

function navClass(active: boolean): string {
  return [
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    active
      ? 'bg-emerald-500/15 text-emerald-300'
      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
  ].join(' ');
}

// Sidebar shell for the MPP section: the shared LUMNA rail plus the app's tabs
// (Leaderboard, Progression), with a Disconnect control in the top bar.
export function MppLayout({ onDisconnect }: { onDisconnect: () => void }) {
  const disconnect = () => {
    axios.post('/api/mpp/disconnect').then(onDisconnect);
  };

  return (
    <div className="flex min-h-dvh bg-slate-900 text-slate-100">
      <AppSidebar className="sticky top-0 hidden h-dvh md:flex">
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => navClass(isActive)}>
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </AppSidebar>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top nav */}
        <div className="flex items-center gap-1 border-b border-slate-800 px-3 py-2 md:hidden">
          <NavLink to="/mpp" end className="mr-2 flex items-center gap-2">
            <LumnaLogo className="h-6 w-6" />
          </NavLink>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => navClass(isActive)}>
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </div>

        <div className="hidden border-b border-slate-800 px-6 py-5 md:block">
          <AppTitle title="MPP" />
        </div>

        <div className="flex justify-end border-b border-slate-800 px-6 py-3">
          <button
            onClick={disconnect}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm font-medium text-slate-400 transition-colors hover:border-red-500/60 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Disconnect
          </button>
        </div>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
