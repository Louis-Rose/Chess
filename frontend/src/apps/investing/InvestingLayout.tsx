// Investing app layout

import { Outlet } from 'react-router-dom';
import { InvestingSidebar } from './InvestingSidebar';

export function InvestingLayout() {
  return (
    <div className="h-screen bg-slate-800 font-sans text-slate-100 flex">
      <InvestingSidebar />
      <main className="flex-1 p-8 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
