import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { fitRequest } from './fitAuth';
import { setCustomExercises, type CustomExercise } from './programData';

// The user's custom (free-text) exercises. Loading them also feeds the module
// registry in programData (setCustomExercises) so the catalogue helpers
// (muscleOf, muscleContribution, isValidLeaf, exercisesForMuscle) see them.
// Any screen that displays custom data calls this so it re-renders once loaded.
export function useCustomExercises() {
  const [customExercises, setList] = useState<CustomExercise[]>([]);

  const reloadCustom = useCallback(() => {
    return fitRequest(() => axios.get<{ exercises: CustomExercise[] }>('/api/fit/custom-exercises'))
      .then(res => {
        const list = res.data.exercises ?? [];
        setCustomExercises(list);
        setList(list);
      })
      .catch(() => { /* none yet */ });
  }, []);

  useEffect(() => { reloadCustom(); }, [reloadCustom]);

  return { customExercises, reloadCustom };
}
