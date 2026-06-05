import { useEffect, useRef, useState } from 'react';
import { Dumbbell, LogOut } from 'lucide-react';
import { useFitAuth } from './fitAuth';

// Top bar for the gym app:
//  - left: Google profile picture, click for a dropdown (Se déconnecter)
//  - center: "LUMNA" centered in the bar, with the dumbbell just to its left
//    (the icon is positioned absolutely so it doesn't shift the centering).
export function FitHeader() {
  const { user, logout } = useFitAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
      <div className="relative mx-auto flex h-14 max-w-md items-center px-5">
        {/* Profile picture + dropdown (left) */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="block rounded-full focus:outline-none"
          >
            {user?.picture ? (
              <img
                src={user.picture}
                alt={user.name ?? ''}
                referrerPolicy="no-referrer"
                className="h-9 w-9 rounded-full border border-slate-700"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-sm font-semibold">
                {(user?.name ?? '?').charAt(0).toUpperCase()}
              </span>
            )}
          </button>

          {open && (
            <div
              role="menu"
              className="absolute left-0 top-full mt-2 w-max overflow-hidden rounded-lg border border-slate-700 bg-slate-800 shadow-lg"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); logout(); }}
                className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2.5 text-left text-sm text-red-400 hover:bg-slate-700"
              >
                <LogOut className="h-4 w-4" />
                Se déconnecter
              </button>
            </div>
          )}
        </div>

        {/* App name centered; dumbbell sits just to its left without affecting centering */}
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2">
          <span className="relative text-lg font-bold tracking-wide">
            <Dumbbell className="absolute right-full top-1/2 mr-2 h-6 w-6 -translate-y-1/2 text-emerald-400" strokeWidth={2} />
            LUMNA
          </span>
        </div>
      </div>
    </header>
  );
}
