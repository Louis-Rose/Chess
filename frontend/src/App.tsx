// Root app with routing
// TODO: Add analytics tracking for route changes

import { Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { CGUPage } from './pages/CGUPage';
import { MobileUpload } from './pages/MobileUpload';
import { ChessApp } from './apps/chess/ChessApp';
import { InvestingApp } from './apps/investing/InvestingApp';
import { DemoAlphawiseApp } from './apps/demo_alphawise/DemoAlphawiseApp';

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/cgu" element={<CGUPage />} />
      <Route path="/upload/:token" element={<MobileUpload />} />
      <Route path="/chess/*" element={<ChessApp />} />
      <Route path="/investing/*" element={<InvestingApp />} />
      <Route path="/demo-alphawise/*" element={<DemoAlphawiseApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
