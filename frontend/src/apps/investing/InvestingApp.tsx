import { Navigate, Route, Routes } from 'react-router-dom';
import { InvestingLayout } from './InvestingLayout';
import { MyPortfolio } from './panels/MyPortfolio';
import { DataPanel } from './panels/DataPanel';

// Investing section: a sidebar shell wrapping two pages — My Portfolio (the
// signed-in user's own transactions) and Data (the public correlation tool).
export function InvestingApp() {
  return (
    <Routes>
      <Route element={<InvestingLayout />}>
        <Route index element={<Navigate to="portfolio" replace />} />
        <Route path="portfolio" element={<MyPortfolio />} />
        <Route path="data" element={<DataPanel />} />
        <Route path="*" element={<Navigate to="portfolio" replace />} />
      </Route>
    </Routes>
  );
}
