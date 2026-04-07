// Chess Coaches app layout with sidebar and content area

import { useState, useRef, useEffect, useMemo } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Users, FileText, LogOut, Clock, Grid3X3, Home, Shield, CreditCard, UserCircle, MessageCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CoachesDataProvider } from './contexts/CoachesDataContext';
import { CoachesSidebar } from './CoachesSidebar';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { LumnaBrand, LumnaBrandSubtitle } from './components/LumnaBrand';
import { LanguageToggle } from './components/LanguageToggle';
import { RotateCcw } from 'lucide-react';
import { saveCoachesPrefs } from './contexts/CoachesDataContext';

export interface NavItem {
  path: string;
  labelKey: string;
  icon: LucideIcon;
  hoverColor: string;   // tailwind border-* color for card hover
  bgColor: string;       // tailwind bg-* color for card icon badge
  hidden?: boolean;      // true = route exists but not shown in sidebar/home
  roles?: ('coach' | 'student')[];  // which roles see this item (default: all)
}

export interface NavSection {
  titleKey: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    titleKey: 'coaches.sectionAdmin',
    items: [
      { path: '/profile', labelKey: 'coaches.navProfile', icon: UserCircle, hoverColor: 'hover:border-blue-500', bgColor: 'bg-blue-600', roles: ['coach'] },
      { path: '/students', labelKey: 'coaches.navStudents', icon: Users, hoverColor: 'hover:border-purple-500', bgColor: 'bg-purple-600', roles: ['coach'] },
      { path: '/payments', labelKey: 'coaches.navPacks', icon: CreditCard, hoverColor: 'hover:border-emerald-500', bgColor: 'bg-emerald-600', roles: ['coach'] },
      { path: '/messages', labelKey: 'coaches.navMessages', icon: MessageCircle, hoverColor: 'hover:border-blue-500', bgColor: 'bg-blue-600' },
    ],
  },
  {
    titleKey: 'coaches.sectionAITools',
    items: [
      { path: '/scoresheets', labelKey: 'coaches.navScoresheets', icon: FileText, hoverColor: 'hover:border-blue-500', bgColor: 'bg-blue-600', roles: ['coach'] },
      { path: '/diagram', labelKey: 'coaches.navDiagram', icon: Grid3X3, hoverColor: 'hover:border-emerald-500', bgColor: 'bg-emerald-600', roles: ['coach'] },
      { path: '/mistakes', labelKey: 'coaches.navMistakes', icon: Clock, hoverColor: 'hover:border-amber-500', bgColor: 'bg-amber-600', hidden: true, roles: ['coach'] },
    ],
  },
];

function CoachesNavSidebar() {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const [showPlayerMenu, setShowPlayerMenu] = useState(false);
  const playerMenuRef = useRef<HTMLDivElement>(null);

  // Pick the largest font where the longest name part fits on one line
  // Available text width: sidebar 256px - card padding 24px - pl-14 (56px) = 176px
  const nameFontClass = useMemo(() => {
    const name = user?.name ?? '';
    const longest = name.split(' ').reduce((a, b) => a.length > b.length ? a : b, '');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'text-sm';
    const available = 152;
    for (const [cls, font] of [['text-sm', '500 14px Inter,system-ui,sans-serif'], ['text-xs', '500 12px Inter,system-ui,sans-serif'], ['text-[10px]', '500 10px Inter,system-ui,sans-serif']] as [string, string][]) {
      ctx.font = font;
      if (ctx.measureText(longest).width <= available) return cls;
    }
    return 'text-[10px]';
  }, [user?.name]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (playerMenuRef.current && !playerMenuRef.current.contains(e.target as Node))
        setShowPlayerMenu(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="hidden md:flex w-56 2xl:w-64 bg-slate-900 h-screen flex-col flex-shrink-0">
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
                <div className="w-full text-center pl-14">
                  <p className={`text-white font-medium break-words ${nameFontClass}`}>{user.name}</p>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-blue-400">{user.role === 'student' ? t('coaches.roleLabel.student') : t('coaches.roleLabel.coach')}</p>
                </div>
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
                {user.is_admin && (
                  <button
                    onClick={async () => {
                      setShowPlayerMenu(false);
                      saveCoachesPrefs({ scoresheet_success: false });
                      await fetch('/api/auth/reset-role', { method: 'POST', credentials: 'include' });
                      await logout();
                    }}
                    className="w-full px-3 py-2.5 text-slate-400 hover:bg-slate-700 flex items-center justify-center gap-2 text-xs transition-colors border-t border-slate-700"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset &amp; log out
                  </button>
                )}
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

        {/* Navigation */}
        <nav className="flex flex-col gap-0.5">
          <NavLink
            to="/"
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

          {NAV_SECTIONS.map(({ titleKey, items }) => {
            const userRole = user?.role || 'coach';
            const enabledItems = items.filter(i => !i.hidden && (!i.roles || i.roles.includes(userRole)));
            if (enabledItems.length === 0) return null;
            return (
              <div key={titleKey}>
                <div className="h-px bg-slate-700 my-1.5" />
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider px-3 pt-2 pb-1 text-center">
                  {t(titleKey)}
                </div>
                {enabledItems.map(({ path, labelKey, icon: Icon }) => (
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
              </div>
            );
          })}
        </nav>

        {user?.is_admin && (
          <>
            <div className="h-px bg-slate-700" />
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`
              }
            >
              <Shield className="w-4 h-4 flex-shrink-0" />
              {t('coaches.navAdmin')}
            </NavLink>
          </>
        )}

        <div className="h-px bg-slate-700" />
      </div>
    </div>
  );
}

function MobilePlayerButton() {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
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
          {user.is_admin && (
            <button
              onClick={() => { setOpen(false); navigate('/admin'); }}
              className="w-full px-3 py-2.5 text-left text-amber-400 hover:bg-slate-700 flex items-center gap-2 text-sm transition-colors border-b border-slate-700"
            >
              <Shield className="w-4 h-4" />
              Admin
            </button>
          )}
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
    <div className="flex flex-col items-center px-2 py-3">
      <div className="relative flex items-center justify-center w-full">
        <div className="absolute left-0">
          <MobilePlayerButton />
        </div>
        <LumnaBrand hideSubtitle />
        <div className="absolute right-0">
          <LanguageToggle />
        </div>
      </div>
      <LumnaBrandSubtitle />
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
