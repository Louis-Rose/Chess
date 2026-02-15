// Chess app layout with sidebar and content area

import { Outlet } from 'react-router-dom';
import { ChessDataProvider, useChessData } from './contexts/ChessDataContext';
import { ChessSidebar } from './ChessSidebar';
import { FeedbackWidget } from '../../components/FeedbackWidget';
import { getChessPrefs } from './utils/constants';

function ChessLayoutInner() {
  const { myPlayerData } = useChessData();
  const hasUsername = !!(getChessPrefs().chess_username || myPlayerData);

  return (
    <div className="h-screen bg-slate-800 font-sans text-slate-100 flex overflow-hidden">
      {!hasUsername ? (
        <ChessSidebar />
      ) : (
        <>
          <main className="flex-1 p-4 md:p-8 overflow-y-auto">
            <Outlet />
          </main>
          <FeedbackWidget language="en" />
        </>
      )}
    </div>
  );
}

export function ChessLayout() {
  return (
    <ChessDataProvider>
      <ChessLayoutInner />
    </ChessDataProvider>
  );
}
