// Mobile bottom navigation for Investing app

import { NavLink } from 'react-router-dom';
import { Home, Briefcase, Eye, Calendar, TrendingUp, Shield } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const navItems = [
  { path: '/investing', icon: Home, label: 'Home', end: true },
  { path: '/investing/financials', icon: TrendingUp, label: 'Financials' },
  { path: '/investing/portfolio', icon: Briefcase, label: 'Portfolio' },
  { path: '/investing/watchlist', icon: Eye, label: 'Watchlist' },
  { path: '/investing/earnings', icon: Calendar, label: 'Earnings' },
];

export function InvestingBottomNav() {
  const { user } = useAuth();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-2 pt-3 pb-6 md:hidden z-50">
      <div className="flex justify-around items-center">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-2 py-1 rounded-lg transition-colors ${
                isActive
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <item.icon className="w-6 h-6" />
            <span className="text-xs">{item.label}</span>
          </NavLink>
        ))}
        {user?.is_admin && (
          <NavLink
            to="/investing/admin"
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-2 py-1 rounded-lg transition-colors ${
                isActive
                  ? 'text-amber-500 dark:text-amber-400'
                  : 'text-amber-600/70 dark:text-amber-500/70'
              }`
            }
          >
            <Shield className="w-6 h-6" />
            <span className="text-xs">Admin</span>
          </NavLink>
        )}
      </div>
    </nav>
  );
}
