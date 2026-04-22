import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const GymDashboard = lazy(() => import('./GymDashboard').then(m => ({ default: m.GymDashboard })));

export function GymApp() {
  const { user, isLoading } = useAuth();
  const [accessChecked, setAccessChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    document.title = 'Gym | LUMNA';
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user) { setAccessChecked(true); setAllowed(false); return; }
    fetch('/api/gym/access', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { setAllowed(!!d.allowed); setAccessChecked(true); })
      .catch(() => { setAllowed(false); setAccessChecked(true); });
  }, [user, isLoading]);

  if (isLoading || !accessChecked) {
    return (
      <div className="h-dvh bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <Suspense fallback={<div className="h-dvh bg-slate-900" />}>
      <GymDashboard />
    </Suspense>
  );
}
