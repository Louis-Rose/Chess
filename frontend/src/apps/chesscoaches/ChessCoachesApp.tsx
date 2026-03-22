// Chess Coaches app routes

import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ChessCoachesLayout } from './ChessCoachesLayout';
import { ScoresheetPanel } from './panels/ScoresheetPanel';
import { ScoresheetReadPage } from './panels/ScoresheetReadPage';
import { StudentsPanel } from './panels/StudentsPanel';
import { MistakeFinderPanel } from './panels/MistakeFinderPanel';
import { DiagramToFenPanel } from './panels/DiagramToFenPanel';

export function ChessCoachesApp() {
  useEffect(() => {
    document.title = 'LUMNA — Chess Coaches';
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (link) link.href = '/favicon.svg';
  }, []);

  return (
    <Routes>
      <Route element={<ChessCoachesLayout />}>
        <Route index element={<ScoresheetPanel />} />
        <Route path="students" element={<StudentsPanel />} />
        <Route path="scoresheets" element={<ScoresheetReadPage />} />
        <Route path="mistakes" element={<MistakeFinderPanel />} />
        <Route path="diagram" element={<DiagramToFenPanel />} />
      </Route>
    </Routes>
  );
}
