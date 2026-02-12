// Chess app layout with sidebar and content area

import { Outlet } from 'react-router-dom';
import { ChessDataProvider } from './contexts/ChessDataContext';
import { ChessSidebar } from './ChessSidebar';
import { FeedbackWidget } from '../../components/FeedbackWidget';

export function ChessLayout() {
  return (
    <ChessDataProvider>
      <div className="h-screen bg-slate-800 font-sans text-slate-100 flex overflow-hidden">
        <ChessSidebar />
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          <Outlet />
        </main>

        {/* Floating feedback widget */}
        <FeedbackWidget language="en" />
      </div>
    </ChessDataProvider>
  );
}
