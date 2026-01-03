// Mobile bottom navigation for Investing app

import { NavLink } from 'react-router-dom';
import { Home, Briefcase, Eye, Calendar, TrendingUp } from 'lucide-react';

const navItems = [
  { path: '/investing', icon: Home, label: 'Home', end: true },
  { path: '/investing/portfolio', icon: Briefcase, label: 'Portfolio' },
  { path: '/investing/watchlist', icon: Eye, label: 'Watchlist' },
  { path: '/investing/earnings', icon: Calendar, label: 'Earnings' },
  { path: '/investing/financials', icon: TrendingUp, label: 'Financials' },
];

export function InvestingBottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 px-2 py-2 md:hidden z-50">
      <div className="flex justify-around items-center">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-4 py-1 rounded-lg transition-colors ${
                isActive
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="text-xs">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
