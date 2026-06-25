import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { FileText, Library, Lightbulb, Lock, LogOut, Moon, Sun, type LucideIcon } from 'lucide-react';
import { LumnaLogo } from '../chesscoaches/components/LumnaBrand';
import { AppSidebar } from '../../components/AppSidebar';
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

// Nav links live in the always-dark left rail / mobile bar, so they keep dark
// colors regardless of the content theme.
function navClass(active: boolean): string {
  return [
    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    active ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
  ].join(' ');
}

type Theme = 'light' | 'dark';
const THEME_KEY = 'notice.theme';

// Sidebar shell for Notice.ai. The left rail and mobile bar are always dark
// (shared chrome); the content column (header + main) toggles light/dark via a
// `dark` class, driving the dark: variants in the panels.
export function NoticeLayout() {
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { t } = useLanguage();
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'),
  );

  useEffect(() => {
    document.title = 'Notice.ai | LUMNA';
  }, []);

  // The app is globally dark (`dark` on <html>), and Tailwind's dark: variant
  // fires for any ancestor with that class — so a scoped class can't turn it
  // off. Drive the global class from the Notice theme instead; the shared rail
  // uses explicit dark colors (not dark: variants), so it stays dark either
  // way. Restore the app default (dark) when leaving Notice.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    return () => root.classList.add('dark');
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      return next;
    });
  };

  const themeButton = (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle light/dark theme"
      className="rounded-lg border border-slate-300 p-2 text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );

  return (
    <div className="flex min-h-dvh bg-slate-900 text-slate-100">
      {/* Desktop sidebar (shared LUMNA rail + Notice nav) — always dark */}
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

      {/* Content column: themed by the toggle. */}
      <div className="flex min-w-0 flex-1 flex-col bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
        {/* Mobile top nav — always dark */}
        <div className="flex items-center gap-1 border-b border-slate-800 bg-slate-900 px-3 py-2 text-slate-100 md:hidden">
          <NavLink to="/notice" end className="mr-2 flex items-center gap-2">
            <LumnaLogo className="h-6 w-6" />
          </NavLink>
          {NAV.map(({ to, labelKey, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => navClass(isActive)}>
              <Icon className="h-4 w-4" />
              {t(labelKey)}
            </NavLink>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {themeButton}
            <LangToggle />
            {user?.picture && (
              <img src={user.picture} alt="" className="h-7 w-7 rounded-full" title={user.email} />
            )}
            {user && (
              <button
                onClick={() => logout()}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Desktop header bar — themed */}
        <div className="relative hidden border-b border-slate-200 px-6 py-5 dark:border-slate-800 md:block">
          <div className="flex items-center justify-center gap-3">
            <FileText className="h-9 w-9 text-emerald-500" strokeWidth={1.5} />
            <h1 className="text-3xl font-bold tracking-wide">Notice.ai</h1>
          </div>
          <div className="absolute right-6 top-1/2 flex -translate-y-1/2 items-center gap-2">
            {themeButton}
            <LangToggle />
          </div>
        </div>

        <main className="flex min-w-0 flex-1 flex-col">
          {!authLoading && !isAuthenticated ? (
            <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
              <Lock className="h-10 w-10 text-slate-400" />
              <div>
                <h2 className="text-xl font-semibold">Notice.ai</h2>
                <p className="mt-1 max-w-sm text-slate-600 dark:text-slate-400">{t('notice.gate.desc')}</p>
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
