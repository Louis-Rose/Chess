// Root app with routing

import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useLanguage } from './contexts/LanguageContext';

const ChessCoachesApp = lazy(() => import('./apps/chesscoaches/ChessCoachesApp').then(m => ({ default: m.ChessCoachesApp })));

function App() {
  const { user } = useAuth();
  const { language, setLanguage } = useLanguage();

  // Hydrate language from the server for returning users (page refresh with
  // valid session). On a fresh login, login() already sends the pre-login
  // language atomically so user.language is already correct — nothing to do.
  useEffect(() => {
    if (!user?.language) return;
    if (user.language !== language) setLanguage(user.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.language]);

  return (
    <Suspense fallback={<div className="h-dvh bg-slate-800" />}>
      <Routes>
        <Route path="/*" element={<ChessCoachesApp />} />
      </Routes>
    </Suspense>
  );
}

export default App;
