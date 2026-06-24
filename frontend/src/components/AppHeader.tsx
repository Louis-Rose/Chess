import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { LoginButton } from './LoginButton';
import { SiteBlockToggle } from './SiteBlockToggle';
import { LumnaLogo } from '../apps/chesscoaches/components/LumnaBrand';

const OWNER_EMAIL = 'rose.louis.mail@gmail.com';

// Shared top bar for the LUMNA sub-apps. Top-left holds, in order:
//   - the Google profile picture (click for a logout dropdown), or a sign-in
//     button when logged out — using the site-wide Google auth (useAuth);
//   - the LUMNA logo, which links back to the app chooser at "/".
// An optional title labels the current app.
export function AppHeader({ title }: { title?: string }) {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
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
    <header className="mb-6 flex items-center gap-3">
      {/* Profile / sign-in (far left) */}
      {isLoading ? (
        <span className="h-10 w-10 rounded-full bg-slate-800" />
      ) : isAuthenticated && user ? (
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={open}
            className="block rounded-full focus:outline-none"
          >
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name ?? ''}
                referrerPolicy="no-referrer"
                className="h-10 w-10 rounded-full border border-slate-700"
              />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-sm font-semibold">
                {(user.name || user.email || '?').charAt(0).toUpperCase()}
              </span>
            )}
          </button>

          {open && (
            <div
              role="menu"
              className="absolute left-0 top-full z-50 mt-2 w-max min-w-[12rem] overflow-hidden rounded-lg border border-slate-700 bg-slate-800 shadow-lg"
            >
              <div className="border-b border-slate-700 px-3 py-2.5">
                <p className="truncate text-sm font-medium text-slate-100">{user.name}</p>
                <p className="truncate text-xs text-slate-400">{user.email}</p>
              </div>
              {user.email === OWNER_EMAIL && <SiteBlockToggle />}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2.5 text-left text-sm text-red-400 hover:bg-slate-700"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      ) : (
        // Empty redirectTo: stay on the current app after signing in.
        <LoginButton size="medium" redirectTo="" />
      )}

      {/* LUMNA logo: back to the app chooser */}
      <Link
        to="/"
        aria-label="LUMNA home"
        className="transition-opacity hover:opacity-80"
      >
        <LumnaLogo className="h-8 w-8" />
      </Link>

      {title && <h1 className="text-xl font-bold tracking-wide">{title}</h1>}
    </header>
  );
}
