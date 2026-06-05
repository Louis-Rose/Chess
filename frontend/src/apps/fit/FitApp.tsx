import { useEffect, useState } from 'react';
import { CalendarDays, Dumbbell, TrendingUp } from 'lucide-react';
import { FitBottomNav, type FitTab } from './FitBottomNav';
import { FitProgramme } from './FitProgramme';
import { FitLogin } from './FitLogin';
import { FitAuthProvider, useFitAuth } from './fitAuth';

// New native fitness app (replaces the old Notion-synced Gym page).
// French only, designed primarily for phone. Per-user, with its own
// independent auth session (see fitAuth).

const TABS: FitTab[] = [
  { key: 'calendrier', label: 'Calendrier', Icon: CalendarDays },
  { key: 'programme', label: 'Programme', Icon: Dumbbell },
  { key: 'performances', label: 'Performances', Icon: TrendingUp },
];

export function FitApp() {
  useEffect(() => {
    document.title = 'Mon Programme';
  }, []);

  return (
    <FitAuthProvider>
      <FitAppInner />
    </FitAuthProvider>
  );
}

function FitAppInner() {
  const { isLoading, isAuthenticated } = useFitAuth();
  const [active, setActive] = useState('calendrier');

  if (isLoading) return <div className="min-h-dvh bg-slate-900" />;
  if (!isAuthenticated) return <FitLogin />;

  const current = TABS.find(t => t.key === active) ?? TABS[0];

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100">
      <main className="min-h-dvh">
        {active === 'programme' ? (
          <FitProgramme />
        ) : (
          <div className="flex min-h-dvh flex-col items-center justify-center px-6 pb-24 text-center">
            <h1 className="text-2xl font-semibold">{current.label}</h1>
            <p className="mt-3 text-sm text-slate-400">Bientôt disponible.</p>
          </div>
        )}
      </main>
      <FitBottomNav tabs={TABS} active={active} onSelect={setActive} />
    </div>
  );
}
