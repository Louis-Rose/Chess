import { lazy, Suspense, useEffect } from 'react';

const FideDashboard = lazy(() => import('./FideDashboard').then(m => ({ default: m.FideDashboard })));

// Public on purpose: the link is pinned in the crew's Messenger chat, so anyone
// with it can open the rankings. The page only shows public FIDE data.
export function FideApp() {
  useEffect(() => {
    document.title = 'Blitz Crew Fide Rankings';
  }, []);

  return (
    <Suspense fallback={<div className="h-dvh bg-slate-900" />}>
      <FideDashboard />
    </Suspense>
  );
}
