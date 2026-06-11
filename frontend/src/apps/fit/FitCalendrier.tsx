import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ChevronRight, Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitSessionDetail } from './FitSessionDetail';
import { FitConfirm } from './FitConfirm';
import { formatSessionDate } from './format';

// Calendrier tab: the history of past sessions, newest first. Tap one to see
// its detail, or swipe left to reveal a Supprimer button.

interface SessionSummary {
  id: number;
  started_at: string | null;
  ended_at: string | null;
  set_count: number;
  exercise_count: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

const REVEAL = 88; // px the card slides left to expose the delete button

interface RowProps {
  session: SessionSummary;
  isOpen: boolean;
  setOpenId: (id: number | null) => void;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
}

function SwipeableSession({ session, isOpen, setOpenId, onSelect, onDelete }: RowProps) {
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
    if (dx < -REVEAL / 2) { setOpenId(session.id); setDx(-REVEAL); }
    else { if (isOpen) setOpenId(null); setDx(0); }
  };

  const handleClick = () => {
    if (moved.current) return;        // it was a swipe, not a tap
    if (isOpen) { setOpenId(null); return; } // tap an open row to close it
    onSelect(session.id);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <button
        type="button"
        onClick={() => onDelete(session.id)}
        className="absolute inset-y-0 right-0 flex w-[5.5rem] items-center justify-center bg-red-600 text-sm font-medium text-white active:bg-red-700"
      >
        Supprimer
      </button>
      <button
        type="button"
        onClick={handleClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ transform: `translateX(${dx}px)`, touchAction: 'pan-y' }}
        className={`relative flex w-full flex-col items-center rounded-2xl border border-slate-800 bg-[#141c2f] px-4 py-4 text-center active:bg-[#182234] ${dragging ? '' : 'transition-transform duration-200'}`}
      >
        <span className="font-medium capitalize text-slate-100">{formatSessionDate(session.started_at)}</span>
        <span className="mt-0.5 text-sm text-slate-400">
          {plural(session.exercise_count, 'exercice')} - {plural(session.set_count, 'série')}
        </span>
        <ChevronRight className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
      </button>
    </div>
  );
}

export function FitCalendrier() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  useEffect(() => {
    fitRequest(() => axios.get<{ sessions: SessionSummary[] }>('/api/fit/sessions'))
      .then(res => setSessions(res.data.sessions ?? []))
      .catch(() => { /* show empty */ })
      .finally(() => setLoading(false));
  }, []);

  const confirmDelete = () => {
    const id = confirmId;
    setConfirmId(null);
    if (id == null) return;
    setOpenId(null);
    setSessions(prev => prev.filter(s => s.id !== id));
    fitRequest(() => axios.delete(`/api/fit/sessions/${id}`)).catch(() => { /* best effort */ });
  };

  if (selected != null) return <FitSessionDetail sessionId={selected} onBack={() => setSelected(null)} editable />;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <h1 className="text-center text-2xl font-semibold">Calendrier</h1>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="mt-10 text-center text-sm text-slate-400">Aucune séance enregistrée pour le moment.</p>
      ) : (
        <div className="mx-auto mt-8 flex w-full max-w-[22rem] flex-col gap-3">
          {sessions.map(s => (
            <SwipeableSession
              key={s.id}
              session={s}
              isOpen={openId === s.id}
              setOpenId={setOpenId}
              onSelect={setSelected}
              onDelete={setConfirmId}
            />
          ))}
        </div>
      )}

      {confirmId != null && (
        <FitConfirm
          title="Supprimer la séance"
          message="Cette séance et toutes ses séries seront définitivement supprimées."
          confirmLabel="Supprimer"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setConfirmId(null)}
        />
      )}
    </div>
  );
}
