import { useState } from 'react';
import { Plus } from 'lucide-react';
import { FitSession } from './FitSession';

// Accueil tab. For now: start a new workout session. (Past sessions / stats
// will live here later.)

export function FitAccueil() {
  const [inSession, setInSession] = useState(false);

  if (inSession) return <FitSession onDone={() => setInSession(false)} />;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col items-center justify-center px-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] text-center">
      <button
        type="button"
        onClick={() => setInSession(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-4 text-lg font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-500"
      >
        <Plus className="h-5 w-5" />
        Nouvelle séance
      </button>
    </div>
  );
}
