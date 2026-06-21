import { useEffect, useState } from 'react';
import { BarChart3, BookOpen, CalendarDays, Dumbbell, TrendingUp } from 'lucide-react';
import { FitAccueil } from './FitAccueil';
import { FitCalendrier } from './FitCalendrier';
import { FitPerformances } from './FitPerformances';
import { FitPrincipes } from './FitPrincipes';
import { FitBottomNav, type FitTab } from './FitBottomNav';
import { FitHeader } from './FitHeader';
import { FitProgramme } from './FitProgramme';
import { FitLogin } from './FitLogin';
import { FitAuthProvider, useFitAuth } from './fitAuth';
import { FitChrono } from './FitChrono';
import { requestSessionResume } from './sessionResume';

// New native fitness app (replaces the old Notion-synced Gym page).
// French only, designed primarily for phone. Per-user, with its own
// independent auth session (see fitAuth).

const TABS: FitTab[] = [
  { key: 'calendrier', label: 'Calendrier', Icon: CalendarDays },
  { key: 'performances', label: 'Progrès', Icon: TrendingUp },
  { key: 'programme', label: 'Programme', Icon: Dumbbell },
  { key: 'principes', label: 'Principes', Icon: BookOpen },
  { key: 'accueil', label: 'Stats', Icon: BarChart3 },
];

export function FitApp() {
  useEffect(() => {
    document.title = 'Mon programme';
  }, []);

  return (
    <FitAuthProvider>
      <FitAppInner />
    </FitAuthProvider>
  );
}

function FitAppInner() {
  const { isLoading, isAuthenticated } = useFitAuth();
  const [active, setActive] = useState(TABS[0].key);
  // Bumped whenever a tab is re-tapped while already active, so the content
  // remounts and resets to its root view (e.g. exits a session in progress).
  const [navNonce, setNavNonce] = useState(0);

  const select = (key: string) => {
    if (key === active) setNavNonce(n => n + 1);
    setActive(key);
  };

  // Tapping the session chrono reopens the in-progress session: jump to the tab
  // that hosts it (Calendrier) and flag it to resume on mount.
  const openSession = () => {
    requestSessionResume();
    select('calendrier');
  };

  if (isLoading) return <div className="min-h-dvh bg-slate-900" />;
  if (!isAuthenticated) return <FitLogin />;

  const current = TABS.find(t => t.key === active) ?? TABS[0];

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100">
      <FitHeader />
      {/* `sticky` just under the header: stays visible while scrolling, yet
          (unlike `fixed`) part of the scroll flow, so the iOS keyboard
          auto-scroll on input focus can't displace it. */}
      <FitChrono className="sticky top-[calc(3.5rem+1px)] z-10" onClick={openSession} />
      <main key={`${active}-${navNonce}`}>
        {active === 'programme' ? (
          <FitProgramme />
        ) : active === 'accueil' ? (
          <FitAccueil />
        ) : active === 'calendrier' ? (
          <FitCalendrier />
        ) : active === 'performances' ? (
          <FitPerformances />
        ) : active === 'principes' ? (
          <FitPrincipes />
        ) : (
          <div className="flex min-h-[calc(100dvh-3.5rem-1px)] flex-col items-center justify-center px-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] text-center">
            <h1 className="text-2xl font-semibold">{current.label}</h1>
            <p className="mt-3 text-sm text-slate-400">Bientôt disponible.</p>
          </div>
        )}
      </main>
      <FitBottomNav tabs={TABS} active={active} onSelect={select} />
    </div>
  );
}

