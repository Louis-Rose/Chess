import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

// Shared pointer-based drag & drop (works on touch and mouse). The dragged item
// is captured, a floating clone follows the pointer (DragOverlay), and the
// consumer reacts via onMove (live feedback) / onDrop (commit). Used by the
// priority zones (drop into a zone) and the muscle order list (reorder).

export interface PointerDrag<T> { item: T; x: number; y: number; }

export function usePointerDrag<T>(opts: {
  onMove?: (item: T, x: number, y: number) => void;
  onDrop: (item: T, x: number, y: number) => void;
}) {
  const [drag, setDrag] = useState<PointerDrag<T> | null>(null);

  // Spread onto the draggable element: `{...bind(item)}`.
  const bind = (item: T) => ({
    style: { touchAction: 'none' as const },
    onPointerDown: (e: ReactPointerEvent) => {
      e.preventDefault();
      try { (e.target as Element).setPointerCapture(e.pointerId); } catch { /* ignore */ }
      setDrag({ item, x: e.clientX, y: e.clientY });
      opts.onMove?.(item, e.clientX, e.clientY);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      setDrag(d => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
      opts.onMove?.(item, e.clientX, e.clientY);
    },
    onPointerUp: (e: ReactPointerEvent) => {
      opts.onDrop(item, e.clientX, e.clientY);
      setDrag(null);
    },
    onPointerCancel: () => setDrag(null),
  });

  return { drag, bind };
}

// The lifted clone shown under the pointer while dragging (slightly enlarged).
export function DragOverlay({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 scale-105 drop-shadow-xl"
      style={{ left: x, top: y }}
    >
      {children}
    </div>
  );
}
