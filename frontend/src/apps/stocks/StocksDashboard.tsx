import { useState } from 'react';
import { StocksSidebar, type StocksTab } from './StocksSidebar';
import { EarningsCalendar } from './EarningsCalendar';
import { StocksTable } from './StocksTable';

// Shell for the Stocks sub-app: a nav sidebar (matching the main app's) plus
// the active tab's content. "Earnings calendar" and "Stocks" are in-page tabs.
export function StocksDashboard() {
  const [tab, setTab] = useState<StocksTab>('calendar');

  return (
    <div className="flex min-h-dvh bg-slate-900 text-slate-100 font-sans">
      <StocksSidebar tab={tab} onTab={setTab} />
      <div className="flex-1 min-w-0">
        {tab === 'calendar' ? <EarningsCalendar /> : <StocksTable />}
      </div>
    </div>
  );
}
