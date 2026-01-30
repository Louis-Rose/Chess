// Investing app layout

import { Outlet, Link } from 'react-router-dom';
import { Loader2, BarChart3 } from 'lucide-react';
import { InvestingSidebar } from './InvestingSidebar';
import { InvestingBottomNav } from './InvestingBottomNav';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { UserMenu } from '../../components/UserMenu';
import { LanguageToggle } from '../../components/LanguageToggle';
import { ThemeToggle } from '../../components/ThemeToggle';
import { FeedbackWidget } from '../../components/FeedbackWidget';
import { RewardPopup } from './components/RewardPopup';
import { LoginOverlay } from './components/LoginOverlay';

export function InvestingLayout() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { language } = useLanguage();

  return (
    <div className="min-h-screen bg-slate-200 dark:bg-slate-800 font-sans text-slate-900 dark:text-slate-100 flex flex-col md:flex-row">
      {/* Mobile header: visible on mobile, hidden on md+ */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <Link to="/investing" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-slate-900 dark:text-white tracking-wide">LUMNA</span>
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <LanguageToggle />
          {isAuthenticated ? (
            authLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-500 dark:text-slate-400" />
            ) : (
              <UserMenu />
            )
          ) : (
            <Link to="/" className="w-8 h-8 rounded-full bg-slate-300 dark:bg-slate-700" />
          )}
        </div>
      </div>

      {/* Sidebar: hidden on mobile, visible on md+ */}
      <div className="hidden md:block">
        <InvestingSidebar />
      </div>
      <main className={`flex-1 p-4 md:p-8 pb-20 md:pb-2 ${!isAuthenticated && !authLoading ? 'blur-[1.5px] opacity-70 pointer-events-none select-none' : ''}`}>
        <Outlet />
      </main>
      {/* Bottom nav: visible on mobile, hidden on md+ */}
      <InvestingBottomNav />

      {/* Login overlay for unauthenticated users */}
      <LoginOverlay />

      {/* Floating feedback widget */}
      <FeedbackWidget language={language} />

      {/* First visitor reward popup */}
      <RewardPopup />
    </div>
  );
}
