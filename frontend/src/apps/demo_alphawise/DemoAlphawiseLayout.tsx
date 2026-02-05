// Demo AlphaWise app layout - simplified version of InvestingLayout

import { Outlet, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { DemoAlphawiseSidebar } from './DemoAlphawiseSidebar';
import { DemoAlphawiseBottomNav } from './DemoAlphawiseBottomNav';
import { useAuth } from '../../contexts/AuthContext';
import { UserMenu } from '../../components/UserMenu';
import { ThemeToggle } from '../../components/ThemeToggle';
import { LanguageToggle } from '../../components/LanguageToggle';
import { LoginOverlay } from './components/LoginOverlay';

// LUMNA logo (green chart icon)
const LumnaLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 128 128" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="8" width="112" height="112" rx="20" fill="#16a34a"/>
    <rect x="32" y="64" width="16" height="40" rx="2" fill="white"/>
    <rect x="56" y="48" width="16" height="56" rx="2" fill="white"/>
    <rect x="80" y="32" width="16" height="72" rx="2" fill="white"/>
  </svg>
);

// AlphaWise logo (stylized A with gold swoosh - adapts to dark/light mode)
const AlphaWiseLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 8 L20 92 L35 92 L42 70 L58 70 L65 92 L80 92 L50 8 Z M46 55 L50 40 L54 55 Z" className="fill-slate-800 dark:fill-white"/>
    <path d="M25 75 Q50 55 85 35 Q70 50 55 60 Q40 70 25 82 L25 75 Z" fill="#d4a14a" stroke="#c9963f" strokeWidth="1"/>
    <path d="M78 82 Q85 70 88 55 Q90 75 85 90 Q80 88 78 82 Z" fill="#d4a14a"/>
  </svg>
);

export function DemoAlphawiseLayout() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  return (
    <div className="min-h-screen bg-slate-200 dark:bg-slate-800 font-sans text-slate-900 dark:text-slate-100 flex flex-col md:flex-row">
      {/* Mobile header: visible on mobile, hidden on md+ */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <Link to="/demo-alphawise" className="flex items-center gap-1.5">
          <LumnaLogo className="w-7 h-7 flex-shrink-0" />
          <span className="text-slate-400 dark:text-slate-500 text-sm font-light">×</span>
          <AlphaWiseLogo className="w-7 h-7 flex-shrink-0" />
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
