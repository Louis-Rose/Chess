import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { OWNER_EMAIL } from '../../config';
import { SidebarLayout } from '../../components/SidebarLayout';

// Mon Petit Prono — owner-only World Cup prediction game. This is the scaffold;
// fixtures, predictions and scoring land in the next pass.
export function MppApp() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    document.title = 'MPP | LUMNA';
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-900">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-500" />
      </div>
    );
  }
  if (user?.email !== OWNER_EMAIL) return <Navigate to="/" replace />;

  return (
    <SidebarLayout title="MPP">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-8 text-center">
          <h2 className="text-2xl font-bold text-slate-100">Mon Petit Prono</h2>
          <p className="mt-2 text-slate-400">
            Predict the 2026 World Cup results and track your score.
          </p>
          <p className="mt-6 text-sm text-slate-500">
            Matches and scoring coming next.
          </p>
        </div>
      </div>
    </SidebarLayout>
  );
}
