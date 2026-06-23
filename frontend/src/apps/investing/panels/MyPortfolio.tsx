import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Lock, Wallet } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { LoginButton } from '../../../components/LoginButton';
import type { Transaction } from '../types';

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function TransactionRow({ tx }: { tx: Transaction }) {
  const isBuy = tx.transaction_type === 'BUY';
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-800/40 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span
          className={`rounded px-2 py-0.5 text-xs font-bold ${
            isBuy ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
          }`}
        >
          {tx.transaction_type}
        </span>
        <span className="w-16 font-bold text-slate-100">{tx.stock_ticker}</span>
        <span className="text-slate-300">{tx.quantity} shares</span>
        <span className="text-slate-500">@</span>
        <span className="text-slate-300">
          {tx.price_currency} {tx.price_per_share.toFixed(2)}
        </span>
        {tx.account_name && (
          <span className="rounded bg-slate-700/50 px-2 py-0.5 text-xs text-slate-400">
            {tx.account_name}
          </span>
        )}
        <span className="ml-auto text-sm text-slate-400">{fmtDate(tx.transaction_date)}</span>
      </div>
    </div>
  );
}

// "My Portfolio" — the logged-in user's own transaction history. Gated behind
// Google login; the backend scopes the query to the authenticated user, so
// each person only ever sees their own rows.
export function MyPortfolio() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'My Portfolio — LUMNA';
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setTransactions(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    axios
      .get<{ transactions: Transaction[] }>('/api/investing/transactions')
      .then((res) => {
        if (!cancelled) setTransactions(res.data.transactions);
      })
      .catch((err) => {
        if (cancelled) return;
        setTransactions(null);
        setError(err?.response?.data?.error ?? 'Could not load your transactions.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const summary = useMemo(() => {
    if (!transactions) return null;
    const buys = transactions.filter((t) => t.transaction_type === 'BUY').length;
    return { total: transactions.length, buys, sells: transactions.length - buys };
  }, [transactions]);

  // Not logged in: prompt for Google sign-in.
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 text-center">
        <Lock className="h-10 w-10 text-slate-600" />
        <div>
          <h2 className="text-xl font-semibold text-slate-100">My Portfolio</h2>
          <p className="mt-1 max-w-sm text-slate-400">
            Sign in with Google to see your own transactions. Your portfolio is private to you.
          </p>
        </div>
        <LoginButton redirectTo="/investing/portfolio" />
      </div>
    );
  }

  return (
    <div className="px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <Wallet className="h-6 w-6 text-emerald-400" />
          <h1 className="text-2xl font-bold text-slate-100">My Portfolio</h1>
        </div>

        {summary && (
          <p className="mb-6 text-sm text-slate-400">
            {summary.total} transactions · {summary.buys} buys · {summary.sells} sells
            {user?.email ? ` · ${user.email}` : ''}
          </p>
        )}

        {(authLoading || loading) && (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-500" />
          </div>
        )}

        {error && !loading && <p className="text-rose-400">{error}</p>}

        {transactions && !loading && transactions.length === 0 && (
          <p className="text-slate-500">No transactions yet.</p>
        )}

        {transactions && !loading && transactions.length > 0 && (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
