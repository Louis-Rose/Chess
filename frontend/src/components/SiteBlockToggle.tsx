import { Ban } from 'lucide-react';
import { useSiteBlock } from '../hooks/useSiteBlock';

// Owner-only row in the profile dropdown: flips site blocking on/off.
// Backed by /api/workblock; the Mac watcher polls the status and closes
// distracting tabs while it's on.
export function SiteBlockToggle() {
  const { blocking, busy, toggle } = useSiteBlock();

  return (
    <button
      type="button"
      role="menuitem"
      onClick={toggle}
      disabled={busy}
      className="flex w-full items-center justify-between gap-4 border-b border-slate-700 px-3 py-2.5 text-left text-sm text-slate-100 hover:bg-slate-700 disabled:opacity-60"
    >
      <span className="flex items-center gap-2">
        <Ban className="h-4 w-4 text-slate-400" />
        Site blocking
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
