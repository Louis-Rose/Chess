import { useEffect, useState } from 'react';
import { useRestStart } from './restTimer';
import { useSession } from './sessionTimer';

// "M:SS" (or "H:MM:SS" past an hour) elapsed since a start timestamp.
function clockLabel(startMs: number, nowMs: number) {
  const secs = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = String(secs % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// The workout chronos in one bubble. The "Séance" line runs the whole session
// (ends only via "Terminer la séance"); the "Repos" line counts since the last
// logged set. Ticks once a second; returns null when idle. `className` styles
// the outer row (e.g. sticky positioning); it's reused both under the app
// header and inside the full-screen exercise picker.
// `onClick` (passed only under the app header) reopens the in-progress session.
export function FitChrono({ className, onClick }: { className?: string; onClick?: () => void }) {
  const session = useSession();
  const restStart = useRestStart();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const active = session != null || restStart != null;

  useEffect(() => {
    if (!active) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  if (!active) return null;

  const Tag = onClick ? 'button' : 'div';
  return (
    <div className={`pointer-events-none flex justify-center px-5 pt-2 pb-1 ${className ?? ''}`}>
      <Tag
        {...(onClick ? { type: 'button' as const, onClick } : {})}
        className={`pointer-events-auto grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-1.5 text-sm tabular-nums shadow ${
          onClick ? 'transition-colors active:bg-slate-700' : ''
        }`}
      >
        {session != null && (
          <>
            <span className="text-slate-400">Séance</span>
            <span className="text-right font-semibold text-emerald-400">{clockLabel(session.start, nowMs)}</span>
          </>
        )}
        {restStart != null && (
          <>
            <span className="text-slate-400">Repos</span>
            <span className="text-right font-semibold text-emerald-400">{clockLabel(restStart, nowMs)}</span>
          </>
        )}
      </Tag>
    </div>
  );
}
