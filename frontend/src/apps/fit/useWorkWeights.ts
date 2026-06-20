import { useEffect, useState } from 'react';
import axios from 'axios';
import { fitRequest } from './fitAuth';

// The user's working weight per exercise, carried across sessions. Read-only:
// the value is recomputed server-side from history when a session is finished.
export function useWorkWeights() {
  const [weights, setWeights] = useState<Record<string, number>>({});

  useEffect(() => {
    fitRequest(() => axios.get<{ weights: Record<string, number> }>('/api/fit/work-weights'))
      .then(res => setWeights(res.data.weights ?? {}))
      .catch(() => { /* none yet */ });
  }, []);

  return { weights };
}
