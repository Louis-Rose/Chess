import { useEffect, useState } from 'react';
import { Dumbbell, ClipboardList, History } from 'lucide-react';
import { FitBottomNav, type FitTab } from './FitBottomNav';

// New native fitness app (replaces the old Notion-synced Gym page).
// French only, designed primarily for phone. Placeholder content for now.

const TABS: FitTab[] = [
  { key: 'programme', label: 'Programme', Icon: Dumbbell },
  { key: 'seance', label: 'Séance', Icon: ClipboardList },
  { key: 'historique', label: 'Historique', Icon: History },
];

export function FitApp() {
  const [active, setActive] = useState('programme');

  useEffect(() => {
    document.title = 'Mon Programme';
  }, []);

  const current = TABS.find(t => t.key === active) ?? TABS[0];

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100">
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 pb-24 text-center">
        <h1 className="text-2xl font-semibold">{current.label}</h1>
        <p className="mt-3 text-sm text-slate-400">Bientôt disponible.</p>
      </main>
      <FitBottomNav tabs={TABS} active={active} onSelect={setActive} />
    </div>
  );
}
