// Chess app layout with sidebar and content area

import { Outlet } from 'react-router-dom';
import { ChessDataProvider } from './contexts/ChessDataContext';
import { ChessSidebar } from './ChessSidebar';
import { FeedbackWidget } from '../../components/FeedbackWidget';

export function ChessLayout() {
  return (
    <ChessDataProvider>
      <div className="min-h-screen bg-slate-200 dark:bg-slate-800 font-sans text-slate-900 dark:text-slate-100 flex flex-col md:flex-row">
        {/* Sidebar: hidden on mobile, visible on md+ */}
        <div className="hidden md:block bg-slate-900">
          <ChessSidebar />
        </div>
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>

        {/* Floating feedback widget */}
        <FeedbackWidget language="en" />
      </div>
    </ChessDataProvider>
  );
}
