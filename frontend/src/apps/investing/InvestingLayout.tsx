// Investing app layout

import { Outlet } from 'react-router-dom';
import { InvestingSidebar } from './InvestingSidebar';

export function InvestingLayout() {
  return (
    <div className="min-h-screen bg-slate-800 font-sans text-slate-100 flex">
      <InvestingSidebar />
      <main className="flex-1 p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
