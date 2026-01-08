// Investing app routes

import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { InvestingLayout } from './InvestingLayout';
import { InvestingWelcomePanel } from './panels/WelcomePanel';
import { PortfolioPanel } from './panels/PortfolioPanel';
import { WatchlistPanel } from './panels/WatchlistPanel';
import { EarningsCalendarPanel } from './panels/EarningsCalendarPanel';
import { FinancialsPanel } from './panels/FinancialsPanel';
import { NewsPanel } from './panels/NewsPanel';
import { StockDetailPanel } from './panels/StockDetailPanel';
import { AdminPanel } from './panels/AdminPanel';
import { UserDetailPanel } from './panels/UserDetailPanel';
import { StockViewDetailPanel } from './panels/StockViewDetailPanel';

export function InvestingApp() {
  useEffect(() => {
    document.title = 'LUMRA';
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    if (link) link.href = '/favicon-lumra.svg';
  }, []);

  return (
    <Routes>
      <Route element={<InvestingLayout />}>
        <Route index element={<InvestingWelcomePanel />} />
        <Route path="portfolio" element={<PortfolioPanel />} />
        <Route path="watchlist" element={<WatchlistPanel />} />
        <Route path="earnings" element={<EarningsCalendarPanel />} />
        <Route path="financials" element={<FinancialsPanel />} />
        <Route path="news" element={<NewsPanel />} />
        <Route path="stock/:ticker" element={<StockDetailPanel />} />
        <Route path="admin" element={<AdminPanel />} />
        <Route path="admin/user/:userId" element={<UserDetailPanel />} />
        <Route path="admin/stock/:ticker" element={<StockViewDetailPanel />} />
      </Route>
    </Routes>
  );
}
