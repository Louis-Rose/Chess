// Chess Coaches app layout with sidebar and content area

import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { FileText, LogOut } from 'lucide-react';
import { CoachesDataProvider, useCoachesData, getCoachesPrefs, saveCoachesPrefs } from './contexts/CoachesDataContext';
import { CoachesSidebar } from './CoachesSidebar';
import { useLanguage } from '../../contexts/LanguageContext';

const NAV_ITEMS = [
  { path: '/coach', labelKey: 'coaches.navScoresheets', icon: FileText, end: true },
];

function CoachesNavSidebar() {
  const { t } = useLanguage();
  const { playerInfo } = useCoachesData();
  const [showPlayerMenu, setShowPlayerMenu] = useState(false);
  const playerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (playerMenuRef.current && !playerMenuRef.current.contains(e.target as Node))
        setShowPlayerMenu(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="hidden md:flex w-64 bg-slate-900 h-screen flex-col flex-shrink-0">
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {/* Player card */}
        {playerInfo ? (
          <div ref={playerMenuRef} className="relative mb-1">
            <button
              onClick={() => setShowPlayerMenu(!showPlayerMenu)}
              className="w-full bg-slate-800 rounded-lg p-3 hover:bg-slate-750 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                {playerInfo.avatar ? (
                  <img src={playerInfo.avatar} alt="" className="w-10 h-10 rounded-full" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-slate-300 font-bold">
                    {playerInfo.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-left min-w-0">
                  <p className="text-white font-medium text-sm truncate">{playerInfo.name || playerInfo.username}</p>
                  <p className="text-slate-400 text-xs truncate">@{playerInfo.username}</p>
                </div>
              </div>
            </button>
            {showPlayerMenu && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50 overflow-hidden">
                <button
                  onClick={() => {
                    setShowPlayerMenu(false);
                    localStorage.removeItem('coaches_preferences');
                    localStorage.removeItem('coaches_saved_players');
                    window.location.href = '/coach';
                  }}
                  className="w-full px-3 py-2.5 text-left text-red-400 hover:bg-slate-700 flex items-center gap-2 text-sm transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  {t('chess.logout')}
                </button>
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

        <div className="h-px bg-slate-700" />
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
  const { t } = useLanguage();
  const { playerInfo } = useCoachesData();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!playerInfo) return null;

  return (
    <div ref={ref} className="md:hidden relative z-50">
      <button onClick={() => setOpen(!open)} className="rounded-full overflow-hidden w-9 h-9 bg-slate-700 flex items-center justify-center">
        {playerInfo.avatar ? (
          <img src={playerInfo.avatar} alt="" className="w-9 h-9 rounded-full" />
        ) : (
          <span className="text-slate-300 font-bold text-sm">{playerInfo.username.charAt(0).toUpperCase()}</span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg overflow-hidden whitespace-nowrap">
          <div className="px-3 py-2 border-b border-slate-700">
            <p className="text-white text-sm font-medium">{playerInfo.name || playerInfo.username}</p>
            <p className="text-slate-400 text-xs">@{playerInfo.username}</p>
          </div>
          <button
            onClick={() => {
              setOpen(false);
              localStorage.removeItem('coaches_preferences');
              localStorage.removeItem('coaches_saved_players');
              window.location.href = '/coach';
            }}
            className="w-full px-3 py-2.5 text-left text-red-400 hover:bg-slate-700 flex items-center gap-2 text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {t('chess.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

function CoachesHeader() {
  const { t } = useLanguage();
  return (
    <div className="relative flex items-center justify-center px-2 py-3">
      <div className="absolute left-2">
        <MobilePlayerButton />
      </div>
      <a href="/coach" className="flex flex-col items-center hover:opacity-80 transition-opacity">
        <div className="relative flex items-center">
          <LumnaLogo className="w-9 h-9 absolute -left-11" />
          <span className="text-2xl font-bold text-white tracking-wide">LUMNA</span>
        </div>
        <span className="text-lg font-bold text-slate-100 mt-1">{t('coaches.title')}</span>
      </a>
      <div className="absolute right-2">
        <LanguageToggle />
      </div>
    </div>
  );
}

function CoachesLayoutInner() {
  const prefs = getCoachesPrefs();
  const [onboardingDone, setOnboardingDone] = useState(prefs.onboarding_done && !!prefs.chess_username);

  useEffect(() => {
    const handler = () => {
      if (!onboardingDone && getCoachesPrefs().onboarding_done) setOnboardingDone(true);
    };
    window.addEventListener('coaches-prefs-change', handler);
    return () => window.removeEventListener('coaches-prefs-change', handler);
  }, [onboardingDone]);

  const handleOnboardingComplete = () => {
    saveCoachesPrefs({ onboarding_done: true });
    setOnboardingDone(true);
  };

  return (
    <div className="h-dvh bg-slate-800 font-sans text-slate-100 flex overflow-hidden">
      {!onboardingDone ? (
        <CoachesSidebar onComplete={handleOnboardingComplete} />
      ) : (
        <>
          <CoachesNavSidebar />
          <main className="relative flex-1 px-2 pb-8 md:px-8 md:pb-8 overflow-y-auto overflow-x-hidden overscroll-y-contain" style={{ scrollbarGutter: 'stable' }}>
            <CoachesHeader />
            <Outlet />
          </main>
        </>
      )}
    </div>
  );
}

export function ChessCoachesLayout() {
  return (
    <CoachesDataProvider>
      <CoachesLayoutInner />
    </CoachesDataProvider>
  );
}
