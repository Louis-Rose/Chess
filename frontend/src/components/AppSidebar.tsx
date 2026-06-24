import { Link } from 'react-router-dom';
import { LogOut, Ban } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSiteBlock } from '../hooks/useSiteBlock';
import { LoginButton } from './LoginButton';
import { LumnaLogo } from '../apps/chesscoaches/components/LumnaBrand';

const OWNER_EMAIL = 'rose.louis.mail@gmail.com';

// Shared left rail for the LUMNA sub-apps (adapted from the Investing sidebar).
//   - top: LUMNA logo + wordmark, centered, links back to the app chooser;
//   - profile card: avatar + name (no email), an owner-only Blocking toggle,
//     and Sign out — or a sign-in button when logged out.
export function AppSidebar({ className = '' }: { className?: string }) {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const isOwner = user?.email === OWNER_EMAIL;

  return (
    <aside className={`w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-900 px-3 py-5 ${className}`}>
      <Link
        to="/"
        aria-label="LUMNA home"
        className="mb-6 flex items-center justify-center gap-2 transition-opacity hover:opacity-80"
      >
        <LumnaLogo className="h-7 w-7" />
        <span className="text-lg font-bold tracking-wide">LUMNA</span>
      </Link>

      {isLoading ? (
        <div className="h-20 rounded-xl border border-slate-800 bg-slate-800/40" />
      ) : isAuthenticated && user ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3">
          <div className="flex items-center gap-3">
            {user.picture ? (
              <img
                src={user.picture}
                alt=""
                referrerPolicy="no-referrer"
                className="h-10 w-10 shrink-0 rounded-full border border-slate-700"
              />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-sm font-semibold">
                {(user.name || user.email || '?').charAt(0).toUpperCase()}
              </span>
            )}
            <p className="truncate text-sm font-semibold text-slate-100">{user.name}</p>
          </div>

          {isOwner && <BlockingRow />}

          <button
            onClick={() => logout()}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      ) : (
        <LoginButton size="medium" redirectTo="" />
      )}
    </aside>
  );
}

function BlockingRow() {
  const { blocking, busy, toggle } = useSiteBlock();
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-label="Blocking"
      className="mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-slate-800 disabled:opacity-60"
    >
      <span className="flex items-center gap-2">
        <Ban className="h-4 w-4 text-slate-400" />
        Blocking
      </span>
      <span
        className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
          blocking ? 'bg-emerald-500' : 'bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
            blocking ? 'left-[18px]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}
