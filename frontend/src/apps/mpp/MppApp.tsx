import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { OWNER_EMAIL } from '../../config';
import { SidebarLayout } from '../../components/SidebarLayout';
import { MppConnect } from './MppConnect';
import { MppLayout } from './MppLayout';
import { MppLeaderboard } from './MppLeaderboard';
import { MppTests } from './MppTests';
import { MppRules } from './MppRules';
import { MppDocs } from './MppDocs';
import type { MppStatus } from './types';

// Mon Petit Prono — owner-only. Gates on the owner, then either shows the
// one-time Connect form or the tabbed app (Leaderboard + MPP Docs).
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

  if (isLoading) return <Spinner />;
  if (user?.email !== OWNER_EMAIL) return <Navigate to="/" replace />;

  if (status === null) {
    return (
      <SidebarLayout title="MPP">
        <Spinner />
      </SidebarLayout>
    );
  }

  if (!status.connected) {
    return (
      <SidebarLayout title="MPP">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <MppConnect onConnected={loadStatus} />
        </div>
      </SidebarLayout>
    );
  }

  return (
    <Routes>
      <Route element={<MppLayout onDisconnect={loadStatus} />}>
        <Route index element={<Navigate to="leaderboard" replace />} />
        <Route path="leaderboard" element={<MppLeaderboard />} />
        <Route path="tests" element={<MppTests />} />
        <Route path="rules" element={<MppRules />} />
        <Route path="docs" element={<MppDocs />} />
        <Route path="*" element={<Navigate to="leaderboard" replace />} />
      </Route>
    </Routes>
  );
}

function Spinner() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-500" />
    </div>
  );
}
