// Chess Coaches app layout with sidebar and content area

import { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { Users, FileText, LogOut, Clock, Grid3X3, Home } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CoachesDataProvider } from './contexts/CoachesDataContext';
import { CoachesSidebar } from './CoachesSidebar';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { LumnaBrand } from './components/LumnaBrand';

export interface NavItem {
  path: string;
  labelKey: string;
  icon: LucideIcon;
  hoverColor: string;   // tailwind border-* color for card hover
  bgColor: string;       // tailwind bg-* color for card icon badge
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/coach/students', labelKey: 'coaches.navStudents', icon: Users, hoverColor: 'hover:border-purple-500', bgColor: 'bg-purple-600' },
  { path: '/coach/scoresheets', labelKey: 'coaches.navScoresheets', icon: FileText, hoverColor: 'hover:border-blue-500', bgColor: 'bg-blue-600' },
  { path: '/coach/diagram', labelKey: 'coaches.navDiagram', icon: Grid3X3, hoverColor: 'hover:border-emerald-500', bgColor: 'bg-emerald-600' },
  { path: '/coach/mistakes', labelKey: 'coaches.navMistakes', icon: Clock, hoverColor: 'hover:border-amber-500', bgColor: 'bg-amber-600' },
];

function CoachesNavSidebar() {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
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
        {/* User card */}
        {user ? (
          <div ref={playerMenuRef} className="relative mb-1">
            <button
              onClick={() => setShowPlayerMenu(!showPlayerMenu)}
              className="w-full bg-slate-800 rounded-lg p-3 hover:bg-slate-750 transition-colors cursor-pointer"
            >
              <div className="relative flex items-center min-h-[40px]">
                {user.picture ? (
                  <img src={user.picture} alt="" className="absolute left-0 w-10 h-10 rounded-full" />
                ) : (
                  <div className="absolute left-0 w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-slate-300 font-bold">
                    {(user.name || user.email).charAt(0).toUpperCase()}
                  </div>
                )}
                <p className={`text-white font-medium w-full text-center pl-14 ${(user.name?.length ?? 0) > 16 ? 'text-xs' : 'text-sm'}`}>{'LLlLLLLLLLLJJ RRRRRRRRRRRRRRRRRRRR' /* TODO: revert to user.name */}</p>
              </div>
            </button>
            {showPlayerMenu && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50 overflow-hidden">
                <button
                  onClick={async () => {
                    setShowPlayerMenu(false);
                    await logout();
                  }}
                  className="w-full px-3 py-2.5 text-red-400 hover:bg-slate-700 flex items-center justify-center gap-2 text-sm transition-colors"
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
              <div className="w-10 h-10 rounded-full bg-slate-700 animate-pulse flex-shrink-0" />
              <div className="h-4 w-24 bg-slate-700 rounded animate-pulse flex-1" />
            </div>
          </div>
        )}

        <div className="h-px bg-slate-700" />

        {/* Navigation */}
        <nav className="flex flex-col gap-0.5">
          <NavLink
            to="/coach"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`
            }
          >
            <Home className="w-4 h-4 flex-shrink-0" />
            {t('coaches.navHome')}
          </NavLink>
          {NAV_ITEMS.map(({ path, labelKey, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
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
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  return (
    <div ref={ref} className="md:hidden relative z-50">
      <button onClick={() => setOpen(!open)} className="rounded-full overflow-hidden w-9 h-9 bg-slate-700 flex items-center justify-center">
        {user.picture ? (
          <img src={user.picture} alt="" className="w-9 h-9 rounded-full" />
        ) : (
          <span className="text-slate-300 font-bold text-sm">{(user.name || user.email).charAt(0).toUpperCase()}</span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg overflow-hidden whitespace-nowrap">
          <div className="px-3 py-2 border-b border-slate-700">
            <p className="text-white text-sm font-medium">{user.name}</p>
          </div>
          <button
            onClick={async () => {
              setOpen(false);
              await logout();
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
  return (
    <div className="relative flex items-center justify-center px-2 py-3">
      <div className="absolute left-2">
        <MobilePlayerButton />
      </div>
      <LumnaBrand />
      <div className="absolute right-2">
        <LanguageToggle />
      </div>
    </div>
  );
}

function CoachesLayoutInner() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-dvh bg-slate-800 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-600 border-t-purple-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-dvh bg-slate-800 font-sans text-slate-100 flex overflow-hidden">
      {!isAuthenticated ? (
        <CoachesSidebar />
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
