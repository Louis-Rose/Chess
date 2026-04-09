// Chess Coaches app layout with sidebar and content area

import { useState, useRef, useEffect, useMemo } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Users, FileText, LogOut, Clock, Grid3X3, Home, Shield, CreditCard, UserCircle, MessageCircle, CalendarDays, AlertTriangle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { CoachesDataProvider, saveCoachesPrefs } from './contexts/CoachesDataContext';
import { CoachesSidebar } from './CoachesSidebar';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { LumnaBrand, LumnaBrandSubtitle } from './components/LumnaBrand';
import { LanguageToggle } from './components/LanguageToggle';

export interface NavItem {
  path: string;
  labelKey: string;
  icon: LucideIcon;
  hoverColor: string;   // tailwind border-* color for card hover
  bgColor: string;       // tailwind bg-* color for card icon badge
  hidden?: boolean;      // true = route exists but not shown in sidebar/home
  comingSoon?: boolean;  // true = shown but greyed out and not clickable
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
      { path: '/schedule', labelKey: 'coaches.navCalendar', icon: CalendarDays, hoverColor: 'hover:border-amber-500', bgColor: 'bg-amber-600', roles: ['coach'] },
      { path: '/messages', labelKey: 'coaches.navMessages', icon: MessageCircle, hoverColor: 'hover:border-blue-500', bgColor: 'bg-blue-600', roles: ['coach', 'student'] },
      { path: '/payments', labelKey: 'coaches.navPacks', icon: CreditCard, hoverColor: 'hover:border-emerald-500', bgColor: 'bg-emerald-600', roles: ['coach'] },
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
  const navigate = useNavigate();
  const [showPlayerMenu, setShowPlayerMenu] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const playerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    const fetchUnread = () =>
      fetch('/api/messages/unread-count', { credentials: 'include' })
        .then(r => r.json())
        .then(d => setUnreadCount(d.count || 0))
        .catch(() => {});
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [user]);

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
                  {user.role && (
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-blue-400">
                      {user.role === 'student' ? t('coaches.roleLabel.student') : t('coaches.roleLabel.coach')}
                    </p>
                  )}
                </div>
              </div>
            </button>
            {showPlayerMenu && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50 overflow-hidden">
                {user.is_admin && (
                  <button
                    onClick={() => { setShowPlayerMenu(false); navigate('/admin'); }}
                    className="w-full px-3 py-2.5 text-amber-400 hover:bg-slate-700 flex items-center justify-center gap-2 text-sm transition-colors border-b border-slate-700"
                  >
                    <Shield className="w-4 h-4" />
                    {t('coaches.navAdmin')}
                  </button>
                )}
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
                    className="w-full px-3 py-2.5 text-red-400 hover:bg-slate-700 flex items-center justify-center gap-2 text-sm transition-colors border-t border-slate-700"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    {t('chess.resetAndLogout')}
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
            // No role yet → hide every role-gated item; role-agnostic items stay visible.
            const userRole = user?.role;
            const enabledItems = items.filter(i =>
              !i.hidden && (!i.roles || (userRole && i.roles.includes(userRole)))
            );
            if (enabledItems.length === 0) return null;
            return (
              <div key={titleKey}>
                <div className="h-px bg-slate-700 my-1.5" />
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider px-3 pt-2 pb-1 text-center">
                  {t(titleKey)}
                </div>
                {enabledItems.map(({ path, labelKey, icon: Icon, comingSoon }) =>
                  comingSoon ? (
                    <span
                      key={path}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-600 cursor-default"
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {t(labelKey)}
                    </span>
                  ) : (
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
                      <span className="flex-1">{t(labelKey)}</span>
                      {path === '/messages' && unreadCount > 0 && (
                        <span className="w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </NavLink>
                  )
                )}
              </div>
            );
          })}
        </nav>

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
    <div className="relative bg-slate-900 border-b border-slate-700 -mx-2 md:-mx-8 px-4 md:px-8 py-3 mb-2">
      <div className="flex flex-col items-center">
        <div className="relative flex items-center justify-center w-full">
          <div className="absolute left-0">
            <MobilePlayerButton />
          </div>
          <LumnaBrand hideSubtitle />
        </div>
        <LumnaBrandSubtitle />
      </div>
      <div className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2">
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
          <main className="relative flex-1 px-2 pb-8 md:px-8 md:pb-8 overflow-y-auto overflow-x-hidden overscroll-y-contain bg-[#1e2d3d] flex flex-col" style={{ scrollbarGutter: 'stable' }}>
            <CoachesHeader />
            <div className="flex-1 border-l border-slate-700 -ml-2 md:-ml-8 pl-2 md:pl-8 -mt-2 pt-2">
              <Outlet />
            </div>
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
