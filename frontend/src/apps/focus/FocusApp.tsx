import { useEffect } from 'react';
import { Ban } from 'lucide-react';
import { AppHeader } from '../../components/AppHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteBlock } from '../../hooks/useSiteBlock';

const OWNER_EMAIL = 'rose.louis.mail@gmail.com';
const BLOCKED_SITES = ['youtube.com', 'linkedin.com', 'chess.com'];

// Owner-only page at /focus: a big switch for site blocking (same state as the
// profile-menu toggle). While on, the local Mac watcher closes distracting tabs.
export function FocusApp() {
  useEffect(() => {
    document.title = 'Focus | LUMNA';
  }, []);

  const { user } = useAuth();
  const isOwner = user?.email === OWNER_EMAIL;

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-8">
        <AppHeader title="Focus" />

        {isOwner ? (
          <FocusPanel />
        ) : (
          <p className="rounded-2xl border border-slate-800 bg-slate-800/40 p-8 text-center text-sm text-slate-400">
            This is a private tool. Sign in as the owner to use it.
          </p>
        )}
      </div>
    </div>
  );
}

function FocusPanel() {
  const { blocking, busy, toggle } = useSiteBlock();

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Site blocking</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            {blocking ? 'On. Distracting tabs are being closed.' : 'Off.'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          role="switch"
          aria-checked={blocking}
          aria-label="Site blocking"
          className={`relative h-8 w-14 flex-shrink-0 rounded-full transition-colors disabled:opacity-60 ${
            blocking ? 'bg-emerald-500' : 'bg-slate-600'
          }`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
              blocking ? 'left-[26px]' : 'left-1'
            }`}
          />
        </button>
      </div>

      <div className="mt-6 border-t border-slate-700 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Blocked while on
        </p>
        <ul className="flex flex-wrap gap-2">
          {BLOCKED_SITES.map((s) => (
            <li
              key={s}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/50 px-2.5 py-1 text-sm text-slate-300"
            >
              <Ban className="h-3.5 w-3.5 text-slate-500" />
              {s}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
