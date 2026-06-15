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
import { useSession } from './sessionTimer';

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

// "M:SS" (or "H:MM:SS" past an hour) elapsed since a start timestamp.
function clockLabel(startMs: number, nowMs: number) {
  const secs = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = String(secs % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// The workout chronos, in one bubble `sticky` just under the header: it stays
// visible while scrolling, yet (unlike `fixed`) is part of the scroll flow, so
// the iOS keyboard auto-scroll on input focus can't displace it. Shown on every
// tab so it persists while navigating. The "Séance" line runs the whole session
// (ends only via "Terminer la séance"); the "Repos" line counts since the last
// logged set and its X clears it. Ticks once a second.
function FitRestBar() {
  const session = useSession();
  const restStart = useRestStart();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const active = session != null || restStart != null;

  useEffect(() => {
    if (!active) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;

  return (
    <div className="pointer-events-none sticky top-[calc(3.5rem+1px)] z-10 flex justify-center px-5 pt-2 pb-1">
      <div className="pointer-events-auto inline-flex flex-col items-center gap-0.5 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-1.5 text-sm tabular-nums shadow">
        {session != null && (
          <span className="flex items-center gap-2">
            <span className="text-slate-400">Séance</span>
            <span className="font-semibold text-emerald-400">{clockLabel(session.start, nowMs)}</span>
          </span>
        )}
        {restStart != null && (
          <span className="flex items-center gap-2">
            <span className="text-slate-400">Repos</span>
            <span className="font-semibold text-emerald-400">{clockLabel(restStart, nowMs)}</span>
            <button
              type="button"
              onClick={clearRest}
              aria-label="Fermer le chrono de repos"
              className="-mr-1.5 ml-0.5 p-1 text-slate-500 transition-colors active:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
