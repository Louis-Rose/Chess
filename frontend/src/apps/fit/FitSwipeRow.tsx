import { useEffect, useRef, useState, type ReactNode } from 'react';

// A card that slides left to reveal a red "Supprimer" button behind it.
// Shared by every list in the app that supports swipe-to-delete (Calendrier
// sessions, in-session exercises, …). The parent owns the open/closed state so
// only one row in a list is open at a time.

const REVEAL = 88; // px the card slides left to expose the delete button

interface Props {
  isOpen: boolean;
  onOpen: () => void;          // this row asks to become the open one
  onClose: () => void;         // this row asks to close
  onDelete: () => void;        // the Supprimer button was tapped
  onTap?: () => void;          // a real tap (not a swipe) on a closed row
  deleteLabel?: string;
  className?: string;          // styling for the foreground card button
  children: ReactNode;
}

export function FitSwipeRow({
  isOpen, onOpen, onClose, onDelete, onTap, deleteLabel = 'Supprimer', className = '', children,
}: Props) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef<number | null>(null);
  const startDx = useRef(0);
  const moved = useRef(false);

  // Snap shut when another row opens.
  useEffect(() => { if (!isOpen) setDx(0); }, [isOpen]);

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    startDx.current = isOpen ? -REVEAL : 0;
    moved.current = false;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current == null) return;
    const delta = e.clientX - startX.current;
    if (Math.abs(delta) > 6) moved.current = true;
    setDx(Math.max(-REVEAL, Math.min(0, startDx.current + delta)));
  };

  const onPointerUp = () => {
    if (startX.current == null) return;
    startX.current = null;
    setDragging(false);
    if (dx < -REVEAL / 2) { onOpen(); setDx(-REVEAL); }
    else { if (isOpen) onClose(); setDx(0); }
  };

  const handleClick = () => {
    if (moved.current) return;          // it was a swipe, not a tap
    if (isOpen) { onClose(); return; }  // tap an open row to close it
    onTap?.();
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <button
        type="button"
        onClick={onDelete}
        className="absolute inset-y-0 right-0 flex w-[5.5rem] items-center justify-center bg-red-600 text-sm font-medium text-white active:bg-red-700"
      >
        {deleteLabel}
      </button>
      <button
        type="button"
        onClick={handleClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ transform: `translateX(${dx}px)`, touchAction: 'pan-y' }}
        className={`relative w-full ${dragging ? '' : 'transition-transform duration-200'} ${className}`}
      >
        {children}
      </button>
    </div>
  );
}
