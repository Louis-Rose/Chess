import { useEffect, useRef, useState } from 'react';
import { LogOut, Focus, type LucideIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { LoginButton } from './LoginButton';
import { FocusSettingsModal } from '../apps/focus/FocusSettings';

// An app-specific action injected into the menu (e.g. a "Disconnect" action).
export interface ProfileMenuItem {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

// Clickable avatar that opens a dropdown: name, email, and Sign out. Shows a
// sign-in button when logged out. Shared by the top bar (avatar only) and the
// sidebar (avatar + name). `extraItems` lets an app add its own actions above
// Sign out.
export function ProfileMenu({
  showName = false,
  extraItems = [],
}: {
  showName?: boolean;
  extraItems?: ProfileMenuItem[];
}) {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  if (isLoading) return <span className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-800" />;
  if (!isAuthenticated || !user) return <LoginButton size="medium" redirectTo="" />;

  const avatar = user.picture ? (
    <img
      src={user.picture}
      alt=""
      referrerPolicy="no-referrer"
      className="h-10 w-10 shrink-0 rounded-full border border-slate-200 dark:border-slate-700"
    />
  ) : (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800">
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
          showName
            ? 'w-full justify-center rounded-xl border border-slate-200 bg-slate-100 p-2 transition-colors hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-700/60'
            : 'rounded-full'
        }`}
      >
        {avatar}
        {showName && (
          <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{user.name}</span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 w-max min-w-[12rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="border-b border-slate-200 px-3 py-2.5 dark:border-slate-700">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{user.name}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setFocusOpen(true);
            }}
            className="flex w-full items-center gap-2 whitespace-nowrap border-b border-slate-200 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Focus className="h-4 w-4" />
            Focus
          </button>
          {extraItems.map(({ icon: Icon, label, onClick, danger }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onClick();
              }}
              className={`flex w-full items-center gap-2 whitespace-nowrap border-b border-slate-200 px-3 py-2.5 text-left text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-700 ${
                danger ? 'text-red-400' : 'text-slate-700 dark:text-slate-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="flex w-full items-center gap-2 whitespace-nowrap px-3 py-2.5 text-left text-sm text-red-400 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}

      {focusOpen && <FocusSettingsModal onClose={() => setFocusOpen(false)} />}
    </div>
  );
}
