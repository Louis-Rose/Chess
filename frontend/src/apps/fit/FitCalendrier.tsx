import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ChevronRight, Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitSessionDetail } from './FitSessionDetail';
import { FitConfirm } from './FitConfirm';
import { FitSwipeRow } from './FitSwipeRow';
import { PerfCounts } from './FitPerf';
import { FitWeekPlan } from './FitWeek';
import { sessionTitle } from './format';

// Calendrier tab: the history of past sessions, newest first. Tap one to see
// its detail, or swipe left to reveal a Supprimer button.

interface SessionSummary {
  id: number;
  number: number | null;
  started_at: string | null;
  ended_at: string | null;
  set_count: number;
  exercise_count: number;
  plus: number;
  equal: number;
  minus: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

interface RowProps {
  session: SessionSummary;
  isOpen: boolean;
  setOpenId: (id: number | null) => void;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
}

function SwipeableSession({ session, isOpen, setOpenId, onSelect, onDelete }: RowProps) {
  return (
    <FitSwipeRow
      isOpen={isOpen}
      onOpen={() => setOpenId(session.id)}
      onClose={() => setOpenId(null)}
      onDelete={() => onDelete(session.id)}
      onTap={() => onSelect(session.id)}
      className="flex flex-col items-center border-slate-700 px-4 py-4 text-center"
    >
      <span className="font-medium text-slate-100">{sessionTitle(session.number, session.started_at)}</span>
      <span className="mt-0.5 text-sm text-slate-400">
        {plural(session.exercise_count, 'exercice')} - {plural(session.set_count, 'série')}
      </span>
      <PerfCounts plus={session.plus} equal={session.equal} minus={session.minus} className="mt-1 text-sm" />
      <ChevronRight className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
    </FitSwipeRow>
  );
}

type Period = 'semaine' | 'mois' | 'annee' | 'tout';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'semaine', label: 'Semaine' },
  { key: 'mois', label: 'Mois' },
  { key: 'annee', label: 'Année' },
  { key: 'tout', label: 'Tout' },
];

// Start of the selected period (calendar week starting Monday, month, or year),
// or null for "tout" (no filter).
function periodStart(period: Period): Date | null {
  if (period === 'tout') return null;
  const now = new Date();
  if (period === 'annee') return new Date(now.getFullYear(), 0, 1);
  if (period === 'mois') return new Date(now.getFullYear(), now.getMonth(), 1);
  const day = now.getDay();                      // 0=dimanche … 6=samedi
  const sinceMonday = day === 0 ? 6 : day - 1;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - sinceMonday);
}

export function FitCalendrier() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period>('mois');
  // This week's plan from the chosen split (shown at the top).
  const [weekSplit, setWeekSplit] = useState<string | null>(null);
  const [bodyPartOrder, setBodyPartOrder] = useState<string[]>([]);
  const [sessionOrder, setSessionOrder] = useState<Record<string, string[][]>>({});
  const [muscleOrder, setMuscleOrder] = useState<string[]>([]);
  const [doneThisWeek, setDoneThisWeek] = useState(0);
  // A just-deleted session, kept around so it can be undone. The backend DELETE
  // is deferred until the undo window elapses (or the tab unmounts).
  const [pendingUndo, setPendingUndo] = useState<SessionSummary | null>(null);
  const pendingRef = useRef<{ id: number; session: SessionSummary; timer: ReturnType<typeof setTimeout> } | null>(null);

  useEffect(() => {
    fitRequest(() => axios.get<{ sessions: SessionSummary[] }>('/api/fit/sessions'))
      .then(res => setSessions(res.data.sessions ?? []))
      .catch(() => { /* show empty */ })
      .finally(() => setLoading(false));
    // This week's plan: the active program's split + how far through the week.
    fitRequest(() => axios.get<{ split: string | null; body_part_order: string[]; session_order: Record<string, string[][]>; muscle_order: string[]; done_this_week: number }>('/api/fit/exercises'))
      .then(ex => {
        setWeekSplit(ex.data.split);
        setDoneThisWeek(ex.data.done_this_week ?? 0);
        setBodyPartOrder(ex.data.body_part_order ?? []);
        setSessionOrder(ex.data.session_order ?? {});
        setMuscleOrder(ex.data.muscle_order ?? []);
      })
      .catch(() => { /* no week plan */ });
  }, []);

  // Commit the deferred delete now (timer fired, a new delete arrived, or the
  // tab is unmounting): actually hit the backend and drop the undo banner.
  const commitPending = () => {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingRef.current = null;
    setPendingUndo(null);
    fitRequest(() => axios.delete(`/api/fit/sessions/${p.id}`)).catch(() => { /* best effort */ });
  };
  // Make sure a pending delete isn't silently dropped when leaving the tab.
  useEffect(() => () => commitPending(), []);

  const confirmDelete = () => {
    const id = confirmId;
    setConfirmId(null);
    if (id == null) return;
    setOpenId(null);
    const victim = sessions.find(s => s.id === id);
    if (!victim) return;
    commitPending();   // flush any earlier pending delete first
    setSessions(prev => prev.filter(s => s.id !== id));
    const timer = setTimeout(commitPending, 10000);
    pendingRef.current = { id, session: victim, timer };
    setPendingUndo(victim);
  };

  const undoDelete = () => {
    const p = pendingRef.current;
    if (!p) return;
    clearTimeout(p.timer);
    pendingRef.current = null;
    setPendingUndo(null);
    setSessions(prev => [...prev, p.session].sort((a, b) => {
      const ta = a.started_at ? new Date(a.started_at).getTime() : 0;
      const tb = b.started_at ? new Date(b.started_at).getTime() : 0;
      return tb - ta;
    }));
  };

  if (selected != null) return <FitSessionDetail sessionId={selected} onBack={() => setSelected(null)} editable />;

  const start = periodStart(period);
  const visible = start
    ? sessions.filter(s => s.started_at && new Date(s.started_at) >= start)
    : sessions;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <h1 className="text-center text-2xl font-semibold">Calendrier</h1>

      <FitWeekPlan split={weekSplit} bodyPartOrder={bodyPartOrder} sessionOrder={sessionOrder} muscleOrder={muscleOrder} doneThisWeek={doneThisWeek} />

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="mt-10 text-center text-sm text-slate-400">Aucune séance enregistrée pour le moment.</p>
      ) : (
        <>
          <div className="mx-auto mt-6 grid w-full max-w-[22rem] grid-cols-4 rounded-lg border border-slate-700 p-0.5 text-sm">
            {PERIODS.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={`rounded-md py-1.5 font-medium transition-colors ${
                  period === p.key ? 'bg-emerald-600 text-white' : 'text-slate-400 active:text-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="mt-10 text-center text-sm text-slate-400">Aucune séance sur cette période.</p>
          ) : (
            <div className="mx-auto mt-6 flex w-full max-w-[22rem] flex-col gap-3">
              {visible.map(s => (
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
        </>
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

      {pendingUndo != null && (
        <div className="fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-5">
          <div className="flex items-center gap-4 rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm shadow-lg">
            <span className="text-slate-300">Séance supprimée</span>
            <button type="button" onClick={undoDelete} className="font-semibold text-emerald-400 active:text-emerald-300">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
