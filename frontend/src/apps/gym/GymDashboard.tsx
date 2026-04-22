import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Dumbbell, ArrowLeft, Archive, ArchiveRestore, EyeOff, Eye, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BodyHeatmap } from './BodyHeatmap';

interface WeeklyPoint { week: string; sets: number }
interface SetEntry { reps: number; weight_kg: number; is_warmup: boolean }
interface SessionEntry { date: string; sets: SetEntry[] }
interface Exercise {
  exercise: string;
  muscle_group: string;
  last_date: string;
  days_since: number;
  total_sets: number;
  sets_last_7d: number;
  best_weight_kg: number;
  weekly_sets: WeeklyPoint[];
  ignored: boolean;
  sessions: SessionEntry[];
}
interface Dashboard {
  last_synced_at: string | null;
  today: string;
  exercises: Exercise[];
}

function daysSinceColor(d: number) {
  if (d <= 2) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  if (d <= 5) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
  if (d <= 7) return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
  return 'text-red-400 bg-red-500/10 border-red-500/30';
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtSync(iso: string | null) {
  if (!iso) return 'never';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

export function GymDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muscleFilter, setMuscleFilter] = useState<string>('ALL');
  const [showIgnored, setShowIgnored] = useState(false);

  async function toggleIgnore(exercise: string, ignored: boolean) {
    setData(prev => prev ? {
      ...prev,
      exercises: prev.exercises.map(e => e.exercise === exercise ? { ...e, ignored } : e),
    } : prev);
    try {
      await axios.post('/api/gym/exercises/ignore', { exercise, ignored });
    } catch (e) {
      setError(String(e));
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get<Dashboard>('/api/gym/dashboard');
      setData(r.data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setError(null);
    try {
      await axios.post('/api/gym/sync');
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  useEffect(() => {
    if (!data || syncing) return;
    const stale = !data.last_synced_at
      || (Date.now() - new Date(data.last_synced_at).getTime()) > 12 * 60 * 60 * 1000;
    if (stale) sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.last_synced_at]);

  const muscles = useMemo(() => {
    if (!data) return ['ALL'];
    const order = ['SHOULDERS', 'CHEST', 'BACK', 'BICEPS', 'TRICEPS', 'ABS', 'LEGS', 'OTHER'];
    const present = new Set(data.exercises.map(e => e.muscle_group));
    const known = order.filter(m => present.has(m));
    const unknown = [...present].filter(m => !order.includes(m));
    return ['ALL', ...known, ...unknown];
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.exercises.filter(e =>
      (showIgnored || !e.ignored)
      && (muscleFilter === 'ALL' || e.muscle_group === muscleFilter)
    );
  }, [data, muscleFilter, showIgnored]);

  const ignoredCount = useMemo(
    () => data?.exercises.filter(e => e.ignored).length ?? 0,
    [data]
  );

  const muscleStats = useMemo(() => {
    const out: Record<string, { minDaysSince: number | null }> = {};
    for (const ex of data?.exercises ?? []) {
      if (ex.ignored) continue;
      const cur = out[ex.muscle_group]?.minDaysSince;
      if (cur === undefined || cur === null || ex.days_since < cur) {
        out[ex.muscle_group] = { minDaysSince: ex.days_since };
      }
    }
    return out;
  }, [data]);

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 font-sans">
      <header className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Dumbbell className="w-6 h-6 text-emerald-400" />
          <h1 className="text-xl font-semibold flex-1">Gym</h1>
          <button
            onClick={sync}
            disabled={syncing}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-200 disabled:opacity-50 transition-colors"
            title="Re-sync from Notion"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'syncing…' : `synced ${fmtSync(data?.last_synced_at ?? null)}`}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg text-sm">
            {error}
          </div>
        )}

        {loading && !data && (
          <div className="h-64 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        )}

        {data && data.exercises.length === 0 && (
          <div className="text-center py-16 text-slate-500">
            <Dumbbell className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No data yet. Click <span className="font-semibold text-slate-300">Sync</span> to pull from Notion.</p>
          </div>
        )}

        {data && data.exercises.length > 0 && (
          <div className="mb-4">
            <BodyHeatmap stats={muscleStats} selected={muscleFilter} onSelect={setMuscleFilter} />
          </div>
        )}

        {data && data.exercises.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {muscles.map(m => (
              <button
                key={m}
                onClick={() => setMuscleFilter(m)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  muscleFilter === m
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
              >
                {m}
              </button>
            ))}
            {ignoredCount > 0 && (
              <button
                onClick={() => setShowIgnored(v => !v)}
                className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  showIgnored
                    ? 'bg-slate-700 text-slate-200'
                    : 'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'
                }`}
              >
                {showIgnored ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {showIgnored ? 'Hide' : 'Show'} archived ({ignoredCount})
              </button>
            )}
          </div>
        )}

        <div className="space-y-3">
          {filtered.map(ex => (
            <ExerciseCard key={ex.exercise} ex={ex} onToggleIgnore={toggleIgnore} />
          ))}
        </div>
      </main>
    </div>
  );
}

function ExerciseCard({ ex, onToggleIgnore }: { ex: Exercise; onToggleIgnore: (exercise: string, ignored: boolean) => void }) {
  const [expanded, setExpanded] = useState(false);
  const color = ex.ignored
    ? 'text-slate-500 bg-slate-700/30 border-slate-700'
    : daysSinceColor(ex.days_since);
  const last12 = ex.weekly_sets.slice(-12);

  return (
    <div className={`bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden ${ex.ignored ? 'opacity-60' : ''}`}>
      <div className="flex items-stretch">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 p-4 flex items-center gap-4 text-left hover:bg-slate-800 transition-colors min-w-0"
        >
          <div className={`flex-shrink-0 w-16 h-16 rounded-lg border flex flex-col items-center justify-center ${color}`}>
            <div className="text-xl font-bold leading-none">{ex.days_since}</div>
            <div className="text-[10px] uppercase tracking-wider mt-0.5">day{ex.days_since === 1 ? '' : 's'}</div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <div className="font-medium text-slate-100 truncate">{ex.exercise}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{ex.muscle_group}</div>
              {ex.ignored && <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">• archived</div>}
            </div>
            <div className="text-xs text-slate-400 mt-1 flex gap-3 flex-wrap">
              <span>Last: {fmtDate(ex.last_date)}</span>
              <span>•</span>
              <span>{ex.sets_last_7d} set{ex.sets_last_7d === 1 ? '' : 's'} last 7d</span>
              {ex.best_weight_kg > 0 && (<><span>•</span><span>Best: {ex.best_weight_kg}kg</span></>)}
            </div>
          </div>
        </button>
        <button
          onClick={() => onToggleIgnore(ex.exercise, !ex.ignored)}
          className="flex flex-col items-center justify-center gap-1 px-4 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors border-l border-slate-700 text-[11px] font-medium"
          title={ex.ignored ? 'Restore to active exercises' : 'Archive — keep data, hide from dashboard'}
        >
          {ex.ignored
            ? <><ArchiveRestore className="w-4 h-4" /><span>Restore</span></>
            : <><Archive className="w-4 h-4" /><span>Archive</span></>}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-slate-700 p-4 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Sets per week (last 12)</div>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={last12} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="week" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: '#cbd5e1' }}
                    itemStyle={{ color: '#10b981' }}
                  />
                  <Bar dataKey="sets" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {ex.sessions.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                Session history ({ex.sessions.length} most recent)
              </div>
              <div className="space-y-1.5">
                {ex.sessions.map(s => (
                  <div key={s.date} className="flex gap-3 text-xs">
                    <div className="w-16 flex-shrink-0 text-slate-400 font-mono">{fmtDate(s.date)}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {s.sets.map((set, i) => (
                        <span
                          key={i}
                          className={`px-1.5 py-0.5 rounded ${
                            set.is_warmup
                              ? 'bg-slate-800 text-slate-500 italic'
                              : 'bg-slate-700 text-slate-200'
                          }`}
                        >
                          {set.reps}×{set.weight_kg > 0 ? `${set.weight_kg}kg` : 'BW'}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-xs text-slate-500">{ex.total_sets} total working sets</div>
        </div>
      )}
    </div>
  );
}
