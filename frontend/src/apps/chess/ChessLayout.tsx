// Chess app layout with sidebar and content area

import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Calendar, TrendingUp, Home, Shield, LogOut, Trash2, Clock, CalendarDays, Award, Target } from 'lucide-react';
import { ChessDataProvider } from './contexts/ChessDataContext';
import { useChessData } from './contexts/ChessDataContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { ChessSidebar } from './ChessSidebar';
import { OnboardingOverlay } from './components/OnboardingOverlay';
import { FeedbackWidget } from '../../components/FeedbackWidget';
import { useAuth } from '../../contexts/AuthContext';
import { getChessPrefs, saveChessPrefs, CHESS_PREFS_KEY, STORAGE_KEY } from './utils/constants';
import { useChessHeartbeat } from './hooks/useChessHeartbeat';

const NAV_ITEMS = [
  { path: '/chess', labelKey: 'chess.navHome', icon: Home, end: true },
  { path: '/chess/goal', labelKey: 'chess.navGoal', icon: Target },
  { path: '/chess/fide', labelKey: 'chess.navFide', icon: Award },
  { path: '/chess/daily-volume', labelKey: 'chess.navDailyVolume', icon: Calendar },
  { path: '/chess/streak', labelKey: 'chess.navStreaks', icon: TrendingUp },
  { path: '/chess/best-hours', labelKey: 'chess.navBestHours', icon: Clock },
  { path: '/chess/best-days', labelKey: 'chess.navBestDays', icon: CalendarDays },
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
        {displayData?.player ? (
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
                    // Clear stats cache (keep saved player history)
                    for (let i = localStorage.length - 1; i >= 0; i--) {
                      const k = localStorage.key(i);
                      if (k?.startsWith('chess_stats_cache_')) localStorage.removeItem(k);
                    }
                    await logout();
                    window.location.href = '/chess';
                  }}
                  className="w-full px-3 py-2.5 text-left text-red-400 hover:bg-slate-700 flex items-center gap-2 text-sm transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  {t('chess.logout')}
                </button>
                {displayData?.player?.username.toLowerCase() === 'akyrosu' && (
                  <button
                    onClick={async () => {
                      setShowPlayerMenu(false);
                      await fetch('/api/chess/clear-cache?username=akyrosu', { method: 'DELETE' }).catch(() => {});
                      localStorage.removeItem(CHESS_PREFS_KEY);
                      localStorage.removeItem(STORAGE_KEY);
                      for (let i = localStorage.length - 1; i >= 0; i--) {
                        const k = localStorage.key(i);
                        if (k?.startsWith('chess_stats_cache_')) localStorage.removeItem(k);
                      }
                      window.location.href = '/chess';
                    }}
                    className="w-full px-3 py-2.5 text-left text-red-500 hover:bg-slate-700 flex items-center gap-2 text-sm transition-colors border-t border-slate-700"
                  >
                    <Trash2 className="w-4 h-4" />
                    Forget data & log out
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="mb-1 bg-slate-800 rounded-lg p-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-700 animate-pulse" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="h-4 w-24 bg-slate-700 rounded animate-pulse" />
                <div className="h-3 w-16 bg-slate-700 rounded animate-pulse" />
              </div>
            </div>
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

const LumnaLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 128 128" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="8" width="112" height="112" rx="20" fill="#16a34a"/>
    <rect x="32" y="64" width="16" height="40" rx="2" fill="white"/>
    <rect x="56" y="48" width="16" height="56" rx="2" fill="white"/>
    <rect x="80" y="32" width="16" height="72" rx="2" fill="white"/>
  </svg>
);

function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="relative flex bg-slate-700 rounded-md p-0.5">
      <div
        className="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] bg-slate-500 rounded transition-transform duration-200"
        style={{ transform: language === 'en' ? 'translateX(0)' : 'translateX(100%)' }}
      />
      <button
        onClick={() => setLanguage('en')}
        className={`relative z-10 px-2 py-1 text-xs font-medium rounded transition-colors ${language === 'en' ? 'text-white' : 'text-slate-400'}`}
      >
        EN
      </button>
      <button
        onClick={() => setLanguage('fr')}
        className={`relative z-10 px-2 py-1 text-xs font-medium rounded transition-colors ${language === 'fr' ? 'text-white' : 'text-slate-400'}`}
      >
        FR
      </button>
    </div>
  );
}

