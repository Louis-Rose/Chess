import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { fitRequest } from './fitAuth';
import { useCustomExercises } from './useCustomExercises';
import { REP_GOAL_DEFAULT, exclusiveSiblings, normalizeMuscleOrder, variantId, type CustomExercise, type FitProgram, type MusclePriority, type Priorities, type RepCategory, type RepGoals } from './programData';
import type { CustomDraft } from './FitCustomExercises';

// Shared editing state for one program: name, split, working sets, per-muscle
// exercise selections and the custom-exercise draft. Every change saves
// immediately to the program-scoped endpoints. Both the rail editor
// (FitProgrammeEdit, for an existing program) and the guided create wizard
// (FitProgrammeWizard) drive their bodies through this hook + FitProgrammeSection,
// so the two stay in sync. Keep the working-sets range / name length in sync
// with fit.py.

export function useProgramEditor(program: FitProgram) {
  const [name, setName] = useState(program.name);
  const [split, setSplit] = useState<string | null>(program.split ?? null);
  const [workSets, setWorkSets] = useState<number | null>(program.work_sets);
  const [priorities, setPriorities] = useState<Priorities>(program.priorities ?? {});
  const [bodyPartOrder, setBodyPartOrder] = useState<string[]>(program.body_part_order ?? []);
  const [repGoals, setRepGoals] = useState<RepGoals>(program.rep_goals ?? REP_GOAL_DEFAULT);
  const [muscleOrder, setMuscleOrder] = useState<string[]>(normalizeMuscleOrder(program.muscle_order));
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [unilateral, setUnilateral] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const { customExercises, reloadCustom } = useCustomExercises();
  const [customDraft, setCustomDraft] = useState<CustomDraft | null>(null);

  const base = `/api/fit/programs/${program.id}`;

  const loadSelections = useCallback(() => {
    return fitRequest(() => axios.get<{ selections: Record<string, string[]>; unilateral: string[] }>(`${base}/exercises`))
      .then(res => {
        setSelections(res.data.selections ?? {});
        setUnilateral(new Set(res.data.unilateral ?? []));
      })
      .catch(() => { /* start empty */ })
      .finally(() => setLoading(false));
  }, [base]);

  // Unilateral is per program: tapping the chip toggles the base for this program.
  function saveUnilateral(exercise: string, value: boolean) {
    setUnilateral(prev => {
      const next = new Set(prev);
      if (value) next.add(exercise); else next.delete(exercise);
      return next;
    });
    fitRequest(() => axios.put(`${base}/unilateral`, { exercise, unilateral: value })).catch(() => {});
  }

  useEffect(() => { loadSelections(); }, [loadSelections]);

  function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === program.name) return;
    fitRequest(() => axios.put(base, { name: trimmed })).catch(() => {});
  }

  // A program has a single split; tapping one selects it (replacing the previous).
  function chooseSplit(s: string) {
    setSplit(s);
    fitRequest(() => axios.put(base, { split: s })).catch(() => {});
  }

  function chooseSets(n: number) {
    setWorkSets(n);
    fitRequest(() => axios.put(base, { work_sets: n })).catch(() => {});
  }

  function savePriorities(next: Priorities) {
    setPriorities(next);
    fitRequest(() => axios.put(base, { priorities: next })).catch(() => {});
  }

  // Drag a muscle into a zone: 'weak' / 'strong', or null for neutral (the
  // default, stored as absent from the map).
  function setPriority(muscle: string, state: MusclePriority | null) {
    if ((priorities[muscle] ?? null) === state) return;
    const next = { ...priorities };
    if (state) next[muscle] = state; else delete next[muscle];
    savePriorities(next);
  }

  // Body part day order (one muscle group per day). Adding appends a day,
  // removing drops one by position, moving reorders. Saved immediately.
  function saveBodyPartOrder(next: string[]) {
    setBodyPartOrder(next);
    fitRequest(() => axios.put(base, { body_part_order: next })).catch(() => {});
  }
  function addBodyPartDay(muscle: string) {
    saveBodyPartOrder([...bodyPartOrder, muscle]);
  }
  function removeBodyPartDay(index: number) {
    saveBodyPartOrder(bodyPartOrder.filter((_, i) => i !== index));
  }
  function moveBodyPartDay(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= bodyPartOrder.length) return;
    const next = [...bodyPartOrder];
    [next[index], next[j]] = [next[j], next[index]];
    saveBodyPartOrder(next);
  }

  // Target reps for a category; saves the whole {upper, lower, isolation} object.
  function setRepGoal(category: RepCategory, n: number) {
    setRepGoals(prev => {
      const next = { ...prev, [category]: n };
      fitRequest(() => axios.put(base, { rep_goals: next })).catch(() => {});
      return next;
    });
  }

  // Muscles shown in the order step, in the program's stored order: only those
  // with a selected exercise, so the editor lists just the relevant muscles.
  // Falls back to all when none is selected yet (the create wizard).
  function orderedMuscles(): string[] {
    const withEx = muscleOrder.filter(m => (selections[m] ?? []).length > 0);
    return withEx.length ? withEx : muscleOrder;
  }

  // Commit a freely drag-reordered list of the shown muscles. The hidden (empty)
  // muscles keep their order, appended after. Saved as the whole order.
  function reorderMuscles(visibleOrder: string[]) {
    const next = [...visibleOrder, ...muscleOrder.filter(m => !visibleOrder.includes(m))];
    setMuscleOrder(next);
    fitRequest(() => axios.put(base, { muscle_order: next })).catch(() => {});
  }

  function toggleExercise(muscle: string, id: string) {
    setSelections(prev => {
      const cur = prev[muscle] ?? [];
      let next: string[];
      if (cur.includes(id)) {
        next = cur.filter(e => e !== id);
      } else {
        // Exclusive variants: picking one clears the others of its row.
        const siblings = exclusiveSiblings(id);
        next = [...cur.filter(e => !siblings.includes(e)), id];
      }
      fitRequest(() => axios.put(`${base}/exercises`, { muscle, exercises: next })).catch(() => {});
      return { ...prev, [muscle]: next };
    });
  }

  // A newly created exercise is selected into the program by default (all its
  // variant leaves, or its bare name when it has none).
  function autoSelectCustom(saved: CustomExercise) {
    const leaves = saved.variants.length ? saved.variants.map(v => variantId(saved.name, v)) : [saved.name];
    setSelections(prev => {
      const next = Array.from(new Set([...(prev[saved.muscle] ?? []), ...leaves]));
      fitRequest(() => axios.put(`${base}/exercises`, { muscle: saved.muscle, exercises: next })).catch(() => {});
      return { ...prev, [saved.muscle]: next };
    });
  }

  function onCustomSaved(saved: CustomExercise, wasNew: boolean) {
    setCustomDraft(null);
    reloadCustom();
    if (wasNew) autoSelectCustom(saved);
    else loadSelections();   // a rename remaps stored leaves server-side
  }

  // Swipe-left delete on a custom exercise card (catalogue exercises aren't
  // deletable, so they never get this).
  async function deleteCustom(muscle: string, name: string) {
    const c = customExercises.find(x => x.muscle === muscle && x.name === name);
    if (!c) return;
    try {
      await fitRequest(() => axios.delete(`/api/fit/custom-exercises/${c.id}`));
      reloadCustom();
      loadSelections();      // it was dropped from the program server-side
    } catch { /* keep shown */ }
  }

  return {
    loading,
    name, setName, saveName,
    split, chooseSplit,
    workSets, chooseSets,
    priorities, setPriority,
    muscleOrder, orderedMuscles, reorderMuscles,
    bodyPartOrder, addBodyPartDay, removeBodyPartDay, moveBodyPartDay,
    repGoals, setRepGoal,
    selections, toggleExercise,
    customExercises, customDraft, setCustomDraft, onCustomSaved, deleteCustom,
    unilateral, saveUnilateral,
  };
}

export type ProgramEditor = ReturnType<typeof useProgramEditor>;
