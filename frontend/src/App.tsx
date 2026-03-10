// Root app with routing
// TODO: Add analytics tracking for route changes

import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { CGUPage } from './pages/CGUPage';
import { MobileUpload } from './pages/MobileUpload';

const ChessApp = lazy(() => import('./apps/chess/ChessApp').then(m => ({ default: m.ChessApp })));
const ChessCoachesApp = lazy(() => import('./apps/chesscoaches/ChessCoachesApp').then(m => ({ default: m.ChessCoachesApp })));
const InvestingApp = lazy(() => import('./apps/investing/InvestingApp').then(m => ({ default: m.InvestingApp })));
const DemoAlphawiseApp = lazy(() => import('./apps/demo_alphawise/DemoAlphawiseApp').then(m => ({ default: m.DemoAlphawiseApp })));

function App() {
  return (
    <Suspense fallback={<div className="h-dvh bg-slate-800" />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/cgu" element={<CGUPage />} />
        <Route path="/upload/:token" element={<MobileUpload />} />
        <Route path="/chess/*" element={<ChessApp />} />
        <Route path="/coach/*" element={<ChessCoachesApp />} />
        <Route path="/investing/*" element={<InvestingApp />} />
        <Route path="/demo-alphawise/*" element={<DemoAlphawiseApp />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
