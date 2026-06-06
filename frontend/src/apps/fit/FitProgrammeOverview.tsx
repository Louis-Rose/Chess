import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitShell } from './FitShell';
import { MUSCLES, PROGRAM_NAME, splitLabel, sortLabels } from './programData';

// Read-only detail of the program (reached via "view" on the welcome hub):
// the chosen split + selected exercises per muscle. Remounted each time it is
// shown, so it always reflects the latest saved selections.

const MUSCLE_ORDER = MUSCLES.map(m => m.name);

export function FitProgrammeOverview({ split, onBack }: { split: string; onBack: () => void }) {
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fitRequest(() => axios.get<{ selections: Record<string, string[]> }>('/api/fit/exercises'))
      .then(res => setSelections(res.data.selections ?? {}))
      .catch(() => { /* show split only */ })
      .finally(() => setLoading(false));
  }, []);

  const chosen = MUSCLE_ORDER.filter(name => (selections[name]?.length ?? 0) > 0);

  return (
    <FitShell title={PROGRAM_NAME} onBack={onBack}>
      {loading ? (
        <div className="flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[20rem]">
          <p className="text-xs uppercase tracking-wide text-slate-500">Split</p>
          <p className="mt-1 text-lg font-medium text-slate-100">{splitLabel(split)}</p>

          {chosen.length === 0 ? (
            <p className="mt-8 text-sm text-slate-400">Aucun exercice sélectionné pour le moment.</p>
          ) : (
            <div className="mt-7 flex flex-col gap-5">
              {chosen.map(name => (
                <div key={name}>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{name}</p>
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {sortLabels(selections[name]).map(ex => (
                      <li key={ex} className="text-slate-200">{ex}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </FitShell>
  );
}
