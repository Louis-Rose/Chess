// Chess Coaches app routes

import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ChessCoachesLayout } from './ChessCoachesLayout';
import { HomePage } from './panels/HomePage';
import { StudentsPanel } from './panels/StudentsPanel';
import { MistakeFinderPanel } from './panels/MistakeFinderPanel';
import { DiagramToFenPanel } from './panels/DiagramToFenPanel';
import { PositionsPanel } from './panels/PositionsPanel';
import { AboutPanel } from './panels/AboutPanel';
import { StudentDetailPage } from './panels/StudentDetailPage';
import { PaymentsPanel } from './panels/PaymentsPanel';
import { ProfilePage } from './panels/ProfilePage';
import { MessagesPanel } from './panels/MessagesPanel';
import { SchedulePanel } from './panels/SchedulePanel';
import { InvitePage } from './panels/InvitePage';
import { WaitlistPage } from './panels/WaitlistPage';
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

  return (
    <Routes>
      {/* Invite page — accessible without auth (has its own layout) */}
      <Route path="invite/*" element={<InvitePage />} />

      {/* Waitlist — full-screen Typeform, no layout */}
      <Route path="waitlist" element={<WaitlistPage />} />

      {/* Shared layout — sidebar filters visibility by role */}
      <Route element={<ChessCoachesLayout />}>
        <Route index element={<HomePage role={user?.role ?? null} />} />
        <Route path="schedule" element={<SchedulePanel />} />
        <Route path="messages" element={<MessagesPanel />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="students" element={<StudentsPanel />} />
        <Route path="students/:studentId" element={<StudentDetailPage />} />
        <Route path="payments" element={<PaymentsPanel />} />
        <Route path="mistakes" element={<MistakeFinderPanel />} />
        <Route path="diagram" element={<DiagramToFenPanel />} />
        <Route path="positions" element={<PositionsPanel />} />
        <Route path="about" element={<AboutPanel />} />
        <Route path="admin" element={<Suspense><AdminPanel /></Suspense>} />
      </Route>
    </Routes>
  );
}
