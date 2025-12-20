// Chess app layout with sidebar and content area

import { Outlet } from 'react-router-dom';
import { ChessDataProvider } from './contexts/ChessDataContext';
import { ChessSidebar } from './ChessSidebar';

export function ChessLayout() {
  return (
    <ChessDataProvider>
      <div className="min-h-screen bg-slate-800 font-sans text-slate-800 flex">
        <ChessSidebar />
        <main className="flex-1 p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </ChessDataProvider>
  );
}
