// Chess app sidebar with navigation

import { useState, useEffect, useRef } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { Loader2, ChevronDown, Home, BarChart3, TrendingUp, BookOpen } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { UserMenu } from '../../components/UserMenu';
import { ThemeToggle } from '../../components/ThemeToggle';
import { LanguageToggle } from '../../components/LanguageToggle';
import { useChessData } from './contexts/ChessDataContext';

const navItems = [
  { path: '/chess', icon: Home, label: 'Welcome', end: true },
  { path: '/chess/my-data', icon: BarChart3, label: 'My Data' },
  { path: '/chess/win-prediction', icon: TrendingUp, label: 'Win Prediction' },
  { path: '/chess/openings', icon: BookOpen, label: 'Openings' },
];

export function ChessSidebar() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    myPlayerData,
    selectedTimeClass,
    handleTimeClassChange,
  } = useChessData();

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
    <div className="w-64 bg-slate-900 h-screen p-4 flex flex-col gap-2 sticky top-0">
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

      {/* App Switcher */}
      <div className="px-2 pb-4 border-b border-slate-700 relative" ref={appSwitcherRef}>
        <button
          onClick={() => setShowAppSwitcher(!showAppSwitcher)}
          className="w-full bg-blue-900/30 hover:bg-blue-900/50 rounded-lg p-3 transition-colors"
        >
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl">♞</span>
            <p className="text-blue-400 font-semibold">Chess</p>
            <ChevronDown className={`w-4 h-4 text-blue-400 transition-transform ${showAppSwitcher ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {showAppSwitcher && (
          <div className="absolute top-full left-2 right-2 mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-lg z-50 overflow-hidden">
            <Link
              to="/investing"
              onClick={() => setShowAppSwitcher(false)}
              className="flex items-center justify-center gap-3 px-4 py-3 hover:bg-slate-600 transition-colors"
            >
              <span className="text-2xl">📈</span>
              <p className="text-slate-200 font-medium">Investing</p>
            </Link>
          </div>
        )}
      </div>

      {/* Player Info */}
      <div className="px-2 pb-4 border-b border-slate-700">
        {isAuthenticated && myPlayerData?.player ? (
          <div className="bg-white rounded-lg p-4 text-center">
            {myPlayerData.player.avatar ? (
              <img src={myPlayerData.player.avatar} alt="" className="w-16 h-16 rounded-full mx-auto mb-2" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-xl font-bold mx-auto mb-2">
                {myPlayerData.player.username.charAt(0).toUpperCase()}
              </div>
            )}
            <p className="text-slate-800 font-semibold">{myPlayerData.player.name || myPlayerData.player.username}</p>
            <p className="text-slate-500 text-sm">@{myPlayerData.player.username}</p>
            <p className="text-slate-400 text-xs mt-1">{myPlayerData.player.followers} followers</p>
            <p className="text-slate-400 text-xs">
              Joined {new Date(myPlayerData.player.joined * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            <div className="mt-3 pt-3 border-t border-slate-200 text-xs text-slate-600 space-y-1">
              <p>Rapid: <span className="font-semibold text-slate-800">{myPlayerData.total_rapid?.toLocaleString() || 0}</span> games</p>
              <p>Blitz: <span className="font-semibold text-slate-800">{myPlayerData.total_blitz?.toLocaleString() || 0}</span> games</p>
            </div>
          </div>
        ) : (
          <div className="bg-slate-800 rounded-lg p-4 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-600 mx-auto mb-2" />
            <p className="text-slate-500 font-semibold">&nbsp;</p>
            <p className="text-slate-500 text-sm">@username</p>
            <p className="text-slate-500 text-xs mt-1">-- followers</p>
            <p className="text-slate-500 text-xs">Joined --</p>
            <div className="mt-3 pt-3 border-t border-slate-600 text-xs text-slate-500 space-y-1">
              <p>Rapid: <span className="font-semibold">--</span> games</p>
              <p>Blitz: <span className="font-semibold">--</span> games</p>
            </div>
          </div>
        )}
      </div>

      {/* Game Type Selector */}
      <div className="px-2 py-4 border-b border-slate-700">
        <div className="bg-white rounded-lg p-3">
          <label className="block text-slate-600 text-xs font-medium mb-2 text-center">Game Type</label>
          <select
            value={selectedTimeClass}
            onChange={(e) => handleTimeClassChange(e.target.value as 'rapid' | 'blitz')}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="rapid">Rapid</option>
            <option value="blitz">Blitz</option>
          </select>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex flex-col gap-1 px-2 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </NavLink>
        ))}
      </div>

      {/* Theme & Language - at bottom */}
      <div className="mt-auto flex-shrink-0 px-2 pt-4 pb-4 border-t border-slate-700">
        <div className="flex items-center justify-center gap-2">
          <ThemeToggle />
          <LanguageToggle />
        </div>
      </div>
    </div>
  );
}
