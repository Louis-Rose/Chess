import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { fitRequest } from './fitAuth';

// The user's machine-setting override per exercise base, persisted across
// sessions. `save` upserts (or clears, when the value is null/empty) and updates
// the local map. Mirrors useWorkWeights.
export function useExerciseSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    fitRequest(() => axios.get<{ settings: Record<string, string> }>('/api/fit/exercise-settings'))
      .then(res => setSettings(res.data.settings ?? {}))
      .catch(() => { /* none yet */ });
  }, []);

  const save = useCallback((exercise: string, setting: string | null) => {
    const v = setting?.trim() ? setting.trim() : null;
    setSettings(prev => {
      const next = { ...prev };
      if (v == null) delete next[exercise];
      else next[exercise] = v;
      return next;
    });
    fitRequest(() => axios.put('/api/fit/exercise-settings', { exercise, setting: v })).catch(() => {});
  }, []);

  return { settings, save };
}
