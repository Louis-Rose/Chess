import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { FileText, Library, Lightbulb, Lock, Wallet } from 'lucide-react';
import { TabbedSidebarLayout, type TabNavItem } from '../../components/TabbedSidebarLayout';
import { LangToggle } from '../../components/LangToggle';
import { LoginButton } from '../../components/LoginButton';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';

// Sidebar shell for Notice.ai: the shared tabbed layout (desktop rail +
// collapsible mobile drawer). The content column is themed light/dark via the
// global theme (the toggle lives in the sidebar); the panels' dark: variants
// read the `dark` class on <html>.
export function NoticeLayout() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    document.title = 'Notice.ai | LUMNA';
  }, []);

  const nav: TabNavItem[] = [
    { to: '/notice/notes', label: t('notice.nav.notes'), icon: Lightbulb },
    { to: '/notice/view', label: t('notice.nav.viewer'), icon: FileText },
    { to: '/notice/library', label: t('notice.nav.library'), icon: Library },
    { to: '/notice/pricing', label: t('notice.nav.pricing'), icon: Wallet },
  ];

  return (
    <TabbedSidebarLayout
      title="Notice.ai"
      nav={nav}
      headerRight={<LangToggle />}
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
