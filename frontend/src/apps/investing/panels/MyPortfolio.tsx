import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Lock, Plus, Trash2, Wallet } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { LoginButton } from '../../../components/LoginButton';
import type { Transaction } from '../types';
import { PortfolioComposition } from './PortfolioComposition';
import {
  AddTransactionForm,
  type AccountChoice,
  type NewTransaction,
} from './AddTransactionForm';

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Which account a transaction belongs to, as a stable string key.
const acctKey = (t: Transaction) => (t.account_id == null ? 'none' : String(t.account_id));

interface AccountOption {
  key: string;
  label: string;
  count: number;
}

function TransactionRow({ tx, onDelete }: { tx: Transaction; onDelete: (id: number) => void }) {
  const isBuy = tx.transaction_type === 'BUY';
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="group flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-800/40 px-4 py-3">
      <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-1">
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
      {confirming ? (
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => onDelete(tx.id)}
            className="rounded bg-rose-500/20 px-2 py-1 font-semibold text-rose-300 hover:bg-rose-500/30"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded px-2 py-1 text-slate-400 hover:text-slate-200"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          aria-label="Delete transaction"
          className="text-slate-600 transition-colors hover:text-rose-400 md:opacity-0 md:group-hover:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// "My Portfolio" — the logged-in user's own holdings and transaction history.
// Gated behind Google login; the backend scopes every query to the
// authenticated user. One account is shown at a time, and both the composition
// and the transaction list reflect that single account.
export function MyPortfolio() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    document.title = 'My Portfolio — LUMNA';
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return axios
      .get<{ transactions: Transaction[] }>('/api/investing/transactions')
      .then((res) => setTransactions(res.data.transactions))
      .catch((err) => {
        setTransactions(null);
        setError(err?.response?.data?.error ?? 'Could not load your transactions.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setTransactions(null);
      return;
    }
    reload();
  }, [isAuthenticated, reload]);

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

  const accountChoices = useMemo<AccountChoice[]>(
    () =>
      accounts.map((a) => ({
        key: a.key,
        label: a.label,
        accountId: a.key === 'none' ? null : Number(a.key),
      })),
    [accounts],
  );

  const handleAdd = useCallback(
    async (tx: NewTransaction) => {
      const res = await axios.post<{ transaction: Transaction }>(
        '/api/investing/transactions',
        tx,
      );
      const created = res.data.transaction;
      setTransactions((prev) => (prev ? [created, ...prev] : [created]));
      setSelectedKey(acctKey(created)); // jump to the account it landed in
    },
    [],
  );

  const handleDelete = useCallback((id: number) => {
    setTransactions((prev) => (prev ? prev.filter((t) => t.id !== id) : prev));
    axios.delete(`/api/investing/transactions/${id}`).catch(() => reload());
  }, [reload]);

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
          <div className="mb-6 flex flex-wrap gap-2">
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

        {(authLoading || loading) && (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-500" />
          </div>
        )}

        {error && !loading && <p className="text-rose-400">{error}</p>}

        {transactions && !loading && (
          <>
            <hr className="mb-8 border-slate-800" />
            <section className="mb-8">
              <h2 className="mb-5 text-center text-xl font-semibold text-slate-100">Portfolio</h2>
              <PortfolioComposition transactions={visible} />
            </section>

            <hr className="mb-8 border-slate-800" />
            <section>
              <div className="relative mb-5 flex items-center justify-center">
                <h2 className="text-center text-xl font-semibold text-slate-100">Transactions</h2>
                <button
                  onClick={() => setAdding((v) => !v)}
                  className="absolute right-0 flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-emerald-500 hover:text-emerald-300"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>

              {adding && (
                <AddTransactionForm
                  accounts={accountChoices}
                  defaultAccountKey={selectedKey}
                  onAdd={handleAdd}
                  onClose={() => setAdding(false)}
                />
              )}

              {visible.length === 0 ? (
                <p className="text-slate-500">No transactions in this account.</p>
              ) : (
                <div className="space-y-2">
                  {visible.map((tx) => (
                    <TransactionRow key={tx.id} tx={tx} onDelete={handleDelete} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
