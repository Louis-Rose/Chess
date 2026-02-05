// Demo AlphaWise app layout - simplified version of InvestingLayout

import { Outlet, Link } from 'react-router-dom';
import { Loader2, BarChart3 } from 'lucide-react';
import { DemoAlphawiseSidebar } from './DemoAlphawiseSidebar';
import { DemoAlphawiseBottomNav } from './DemoAlphawiseBottomNav';
import { useAuth } from '../../contexts/AuthContext';
import { UserMenu } from '../../components/UserMenu';
import { ThemeToggle } from '../../components/ThemeToggle';
import { LanguageToggle } from '../../components/LanguageToggle';
import { LoginOverlay } from './components/LoginOverlay';

export function DemoAlphawiseLayout() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  return (
    <div className="min-h-screen bg-slate-200 dark:bg-slate-800 font-sans text-slate-900 dark:text-slate-100 flex flex-col md:flex-row">
      {/* Mobile header: visible on mobile, hidden on md+ */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <Link to="/demo-alphawise" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-slate-900 dark:text-white tracking-wide">AlphaWise</span>
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
        <DemoAlphawiseSidebar />
      </div>
      <main className={`flex-1 p-4 md:p-8 pb-20 md:pb-2 ${!isAuthenticated && !authLoading ? 'blur-[1.5px] opacity-70 pointer-events-none select-none' : ''}`}>
        <Outlet />
      </main>
      {/* Bottom nav: visible on mobile, hidden on md+ */}
      <DemoAlphawiseBottomNav />

      {/* Login overlay for unauthenticated users */}
      <LoginOverlay />
    </div>
  );
}
