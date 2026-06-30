import { type ReactNode, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, Brain } from 'lucide-react';

// A circled brain that reveals a model's reasoning on hover. The tooltip is
// rendered into <body> (fixed position) so a table's scroll container can't clip
// it. It is sized to the viewport (capped height + internal scroll) and
// repositioned to stay fully on screen, however long the reasoning is. It stays
// open while the pointer is over the tooltip itself, so long text can be scrolled.
// Shared by Étape 1 (per-page cell) and Étape 2 (the PAGE row of the parts table).
const MARGIN = 12;

export function ReasoningBadge({
  content,
  label,
  reasons,
}: {
  content: ReactNode;
  label: string;
  reasons: boolean;
}) {
  const iconRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ left: 0, top: 0 });

  // Center horizontally on the icon (clamped to the viewport) and prefer placing
  // the box above the icon; if it doesn't fit there, drop below, then clamp so
  // the top stays on screen and the internal scroll handles the overflow.
  const place = useCallback(() => {
    const icon = iconRef.current?.getBoundingClientRect();
    if (!icon) return;
    const tip = tipRef.current?.getBoundingClientRect();
    const w = tip?.width ?? 0;
    const h = tip?.height ?? 0;
    const left = Math.min(Math.max(icon.left + icon.width / 2, w / 2 + MARGIN), window.innerWidth - w / 2 - MARGIN);
    let top = icon.top - MARGIN - h;
    if (top < MARGIN) top = Math.min(icon.bottom + MARGIN, window.innerHeight - h - MARGIN);
    if (top < MARGIN) top = MARGIN;
    setCoords({ left, top });
  }, []);

  // Measure once mounted, then re-place. Re-measure on the next frame too, since
  // wrapping/height settles after the first paint.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  const openTip = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <span ref={iconRef} onMouseEnter={openTip} onMouseLeave={scheduleClose} className="inline-flex">
      <span className="inline-flex items-center justify-center rounded-full border border-slate-300 p-0.5 text-slate-400 transition-colors hover:border-emerald-500 hover:text-emerald-600 dark:border-slate-600 dark:text-slate-500 dark:hover:border-emerald-400 dark:hover:text-emerald-400">
        {reasons ? <Brain className="h-3 w-3" aria-label={label} /> : <ArrowUp className="h-3 w-3" aria-label={label} />}
      </span>
      {open &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            onMouseEnter={openTip}
            onMouseLeave={scheduleClose}
            style={{ position: 'fixed', left: coords.left, top: coords.top, transform: 'translateX(-50%)' }}
            className="z-50 max-h-[92vh] w-[52rem] max-w-[94vw] overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white px-5 py-4 text-left text-sm font-normal leading-relaxed text-slate-700 shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}
