// Chess app routes

import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ChessLayout } from './ChessLayout';
import { WelcomePanel } from './panels/WelcomePanel';
import { MyDataPanel } from './panels/MyDataPanel';
import { WinPredictionPanel } from './panels/WinPredictionPanel';
import { OpeningsPanel } from './panels/OpeningsPanel';
import { DailyVolumePage } from './panels/DailyVolumePage';
import { GameNumberPage } from './panels/GameNumberPage';
import { StreakPage } from './panels/StreakPage';

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
        <Route path="my-data" element={<MyDataPanel />} />
        <Route path="daily-volume" element={<DailyVolumePage />} />
        <Route path="game-number" element={<GameNumberPage />} />
        <Route path="streak" element={<StreakPage />} />
        <Route path="win-prediction" element={<WinPredictionPanel />} />
        <Route path="openings" element={<OpeningsPanel />} />
      </Route>
    </Routes>
  );
}
