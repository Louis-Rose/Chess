import { useEffect, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';
import { fitRequest } from './fitAuth';
import { groupExercises, MUSCLE_LEAVES, MUSCLE_ORDER, sortLabels } from './programData';
import { FitExerciseHistory } from './FitExerciseHistory';

// Days-since-last-done for each exercise currently in the program, grouped by
// muscle. Opened from the "Jours depuis la dernière séance" card on Accueil.
//
// Matching is by *base* exercise, not by exact leaf: an exercise like
// "Développé épaules" has independent variant rows (equipment + grip) stored
// as separate leaves, and a logged set only carries one of them — so we
// aggregate across all leaves sharing a base (most recent wins).

const baseOf = (leaf: string) => {
  const i = leaf.indexOf(' — ');
  return i === -1 ? leaf : leaf.slice(0, i);
};

// The calendar date the exercise was last done, from its days-ago count, as a
// French long date ("mardi 3 juin"; capitalized in the UI via CSS).
const lastDoneLabel = (days: number | undefined) => {
  if (days == null) return 'Jamais';
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
};

interface BaseInfo { days: number; sessionId: number; }

export function FitLastDone({ onBack }: { onBack: () => void }) {
  const [baseInfo, setBaseInfo] = useState<Record<string, BaseInfo>>({});
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [historyBase, setHistoryBase] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fitRequest(() => axios.get<{ exercises: { exercise: string; days: number; session_id: number }[] }>('/api/fit/last-done')),
      fitRequest(() => axios.get<{ selections: Record<string, string[]> }>('/api/fit/exercises')),
    ])
      .then(([ld, ex]) => {
        // Per base exercise, keep the most recent leaf (its days + session).
        const bd: Record<string, BaseInfo> = {};
        for (const e of ld.data.exercises ?? []) {
          const b = baseOf(e.exercise);
          if (bd[b] == null || e.days < bd[b].days) bd[b] = { days: e.days, sessionId: e.session_id };
        }
        setBaseInfo(bd);
        setSelections(ex.data.selections ?? {});
      })
      .catch(() => { /* show empty */ })
      .finally(() => setLoading(false));
  }, []);

  if (historyBase != null) return <FitExerciseHistory base={historyBase} onBack={() => setHistoryBase(null)} />;

  const groups = MUSCLE_ORDER
    .map(m => {
      const valid = (selections[m] ?? []).filter(l => MUSCLE_LEAVES[m]?.has(l));
      return { name: m, entries: groupExercises(sortLabels(valid)) };
    })
    .filter(g => g.entries.length > 0);

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem-1px)] w-full max-w-md flex-col px-5 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={onBack}
        className="self-start inline-flex items-center gap-1.5 py-1 text-xs text-slate-300 transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Précédent</span>
      </button>

      <h1 className="mt-4 text-center text-2xl font-semibold">Dernière fois</h1>

      {loading ? (
        <div className="mt-10 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : groups.length === 0 ? (
        <p className="mt-10 text-center text-sm text-slate-400">Aucun exercice dans le programme.</p>
      ) : (
        <div className="mx-auto mt-8 flex w-full max-w-[22rem] flex-col gap-6">
          {groups.map(g => (
            <section key={g.name}>
              <h2 className="text-center text-xs uppercase tracking-wide text-slate-500">{g.name}</h2>
              <div className="mt-2 flex flex-col gap-2">
                {g.entries.map(entry => {
                  const info = baseInfo[entry.name];
                  const inner = (
                    <>
                      <div className="min-w-0 flex-1 text-center">
                        <div className="truncate text-slate-100">{entry.name}</div>
                        {entry.variants.length > 0 && (
                          <div className="truncate text-sm text-slate-400">({entry.variants.join(', ')})</div>
                        )}
                      </div>
                      <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-sm capitalize text-slate-300">
                        {lastDoneLabel(info?.days)}
                        {info && <ChevronRight className="h-4 w-4 text-slate-500" />}
                      </span>
                    </>
                  );
                  const cls = 'flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3';
                  // Tappable only when there's a session to open (i.e. it was done).
                  return info ? (
                    <button
                      key={entry.name}
                      type="button"
                      onClick={() => setHistoryBase(entry.name)}
                      className={`${cls} w-full transition-colors active:bg-slate-800`}
                    >
                      {inner}
                    </button>
                  ) : (
                    <div key={entry.name} className={cls}>{inner}</div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
