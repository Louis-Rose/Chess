// Chess app layout with sidebar and content area

import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { LineChart, Calendar, Hash, TrendingUp, Target, Home, Shield, LogOut } from 'lucide-react';
import { ChessDataProvider } from './contexts/ChessDataContext';
import { useChessData } from './contexts/ChessDataContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { ChessSidebar } from './ChessSidebar';
import { FeedbackWidget } from '../../components/FeedbackWidget';
import { useAuth } from '../../contexts/AuthContext';
import { getChessPrefs, saveChessPrefs, CHESS_PREFS_KEY, STORAGE_KEY } from './utils/constants';

const NAV_ITEMS = [
  { path: '/chess', labelKey: 'chess.navHome', icon: Home, end: true },
  { path: '/chess/elo', labelKey: 'chess.navElo', icon: LineChart },
  { path: '/chess/today', labelKey: 'chess.navToday', icon: Target },
  { path: '/chess/daily-volume', labelKey: 'chess.navDailyVolume', icon: Calendar },
  { path: '/chess/game-number', labelKey: 'chess.navBestGames', icon: Hash },
  { path: '/chess/streak', labelKey: 'chess.navStreaks', icon: TrendingUp },
];

function ChessNavSidebar() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const {
    data,
    myPlayerData,
  } = useChessData();

  const displayData = data || myPlayerData;
  const [showPlayerMenu, setShowPlayerMenu] = useState(false);
  const playerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (playerMenuRef.current && !playerMenuRef.current.contains(e.target as Node)) {
        setShowPlayerMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="hidden md:flex w-64 bg-slate-900 h-screen flex-col flex-shrink-0">
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {/* Player card (compact) — clickable with menu */}
        {displayData?.player && (
          <div ref={playerMenuRef} className="relative mb-1">
            <button
              onClick={() => setShowPlayerMenu(!showPlayerMenu)}
              className="w-full bg-slate-800 rounded-lg p-3 hover:bg-slate-750 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                {displayData.player.avatar ? (
                  <img src={displayData.player.avatar} alt="" className="w-10 h-10 rounded-full" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-slate-300 font-bold">
                    {displayData.player.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-left min-w-0">
                  <p className="text-white font-medium text-sm truncate">{displayData.player.name || displayData.player.username}</p>
                  <p className="text-slate-400 text-xs truncate">@{displayData.player.username}</p>
                </div>
              </div>
            </button>
            {showPlayerMenu && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50 overflow-hidden">
                <button
                  onClick={async () => {
                    setShowPlayerMenu(false);
                    localStorage.removeItem(CHESS_PREFS_KEY);
                    localStorage.removeItem(STORAGE_KEY);
                    await logout();
                    window.location.href = '/chess';
                  }}
                  className="w-full px-3 py-2.5 text-left text-red-400 hover:bg-slate-700 flex items-center gap-2 text-sm transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  {t('chess.logout')}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="h-px bg-slate-700" />

        {/* Navigation */}
        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ path, labelKey, icon: Icon, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>

        {/* Admin */}
        {(user?.is_admin || displayData?.player?.username.toLowerCase() === 'akyrosu') && (
          <>
            <div className="h-px bg-slate-700" />
            <NavLink
              to="/chess/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-amber-600 text-white' : 'text-amber-400 hover:bg-slate-800'
                }`
              }
            >
              <Shield className="w-4 h-4 flex-shrink-0" />
              Admin
            </NavLink>
          </>
        )}
      </div>
    </div>
  );
}

function ChessLayoutInner() {
  const [onboardingDone, setOnboardingDone] = useState(getChessPrefs().onboarding_done);

  const handleOnboardingComplete = () => {
    saveChessPrefs({ onboarding_done: true });
    setOnboardingDone(true);
  };

  return (
    <div className="h-screen bg-slate-800 font-sans text-slate-100 flex overflow-hidden">
      {!onboardingDone ? (
        <ChessSidebar onComplete={handleOnboardingComplete} />
      ) : (
        <>
          <ChessNavSidebar />
          <main className="flex-1 p-4 md:p-8 overflow-y-auto">
            <Outlet />
          </main>
          <FeedbackWidget language="en" />
        </>
      )}
    </div>
  );
}

export function ChessLayout() {
  return (
    <ChessDataProvider>
      <ChessLayoutInner />
    </ChessDataProvider>
  );
}
