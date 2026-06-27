import { Outlet } from 'react-router-dom';
import { LineChart, Wallet } from 'lucide-react';
import { TabbedSidebarLayout, type TabNavItem } from '../../components/TabbedSidebarLayout';
import { useDisplayCurrency, type DisplayCurrency } from './currency';

// EUR/USD display-currency switch, shared app-wide via the currency context.
const CCY_SYMBOL: Record<DisplayCurrency, string> = { EUR: '€', USD: '$' };

function CurrencyToggle() {
  const { display, setDisplay } = useDisplayCurrency();
  return (
    <div className="flex overflow-hidden rounded-lg border border-slate-700 text-sm">
      {(['EUR', 'USD'] as DisplayCurrency[]).map((c) => (
        <button
          key={c}
          onClick={() => setDisplay(c)}
          className={`px-3 py-1.5 font-semibold transition-colors ${
            display === c
              ? 'bg-emerald-500/20 text-emerald-300'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          {c} {CCY_SYMBOL[c]}
        </button>
      ))}
    </div>
  );
}

const NAV: TabNavItem[] = [
  { to: '/investing/portfolio', label: 'My Portfolio', icon: Wallet },
  { to: '/investing/data', label: 'Data', icon: LineChart },
];

// Sidebar shell for the Investing section: the shared tabbed layout (desktop
// rail + collapsible mobile drawer) with the EUR/USD display switch in the
// header. The signed-in user and sign-out live in the rail's profile menu.
export function InvestingLayout() {
  return (
    <TabbedSidebarLayout title="Investing" nav={NAV} headerRight={<CurrencyToggle />}>
      <Outlet />
    </TabbedSidebarLayout>
  );
}
