import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { fitRequest } from './fitAuth';

// The base exercises the user logs per side (unilateral), persisted across
// sessions. `save` toggles one and updates the local set. Keyed by base name.
export function useExerciseUnilateral() {
  const [unilateral, setUnilateral] = useState<Set<string>>(new Set());

  useEffect(() => {
    fitRequest(() => axios.get<{ exercises: string[] }>('/api/fit/exercise-unilateral'))
      .then(res => setUnilateral(new Set(res.data.exercises ?? [])))
      .catch(() => { /* none yet */ });
  }, []);

  const save = useCallback((exercise: string, value: boolean) => {
    setUnilateral(prev => {
      const next = new Set(prev);
      if (value) next.add(exercise); else next.delete(exercise);
      return next;
    });
    fitRequest(() => axios.put('/api/fit/exercise-unilateral', { exercise, unilateral: value })).catch(() => {});
  }, []);

  return { unilateral, save };
}
