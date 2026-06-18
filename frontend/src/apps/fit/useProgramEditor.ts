import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { fitRequest } from './fitAuth';
import { useCustomExercises } from './useCustomExercises';
import { useExerciseUnilateral } from './useExerciseUnilateral';
import { variantId, type CustomExercise, type FitProgram } from './programData';
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
  const [splits, setSplits] = useState<string[]>(program.splits ?? []);
  const [workSets, setWorkSets] = useState<number | null>(program.work_sets);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const { customExercises, reloadCustom } = useCustomExercises();
  const { unilateral, save: saveUnilateral } = useExerciseUnilateral();
  const [customDraft, setCustomDraft] = useState<CustomDraft | null>(null);

  const base = `/api/fit/programs/${program.id}`;

  const loadSelections = useCallback(() => {
    return fitRequest(() => axios.get<{ selections: Record<string, string[]> }>(`${base}/exercises`))
      .then(res => setSelections(res.data.selections ?? {}))
      .catch(() => { /* start empty */ })
      .finally(() => setLoading(false));
  }, [base]);

  useEffect(() => { loadSelections(); }, [loadSelections]);

  function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === program.name) return;
    fitRequest(() => axios.put(base, { name: trimmed })).catch(() => {});
  }

  // A program can carry several splits; tapping one toggles it on/off.
  function toggleSplit(s: string) {
    setSplits(prev => {
      const next = prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s];
      fitRequest(() => axios.put(base, { splits: next })).catch(() => {});
      return next;
    });
  }

  function chooseSets(n: number) {
    setWorkSets(n);
    fitRequest(() => axios.put(base, { work_sets: n })).catch(() => {});
  }

  function toggleExercise(muscle: string, id: string) {
    setSelections(prev => {
      const cur = prev[muscle] ?? [];
      const next = cur.includes(id) ? cur.filter(e => e !== id) : [...cur, id];
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
    splits, toggleSplit,
    workSets, chooseSets,
    selections, toggleExercise,
    customExercises, customDraft, setCustomDraft, onCustomSaved, deleteCustom,
    unilateral, saveUnilateral,
  };
}

export type ProgramEditor = ReturnType<typeof useProgramEditor>;
