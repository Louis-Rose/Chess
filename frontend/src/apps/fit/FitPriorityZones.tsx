import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { MUSCLES, type MusclePriority, type Priorities } from './programData';

// Three priority zones a muscle can be dragged into. Muscles default to Neutre
// (stored as absent from the priorities map); weak points lead the session,
// strong points close it. Drag & drop is pointer-based so it works on touch and
// mouse alike — a muscle is dropped into whichever zone box is under the pointer.

type Zone = 'weak' | 'neutral' | 'strong';

const ZONES: { key: Zone; title: string; hint: string; state: MusclePriority | null }[] = [
  { key: 'weak', title: 'Points faibles', hint: 'début de séance', state: 'weak' },
  { key: 'neutral', title: 'Neutre', hint: '', state: null },
  { key: 'strong', title: 'Points forts', hint: 'fin de séance', state: 'strong' },
];

const zoneOf = (p: MusclePriority | undefined): Zone =>
  p === 'weak' ? 'weak' : p === 'strong' ? 'strong' : 'neutral';

export function FitPriorityZones({ priorities, setPriority }: {
  priorities: Priorities;
  setPriority: (muscle: string, state: MusclePriority | null) => void;
}) {
  const zoneEls = useRef<Record<Zone, HTMLDivElement | null>>({ weak: null, neutral: null, strong: null });
  const [drag, setDrag] = useState<{ muscle: string; x: number; y: number } | null>(null);
  const [hover, setHover] = useState<Zone | null>(null);

  // The zone whose box contains the point, if any.
  const zoneAt = (x: number, y: number): Zone | null => {
    for (const z of ZONES) {
      const r = zoneEls.current[z.key]?.getBoundingClientRect();
      if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return z.key;
    }
    return null;
  };

  const onDown = (muscle: string) => (e: ReactPointerEvent) => {
    e.preventDefault();
    try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    setDrag({ muscle, x: e.clientX, y: e.clientY });
    setHover(zoneOf(priorities[muscle]));
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
    setHover(zoneAt(e.clientX, e.clientY));
  };
  const onUp = (e: ReactPointerEvent) => {
    if (!drag) return;
    const z = zoneAt(e.clientX, e.clientY);
    if (z) setPriority(drag.muscle, ZONES.find(zz => zz.key === z)!.state);
    setDrag(null);
    setHover(null);
  };
  const onCancel = () => { setDrag(null); setHover(null); };

  return (
    <div className="flex flex-col">
      {ZONES.map((z, i) => {
        const muscles = MUSCLES.filter(m => zoneOf(priorities[m.name]) === z.key);
        const accent = z.key === 'weak' ? 'text-emerald-300' : z.key === 'strong' ? 'text-amber-300' : 'text-slate-300';
        return (
          <div
            key={z.key}
            ref={el => { zoneEls.current[z.key] = el; }}
            className={`flex flex-col gap-2 rounded-xl px-2 py-3 transition-colors ${i > 0 ? 'mt-1 border-t border-slate-800' : ''} ${
              drag && hover === z.key ? 'bg-slate-800/40' : ''
            }`}
          >
            <div className="flex items-baseline justify-center gap-2">
              <span className={`inline-flex items-center gap-1 text-sm font-semibold ${accent}`}>
                {z.key === 'weak' && <ArrowUp className="h-3.5 w-3.5" />}
                {z.key === 'strong' && <ArrowDown className="h-3.5 w-3.5" />}
                {z.title}
              </span>
              {z.hint && <span className="text-xs text-slate-500">{z.hint}</span>}
            </div>

            <div className="flex min-h-[2.75rem] flex-wrap content-center justify-center gap-2">
              {muscles.length === 0 ? (
                <span className="self-center text-xs text-slate-600">Glisse un muscle ici</span>
              ) : (
                muscles.map(m => (
                  <button
                    key={m.name}
                    type="button"
                    onPointerDown={onDown(m.name)}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onCancel}
                    style={{ touchAction: 'none', opacity: drag?.muscle === m.name ? 0.35 : 1 }}
                    className={`cursor-grab touch-none select-none rounded-full border px-3 py-1.5 text-sm font-medium transition-colors active:cursor-grabbing ${
                      z.key === 'weak' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-200'
                        : z.key === 'strong' ? 'border-amber-500 bg-amber-500/10 text-amber-200'
                        : 'border-slate-700 bg-slate-800/50 text-slate-200'
                    }`}
                  >
                    {m.name}
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}

      {/* The chip floating under the pointer while dragging. */}
      {drag && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-500 bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-100 shadow-lg"
          style={{ left: drag.x, top: drag.y }}
        >
          {drag.muscle}
        </div>
      )}
    </div>
  );
}
