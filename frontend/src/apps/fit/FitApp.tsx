import { useEffect, useState } from 'react';
import { BookOpen, CalendarDays, Dumbbell, Home, TrendingUp, X } from 'lucide-react';
import { FitAccueil } from './FitAccueil';
import { FitCalendrier } from './FitCalendrier';
import { FitPerformances } from './FitPerformances';
import { FitPrincipes } from './FitPrincipes';
import { FitBottomNav, type FitTab } from './FitBottomNav';
import { FitHeader } from './FitHeader';
import { FitProgramme } from './FitProgramme';
import { FitLogin } from './FitLogin';
import { FitAuthProvider, useFitAuth } from './fitAuth';
import { useRestStart, clearRest } from './restTimer';

// New native fitness app (replaces the old Notion-synced Gym page).
// French only, designed primarily for phone. Per-user, with its own
// independent auth session (see fitAuth).

const TABS: FitTab[] = [
  { key: 'accueil', label: 'Accueil', Icon: Home },
  { key: 'principes', label: 'Principes', Icon: BookOpen },
  { key: 'programme', label: 'Programme', Icon: Dumbbell },
  { key: 'calendrier', label: 'Calendrier', Icon: CalendarDays },
  { key: 'performances', label: 'Suivi', Icon: TrendingUp },
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
  const [active, setActive] = useState('accueil');
  // Bumped whenever a tab is re-tapped while already active, so the content
  // remounts and resets to its root view (e.g. exits "Nouvelle séance").
  const [navNonce, setNavNonce] = useState(0);

  const select = (key: string) => {
    if (key === active) setNavNonce(n => n + 1);
    setActive(key);
  };

  if (isLoading) return <div className="min-h-dvh bg-slate-900" />;
  if (!isAuthenticated) return <FitLogin />;

  const current = TABS.find(t => t.key === active) ?? TABS[0];

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100">
      <FitHeader />
      <FitRestBar />
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

// Rest timer since the last logged set. In normal flow (scrolls with the page,
// so the iOS keyboard can't displace it) just under the header; shown on every
// tab so it persists while navigating. Ticks once a second; X clears it.
function FitRestBar() {
  const restStart = useRestStart();
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    if (restStart == null) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [restStart]);

  if (restStart == null) return null;

  const secs = Math.max(0, Math.floor((nowMs - restStart) / 1000));
  const label = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  return (
    <div className="flex justify-center px-5 pt-2">
      <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/60 px-4 py-1 text-sm tabular-nums">
        <span className="text-slate-400">Repos</span>
        <span className="font-semibold text-emerald-400">{label}</span>
        <button
          type="button"
          onClick={clearRest}
          aria-label="Fermer le chrono"
          className="-mr-1.5 ml-0.5 p-1 text-slate-500 transition-colors active:text-slate-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
