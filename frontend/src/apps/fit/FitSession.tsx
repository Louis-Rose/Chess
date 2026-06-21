import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { ChevronRight, Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitSessionExercise, type LoggedSet } from './FitSessionExercise';
import { FitExercisePicker } from './FitExercisePicker';
import { FitExerciseRecent } from './FitExerciseRecent';
import { FitSessionComment } from './FitSessionComment';
import { FitSwipeRow } from './FitSwipeRow';
import { FitConfirm } from './FitConfirm';
import { FitScreenHeader } from './FitScreenHeader';
import { useWorkWeights } from './useWorkWeights';
import { useExerciseSettings } from './useExerciseSettings';
import { leafLabel, muscleOf, MUSCLE_ORDER, type Priorities, type RepGoals } from './programData';
import { weekDays, currentDay } from './splitDays';
import { sessionTitle } from './format';
import { loadSessionNav, saveSessionNav, clearSessionNav } from './fitSessionNav';
import { startRest, clearRest } from './restTimer';
import { getSession, startSession, clearSession } from './sessionTimer';
import { markValidated, unmarkValidated, clearValidated } from './validatedExercises';

// A workout session. Starts empty; the user adds exercises from their program
// "à la volée" and logs sets (poids + reps) on each. Everything persists as it
// goes via /api/fit/sessions. "Terminer" closes the session and returns.

interface Entry {
  exercise: string;       // stored leaf
  sets: LoggedSet[];
}

// Short muscle labels for the day's-groups banner so it fits one line.
const SHORT_MUSCLE: Record<string, string> = {
  Dorsaux: 'Dos',
  Pectoraux: 'Pecs',
  Quadriceps: 'Quads',
  'Ischio-jambiers': 'Ischios',
  'Avant-bras': 'Av-bras',
  Trapèzes: 'Traps',
};
const shortMuscle = (m: string) => SHORT_MUSCLE[m] ?? m;

interface SessionPayload {
  id: number;
  number: number | null;
  started_at: string | null;
  comment: string | null;
  sets: { id: number; exercise: string; weight: number | null; reps: number; reps_right: number | null; warmup: boolean; higher_weight: boolean }[];
  notes?: Record<string, string>;
}

// Group a session's flat set list into per-exercise entries, in logged order.
function groupSets(sets: SessionPayload['sets']): Entry[] {
  const groups: Entry[] = [];
  const idx = new Map<string, number>();
  for (const s of sets) {
    if (!idx.has(s.exercise)) { idx.set(s.exercise, groups.length); groups.push({ exercise: s.exercise, sets: [] }); }
    groups[idx.get(s.exercise)!].sets.push({ id: s.id, weight: s.weight, reps: s.reps, reps_right: s.reps_right, warmup: s.warmup, higher_weight: s.higher_weight });
  }
  return groups;
}

