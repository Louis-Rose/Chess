// Chess app routes

import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ChessLayout } from './ChessLayout';
import { WelcomePanel } from './panels/WelcomePanel';
import { MyDataPanel } from './panels/MyDataPanel';
import { WinPredictionPanel } from './panels/WinPredictionPanel';
import { OpeningsPanel } from './panels/OpeningsPanel';

export function ChessApp() {
  useEffect(() => {
    document.title = 'Improve at Stuff';
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (link) link.href = '/favicon.svg';
  }, []);

  return (
    <Routes>
      <Route element={<ChessLayout />}>
        <Route index element={<WelcomePanel />} />
        <Route path="my-data" element={<MyDataPanel />} />
        <Route path="win-prediction" element={<WinPredictionPanel />} />
        <Route path="openings" element={<OpeningsPanel />} />
      </Route>
    </Routes>
  );
}
