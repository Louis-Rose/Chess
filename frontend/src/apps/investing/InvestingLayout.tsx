import { NavLink, Outlet } from 'react-router-dom';
import { LineChart, LogOut, Wallet, type LucideIcon } from 'lucide-react';
import { LumnaLogo } from '../chesscoaches/components/LumnaBrand';
import { AppSidebar } from '../../components/AppSidebar';
import { useAuth } from '../../contexts/AuthContext';
import { useDisplayCurrency, type DisplayCurrency } from './currency';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

// EUR/USD display-currency switch, shared app-wide via the currency context.
const CCY_SYMBOL: Record<DisplayCurrency, string> = { EUR: '€', USD: '$' };

function CurrencyToggle() {
  const { display, setDisplay } = useDisplayCurrency();
  return (
    <div className="flex overflow-hidden rounded-lg border border-slate-700 text-sm">
      {(['EUR', 'USD'] as DisplayCurrency[]).map((c) => (
        <button
          key={c}
          onClick={() => setDisplay(c)}
          className={`px-3 py-1.5 font-semibold transition-colors ${
            display === c
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          {c} {CCY_SYMBOL[c]}
        </button>
      ))}
    </div>
  );
}

const NAV: NavItem[] = [
  { to: '/investing/portfolio', label: 'My Portfolio', icon: Wallet },
  { to: '/investing/data', label: 'Data', icon: LineChart },
];

function navClass(active: boolean): string {
  return [
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    active
      ? 'bg-emerald-500/15 text-emerald-300'
      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
  ].join(' ');
}

// Sidebar shell for the Investing section: a fixed left rail on desktop, a
// horizontal bar on mobile. Two destinations — My Portfolio and Data — plus
// the signed-in user and a sign-out control.
export function InvestingLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-dvh bg-slate-900 text-slate-100">
      {/* Desktop sidebar (shared LUMNA rail + Investing nav) */}
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
          <NavLink to="/investing" end className="mr-2 flex items-center gap-2">
            <LumnaLogo className="h-6 w-6" />
          </NavLink>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => navClass(isActive)}>
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
          {user && (
            <div className="ml-auto flex items-center gap-2">
              {user.picture && (
                <img src={user.picture} alt="" className="h-7 w-7 rounded-full" title={user.email} />
              )}
              <button
                onClick={() => logout()}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end border-b border-slate-800 px-6 py-3">
          <CurrencyToggle />
        </div>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
