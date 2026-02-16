// Chess app layout with sidebar and content area

import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { LineChart, Calendar, Hash, TrendingUp, Target, Home, Shield, Search, Loader2, LogOut } from 'lucide-react';
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
    usernameInput,
    setUsernameInput,
    savedPlayers,
    showUsernameDropdown,
    setShowUsernameDropdown,
    dropdownRef,
    handleSelectSavedUsername,
    handleSubmit,
    loading,
  } = useChessData();

  const displayData = data || myPlayerData;
  const savedChessUsername = getChessPrefs().chess_username;
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
              className="w-full bg-slate-800 rounded-lg p-3 hover:bg-slate-750 transition-colors"
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

        {/* Search bar */}
        <div ref={dropdownRef} className="relative mb-1">
          <form onSubmit={handleSubmit}>
            <div className="flex">
              <input
                type="text"
                placeholder="Chess.com username"
                className="bg-slate-800 text-white placeholder:text-slate-500 px-2.5 py-1.5 border border-slate-700 rounded-l-lg w-full text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                onFocus={() => savedPlayers.length > 0 && setShowUsernameDropdown(true)}
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 text-white px-2.5 py-1.5 rounded-r-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Search className="w-3.5 h-3.5" />}
              </button>
            </div>
            {showUsernameDropdown && savedPlayers.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-50 max-h-48 overflow-auto">
                <div className="px-3 py-1.5 text-xs text-slate-500 border-b border-slate-200">Recent searches</div>
                {savedPlayers.map((player, idx) => {
                  const isMe = savedChessUsername?.toLowerCase() === player.username.toLowerCase();
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectSavedUsername(player)}
                      className="w-full px-3 py-1.5 text-left text-slate-800 hover:bg-blue-50 flex items-center gap-2 text-sm"
                    >
                      {player.avatar ? (
                        <img src={player.avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-slate-300 flex items-center justify-center text-slate-500 text-xs font-bold">
                          {player.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {player.username}
                      {isMe && <span className="text-xs text-slate-400">(me)</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </form>
        </div>

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
        {user?.is_admin && (
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
