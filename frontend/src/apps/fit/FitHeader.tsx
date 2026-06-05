import { Dumbbell } from 'lucide-react';
import { useFitAuth } from './fitAuth';

// Top bar for the gym app: dumbbell + LUMNA on the left, the user's Google
// profile picture on the right.
export function FitHeader() {
  const { user } = useFitAuth();
  return (
    <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-md items-center px-5">
        <div className="flex flex-1 items-center gap-2">
          <Dumbbell className="h-6 w-6 text-emerald-400" strokeWidth={2} />
          <span className="text-lg font-bold tracking-wide">LUMNA</span>
        </div>
        {user?.picture && (
          <img
            src={user.picture}
            alt={user.name ?? ''}
            referrerPolicy="no-referrer"
            className="h-8 w-8 rounded-full border border-slate-700"
          />
        )}
      </div>
    </header>
  );
}
