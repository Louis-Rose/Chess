// Root app with routing

import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useLanguage } from './contexts/LanguageContext';
import { CookieBanner } from './components/CookieBanner';
import { ChooserPage } from './components/ChooserPage';
import { LandingPage } from './components/LandingPage';
import { ContactPage } from './components/ContactPage';
import { DemoGate } from './components/DemoGate';

const ChessCoachesApp = lazy(() => import('./apps/chesscoaches/ChessCoachesApp').then(m => ({ default: m.ChessCoachesApp })));
const FitApp = lazy(() => import('./apps/fit/FitApp').then(m => ({ default: m.FitApp })));
const MusicApp = lazy(() => import('./apps/music/MusicApp').then(m => ({ default: m.MusicApp })));
const InvestingApp = lazy(() => import('./apps/investing/InvestingApp').then(m => ({ default: m.InvestingApp })));
const YcApp = lazy(() => import('./apps/yc/YcApp').then(m => ({ default: m.YcApp })));
const ClothingApp = lazy(() => import('./apps/clothing/ClothingApp').then(m => ({ default: m.ClothingApp })));
const FocusApp = lazy(() => import('./apps/focus/FocusApp').then(m => ({ default: m.FocusApp })));
const FocusPrivacy = lazy(() => import('./apps/focus/FocusPrivacy').then(m => ({ default: m.FocusPrivacy })));
const ChessApp = lazy(() => import('./apps/chess/ChessApp').then(m => ({ default: m.ChessApp })));
const FideApp = lazy(() => import('./apps/fide/FideApp').then(m => ({ default: m.FideApp })));
const NoticeApp = lazy(() => import('./apps/notice/NoticeApp').then(m => ({ default: m.NoticeApp })));
const MppApp = lazy(() => import('./apps/mpp/MppApp').then(m => ({ default: m.MppApp })));
const InvitePage = lazy(() => import('./apps/chesscoaches/panels/InvitePage').then(m => ({ default: m.InvitePage })));
const WaitlistPage = lazy(() => import('./apps/chesscoaches/panels/WaitlistPage').then(m => ({ default: m.WaitlistPage })));

function App() {
  const { user } = useAuth();
  const { language, setLanguage } = useLanguage();
  const location = useLocation();

  // The /fit PWA is self-contained and sets no tracking cookies, so it skips
  // the global consent banner.
  const isFit = location.pathname.startsWith('/fit');

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
        <Route path="/" element={<ChooserPage />} />
        <Route path="/chess" element={<LandingPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/invite/*" element={<InvitePage />} />
        <Route path="/waitlist" element={<WaitlistPage />} />
        <Route path="/fit/*" element={<FitApp />} />
        <Route path="/music/*" element={<MusicApp />} />
        <Route path="/investing/*" element={<InvestingApp />} />
        <Route path="/yc/*" element={<YcApp />} />
        <Route path="/clothing/*" element={<ClothingApp />} />
        <Route path="/focus/privacy" element={<FocusPrivacy />} />
        <Route path="/focus/*" element={<FocusApp />} />
        <Route path="/notice/*" element={<NoticeApp />} />
        <Route path="/mpp/*" element={<MppApp />} />
        <Route path="/chess/stats/*" element={<ChessApp />} />
        <Route path="/blitzcrewrankings/*" element={<FideApp />} />
        <Route path="/chess/app/*" element={<DemoGate><ChessCoachesApp /></DemoGate>} />
      </Routes>
      {!isFit && <CookieBanner />}
    </Suspense>
  );
}

export default App;
