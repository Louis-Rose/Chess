import { lazy, Suspense, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

import { OWNER_EMAIL } from '../../config';

const ChessDashboard = lazy(() => import('./ChessDashboard').then(m => ({ default: m.ChessDashboard })));

export function ChessApp() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    document.title = 'Chess | LUMNA';
  }, []);

  if (isLoading) {
    return (
      <div className="h-dvh bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }
  if (user?.email !== OWNER_EMAIL) return <Navigate to="/chess/app" replace />;

  return (
    <Suspense fallback={<div className="h-dvh bg-slate-900" />}>
      <ChessDashboard />
    </Suspense>
  );
}
