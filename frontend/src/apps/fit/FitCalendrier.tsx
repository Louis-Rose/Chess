import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ChevronRight, Loader2, Plus } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitSession } from './FitSession';
import { FitSessionDetail } from './FitSessionDetail';
import { FitConfirm } from './FitConfirm';
import { FitSwipeRow } from './FitSwipeRow';
import { leafLabel, sessionLeaves, sortLabels } from './programData';
import { weekDays } from './splitDays';
import { sessionTitle } from './format';
import { FitBackButton } from './FitBackButton';
import { hasResumableNav } from './fitSessionNav';
import { getSession, clearSession } from './sessionTimer';
import { useCustomExercises } from './useCustomExercises';

// Calendrier tab: the upcoming sessions of the week (from the active program's
// split) on top, then the full history of past sessions, newest first. Tap a
// past one to see its detail, or swipe left to reveal a Supprimer button.

interface SessionSummary {
  id: number;
  number: number | null;
  started_at: string | null;
  ended_at: string | null;
  set_count: number;
  exercise_count: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

const CARD = 'relative flex flex-col items-center rounded-2xl border px-4 py-4 text-center transition-colors';

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
      <ChevronRight className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
    </FitSwipeRow>
  );
}

export function FitCalendrier() {
  useCustomExercises();   // so planned exercise counts group custom exercises right
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [inSession, setInSession] = useState(false);
  const [hasActive, setHasActive] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [upcomingSel, setUpcomingSel] = useState<number | null>(null);   // index into `upcoming`
  const [openId, setOpenId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  // The active program, to lay out this week's upcoming sessions.
  const [weekSplit, setWeekSplit] = useState<string | null>(null);
  const [bodyPartOrder, setBodyPartOrder] = useState<string[]>([]);
  const [sessionOrder, setSessionOrder] = useState<Record<string, string[][]>>({});
  const [muscleOrder, setMuscleOrder] = useState<string[]>([]);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [workSets, setWorkSets] = useState<number | null>(null);
  const [doneThisWeek, setDoneThisWeek] = useState(0);
  // A just-deleted session, kept around so it can be undone. The backend DELETE
  // is deferred until the undo window elapses (or the tab unmounts).
  const [pendingUndo, setPendingUndo] = useState<SessionSummary | null>(null);
  const pendingRef = useRef<{ id: number; session: SessionSummary; timer: ReturnType<typeof setTimeout> } | null>(null);

  useEffect(() => {
    if (inSession) return;   // reload once the session is done
    fitRequest(() => axios.get<{ sessions: SessionSummary[] }>('/api/fit/sessions'))
      .then(res => setSessions(res.data.sessions ?? []))
      .catch(() => { /* show empty */ })
      .finally(() => setLoading(false));
    // This week's plan: the active program's split + how far through the week.
    fitRequest(() => axios.get<{ split: string | null; work_sets: number | null; selections: Record<string, string[]>; body_part_order: string[]; session_order: Record<string, string[][]>; muscle_order: string[]; done_this_week: number }>('/api/fit/exercises'))
      .then(ex => {
        setWeekSplit(ex.data.split);
        setWorkSets(ex.data.work_sets ?? null);
        setSelections(ex.data.selections ?? {});
        setDoneThisWeek(ex.data.done_this_week ?? 0);
        setBodyPartOrder(ex.data.body_part_order ?? []);
        setSessionOrder(ex.data.session_order ?? {});
        setMuscleOrder(ex.data.muscle_order ?? []);
      })
      .catch(() => { /* no week plan */ });
    // An in-progress session persists until finished; offer to resume it. It's
    // resumable when sets are logged (backend) or the user left mid-exercise
    // (persisted client-side nav spot).
    fitRequest(() => axios.get<{ active: unknown | null }>('/api/fit/sessions/active'))
      .then(res => {
        const resumable = res.data.active != null || hasResumableNav();
        setHasActive(resumable);
        // A live chrono with nothing to resume is an abandoned empty session — end it.
        if (!resumable && getSession() != null) clearSession();
      })
      .catch(() => setHasActive(hasResumableNav()));
  }, [inSession]);

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

  // Upcoming sessions, numbered continuing from the latest, with planned exercise
  // / série counts from the program (exercises for the day's muscles × working
  // sets). Only the next one (lowest number) is startable; the rest are previews.
  // Shown newest-number first (like the past sessions).
  const days = weekDays(weekSplit, bodyPartOrder, sessionOrder, muscleOrder);
  const nextNumber = sessions.reduce((mx, s) => Math.max(mx, s.number ?? 0), 0) + 1;
  const card = (label: string, muscles: string[], number: number, startable: boolean) => {
    const exercises = muscles.reduce((n, m) => n + sessionLeaves(sortLabels(selections[m] ?? [])).length, 0);
    return { number, label, muscles, exercises, series: exercises * (workSets ?? 0), startable };
  };
  const upcoming: ReturnType<typeof card>[] = [];
  if (days.length > 0) {
    // The next session is the current day in the split cycle; the rest of the
    // week's planned days follow it as previews.
    const next = days[doneThisWeek % days.length];
    upcoming.push(card(next.label, next.muscles, nextNumber, true));
    for (let k = doneThisWeek + 1; k < days.length; k++) {
      upcoming.push(card(days[k].label, days[k].muscles, nextNumber + (k - doneThisWeek), false));
    }
  } else {
    // No split plan: a single startable next session over every selected muscle.
    const allMuscles = Object.keys(selections).filter(m => (selections[m]?.length ?? 0) > 0);
    upcoming.push(card('', allMuscles, nextNumber, true));
  }
  upcoming.reverse();

  if (inSession) return <FitSession onDone={() => setInSession(false)} />;
  if (selected != null) return <FitSessionDetail sessionId={selected} onBack={() => setSelected(null)} editable />;
  if (upcomingSel != null && upcoming[upcomingSel]) {
    const u = upcoming[upcomingSel];
    return (
      <UpcomingDetail
        number={u.number}
        label={u.label}
        muscles={u.muscles}
        selections={selections}
        onBack={() => setUpcomingSel(null)}
        onStart={u.startable ? () => { setUpcomingSel(null); setInSession(true); } : undefined}
        startLabel={hasActive ? 'Reprendre la séance' : 'Commencer la séance'}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <h1 className="text-center text-2xl font-semibold">Calendrier</h1>

      {upcoming.length > 0 && (
        <>
          <h2 className="mt-8 text-center text-xs uppercase tracking-wide text-slate-500">À venir</h2>
          <div className="mx-auto mt-3 flex w-full max-w-[22rem] flex-col gap-3">
            {upcoming.map((u, i) => (
              <button
                key={u.number}
                type="button"
                onClick={() => setUpcomingSel(i)}
                className={`${CARD} border-slate-700 bg-[#141c2f] active:bg-[#182234]`}
              >
                {u.startable && (
                  <span className="mb-1 text-xs uppercase tracking-wide text-emerald-400">
                    {hasActive ? 'Séance en cours' : 'Prochaine séance'}
                  </span>
                )}
                <span className="font-medium text-slate-100">
                  Séance {u.number} {u.startable && hasActive ? '(en cours)' : '(à venir)'}
                </span>
                <span className="mt-0.5 text-sm text-slate-400">
                  {plural(u.exercises, 'exercice')} - {plural(u.series, 'série')}
                </span>
                <ChevronRight className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
              </button>
            ))}
          </div>
        </>
      )}

      {/* Separator between the two sections. */}
      {upcoming.length > 0 && !loading && sessions.length > 0 && (
        <div className="mx-auto mt-8 h-px w-full max-w-[22rem] bg-slate-700" />
      )}

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="mt-10 text-center text-sm text-slate-400">Aucune séance enregistrée pour le moment.</p>
      ) : (
        <>
          <h2 className="mt-8 text-center text-xs uppercase tracking-wide text-slate-500">Passées</h2>
          <div className="mx-auto mt-3 flex w-full max-w-[22rem] flex-col gap-3">
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

// Preview of an upcoming session: the program's planned exercises for that day,
// grouped by muscle in session order. The next session also offers a button to
// start (or resume) it.
function UpcomingDetail({ number, label, muscles, selections, onBack, onStart, startLabel }: {
  number: number;
  label: string;
  muscles: string[];
  selections: Record<string, string[]>;
  onBack: () => void;
  onStart?: () => void;
  startLabel: string;
}) {
  const groups = muscles
    .map(m => ({ muscle: m, exercises: sessionLeaves(sortLabels(selections[m] ?? [])).map(leafLabel) }))
    .filter(g => g.exercises.length > 0);

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <FitBackButton onClick={onBack} />

      <h1 className="mt-4 text-center text-2xl font-semibold">Séance {number} (à venir)</h1>
      {label && <p className="mt-2 text-center text-sm text-slate-400">{label}</p>}

      {onStart && (
        <button
          type="button"
          onClick={onStart}
          className="mx-auto mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 text-lg font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-500"
        >
          <Plus className="h-5 w-5" />
          {startLabel}
        </button>
      )}

      {/* The planned content (muscles + exercises) sits in its own box; the
          start button above stays outside it. */}
      <div className="mx-auto mt-8 w-full max-w-[22rem] rounded-2xl border border-slate-700 p-4">
        <h2 className="text-center text-sm font-semibold text-slate-200">Exercices prévus</h2>
        {groups.length === 0 ? (
          <p className="mt-4 text-center text-sm text-slate-400">Aucun exercice prévu pour cette séance.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-6">
            {groups.map(g => (
              <section key={g.muscle}>
                <h2 className="text-center text-xs uppercase tracking-wide text-slate-500">{g.muscle}</h2>
                <ul className="mt-2 flex flex-col gap-2">
                  {g.exercises.map((ex, i) => (
                    <li key={i} className="rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-center text-sm text-slate-100">
                      {ex}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
