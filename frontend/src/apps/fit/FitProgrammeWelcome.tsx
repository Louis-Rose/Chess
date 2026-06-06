import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitShell } from './FitShell';
import { MUSCLES, MUSCLE_LEAVES, splitLabel, sortLabels, groupExercises } from './programData';

// Landing for the Programme tab. The user only ever has one program, so it is
// shown directly (split + selected exercises per muscle). Tapping the card
// edits it; a small Supprimer below deletes it. Empty state invites creating one.
// Deletion is confirmed inline (no native dialog). API calls live in FitProgramme.

const MUSCLE_ORDER = MUSCLES.map(m => m.name);

interface Props {
  split: string | null;             // null => no program yet
  workSets: number | null;          // working sets per exercise
  deleting: boolean;
  onEdit: () => void;
  onCreate: () => void;
  onDelete: () => void;
}

export function FitProgrammeWelcome({ split, workSets, deleting, onEdit, onCreate, onDelete }: Props) {
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(!!split);   // only fetch when a program exists
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!split) return;
    fitRequest(() => axios.get<{ selections: Record<string, string[]> }>('/api/fit/exercises'))
      .then(res => setSelections(res.data.selections ?? {}))
      .catch(() => { /* show split only */ })
      .finally(() => setLoading(false));
  }, [split]);

  if (!split) {
    return (
      <FitShell title="Mon programme">
        <div className="mx-auto w-full max-w-[20rem] text-center">
          <p className="text-sm text-slate-400">Aucun programme pour le moment.</p>
          <button
            type="button"
            onClick={onCreate}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white transition-colors active:bg-emerald-500"
          >
            <Plus className="h-4 w-4" />
            Créer un programme
          </button>
        </div>
      </FitShell>
    );
  }

  // Only show leaves still valid in the catalogue (drop orphaned old picks).
  const validLeaves = (name: string) =>
    sortLabels((selections[name] ?? []).filter(ex => MUSCLE_LEAVES[name]?.has(ex)));
  const chosen = MUSCLE_ORDER.filter(name => validLeaves(name).length > 0);

  return (
    <FitShell>
      {loading ? (
        <div className="flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[20rem]">
          <div
            role="button"
            tabIndex={0}
            onClick={onEdit}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(); } }}
            className="cursor-pointer rounded-2xl border border-slate-800 bg-slate-800/30 px-5 py-7 text-center transition-colors hover:border-slate-700 active:bg-slate-800/60"
          >
            <h1 className="text-2xl font-semibold text-slate-100">Mon programme</h1>
            <div className="mx-auto mt-4 h-px w-24 bg-slate-700" />

            <p className="mt-6 text-xs uppercase tracking-wide text-slate-500">Split</p>
            <p className="mt-1 text-lg font-medium text-slate-100">{splitLabel(split)}</p>

            {workSets != null && (
              <div className="mt-6">
                <p className="text-xs uppercase tracking-wide text-slate-500">Séries de travail</p>
                <p className="mt-1 text-lg font-medium text-slate-100">{workSets}</p>
              </div>
            )}

            {chosen.length === 0 ? (
              <p className="mt-8 text-sm text-slate-400">Aucun exercice sélectionné pour le moment.</p>
            ) : (
              <div className="mt-7 flex flex-col gap-5">
                {chosen.map(name => (
                  <div key={name}>
                    <p className="text-xs uppercase tracking-wide text-slate-500">{name}</p>
                    <ul className="mt-2 flex flex-col gap-3">
                      {groupExercises(validLeaves(name)).map(ex => (
                        <li key={ex.name}>
                          <p className="text-slate-200">{ex.name}</p>
                          {ex.variants.length > 0 && (
                            <p className="mt-0.5 text-sm text-slate-200">({ex.variants.join(', ')})</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          {confirming ? (
            <div className="mt-6 flex flex-col items-center gap-3">
              <p className="text-sm text-slate-300">Supprimer ce programme ?</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                  className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors active:bg-slate-800"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting}
                  className="rounded-lg bg-red-600/90 px-3 py-1.5 text-xs font-semibold text-white transition-colors active:bg-red-600 disabled:opacity-60"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors active:bg-red-950/50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer
              </button>
            </div>
          )}
        </div>
      )}
    </FitShell>
  );
}
