// Root app with routing

import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import posthog from 'posthog-js';
import { useAuth } from './contexts/AuthContext';
import { useLanguage } from './contexts/LanguageContext';

const ChessCoachesApp = lazy(() => import('./apps/chesscoaches/ChessCoachesApp').then(m => ({ default: m.ChessCoachesApp })));

function App() {
  const location = useLocation();
  const { user } = useAuth();
  const { language, setLanguage } = useLanguage();

  useEffect(() => {
    posthog.capture('$pageview');
  }, [location.pathname]);

  // Sync language from user profile (server-persisted) on login
  useEffect(() => {
    if (user?.language && user.language !== language) {
      setLanguage(user.language);
    }
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
