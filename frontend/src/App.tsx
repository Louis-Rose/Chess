// Root app with routing
// TODO: Add analytics tracking for route changes

import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';

const ChessCoachesApp = lazy(() => import('./apps/chesscoaches/ChessCoachesApp').then(m => ({ default: m.ChessCoachesApp })));

function App() {
  return (
    <Suspense fallback={<div className="h-dvh bg-slate-800" />}>
      <Routes>
        <Route path="/*" element={<ChessCoachesApp />} />
      </Routes>
    </Suspense>
  );
}

export default App;
