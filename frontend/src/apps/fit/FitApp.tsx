import { useEffect } from 'react';

// New native fitness app (replaces the old Notion-synced Gym page).
// French only, designed primarily for phone. Placeholder for now.
export function FitApp() {
  useEffect(() => {
    document.title = 'Mon Programme';
  }, []);

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 flex flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">Mon Programme</h1>
      <p className="mt-3 text-sm text-slate-400">Bientôt disponible.</p>
    </div>
  );
}
