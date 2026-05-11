import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';

const StocksDashboard = lazy(() => import('./StocksDashboard').then(m => ({ default: m.StocksDashboard })));

export function StocksApp() {
  const { user, isLoading } = useAuth();
  const [accessChecked, setAccessChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    document.title = 'Stocks | LUMNA';
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user) { setAccessChecked(true); setAllowed(false); return; }
    axios.get('/api/stocks/access')
      .then(r => { setAllowed(!!r.data?.allowed); setAccessChecked(true); })
      .catch(() => { setAllowed(false); setAccessChecked(true); });
  }, [user, isLoading]);

  if (isLoading || !accessChecked) {
    return (
      <div className="h-dvh bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }
  if (!allowed) return <Navigate to="/app" replace />;

  return (
    <Suspense fallback={<div className="h-dvh bg-slate-900" />}>
      <StocksDashboard />
    </Suspense>
  );
}
