import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { FitSwipeRow } from './FitSwipeRow';
import { usePointerDrag, DragOverlay } from './usePointerDrag';
import type { MusclePriority, Priorities } from './programData';

// "Ordre" step for a fixed split: the split's planned sessions, each opening the
// ordered list of muscle groups it trains. Within a session, dragging the grip
// handle reorders the muscles and swiping a row left removes that muscle group
// from the session. Edits persist per session via the editor (session_order).

function Badge({ p }: { p?: MusclePriority }) {
  if (p === 'weak') return <span className="ml-2 text-xs text-red-300">point faible</span>;
  if (p === 'strong') return <span className="ml-2 text-xs text-emerald-300">point fort</span>;
  return null;
}

export function FitSessionOrder({ sessions, labels, priorities, onReorder, onRemove }: {
  sessions: string[][];
  labels: string[];
  priorities: Priorities;
  onReorder: (index: number, muscles: string[]) => void;
  onRemove: (index: number, muscle: string) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);

  if (open != null && open < sessions.length)
    return (
      <SessionMuscles
        index={open}
        label={labels[open] ?? `Séance ${open + 1}`}
        muscles={sessions[open]}
        priorities={priorities}
        onReorder={onReorder}
        onRemove={onRemove}
        onBack={() => setOpen(null)}
      />
    );

  // The list of sessions; tap one to edit its muscle order.
  return (
    <div className="mx-auto flex w-full max-w-[20rem] flex-col gap-2">
      {sessions.map((muscles, i) => (
        <button
          key={i}
          type="button"
          onClick={() => setOpen(i)}
          className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-left transition-colors active:bg-slate-800"
        >
          <span className="min-w-0 flex-1">
            <span className="text-sm font-medium text-slate-400">Séance {i + 1}</span>
            <span className="mx-1.5 text-slate-600">·</span>
            <span className="text-sm text-slate-100">{labels[i] ?? `Séance ${i + 1}`}</span>
            <span className="mt-0.5 block truncate text-xs text-slate-500">
              {muscles.length ? muscles.join(' · ') : 'Aucun groupe'}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-500" />
        </button>
      ))}
    </div>
  );
}

// One session's muscle groups: drag the grip to reorder, swipe a row to remove.
function SessionMuscles({ index, label, muscles, priorities, onReorder, onRemove, onBack }: {
  index: number;
  label: string;
  muscles: string[];
  priorities: Priorities;
  onReorder: (index: number, muscles: string[]) => void;
  onRemove: (index: number, muscle: string) => void;
  onBack: () => void;
}) {
  const [items, setItems] = useState<string[]>(muscles);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const committedRef = useRef(muscles);
  committedRef.current = muscles;
  const rowEls = useRef<Record<string, HTMLLIElement | null>>({});
  const dragging = useRef(false);
  const [openRow, setOpenRow] = useState<string | null>(null);

  // Resync from outside when not mid-drag (e.g. a removal shrank the session).
  useEffect(() => { if (!dragging.current) setItems(muscles); }, [muscles]);

  const { drag, bind } = usePointerDrag<string>({
    // Live reorder: move the dragged muscle to whichever row the pointer is over.
    onMove: (muscle, _x, y) => {
      dragging.current = true;
      setItems(prev => {
        const from = prev.indexOf(muscle);
        if (from < 0) return prev;
        let to = from;
        for (let i = 0; i < prev.length; i++) {
          const r = rowEls.current[prev[i]]?.getBoundingClientRect();
          if (r && y >= r.top && y <= r.bottom) { to = i; break; }
        }
        if (to === from) return prev;
        const n = [...prev]; n.splice(from, 1); n.splice(to, 0, muscle); return n;
      });
    },
    onDrop: () => {
      dragging.current = false;
      // Persist only a real reorder (a plain tap on the handle is a no-op).
      if (itemsRef.current.join('|') !== committedRef.current.join('|')) onReorder(index, itemsRef.current);
    },
  });

  // The grip handle owns the drag; stop the pointer from also reaching the swipe
  // row (which would otherwise start a horizontal swipe at the same time).
  const handle = (m: string) => {
    const b = bind(m);
    return { ...b, onPointerDown: (e: ReactPointerEvent) => { e.stopPropagation(); b.onPointerDown(e); } };
  };

  return (
    <div className="mx-auto flex w-full max-w-[20rem] flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 self-start text-sm text-slate-400 transition-colors active:text-slate-200"
      >
        <ChevronLeft className="h-4 w-4" />
        Séances
      </button>
      <p className="text-center text-sm">
        <span className="font-medium text-slate-400">Séance {index + 1}</span>
        <span className="mx-1.5 text-slate-600">·</span>
        <span className="text-slate-100">{label}</span>
      </p>

      {items.length === 0 ? (
        <p className="rounded-lg bg-slate-800/40 px-3.5 py-2.5 text-center text-sm text-slate-400">
          Aucun groupe musculaire pour cette séance.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map(m => (
            <li key={m} ref={el => { rowEls.current[m] = el; }} style={{ opacity: drag?.item === m ? 0.35 : 1 }}>
              <FitSwipeRow
                isOpen={openRow === m}
                onOpen={() => setOpenRow(m)}
                onClose={() => setOpenRow(null)}
                onDelete={() => { setOpenRow(null); onRemove(index, m); }}
                className={`flex items-center gap-2 px-3 py-2.5 ${drag?.item === m ? 'border-emerald-500' : 'border-slate-700'}`}
              >
                <span className="flex-1 text-left text-sm text-slate-100">{m}<Badge p={priorities[m]} /></span>
                <span
                  aria-label={`Déplacer ${m}`}
                  {...handle(m)}
                  style={{ touchAction: 'none' }}
                  className="-mr-1 cursor-grab p-1 text-slate-500 active:cursor-grabbing"
                >
                  <GripVertical className="h-5 w-5" />
                </span>
              </FitSwipeRow>
            </li>
          ))}
        </ul>
      )}

      {/* The lifted row following the pointer while dragging. */}
      {drag && (
        <DragOverlay x={drag.x} y={drag.y}>
          <div className="flex w-[18rem] items-center gap-2 rounded-2xl border border-emerald-500 bg-slate-800 px-3 py-2.5">
            <span className="flex-1 text-left text-sm text-slate-100">{drag.item}<Badge p={priorities[drag.item]} /></span>
            <GripVertical className="h-5 w-5 text-slate-500" />
          </div>
        </DragOverlay>
      )}
    </div>
  );
}
