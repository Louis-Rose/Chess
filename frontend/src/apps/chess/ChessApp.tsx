// Chess app routes

import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ChessLayout } from './ChessLayout';
import { WelcomePanel } from './panels/WelcomePanel';
import { DailyVolumePage } from './panels/DailyVolumePage';
import { StreakPage } from './panels/StreakPage';
import { WhenToPlayPage } from './panels/WhenToPlayPage';
import { GoalPage } from './panels/GoalPage';
import { FidePage } from './panels/FidePage';
import { ChessAdminPanel } from './panels/AdminPanel';

export function ChessApp() {
  useEffect(() => {
    document.title = 'LUMNA';
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (link) link.href = '/favicon.svg';
  }, []);

  return (
    <Routes>
      <Route element={<ChessLayout />}>
        <Route index element={<WelcomePanel />} />
        <Route path="daily-volume" element={<DailyVolumePage />} />
        <Route path="streak" element={<StreakPage />} />
        <Route path="when-to-play" element={<WhenToPlayPage />} />
        <Route path="goal" element={<GoalPage />} />
        <Route path="fide" element={<FidePage />} />
        <Route path="admin" element={<ChessAdminPanel />} />
      </Route>
    </Routes>
  );
}
