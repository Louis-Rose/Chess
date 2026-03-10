// Chess Coaches app routes

import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { ChessCoachesLayout } from './ChessCoachesLayout';
import { ScoresheetPanel } from './panels/ScoresheetPanel';

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
      </Route>
    </Routes>
  );
}
