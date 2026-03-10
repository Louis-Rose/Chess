// Chess Coaches app layout with sidebar and content area

import { Outlet, NavLink } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { FeedbackWidget } from '../../components/FeedbackWidget';

const NAV_ITEMS = [
  { path: '/chesscoaches', labelKey: 'Tournament Scoresheets', icon: FileText, end: true },
];

function ChessCoachesNavSidebar() {
  return (
    <div className="hidden md:flex w-64 bg-slate-900 h-screen flex-col flex-shrink-0">
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {/* Navigation */}
        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ path, labelKey, icon: Icon, end }) => (
            <NavLink
              key={path}
              to={path}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {labelKey}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

const LumnaLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 128 128" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="8" width="112" height="112" rx="20" fill="#16a34a"/>
    <rect x="32" y="64" width="16" height="40" rx="2" fill="white"/>
    <rect x="56" y="48" width="16" height="56" rx="2" fill="white"/>
    <rect x="80" y="32" width="16" height="72" rx="2" fill="white"/>
  </svg>
);

function ChessCoachesHeader() {
  return (
    <div className="relative flex items-center justify-center px-2 py-3">
      <a href="/chesscoaches" className="flex flex-col items-center hover:opacity-80 transition-opacity">
        <div className="relative flex items-center">
          <LumnaLogo className="w-9 h-9 absolute -left-11" />
          <span className="text-2xl font-bold text-white tracking-wide">LUMNA</span>
        </div>
        <span className="text-lg font-bold text-slate-100 mt-1">Chess Coaches</span>
      </a>
    </div>
  );
}

export function ChessCoachesLayout() {
  return (
    <div className="h-dvh bg-slate-800 font-sans text-slate-100 flex overflow-hidden">
      <ChessCoachesNavSidebar />
      <main className="relative flex-1 px-2 pb-8 md:px-8 md:pb-8 overflow-y-auto overflow-x-hidden overscroll-y-contain" style={{ scrollbarGutter: 'stable' }}>
        <ChessCoachesHeader />
        <Outlet />
      </main>
      <FeedbackWidget language="en" mobileBottom="bottom-2" />
    </div>
  );
}
