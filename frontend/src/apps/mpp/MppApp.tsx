import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { RefreshCw, Trophy, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { OWNER_EMAIL } from '../../config';
import { SidebarLayout } from '../../components/SidebarLayout';
import { MppConnect } from './MppConnect';
import type { MppData, MppStatus } from './types';

// Mon Petit Prono — owner-only. The owner pastes an MPP refresh token once (see
// MppConnect); the backend then reads their live ranking/points from
// api.mpp.football. This page shows the data with a manual refresh.
export function MppApp() {
  const { user, isLoading } = useAuth();
  const [status, setStatus] = useState<MppStatus | null>(null);

  useEffect(() => {
    document.title = 'MPP | LUMNA';
  }, []);

  const loadStatus = useCallback(() => {
    axios
      .get<MppStatus>('/api/mpp/status')
      .then((r) => setStatus(r.data))
      .catch(() => setStatus({ connected: false, updated_at: null }));
  }, []);

  useEffect(() => {
    if (user?.email === OWNER_EMAIL) loadStatus();
  }, [user?.email, loadStatus]);

  if (isLoading) return <FullScreenSpinner />;
  if (user?.email !== OWNER_EMAIL) return <Navigate to="/" replace />;

  return (
    <SidebarLayout title="MPP">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        {status === null ? (
          <FullScreenSpinner />
        ) : status.connected ? (
          <Dashboard onDisconnect={loadStatus} />
        ) : (
          <MppConnect onConnected={loadStatus} />
        )}
      </div>
    </SidebarLayout>
  );
}

// ── Connected dashboard ──────────────────────────────────────────────────────

function Dashboard({ onDisconnect }: { onDisconnect: () => void }) {
  const [data, setData] = useState<MppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    axios
      .get<MppData>('/api/mpp/data')
      .then((r) => setData(r.data))
      .catch((e) => {
        const code = e?.response?.data?.error;
        setError(
          code === 'token_expired'
            ? 'Your MPP session expired. Reconnect with a fresh token.'
            : code === 'not_connected'
              ? 'Not connected.'
              : 'Could not reach MPP. Try again in a moment.',
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const disconnect = () => {
    axios.post('/api/mpp/disconnect').then(onDisconnect);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100">Mon Petit Prono</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:border-emerald-500 hover:text-emerald-400 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={disconnect}
            title="Disconnect MPP"
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm font-medium text-slate-400 transition-colors hover:border-red-500/60 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-10 text-center text-slate-400">
          Loading your predictions...
        </div>
      ) : data ? (
        <ContestList data={data} />
      ) : null}
    </div>
  );
}

function ContestList({ data }: { data: MppData }) {
  if (!data.contests.length) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-10 text-center text-slate-400">
        No leagues found on your MPP account yet.
        <RawPayload raw={data.raw} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {data.contests.map((c, i) => (
        <div
          key={c.id ?? i}
          className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-800/40 px-5 py-4"
        >
          <div className="flex items-center gap-3">
            <Trophy className="h-5 w-5 text-emerald-400" strokeWidth={1.5} />
            <div>
              <p className="font-semibold text-slate-100">{c.title ?? 'League'}</p>
              {c.participants != null && (
                <p className="text-xs text-slate-500">{c.participants} players</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-6 text-right">
            {c.ranking != null && (
              <Stat label="Rank" value={`#${c.ranking}`} />
            )}
            {c.points != null && <Stat label="Points" value={c.points} />}
          </div>
        </div>
      ))}
      <RawPayload raw={data.raw} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-lg font-bold text-slate-100">{value}</p>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

// First-pass aid: the raw MPP payload, collapsed, so we can confirm field names
// and add more (forecasts, matches) once we see real data.
function RawPayload({ raw }: { raw: unknown }) {
  return (
    <details className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs">
      <summary className="cursor-pointer text-slate-500">Raw MPP response</summary>
      <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-all text-slate-400">
        {JSON.stringify(raw, null, 2)}
      </pre>
    </details>
  );
}

function FullScreenSpinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-500" />
    </div>
  );
}
