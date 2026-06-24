import { useEffect, useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { LoginButton } from './LoginButton';
import { SiteBlockToggle } from './SiteBlockToggle';

const OWNER_EMAIL = 'rose.louis.mail@gmail.com';

// Clickable avatar that opens a dropdown: name, an owner-only Blocking toggle,
// and Sign out. Shows a sign-in button when logged out. Shared by the top bar
// (avatar only) and the sidebar (avatar + name).
export function ProfileMenu({ showName = false }: { showName?: boolean }) {
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

  if (isLoading) return <span className="h-10 w-10 rounded-full bg-slate-800" />;
  if (!isAuthenticated || !user) return <LoginButton size="medium" redirectTo="" />;

  const isOwner = user.email === OWNER_EMAIL;
  const avatar = user.picture ? (
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
  );

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-3 focus:outline-none ${
          showName ? 'w-full rounded-xl p-1 text-left transition-colors hover:bg-slate-800/60' : 'rounded-full'
        }`}
      >
        {avatar}
        {showName && (
          <span className="truncate text-sm font-semibold text-slate-100">{user.name}</span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 w-max min-w-[12rem] overflow-hidden rounded-lg border border-slate-700 bg-slate-800 shadow-lg"
        >
          <div className="border-b border-slate-700 px-3 py-2.5">
            <p className="truncate text-sm font-medium text-slate-100">{user.name}</p>
          </div>
          {isOwner && <SiteBlockToggle />}
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
  );
}
