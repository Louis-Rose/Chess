import { useState } from 'react';
import { StocksSidebar, type StocksTab } from './StocksSidebar';
import { EarningsCalendar } from './EarningsCalendar';
import { StocksTable } from './StocksTable';

// Shell for the Stocks sub-app: a nav sidebar (matching the main app's) plus
// the active tab's content. "Earnings calendar" and "Stocks" are in-page tabs.
// The selected ticker lives here so it survives tab switches and so a click in
// the calendar can open that company in the Stocks tab.
export function StocksDashboard() {
  const [tab, setTab] = useState<StocksTab>('calendar');
  const [ticker, setTicker] = useState('');

  const openCompany = (t: string) => { setTicker(t); setTab('dashboard'); };

  return (
    <div className="flex min-h-dvh bg-slate-900 text-slate-100 font-sans">
      <StocksSidebar tab={tab} onTab={setTab} />
      <div className="flex-1 min-w-0">
        {tab === 'calendar'
          ? <EarningsCalendar onOpenCompany={openCompany} />
          : <StocksTable ticker={ticker} onTicker={setTicker} />}
      </div>
    </div>
  );
}
