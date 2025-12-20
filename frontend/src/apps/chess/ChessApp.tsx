// Chess app routes

import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ChessLayout } from './ChessLayout';
import { WelcomePanel } from './panels/WelcomePanel';
import { ProsTipsPanel } from './panels/ProsTipsPanel';
import { MyDataPanel } from './panels/MyDataPanel';
import { WinPredictionPanel } from './panels/WinPredictionPanel';
import { WeaknessesPanel } from './panels/WeaknessesPanel';
import { OpeningsPanel } from './panels/OpeningsPanel';
import { MiddleGamePanel } from './panels/MiddleGamePanel';
import { EndGamePanel } from './panels/EndGamePanel';

export function ChessApp() {
  useEffect(() => {
    document.title = 'Improve at Chess';
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (link) link.href = '/favicon.svg';
  }, []);

  return (
    <Routes>
      <Route element={<ChessLayout />}>
        <Route index element={<WelcomePanel />} />
        <Route path="pros-tips" element={<ProsTipsPanel />} />
        <Route path="my-data" element={<MyDataPanel />} />
        <Route path="win-prediction" element={<WinPredictionPanel />} />
        <Route path="weaknesses" element={<WeaknessesPanel />} />
        <Route path="openings" element={<OpeningsPanel />} />
        <Route path="middle-game" element={<MiddleGamePanel />} />
        <Route path="end-game" element={<EndGamePanel />} />
      </Route>
    </Routes>
  );
}
