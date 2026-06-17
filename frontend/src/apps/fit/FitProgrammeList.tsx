import { useEffect, useState } from 'react';
import axios from 'axios';
import { Check, Loader2, Plus, Trash2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitConfirm } from './FitConfirm';
import { FitShell } from './FitShell';
import { splitLabel, type FitProgram } from './programData';
import { useSession } from './sessionTimer';

// Landing for the Programme tab: the list of the user's programs. The active one
// (used everywhere in the app) is marked; any other can be made active with
// "Utiliser". Tapping a card edits it; a trash button deletes it (inline confirm).
// "Nouveau programme" creates an empty one and opens it for editing.
//
// The active program defines what a session logs, so nothing here can change
// mid-session: every action is blocked with an explanatory notice while a
// session is in progress.

interface ProgramRow extends FitProgram {
  exercise_count: number;
}

export function FitProgrammeList({ onOpen }: { onOpen: (program: FitProgram) => void }) {
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);          // a create/activate/delete is in flight
  const [confirmingId, setConfirmingId] = useState<number | null>(null);  // delete confirm
  const [blocked, setBlocked] = useState(false);

  const session = useSession();
  const guard = (fn: () => void) => () => {
    if (session) { setBlocked(true); return; }
    fn();
  };

  function load() {
    fitRequest(() => axios.get<{ programs: ProgramRow[]; active_id: number | null }>('/api/fit/programs'))
      .then(res => { setPrograms(res.data.programs ?? []); setActiveId(res.data.active_id); })
      .catch(() => { /* leave empty — empty state shows the create button */ })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function create() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fitRequest(() => axios.post<FitProgram>('/api/fit/programs', {}));
      onOpen(res.data);
    } catch {
      /* stay on the list */
    } finally {
      setBusy(false);
    }
  }

  async function activate(id: number) {
    if (busy || id === activeId) return;
    setBusy(true);
    try {
      await fitRequest(() => axios.put('/api/fit/programs/active', { program_id: id }));
      setActiveId(id);
    } catch {
      /* keep the current active */
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (busy) return;
    setBusy(true);
    try {
      await fitRequest(() => axios.delete(`/api/fit/programs/${id}`));
      setConfirmingId(null);
      load();
    } catch {
      /* keep the program shown */
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <FitShell title="Mes programmes">
        <div className="flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      </FitShell>
    );
  }

  const notice = blocked && (
    <FitConfirm
      title="Séance en cours"
      message="Termine ta séance avant de modifier tes programmes."
      confirmLabel="J'ai compris"
      hideCancel
      onConfirm={() => setBlocked(false)}
      onCancel={() => setBlocked(false)}
    />
  );

  if (programs.length === 0) {
    return (
      <FitShell title="Mes programmes">
        <div className="mx-auto w-full max-w-[20rem] text-center">
          <p className="text-sm text-slate-400">Aucun programme pour le moment.</p>
          <button
            type="button"
            onClick={guard(create)}
            disabled={busy}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white transition-colors active:bg-emerald-500 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Créer un programme
          </button>
        </div>
        {notice}
      </FitShell>
    );
  }

  return (
    <FitShell title="Mes programmes">
      <div className="mx-auto flex w-full max-w-[22rem] flex-col gap-4">
        {programs.map(p => {
          const isActive = p.id === activeId;
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={guard(() => onOpen(p))}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); guard(() => onOpen(p))(); } }}
              className={`cursor-pointer rounded-2xl border px-5 py-4 transition-colors ${
                isActive
                  ? 'border-emerald-500/60 bg-emerald-500/5'
                  : 'border-slate-700 bg-slate-800/30 active:bg-slate-800/60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-slate-100">{p.name}</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    {splitLabel(p.split) || 'Split non défini'}
                    <span className="mx-1.5 text-slate-600">·</span>
                    {p.exercise_count} exercice{p.exercise_count > 1 ? 's' : ''}
                  </p>
                </div>
                {isActive ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                    <Check className="h-3.5 w-3.5" />
                    Actif
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); guard(() => activate(p.id))(); }}
                    disabled={busy}
                    className="shrink-0 rounded-full border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 transition-colors active:bg-slate-800 disabled:opacity-60"
                  >
                    Utiliser
                  </button>
                )}
              </div>

              {confirmingId === p.id ? (
                <div className="mt-4 flex items-center justify-end gap-3" onClick={e => e.stopPropagation()}>
                  <span className="mr-auto text-sm text-slate-300">Supprimer ce programme ?</span>
                  <button
                    type="button"
                    onClick={() => setConfirmingId(null)}
                    disabled={busy}
                    className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-100 transition-colors active:bg-slate-800"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    disabled={busy}
                    className="rounded-lg bg-red-600/90 px-3 py-1.5 text-xs font-semibold text-white transition-colors active:bg-red-600 disabled:opacity-60"
                  >
                    Supprimer
                  </button>
                </div>
              ) : (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); guard(() => setConfirmingId(p.id))(); }}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-colors active:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={guard(create)}
          disabled={busy}
          className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-600 px-5 py-3 font-medium text-slate-200 transition-colors active:bg-slate-800/60 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          Nouveau programme
        </button>
      </div>
      {notice}
    </FitShell>
  );
}
