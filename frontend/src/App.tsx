// Root app with routing

import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useLanguage } from './contexts/LanguageContext';
import { CookieBanner } from './components/CookieBanner';
import { LandingPage } from './components/LandingPage';
import { ContactPage } from './components/ContactPage';

const ChessCoachesApp = lazy(() => import('./apps/chesscoaches/ChessCoachesApp').then(m => ({ default: m.ChessCoachesApp })));
const GymApp = lazy(() => import('./apps/gym/GymApp').then(m => ({ default: m.GymApp })));
const InvitePage = lazy(() => import('./apps/chesscoaches/panels/InvitePage').then(m => ({ default: m.InvitePage })));
const WaitlistPage = lazy(() => import('./apps/chesscoaches/panels/WaitlistPage').then(m => ({ default: m.WaitlistPage })));

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
        <Route path="/" element={<LandingPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/invite/*" element={<InvitePage />} />
        <Route path="/waitlist" element={<WaitlistPage />} />
        <Route path="/gym/*" element={<GymApp />} />
        <Route path="/app/*" element={<ChessCoachesApp />} />
      </Routes>
      <CookieBanner />
    </Suspense>
  );
}

export default App;
