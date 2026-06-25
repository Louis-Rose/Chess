import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { FileText, Library, Lightbulb, Lock, LogOut, type LucideIcon } from 'lucide-react';
import { LumnaLogo } from '../chesscoaches/components/LumnaBrand';
import { AppSidebar } from '../../components/AppSidebar';
import { AppTitle } from '../../components/AppTitle';
import { LangToggle } from '../../components/LangToggle';
import { LoginButton } from '../../components/LoginButton';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { to: '/notice/notes', labelKey: 'notice.nav.notes', icon: Lightbulb },
  { to: '/notice/view', labelKey: 'notice.nav.viewer', icon: FileText },
  { to: '/notice/library', labelKey: 'notice.nav.library', icon: Library },
];

function navClass(active: boolean): string {
  return [
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    active ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
  ].join(' ');
}

// Sidebar shell for Notice.ai: a fixed left rail on desktop, a horizontal bar
// on mobile. Two destinations — Viewer and Library — and a Google sign-in gate
// (the app is available to any signed-in user; files stay in their browser).
export function NoticeLayout() {
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    document.title = 'Notice.ai | LUMNA';
  }, []);

  return (
    <div className="flex min-h-dvh bg-slate-900 text-slate-100">
      {/* Desktop sidebar (shared LUMNA rail + Notice nav) */}
      <AppSidebar className="sticky top-0 hidden h-dvh md:flex">
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, labelKey, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => navClass(isActive)}>
              <Icon className="h-4 w-4" />
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>
      </AppSidebar>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top nav */}
        <div className="flex items-center gap-1 border-b border-slate-800 px-3 py-2 md:hidden">
          <NavLink to="/notice" end className="mr-2 flex items-center gap-2">
            <LumnaLogo className="h-6 w-6" />
          </NavLink>
          {NAV.map(({ to, labelKey, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => navClass(isActive)}>
              <Icon className="h-4 w-4" />
              {t(labelKey)}
            </NavLink>
          ))}
          <LangToggle className="ml-auto" />
          {user && (
            <div className="flex items-center gap-2">
              {user.picture && (
                <img src={user.picture} alt="" className="h-7 w-7 rounded-full" title={user.email} />
              )}
              <button
                onClick={() => logout()}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="relative hidden border-b border-slate-800 px-6 py-5 md:block">
          <AppTitle title="Notice.ai" />
          <div className="absolute right-6 top-1/2 -translate-y-1/2">
            <LangToggle />
          </div>
        </div>

        <main className="flex min-w-0 flex-1 flex-col bg-slate-100 text-slate-900">
          {!authLoading && !isAuthenticated ? (
            <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
              <Lock className="h-10 w-10 text-slate-400" />
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Notice.ai</h2>
                <p className="mt-1 max-w-sm text-slate-600">{t('notice.gate.desc')}</p>
              </div>
              <LoginButton redirectTo="/notice" />
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
