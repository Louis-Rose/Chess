import { Fragment, useEffect, useState } from 'react';
import axios from 'axios';
import { Check, Loader2, Plus } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { FitConfirm } from './FitConfirm';
import { FitShell } from './FitShell';
import { FitSwipeRow } from './FitSwipeRow';
import { splitLabel, type FitProgram } from './programData';
import { useSession } from './sessionTimer';

// Landing for the Programme tab: the list of the user's programs. The active one
// (used everywhere in the app) is marked; any other can be made active with
// "Utiliser". Tapping a card edits it (onOpen with isNew=false); swiping a card
// left reveals a Supprimer button. "Nouveau programme" creates an empty one and
// opens it in the guided wizard (onOpen with isNew=true).
//
// The active program defines what a session logs, so nothing here can change
// mid-session: every action is blocked with an explanatory notice while a
// session is in progress.

interface ProgramRow extends FitProgram {
  exercise_count: number;
}

export function FitProgrammeList({ onOpen }: { onOpen: (program: FitProgram, isNew: boolean) => void }) {
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);          // a create/activate/delete is in flight
  const [openId, setOpenId] = useState<number | null>(null);  // row swiped open for delete
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
      onOpen(res.data, true);
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
      setOpenId(null);
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
      <FitShell title="Mes programmes" center>
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
    <FitShell title="Mes programmes" center>
      <div className="mx-auto flex w-full max-w-[22rem] flex-col gap-4">
        {programs.map(p => {
          const isActive = p.id === activeId;
          const splitLabels = p.splits.map(splitLabel).filter(Boolean);
          return (
            <FitSwipeRow
              key={p.id}
              isOpen={openId === p.id}
              onOpen={() => setOpenId(p.id)}
              onClose={() => setOpenId(null)}
              onDelete={guard(() => remove(p.id))}
              onTap={guard(() => onOpen(p, false))}
              className={`relative px-5 py-4 text-center ${isActive ? 'border-emerald-500/60' : 'border-slate-700'}`}
            >
              {/* Status / activate badge, pinned top-right so the text below
                  stays centered. */}
              <div className="absolute right-4 top-4">
                {isActive ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                    <Check className="h-3.5 w-3.5" />
                    Actif
                  </span>
                ) : (
                  <span
                    role="button"
                    tabIndex={0}
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => { e.stopPropagation(); guard(() => activate(p.id))(); }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); guard(() => activate(p.id))(); } }}
                    className="rounded-full border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 transition-colors active:bg-slate-800"
                  >
                    Utiliser
                  </span>
                )}
              </div>

              <h2 className="truncate text-lg font-semibold text-white">{p.name}</h2>
              {/* One split per line, with "&" alone on its own line between them. */}
              {splitLabels.length === 0 ? (
                <p className="mt-4 text-sm text-white">Split non défini</p>
              ) : (
                splitLabels.map((label, i) => (
                  <Fragment key={i}>
                    {i > 0 && <p className="text-sm text-white">&</p>}
                    <p className={`text-sm text-white ${i === 0 ? 'mt-4' : ''}`}>{label}</p>
                  </Fragment>
                ))
              )}
              <p className="mt-3 text-sm text-white">
                {p.exercise_count} exercice{p.exercise_count !== 1 ? 's' : ''}
              </p>
            </FitSwipeRow>
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
