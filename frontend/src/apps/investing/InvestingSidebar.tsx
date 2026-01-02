// Investing app sidebar

import { useState, useRef, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Loader2, Home, Briefcase, Eye, Calendar, ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { UserMenu } from '../../components/UserMenu';
import { LanguageToggle } from '../../components/LanguageToggle';

const navItems = [
  { path: '/investing', icon: Home, label: 'Welcome', end: true },
  { path: '/investing/portfolio', icon: Briefcase, label: 'My Portfolio' },
  { path: '/investing/earnings', icon: Calendar, label: 'Earnings Calendar' },
  { path: '/investing/watchlist', icon: Eye, label: 'Watchlist', disabled: true },
];

export function InvestingSidebar() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [showAppSwitcher, setShowAppSwitcher] = useState(false);
  const appSwitcherRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (appSwitcherRef.current && !appSwitcherRef.current.contains(event.target as Node)) {
        setShowAppSwitcher(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="w-64 bg-slate-900 h-screen p-4 flex flex-col gap-2 sticky top-0 overflow-y-auto">
      {/* User Menu */}
      <div className="flex justify-center mb-4 px-2 pb-4 border-b border-slate-700">
        {isAuthenticated ? (
          authLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          ) : (
            <UserMenu />
          )
        ) : (
          <Link to="/" className="flex items-center gap-2 text-slate-500 hover:text-slate-300 transition-colors">
            <div className="w-8 h-8 rounded-full bg-slate-700" />
            <span className="text-sm">Not signed in</span>
          </Link>
        )}
      </div>

      {/* Language Toggle */}
      <div className="px-2 pb-4 border-b border-slate-700">
        <div className="flex items-center justify-center">
          <LanguageToggle />
        </div>
      </div>

      {/* App Title with Switcher */}
      <div className="px-2 pb-4 border-b border-slate-700 relative" ref={appSwitcherRef}>
        <button
          onClick={() => setShowAppSwitcher(!showAppSwitcher)}
          className="w-full bg-green-900/30 hover:bg-green-900/50 rounded-lg p-4 text-center transition-colors"
        >
          <div className="text-4xl mb-2">&#128200;</div>
          <div className="flex items-center justify-center gap-1">
            <p className="text-green-400 font-semibold">Investing</p>
            <ChevronDown className={`w-4 h-4 text-green-400 transition-transform ${showAppSwitcher ? 'rotate-180' : ''}`} />
          </div>
          <p className="text-slate-500 text-xs mt-1">Track your portfolio</p>
        </button>
        {showAppSwitcher && (
          <div className="absolute top-full left-2 right-2 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50 overflow-hidden">
            <Link
              to="/"
              onClick={() => setShowAppSwitcher(false)}
              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors"
            >
              <span className="text-2xl">🏠</span>
              <div>
                <p className="text-slate-200 font-medium">Home</p>
                <p className="text-slate-500 text-xs">App selector</p>
              </div>
            </Link>
            <Link
              to="/chess"
              onClick={() => setShowAppSwitcher(false)}
              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-700 transition-colors border-t border-slate-700"
            >
              <span className="text-2xl">♞</span>
              <div>
                <p className="text-slate-200 font-medium">Chess</p>
                <p className="text-slate-500 text-xs">Improve at Stuff</p>
              </div>
            </Link>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex flex-col gap-1 px-2 py-4 border-b border-slate-700">
        {navItems.map((item) => (
          item.disabled ? (
            <div
              key={item.path}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-left text-slate-500 cursor-not-allowed opacity-50"
            >
              <item.icon className="w-5 h-5" />
              {item.label}
              <span className="text-xs bg-slate-700 px-1.5 py-0.5 rounded ml-auto">Soon</span>
            </div>
          ) : (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                  isActive
                    ? 'bg-green-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          )
        ))}
      </div>

    </div>
  );
}
