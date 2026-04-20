import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';

interface TimeSelectProps {
  value: string;           // "HH:MM" 24-hour internal format
  onChange: (v: string) => void;
  use24h: boolean;
  className?: string;
}

const SLOTS: { h: number; m: number }[] = [];
for (let h = 0; h < 24; h++) {
  for (const m of [0, 15, 30, 45]) SLOTS.push({ h, m });
}

function formatTime(h: number, m: number, use24h: boolean): string {
  if (use24h) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function TimeSelect({ value, onChange, use24h, className }: TimeSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [h, m] = value.split(':').map(Number);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current;
    const selected = el.querySelector<HTMLButtonElement>('[data-selected="true"]');
    if (selected) el.scrollTop = selected.offsetTop - el.clientHeight / 2 + selected.clientHeight / 2;
  }, [open]);

  const pick = (nh: number, nm: number) => {
    onChange(`${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 bg-slate-700 text-slate-100 text-xs rounded px-2 py-1 border border-slate-600 hover:border-slate-500 focus:border-blue-500 focus:outline-none tabular-nums"
      >
        <span>{formatTime(h, m, use24h)}</span>
        <Clock className="w-3 h-3 text-slate-400" />
      </button>
      {open && (
        <div
          ref={listRef}
          className="absolute z-40 top-full mt-1 left-0 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-56 overflow-y-auto"
        >
          {SLOTS.map(({ h: sh, m: sm }) => {
            const selected = sh === h && sm === m;
            return (
              <button
                key={`${sh}-${sm}`}
                type="button"
                data-selected={selected}
                onClick={() => pick(sh, sm)}
                className={`block w-24 text-center px-3 py-1 text-xs tabular-nums transition-colors ${
                  selected ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                {formatTime(sh, sm, use24h)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
