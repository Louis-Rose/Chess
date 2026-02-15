// Chess app layout with sidebar and content area

import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { ChessDataProvider } from './contexts/ChessDataContext';
import { ChessSidebar } from './ChessSidebar';
import { FeedbackWidget } from '../../components/FeedbackWidget';
import { getChessPrefs, saveChessPrefs } from './utils/constants';

function ChessLayoutInner() {
  const [onboardingDone, setOnboardingDone] = useState(getChessPrefs().onboarding_done);

  const handleOnboardingComplete = () => {
    saveChessPrefs({ onboarding_done: true });
    setOnboardingDone(true);
  };

  return (
    <div className="h-screen bg-slate-800 font-sans text-slate-100 flex overflow-hidden">
      {!onboardingDone ? (
        <ChessSidebar onComplete={handleOnboardingComplete} />
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
