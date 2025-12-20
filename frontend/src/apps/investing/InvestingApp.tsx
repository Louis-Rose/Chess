// Investing app routes

import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { InvestingLayout } from './InvestingLayout';
import { InvestingWelcomePanel } from './panels/WelcomePanel';
import { PortfolioPanel } from './panels/PortfolioPanel';
import { WatchlistPanel } from './panels/WatchlistPanel';

export function InvestingApp() {
  useEffect(() => {
    document.title = 'Investing';
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (link) link.href = '/favicon-investing.svg';
  }, []);

  return (
    <Routes>
      <Route element={<InvestingLayout />}>
        <Route index element={<InvestingWelcomePanel />} />
        <Route path="portfolio" element={<PortfolioPanel />} />
        <Route path="watchlist" element={<WatchlistPanel />} />
      </Route>
    </Routes>
  );
}
