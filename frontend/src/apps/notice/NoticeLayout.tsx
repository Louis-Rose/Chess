import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { FileText, Library, Lightbulb, Lock, Moon, Sun } from 'lucide-react';
import { TabbedSidebarLayout, type TabNavItem } from '../../components/TabbedSidebarLayout';
import { LangToggle } from '../../components/LangToggle';
import { LoginButton } from '../../components/LoginButton';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';

type Theme = 'light' | 'dark';
const THEME_KEY = 'notice.theme';

// Sidebar shell for Notice.ai: the shared tabbed layout (desktop rail +
// collapsible mobile drawer), always dark, with a themed content column that
// toggles light/dark. The toggle drives the global `dark` class on <html>,
// which the panels' dark: variants read; the rail/drawer/bars use explicit dark
// colors, so they stay dark either way.
export function NoticeLayout() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'),
  );

  useEffect(() => {
    document.title = 'Notice.ai | LUMNA';
  }, []);

  // The app is globally dark (`dark` on <html>); drive that class from the
  // Notice theme, and restore the app default (dark) when leaving Notice.
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

  // Light/dark toggle pinned to the bottom of the rail/drawer (always dark), as
  // a row matching the nav items.
  const themeToggle = (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {theme === 'dark' ? t('notice.theme.toLight') : t('notice.theme.toDark')}
    </button>
  );

  const nav: TabNavItem[] = [
    { to: '/notice/notes', label: t('notice.nav.notes'), icon: Lightbulb },
    { to: '/notice/view', label: t('notice.nav.viewer'), icon: FileText },
    { to: '/notice/library', label: t('notice.nav.library'), icon: Library },
  ];

  return (
    <TabbedSidebarLayout
      title="Notice.ai"
      nav={nav}
      headerRight={<LangToggle />}
      navFooter={themeToggle}
      contentClassName="flex flex-col bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-slate-100"
    >
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
    </TabbedSidebarLayout>
  );
}
