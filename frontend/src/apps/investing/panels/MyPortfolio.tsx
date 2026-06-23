import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Lock, Wallet } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { LoginButton } from '../../../components/LoginButton';
import type { Transaction } from '../types';

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Which account a transaction belongs to, as a stable string key.
const acctKey = (t: Transaction) => (t.account_id == null ? 'none' : String(t.account_id));

interface AccountOption {
  key: string;
  label: string;
  count: number;
}

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
        <span className="ml-auto text-sm text-slate-400">{fmtDate(tx.transaction_date)}</span>
      </div>
    </div>
  );
}

// "My Portfolio" — the logged-in user's own transaction history. Gated behind
// Google login; the backend scopes the query to the authenticated user, so
// each person only ever sees their own rows. One account is shown at a time.
export function MyPortfolio() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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

  // Distinct accounts present in the data, most-active first.
  const accounts = useMemo<AccountOption[]>(() => {
    if (!transactions) return [];
    const map = new Map<string, AccountOption>();
    for (const t of transactions) {
      const key = acctKey(t);
      const label =
        t.account_name || (t.account_id == null ? 'Unassigned' : `Account ${t.account_id}`);
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, { key, label, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [transactions]);

  // Default to the most-active account; keep selection valid as data changes.
  useEffect(() => {
    if (accounts.length === 0) return;
    if (selectedKey === null || !accounts.some((a) => a.key === selectedKey)) {
      setSelectedKey(accounts[0].key);
    }
  }, [accounts, selectedKey]);

  const visible = useMemo(() => {
    if (!transactions) return [];
    if (selectedKey === null) return transactions;
    return transactions.filter((t) => acctKey(t) === selectedKey);
  }, [transactions, selectedKey]);

  const summary = useMemo(() => {
    const buys = visible.filter((t) => t.transaction_type === 'BUY').length;
    return { total: visible.length, buys, sells: visible.length - buys };
  }, [visible]);

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

        {accounts.length > 1 && (
          <div className="mb-5 flex flex-wrap gap-2">
            {accounts.map((a) => {
              const active = a.key === selectedKey;
              return (
                <button
                  key={a.key}
                  onClick={() => setSelectedKey(a.key)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                      : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                  }`}
                >
                  {a.label}
                  <span className={active ? 'text-emerald-400/70' : 'text-slate-500'}>
                    {a.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {!loading && !error && transactions && (
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

        {transactions && !loading && visible.length === 0 && (
          <p className="text-slate-500">No transactions in this account.</p>
        )}

        {!loading && visible.length > 0 && (
          <div className="space-y-2">
            {visible.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
