import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { fitRequest } from './fitAuth';

// The user's persisted working weight per exercise, carried across sessions.
// `save` upserts (or clears, when weight is null) and updates the local map.
export function useWorkWeights() {
  const [weights, setWeights] = useState<Record<string, number>>({});

  useEffect(() => {
    fitRequest(() => axios.get<{ weights: Record<string, number> }>('/api/fit/work-weights'))
      .then(res => setWeights(res.data.weights ?? {}))
      .catch(() => { /* none yet */ });
  }, []);

  const save = useCallback((exercise: string, weight: number | null) => {
    setWeights(prev => {
      const next = { ...prev };
      if (weight == null) delete next[exercise];
      else next[exercise] = weight;
      return next;
    });
    fitRequest(() => axios.put('/api/fit/work-weights', { exercise, weight })).catch(() => {});
  }, []);

  return { weights, save };
}