export function FitSession({ onDone }: { onDone: () => void }) {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [number, setNumber] = useState<number | null>(null);
  const [comment, setComment] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});   // per-exercise notes
  const [program, setProgram] = useState<Record<string, string[]>>({});
  const [muscleOrder, setMuscleOrder] = useState<string[]>([]);
  const [groupIndex, setGroupIndex] = useState(0);   // current muscle group in the program order
  const groupInit = useRef(false);
  // The active program's split and the data to locate today's session within it,
  // so the exercise picker is filtered to the day's muscles.
  const [weekSplit, setWeekSplit] = useState<string | null>(null);
  const [bodyPartOrder, setBodyPartOrder] = useState<string[]>([]);
  const [sessionOrder, setSessionOrder] = useState<Record<string, string[][]>>({});
  const [doneThisWeek, setDoneThisWeek] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [confirmingFinish, setConfirmingFinish] = useState(false); // finishing dialog (asks for a comment)
  const [validating, setValidating] = useState<string | null>(null); // exercise whose note modal is open
  const [editing, setEditing] = useState<string | null>(null);   // exercise being edited, else overview
  const [openLeaf, setOpenLeaf] = useState<string | null>(null); // exercise row swiped open in the overview
  const [confirmLeaf, setConfirmLeaf] = useState<string | null>(null);
  const { weights: workWeights } = useWorkWeights();
  const { settings: exerciseSettings, save: saveSetting } = useExerciseSettings();
  const [unilateral, setUnilateral] = useState<Set<string>>(new Set());   // per active program

  useEffect(() => {
    // POST resumes the in-progress session if there is one (with its logged
    // sets), otherwise starts a fresh empty one.
    Promise.all([
      fitRequest(() => axios.post<SessionPayload>('/api/fit/sessions')),
      fitRequest(() => axios.get<{ selections: Record<string, string[]>; priorities: Priorities; split: string | null; body_part_order: string[]; rep_goals: RepGoals; unilateral: string[]; muscle_order: string[]; session_order: Record<string, string[][]>; done_this_week: number }>('/api/fit/exercises')),
    ])
      .then(([sessionRes, exRes]) => {
        const sid = sessionRes.data.id;
        setSessionId(sid);
        setStartedAt(sessionRes.data.started_at);
        // Start the session stopwatch, or keep it running when resuming the
        // same in-progress session.
        const existing = getSession();
        if (!existing || existing.sessionId !== sid) startSession(sid, Date.now());
        setNumber(sessionRes.data.number);
        setComment(sessionRes.data.comment);
        setNotes(sessionRes.data.notes ?? {});
        setProgram(exRes.data.selections ?? {});
        setUnilateral(new Set(exRes.data.unilateral ?? []));
        setMuscleOrder(exRes.data.muscle_order ?? []);

        const grouped = groupSets(sessionRes.data.sets ?? []);

        // The active program's split filters the picker to today's muscles, and
        // doneThisWeek locates today's session within the split's cycle.
        setWeekSplit(exRes.data.split ?? null);
        setBodyPartOrder(exRes.data.body_part_order ?? []);
        setSessionOrder(exRes.data.session_order ?? {});
        setDoneThisWeek(exRes.data.done_this_week ?? 0);
        // Restore the exact sub-view the user left from (open exercise / picker).
        // An open exercise with no sets yet won't be in `grouped`, so re-add it.
        const nav = loadSessionNav();
        if (nav && nav.sessionId === sid) {
          if (nav.editing) {
            if (!grouped.some(e => e.exercise === nav.editing)) {
              grouped.push({ exercise: nav.editing, sets: [] });
            }
            setEditing(nav.editing);
          } else if (nav.picking) {
            setPicking(true);
          }
        }
        setEntries(grouped);
      })
      .catch(() => { /* leave empty; user can retry by closing */ })
      .finally(() => setLoading(false));
  }, []);

  // Persist where we are so leaving and tapping "Reprendre" comes back here.
  useEffect(() => {
    if (sessionId == null) return;
    saveSessionNav({ sessionId, editing, picking });
  }, [sessionId, editing, picking]);

  // A session is worth keeping only once a set is logged. Refs so the
  // unmount / app-close handlers read the latest values.
  const liveRef = useRef(false);
  const sessionIdRef = useRef<number | null>(null);
  useEffect(() => {
    liveRef.current = entries.some(e => e.sets.length > 0);
    sessionIdRef.current = sessionId;
  });
  // Leaving the session with no set logged (tab switch / Précédent, or the app
  // being closed) abandons it: delete it server-side so it reverts to "à venir"
  // rather than lingering as "en cours", and stop the local chrono. On app
  // close the page is torn down, so use a keepalive fetch that can outlive it.
  useEffect(() => {
    const abandon = (beacon: boolean) => {
      if (liveRef.current) return;
      const sid = sessionIdRef.current;
      if (sid != null) {
        if (beacon) {
          try { fetch(`/api/fit/sessions/${sid}`, { method: 'DELETE', credentials: 'include', keepalive: true }); } catch { /* best effort */ }
        } else {
          fitRequest(() => axios.delete(`/api/fit/sessions/${sid}`)).catch(() => {});
        }
      }
      clearSession(); clearValidated(); clearSessionNav();
    };
    const onHide = () => abandon(true);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      abandon(false);
    };
  }, []);

  function addExercise(leaf: string) {
    setPicking(false);
    setEntries(prev => (prev.some(e => e.exercise === leaf) ? prev : [...prev, { exercise: leaf, sets: [] }]));
    setEditing(leaf);
  }

  // "Précédent" steps back to the previous muscle group (mirror of "Muscle
  // suivant"), leaving any open exercise. On the first group it leaves the
  // session. An empty mis-pick is dropped on the way out.
  function goPreviousMuscle() {
    if (editing != null) {
      const entry = entries.find(e => e.exercise === editing);
      if (entry && entry.sets.length === 0) setEntries(prev => prev.filter(e => e.exercise !== editing));
      setEditing(null);
    }
    if (clampedGroupIndex > 0) setGroupIndex(clampedGroupIndex - 1);
    else onDone();
  }

  // "Valider l'exercice": go to the overview, but don't keep an exercise with
  // no logged set — nothing to save. Validating an exercise with logged sets
  // marks it done today in the recency views, mid-session.
  function finishEditing() {
    const entry = entries.find(e => e.exercise === editing);
    if (entry && entry.sets.length === 0) {
      setEntries(prev => prev.filter(e => e.exercise !== editing));
    } else if (entry && sessionId != null && editing) {
      markValidated(sessionId, editing);
    }
    setEditing(null);
  }

  // "Valider l'exercice" → open the note modal (skip it for an empty mis-pick),
  // then finishEditing on confirm.
  function requestValidate() {
    const entry = entries.find(e => e.exercise === editing);
    if (!entry || entry.sets.length === 0) { finishEditing(); return; }
    setValidating(editing);
  }

  function confirmValidate() {
    finishEditing();
    setValidating(null);
  }

  function saveExerciseNote(exercise: string, note: string | null) {
    if (sessionId == null) return;
    setNotes(prev => {
      const next = { ...prev };
      if (note) next[exercise] = note; else delete next[exercise];
      return next;
    });
    fitRequest(() => axios.put(`/api/fit/sessions/${sessionId}/exercise-notes`, { exercise, note })).catch(() => {});
  }

  function saveComment(c: string | null) {
    if (sessionId == null) return;
    setComment(c);
    fitRequest(() => axios.put(`/api/fit/sessions/${sessionId}/comment`, { comment: c })).catch(() => {});
  }

  async function addSet(exercise: string, weight: number | null, reps: number, warmup: boolean, repsRight: number | null, higher: boolean) {
    if (sessionId == null) return;
    const res = await fitRequest(() =>
      axios.post<{ id: number }>(`/api/fit/sessions/${sessionId}/sets`, { exercise, weight, reps, warmup, reps_right: repsRight, higher_weight: higher }));
    const newSet: LoggedSet = { id: res.data.id, weight, reps, reps_right: repsRight, warmup, higher_weight: higher };
    setEntries(prev => prev.map(e =>
      e.exercise === exercise ? { ...e, sets: [...e.sets, newSet] } : e));
    // A logged set makes the session "live" again — it may have been cleared by
    // deleting every set earlier (see deleteSet/deleteExercise).
    if (getSession()?.sessionId !== sessionId) startSession(sessionId, Date.now());
    startRest(Date.now());   // (re)start the shared rest timer
  }

  async function updateSet(exercise: string, setId: number, weight: number | null, reps: number, warmup: boolean, repsRight: number | null, higher: boolean) {
    if (sessionId == null) return;
    await fitRequest(() =>
      axios.patch(`/api/fit/sessions/${sessionId}/sets/${setId}`, { weight, reps, warmup, reps_right: repsRight, higher_weight: higher }));
    setEntries(prev => prev.map(e =>
      e.exercise === exercise ? { ...e, sets: e.sets.map(s => s.id === setId ? { id: setId, weight, reps, reps_right: repsRight, warmup, higher_weight: higher } : s) } : e));
  }

  function deleteSet(exercise: string, setId: number) {
    if (sessionId == null) return;
    fitRequest(() => axios.delete(`/api/fit/sessions/${sessionId}/sets/${setId}`)).catch(() => {});
    const next = entries.map(e =>
      e.exercise === exercise ? { ...e, sets: e.sets.filter(s => s.id !== setId) } : e);
    setEntries(next);
    // An exercise with no set left is no longer "done today".
    if (sessionId != null && !next.find(e => e.exercise === exercise)?.sets.length) {
      unmarkValidated(sessionId, exercise);
    }
    endSessionIfEmpty(next);
    clearRest();   // the rest timer was based on a logged set; deleting one voids it
  }

  // Remove a whole exercise from the session: drop all its logged sets, then the entry.
  function deleteExercise(exercise: string) {
    setConfirmLeaf(null);
    setOpenLeaf(null);
    const entry = entries.find(e => e.exercise === exercise);
    if (sessionId != null && entry) {
      for (const s of entry.sets) {
        fitRequest(() => axios.delete(`/api/fit/sessions/${sessionId}/sets/${s.id}`)).catch(() => {});
      }
    }
    const next = entries.filter(e => e.exercise !== exercise);
    setEntries(next);
    if (sessionId != null) unmarkValidated(sessionId, exercise);   // no longer in the session
    clearRest();   // the rest timer may have been based on a set we just removed
    // Removing the last exercise leaves an empty session, which no longer
    // exists in any meaningful sense — end it and go back to the home screen
    // rather than sit on a blank session view.
    if (next.length === 0) {
      clearSession();
      clearValidated();
      clearSessionNav();
      onDone();
      return;
    }
    endSessionIfEmpty(next);
  }

  // Once a session has no logged set left, it stops being "in progress" — the
  // backend's /sessions/active already treats it as gone, so end the live
  // session here too (stops the chrono, unblocks editing the program).
  function endSessionIfEmpty(next: Entry[]) {
    if (!next.some(e => e.sets.length > 0)) { clearSession(); clearValidated(); }
  }

  async function finish() {
    clearRest();
    clearSession();
    clearValidated();
    if (sessionId == null || finishing) { clearSessionNav(); onDone(); return; }
    setFinishing(true);
    try {
      await fitRequest(() => axios.post(`/api/fit/sessions/${sessionId}/finish`));
    } catch {
      /* still leave the screen */
    } finally {
      clearSessionNav();
      onDone();
    }
  }

  const editingEntry = editing ? entries.find(e => e.exercise === editing) ?? null : null;

  // Today's session within the week's split: its label (banner) and ordered
  // muscles (the user's per-session order). Empty when there's no week plan.
  const weekDayList = weekSplit ? weekDays(weekSplit, bodyPartOrder, sessionOrder, muscleOrder) : [];
  const today = currentDay(weekDayList, doneThisWeek);

  // The picker walks the muscle groups one at a time, forward only. With a split,
  // it follows today's session order; otherwise the program's global muscle
  // order. Either way, restricted to groups that actually have exercises.
  const groupSequence = useMemo(() => {
    const seq = today?.muscles ?? (muscleOrder.length ? muscleOrder : MUSCLE_ORDER);
    return seq.filter(m => (program[m]?.length ?? 0) > 0);
  }, [muscleOrder, today?.muscles, program]);

  // Land on the furthest group already worked (so resume never goes backward).
  useEffect(() => {
    if (groupInit.current || loading) return;
    groupInit.current = true;
    const floor = entries.reduce((mx, e) => {
      const i = groupSequence.indexOf(muscleOf(e.exercise) ?? '');
      return i > mx ? i : mx;
    }, 0);
    setGroupIndex(floor);
  }, [loading, entries, groupSequence]);

  const clampedGroupIndex = Math.min(groupIndex, Math.max(0, groupSequence.length - 1));
  const currentGroup = groupSequence[clampedGroupIndex];
  const nextGroup = groupSequence[clampedGroupIndex + 1] ?? null;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      {/* Précédent steps back to the previous muscle group (or home on the
          first); the session stays live and resumable. */}
      <FitScreenHeader
        title={sessionTitle(number, startedAt)}
        onBack={goPreviousMuscle}
      />

      <div className="flex flex-1 flex-col px-5">
      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : editingEntry ? (
        // Editing one exercise: its card + "Valider l'exercice".
        <>
          <div className="mt-2">
            <FitSessionExercise
              key={editingEntry.exercise}
              exercise={editingEntry.exercise}
              sets={editingEntry.sets}
              onAddSet={(w, r, warmup, rr, hi) => addSet(editingEntry.exercise, w, r, warmup, rr, hi)}
              onUpdateSet={(id, w, r, warmup, rr, hi) => updateSet(editingEntry.exercise, id, w, r, warmup, rr, hi)}
              onDeleteSet={id => deleteSet(editingEntry.exercise, id)}
              workWeight={workWeights[editingEntry.exercise] ?? null}
              setting={exerciseSettings[editingEntry.exercise.split(' — ')[0]] ?? null}
              onSettingChange={s => saveSetting(editingEntry.exercise.split(' — ')[0], s)}
              unilateral={unilateral.has(editingEntry.exercise.split(' — ')[0])}
              onValidate={requestValidate}
            />
            <FitExerciseRecent exercise={editingEntry.exercise} excludeSessionId={sessionId} />
          </div>
        </>
      ) : (
        // Live session: a banner of the day's muscle groups, then the exercises
        // to pick for the current group (the session's main view, walked forward
        // with "Muscle suivant"), then what's already logged and "Terminer".
        <>
          {today && (
            <p className="mt-4 text-center text-sm">
              <span className="font-medium text-slate-400">Séance {doneThisWeek + 1}</span>
              <span className="mx-1.5 text-slate-600">·</span>
              <span className="text-emerald-300">{today.label}</span>
            </p>
          )}

          {/* Banner: every muscle group of the day on one joined bar, the
              current one highlighted, the ones already passed dimmed. Scrolls
              horizontally if the day has too many groups to fit. */}
          {groupSequence.length > 0 && (
            <div className="mt-4 w-full overflow-x-auto">
              <div className="mx-auto flex w-max overflow-hidden rounded-lg border border-slate-700">
                {groupSequence.map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setGroupIndex(i)}
                    className={`whitespace-nowrap px-3 py-1.5 text-xs font-medium transition-colors ${i > 0 ? 'border-l border-slate-700' : ''} ${
                      i === clampedGroupIndex ? 'bg-emerald-600 text-white'
                        : i < clampedGroupIndex ? 'bg-slate-800 text-slate-500 active:bg-slate-700'
                        : 'bg-slate-800 text-slate-300 active:bg-slate-700'
                    }`}
                  >
                    {shortMuscle(m)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* The current group's exercises, proposed straight away (no button). */}
          <div className="mt-6">
            <FitExercisePicker
              embedded
              program={program}
              muscleOrder={muscleOrder}
              group={currentGroup}
              nextGroup={nextGroup}
              onNextGroup={() => setGroupIndex(i => Math.min(i + 1, groupSequence.length - 1))}
              onPick={addExercise}
              onClose={() => {}}
            />
          </div>

          {entries.length > 0 && (
            <div className="mx-auto mt-8 flex w-full max-w-[22rem] flex-col gap-3">
              {entries.map(e => (
                <FitSwipeRow
                  key={e.exercise}
                  isOpen={openLeaf === e.exercise}
                  onOpen={() => setOpenLeaf(e.exercise)}
                  onClose={() => setOpenLeaf(null)}
                  onDelete={() => setConfirmLeaf(e.exercise)}
                  onTap={() => setEditing(e.exercise)}
                  className="flex flex-col items-center border-slate-700 px-4 py-4 text-center"
                >
                  <span className="font-medium text-slate-100">{leafLabel(e.exercise)}</span>
                  {(() => {
                    const n = e.sets.filter(s => !s.warmup).length;   // working sets only
                    return <span className="mt-0.5 text-sm text-slate-400">{n} série{n !== 1 ? 's' : ''}</span>;
                  })()}
                  {notes[e.exercise] && (
                    <span className="mt-1 whitespace-pre-wrap text-xs italic text-slate-500">{notes[e.exercise]}</span>
                  )}
                  <ChevronRight className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                </FitSwipeRow>
              ))}
            </div>
          )}

          {/* Only on the last planned muscle group (no "Muscle suivant" left).
              Sits just below the exercises, a touch lower than where "Muscle
              suivant" would be — not pinned to the bottom of the screen. */}
          {!nextGroup && (
            <div className="mt-12 flex flex-col items-center">
              <button
                type="button"
                onClick={() => setConfirmingFinish(true)}
                className="w-full max-w-[22rem] rounded-xl bg-emerald-600 px-4 py-3.5 font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                Terminer la séance
              </button>
            </div>
          )}
        </>
      )}
      </div>

      {confirmLeaf != null && (
        <FitConfirm
          title="Supprimer l'exercice"
          message={`${leafLabel(confirmLeaf)} et toutes ses séries seront retirés de la séance.`}
          confirmLabel="Supprimer"
          danger
          onConfirm={() => deleteExercise(confirmLeaf)}
          onCancel={() => setConfirmLeaf(null)}
        />
      )}

      {confirmingFinish && (
        // Ask for an optional comment only when wrapping up the session.
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-6"
          onClick={() => { if (!finishing) setConfirmingFinish(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 text-center"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-100">Terminer la séance</h2>
            <div className="mt-4">
              <FitSessionComment comment={comment} onSave={saveComment} />
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmingFinish(false)}
                className="flex-1 rounded-xl border border-slate-700 px-4 py-2.5 font-medium text-slate-200 transition-colors active:bg-slate-800"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={finish}
                disabled={finishing}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
              >
                Terminer
              </button>
            </div>
          </div>
        </div>
      )}

      {validating != null && (
        // A note for the exercise being validated (optional), like the session
        // comment when finishing.
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 px-6"
          onClick={() => setValidating(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 text-center"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-100">{leafLabel(validating)}</h2>
            <div className="mt-4">
              <FitSessionComment
                comment={notes[validating] ?? null}
                onSave={n => saveExerciseNote(validating, n)}
                id="exercise-note"
                placeholder="Une note sur cet exercice ?"
                centered
              />
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setValidating(null)}
                className="flex-1 rounded-xl border border-slate-700 px-4 py-2.5 font-medium text-slate-200 transition-colors active:bg-slate-800"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmValidate}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                Valider
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
