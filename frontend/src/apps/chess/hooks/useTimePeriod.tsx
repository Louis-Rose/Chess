import { useState } from 'react';
import { TimePeriodToggle } from '../components/TimePeriodToggle';
import type { TimePeriod } from '../components/TimePeriodToggle';

export function useTimePeriod(initial: TimePeriod = 'ALL') {
  const [period, setPeriod] = useState<TimePeriod>(initial);
  const toggle = <TimePeriodToggle selected={period} onChange={setPeriod} />;
  return { period, setPeriod, toggle } as const;
}
