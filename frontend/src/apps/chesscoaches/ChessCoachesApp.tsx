// Chess Coaches app routes

import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ChessCoachesLayout } from './ChessCoachesLayout';
import { ScoresheetPanel } from './panels/ScoresheetPanel';
import { ScoresheetReadPage } from './panels/ScoresheetReadPage';
import { StudentsPanel } from './panels/StudentsPanel';
import { MistakeFinderPanel } from './panels/MistakeFinderPanel';
import { DiagramToFenPanel } from './panels/DiagramToFenPanel';
import { AboutPanel } from './panels/AboutPanel';
import { StudentDetailPage } from './panels/StudentDetailPage';
import { PaymentsPanel } from './panels/PaymentsPanel';
import { ProfilePage } from './panels/ProfilePage';
import { MessagesPanel } from './panels/MessagesPanel';
import { StudentDashboard } from './panels/StudentDashboard';
import { InvitePage } from './panels/InvitePage';
import { RoleSelectionPage } from './panels/RoleSelectionPage';
import { useAuth } from '../../contexts/AuthContext';

const AdminPanel = lazy(() =>
  import('./panels/AdminPanel').then(m => ({ default: m.AdminPanel }))
);

export function ChessCoachesApp() {
  const { user } = useAuth();

  useEffect(() => {
    document.title = 'LUMNA | Coaching Tools';
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (link) link.href = '/favicon.svg';
  }, []);

  // New user — needs to pick role
  if (user && user.role === null) {
    return (
      <Routes>
        <Route path="invite/:token" element={<InvitePage />} />
        <Route path="*" element={<RoleSelectionPage />} />
      </Routes>
    );
  }

  // Student role → student dashboard (no coach tools)
  if (user?.role === 'student') {
    return (
      <Routes>
        <Route index element={<StudentDashboard />} />
        <Route path="invite/:token" element={<InvitePage />} />
        <Route path="*" element={<StudentDashboard />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Invite page — accessible without auth (has its own layout) */}
      <Route path="invite/:token" element={<InvitePage />} />

      {/* Coach routes */}
      <Route element={<ChessCoachesLayout />}>
        <Route index element={<ScoresheetPanel />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="students" element={<StudentsPanel />} />
        <Route path="students/:studentId" element={<StudentDetailPage />} />
        <Route path="payments" element={<PaymentsPanel />} />
        <Route path="messages" element={<MessagesPanel />} />
        <Route path="scoresheets" element={<ScoresheetReadPage />} />
        <Route path="mistakes" element={<MistakeFinderPanel />} />
        <Route path="diagram" element={<DiagramToFenPanel />} />
        <Route path="about" element={<AboutPanel />} />
        <Route path="admin" element={<Suspense><AdminPanel /></Suspense>} />
      </Route>
    </Routes>
  );
}
