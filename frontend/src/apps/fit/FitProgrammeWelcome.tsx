import { useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitShell } from './FitShell';
import { MUSCLES, splitLabel, sortLabels } from './programData';

// Landing for the Programme tab. The user only ever has one program, so it is
// shown directly (split + selected exercises per muscle) with Modifier /
// Supprimer actions — no click-through card. Empty state invites creating one.
// Deletion is confirmed inline (no native dialog). API calls live in FitProgramme.

const MUSCLE_ORDER = MUSCLES.map(m => m.name);

interface Props {
  split: string | null;             // null => no program yet
  deleting: boolean;
  onEdit: () => void;
  onCreate: () => void;
  onDelete: () => void;
}

export function FitProgrammeWelcome({ split, deleting, onEdit, onCreate, onDelete }: Props) {
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
      <FitShell title="Mon Programme">
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

  const chosen = MUSCLE_ORDER.filter(name => (selections[name]?.length ?? 0) > 0);

  return (
    <FitShell title="Mon Programme">
      {loading ? (
        <div className="flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[20rem]">
          <div className="rounded-2xl border border-slate-800 bg-slate-800/30 px-5 py-7 text-center">
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

          {confirming ? (
            <div className="mt-6 flex flex-col gap-3">
              <p className="text-center text-sm text-slate-300">Supprimer ce programme ?</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                  className="rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 font-medium text-slate-100 transition-colors active:bg-slate-800"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting}
                  className="rounded-xl bg-red-600/90 px-4 py-3 font-semibold text-white transition-colors active:bg-red-600 disabled:opacity-60"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 font-medium text-slate-100 transition-colors active:bg-slate-800"
              >
                <Pencil className="h-4 w-4" />
                Modifier
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 font-medium text-red-300 transition-colors active:bg-red-950/50"
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </button>
            </div>
          )}
        </div>
      )}
    </FitShell>
  );
}
