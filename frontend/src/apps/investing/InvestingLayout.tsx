// Investing app layout

import { Outlet, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { InvestingSidebar } from './InvestingSidebar';
import { InvestingBottomNav } from './InvestingBottomNav';
import { useAuth } from '../../contexts/AuthContext';
import { UserMenu } from '../../components/UserMenu';
import { LanguageToggle } from '../../components/LanguageToggle';

export function InvestingLayout() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  return (
    <div className="min-h-screen bg-slate-800 font-sans text-slate-100 flex flex-col md:flex-row">
      {/* Mobile header: visible on mobile, hidden on md+ */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📈</span>
          <span className="text-green-400 font-semibold">Investing</span>
        </div>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          {isAuthenticated ? (
            authLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            ) : (
              <UserMenu />
            )
          ) : (
            <Link to="/" className="w-8 h-8 rounded-full bg-slate-700" />
          )}
        </div>
      </div>

      {/* Sidebar: hidden on mobile, visible on md+ */}
      <div className="hidden md:block">
        <InvestingSidebar />
      </div>
      <main className="flex-1 p-4 md:p-8 overflow-y-auto pb-20 md:pb-8">
        <Outlet />
      </main>
      {/* Bottom nav: visible on mobile, hidden on md+ */}
      <InvestingBottomNav />
    </div>
  );
}
