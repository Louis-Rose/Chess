// Demo AlphaWise app routes - simplified copy of LUMNA investing app

import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { DemoAlphawiseLayout } from './DemoAlphawiseLayout';
import { WelcomePanel } from './panels/WelcomePanel';
import { PortfolioPanel } from './panels/PortfolioPanel';

export function DemoAlphawiseApp() {
  useEffect(() => {
    document.title = 'AlphaWise';
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (link) link.href = '/favicon-lumra.svg';
  }, []);

  return (
    <Routes>
      <Route element={<DemoAlphawiseLayout />}>
        <Route index element={<WelcomePanel />} />
        <Route path="portfolio" element={<PortfolioPanel />} />
      </Route>
    </Routes>
  );
}
