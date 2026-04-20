import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';

interface TimeSelectProps {
  value: string;           // "HH:MM" 24-hour internal format
  onChange: (v: string) => void;
  use24h: boolean;
  className?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

function formatTime(hhmm: string, use24h: boolean): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (use24h) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function TimeSelect({ value, onChange, use24h, className }: TimeSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
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
    if (!open || !hourListRef.current) return;
    const el = hourListRef.current;
    const selected = el.querySelector<HTMLButtonElement>('[data-selected="true"]');
    if (selected) el.scrollTop = selected.offsetTop - el.clientHeight / 2 + selected.clientHeight / 2;
  }, [open]);

  const pickHour = (newH: number) => {
    onChange(`${String(newH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  };
  const pickMinute = (newM: number) => {
    onChange(`${String(h).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 bg-slate-700 text-slate-100 text-xs rounded px-2 py-1 border border-slate-600 hover:border-slate-500 focus:border-blue-500 focus:outline-none tabular-nums"
      >
        <span>{formatTime(value, use24h)}</span>
        <Clock className="w-3 h-3 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-40 top-full mt-1 left-0 bg-slate-800 border border-slate-600 rounded-lg shadow-xl flex overflow-hidden">
          <div ref={hourListRef} className="max-h-56 overflow-y-auto scrollbar-thin">
            {HOURS.map(hh => {
              const selected = hh === h;
              const label = use24h
                ? String(hh).padStart(2, '0')
                : `${hh % 12 === 0 ? 12 : hh % 12} ${hh < 12 ? 'AM' : 'PM'}`;
              return (
                <button
                  key={hh}
                  type="button"
                  data-selected={selected}
                  onClick={() => pickHour(hh)}
                  className={`block w-20 text-center px-2 py-1 text-xs tabular-nums transition-colors ${
                    selected ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="max-h-56 overflow-y-auto border-l border-slate-700">
            {MINUTES.map(mm => {
              const selected = mm === m;
              return (
                <button
                  key={mm}
                  type="button"
                  onClick={() => pickMinute(mm)}
                  className={`block w-12 text-center px-2 py-1 text-xs tabular-nums transition-colors ${
                    selected ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {String(mm).padStart(2, '0')}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
