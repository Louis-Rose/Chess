// Root app with routing

import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import posthog from 'posthog-js';

const ChessCoachesApp = lazy(() => import('./apps/chesscoaches/ChessCoachesApp').then(m => ({ default: m.ChessCoachesApp })));

function App() {
  const location = useLocation();

  useEffect(() => {
    posthog.capture('$pageview');
  }, [location.pathname]);

  return (
    <Suspense fallback={<div className="h-dvh bg-slate-800" />}>
      <Routes>
        <Route path="/*" element={<ChessCoachesApp />} />
      </Routes>
    </Suspense>
  );
}

export default App;
