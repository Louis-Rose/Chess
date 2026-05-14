import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, LineChart } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type StocksTab = 'calendar' | 'dashboard';

const ITEMS: { id: StocksTab; label: string; icon: LucideIcon }[] = [
  { id: 'calendar', label: 'Earnings calendar', icon: CalendarDays },
  { id: 'dashboard', label: 'Stocks', icon: LineChart },
];

// Mirrors the main app's nav sidebar (see ChessCoachesLayout's CoachesNavSidebar):
// same slate-900 column, same NavLink-style item treatment.
export function StocksSidebar({ tab, onTab }: { tab: StocksTab; onTab: (t: StocksTab) => void }) {
  const navigate = useNavigate();

  const itemClass = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
      active ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
    }`;

  return (
    <div className="flex w-56 2xl:w-64 bg-slate-900 h-screen flex-col flex-shrink-0 border-r border-slate-800 sticky top-0">
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-0.5">
        <div className="flex items-center gap-2 px-3 py-2 mb-1">
          <LineChart className="w-6 h-6 text-emerald-400" />
          <span className="text-lg font-semibold text-white">Stocks</span>
        </div>

        <div className="h-px bg-slate-700 my-1.5" />

        <nav className="flex flex-col gap-0.5">
          {ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => onTab(id)} className={itemClass(tab === id)}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left">{label}</span>
            </button>
          ))}
        </nav>

        <div className="h-px bg-slate-700 my-1.5" />

        <button onClick={() => navigate('/app')} className={itemClass(false)}>
          <ArrowLeft className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 text-left">Back to app</span>
        </button>
      </div>
    </div>
  );
}
