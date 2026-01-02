// Investing app layout

import { Outlet, Link } from 'react-router-dom';
import { Loader2, BarChart3 } from 'lucide-react';
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
        <Link to="/investing" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-white tracking-wide">LUMRA</span>
        </Link>
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
