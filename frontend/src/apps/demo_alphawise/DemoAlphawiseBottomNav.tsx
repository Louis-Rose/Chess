// Mobile bottom navigation for Demo AlphaWise app

import { NavLink } from 'react-router-dom';
import { Home, Briefcase } from 'lucide-react';

const navItems = [
  { path: '/demo-alphawise', icon: Home, label: 'AlphaWise', end: true },
  { path: '/demo-alphawise/portfolio', icon: Briefcase, label: 'Portfolio' },
];

export function DemoAlphawiseBottomNav() {
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
      </div>
    </nav>
  );
}
