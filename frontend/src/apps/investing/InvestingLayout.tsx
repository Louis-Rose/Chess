// Investing app layout

import { Outlet } from 'react-router-dom';
import { InvestingSidebar } from './InvestingSidebar';
import { InvestingBottomNav } from './InvestingBottomNav';

export function InvestingLayout() {
  return (
    <div className="min-h-screen bg-slate-800 font-sans text-slate-100 flex">
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
