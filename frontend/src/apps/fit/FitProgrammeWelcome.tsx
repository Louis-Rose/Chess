import { useState } from 'react';
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { FitShell } from './FitShell';
import { PROGRAM_NAME, splitLabel } from './programData';

// Landing hub for the Programme tab. Lists the user's single program
// ("Programme de musculation") with view / modifier / supprimer actions, or an
// empty state inviting them to create one. Deletion is confirmed inline (no
// native dialog). The actual API calls live in FitProgramme.

interface Props {
  split: string | null;             // null => no program yet
  deleting: boolean;
  onView: () => void;
  onEdit: () => void;
  onCreate: () => void;
  onDelete: () => void;
}

export function FitProgrammeWelcome({ split, deleting, onView, onEdit, onCreate, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (!split) {
    return (
      <FitShell title="Programme">
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

  return (
    <FitShell title="Programme">
      <div className="mx-auto flex w-full max-w-[20rem] flex-col gap-5">
        <button
          type="button"
          onClick={onView}
          className="relative flex flex-col rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-4 text-left transition-colors active:bg-slate-800"
        >
          <span className="pr-6 font-medium text-slate-100">{PROGRAM_NAME}</span>
          <span className="mt-0.5 text-sm text-slate-400">{splitLabel(split)}</span>
          <ChevronRight className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
        </button>

        {confirming ? (
          <div className="flex flex-col gap-3">
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
          <div className="grid grid-cols-2 gap-3">
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
    </FitShell>
  );
}