function MobilePlayerButton() {
  const { logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { data, myPlayerData } = useChessData();
  const displayData = data || myPlayerData;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isAdmin = displayData?.player?.username.toLowerCase() === 'akyrosu';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!displayData?.player) return null;

  return (
    <div ref={ref} className="md:hidden relative z-50">
      <button onClick={() => setOpen(!open)} className="rounded-full overflow-hidden w-9 h-9 bg-slate-700 flex items-center justify-center">
        {displayData.player.avatar ? (
          <img src={displayData.player.avatar} alt="" className="w-9 h-9 rounded-full" />
        ) : (
          <span className="text-slate-300 font-bold text-sm">{displayData.player.username.charAt(0).toUpperCase()}</span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg overflow-hidden whitespace-nowrap">
          <div className="px-3 py-2 border-b border-slate-700">
            <p className="text-white text-sm font-medium">{displayData.player.name || displayData.player.username}</p>
            <p className="text-slate-400 text-xs">@{displayData.player.username}</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => { setOpen(false); navigate('/chess/admin'); }}
              className="w-full px-3 py-2.5 text-left text-amber-400 hover:bg-slate-700 flex items-center gap-2 text-sm transition-colors border-b border-slate-700"
            >
              <Shield className="w-4 h-4" />
              Admin
            </button>
          )}
          <button
            onClick={async () => {
              setOpen(false);
              localStorage.removeItem(CHESS_PREFS_KEY);
              for (let i = localStorage.length - 1; i >= 0; i--) {
                const k = localStorage.key(i);
                if (k?.startsWith('chess_stats_cache_')) localStorage.removeItem(k);
              }
              await logout();
              window.location.href = '/chess';
            }}
            className="w-full px-3 py-2.5 text-left text-red-400 hover:bg-slate-700 flex items-center gap-2 text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {t('chess.logout')}
          </button>
          {displayData?.player?.username.toLowerCase() === 'akyrosu' && (
            <button
              onClick={async () => {
                setOpen(false);
                await fetch('/api/chess/clear-cache?username=akyrosu', { method: 'DELETE' }).catch(() => {});
                localStorage.removeItem(CHESS_PREFS_KEY);
                localStorage.removeItem(STORAGE_KEY);
                for (let i = localStorage.length - 1; i >= 0; i--) {
                  const k = localStorage.key(i);
                  if (k?.startsWith('chess_stats_cache_')) localStorage.removeItem(k);
                }
                window.location.href = '/chess';
              }}
              className="w-full px-3 py-2.5 text-left text-red-500 hover:bg-slate-700 flex items-center gap-2 text-sm transition-colors border-t border-slate-700"
            >
              <Trash2 className="w-4 h-4" />
              Forget data & log out
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ChessHeader() {
  const { t } = useLanguage();
  return (
    <div className="relative flex flex-col items-center px-2 py-3">
      {/* Mobile player avatar — left */}
      <div className="absolute left-2 top-3">
        <MobilePlayerButton />
      </div>
      {/* LUMNA — text centered on screen, logo positioned to its left */}
      <a href="/chess" className="relative flex items-center hover:opacity-80 transition-opacity">
        <LumnaLogo className="w-9 h-9 absolute -left-11" />
        <span className="text-2xl font-bold text-white tracking-wide">LUMNA</span>
      </a>
      <p className="text-sm text-slate-400 mt-0.5">{t('chess.aiTagline')}</p>
      {/* Language toggle — right */}
      <div className="absolute right-2 top-3">
        <LanguageToggle />
      </div>
    </div>
  );
}

function ChessLayoutInner() {
  // Onboarding requires both the flag AND a saved username — prevent stuck state
  const prefs = getChessPrefs();
  const [onboardingDone, setOnboardingDone] = useState(prefs.onboarding_done && !!prefs.chess_username);
  const [showOverlay, setShowOverlay] = useState(false);
  const { searchedUsername } = useChessData();

  // React to server-side onboarding sync (returning user after logout)
  useEffect(() => {
    const handler = () => {
      if (!onboardingDone && getChessPrefs().onboarding_done) {
        setOnboardingDone(true);
      }
    };
    window.addEventListener('chess-prefs-change', handler);
    return () => window.removeEventListener('chess-prefs-change', handler);
  }, [onboardingDone]);

  // Track chess-only visitors (no Google auth needed)
  useChessHeartbeat(onboardingDone ? searchedUsername : '');

  const handleOnboardingComplete = () => {
    saveChessPrefs({ onboarding_done: true });
    setOnboardingDone(true);
    setShowOverlay(true);
  };

  return (
    <div className="h-dvh bg-slate-800 font-sans text-slate-100 flex overflow-hidden">
      {!onboardingDone ? (
        <ChessSidebar onComplete={handleOnboardingComplete} />
      ) : (
        <>
          <ChessNavSidebar />
          <main className="relative flex-1 px-2 pb-8 md:px-8 md:pb-8 overflow-y-auto overflow-x-hidden overscroll-y-contain">
            <ChessHeader />
            <Outlet />
          </main>
          <FeedbackWidget language="en" mobileBottom="bottom-2" />
          {showOverlay && (
            <OnboardingOverlay onDone={() => setShowOverlay(false)} />
          )}
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
