import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { MUSCLE_ORDER } from './programData';
import { usePointerDrag, DragOverlay } from './usePointerDrag';

// "Ordre" step for a fixed split: the split's planned sessions, each opening the
// ordered list of muscle groups it trains. Within a session, the muscle pills are
// dragged to reorder (same whole-pill drag as the priority step), the × removes a
// group, and the chips below add any group not already in the session.

export function FitSessionOrder({ sessions, labels, onReorder, onRemove, onAdd }: {
  sessions: string[][];
  labels: string[];
  onReorder: (index: number, muscles: string[]) => void;
  onRemove: (index: number, muscle: string) => void;
  onAdd: (index: number, muscle: string) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);

  if (open != null && open < sessions.length)
    return (
      <SessionMuscles
        index={open}
        label={labels[open] ?? `Séance ${open + 1}`}
        muscles={sessions[open]}
        onReorder={onReorder}
        onRemove={onRemove}
        onAdd={onAdd}
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

// One session's muscle groups: drag a pill to reorder, × to remove, chips to add.
function SessionMuscles({ index, label, muscles, onReorder, onRemove, onAdd, onBack }: {
  index: number;
  label: string;
  muscles: string[];
  onReorder: (index: number, muscles: string[]) => void;
  onRemove: (index: number, muscle: string) => void;
  onAdd: (index: number, muscle: string) => void;
  onBack: () => void;
}) {
  const [items, setItems] = useState<string[]>(muscles);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const committedRef = useRef(muscles);
  committedRef.current = muscles;
  const rowEls = useRef<Record<string, HTMLLIElement | null>>({});
  const dragging = useRef(false);

  // Resync from outside when not mid-drag (e.g. an add/remove changed the list).
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
      // Persist only a real reorder (a plain tap on a pill is a no-op).
      if (itemsRef.current.join('|') !== committedRef.current.join('|')) onReorder(index, itemsRef.current);
    },
  });

  const addable = MUSCLE_ORDER.filter(m => !items.includes(m));

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
        <ul className="flex flex-col items-center gap-2">
          {items.map(m => (
            <li key={m} ref={el => { rowEls.current[m] = el; }} className="flex w-full justify-center">
              <div className="relative w-full max-w-[13rem]" style={{ opacity: drag?.item === m ? 0.35 : 1 }}>
                <button
                  type="button"
                  aria-label={`Déplacer ${m}`}
                  {...bind(m)}
                  style={{ touchAction: 'none' }}
                  className={`w-full cursor-grab select-none rounded-full border bg-slate-800/50 px-8 py-2 text-center text-sm font-medium text-slate-200 active:cursor-grabbing ${
                    drag?.item === m ? 'border-emerald-500' : 'border-slate-700'
                  }`}
                >
                  {m}
                </button>
                <button
                  type="button"
                  aria-label={`Retirer ${m}`}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={() => onRemove(index, m)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-500 active:text-slate-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {addable.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-slate-500">Ajouter un groupe musculaire</p>
          <div className="flex flex-wrap justify-center gap-2">
            {addable.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => onAdd(index, m)}
                className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors active:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" />
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The lifted pill following the pointer while dragging. */}
      {drag && (
        <DragOverlay x={drag.x} y={drag.y}>
          <div className="rounded-full border border-emerald-500 bg-slate-800 px-8 py-2 text-center text-sm font-medium text-slate-100">
            {drag.item}
          </div>
        </DragOverlay>
      )}
    </div>
  );
}
