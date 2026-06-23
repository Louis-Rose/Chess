import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Lock, Plus, Trash2, Wallet } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { LoginButton } from '../../../components/LoginButton';
import type { Account, Transaction } from '../types';
import { ownedTickers } from '../holdings';
import { PortfolioComposition } from './PortfolioComposition';
import { AccountBar, type AccountPill } from './AccountBar';
import {
  AddTransactionForm,
  type AccountChoice,
  type NewTransaction,
} from './AddTransactionForm';

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Which account a transaction belongs to, as a stable string key.
const acctKey = (t: Transaction) => (t.account_id == null ? 'none' : String(t.account_id));

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
        <span className="ml-auto text-sm text-slate-400">
          {fmtDate(tx.transaction_date)}
          {tx.transaction_time && (
            <span className="text-slate-500"> · {tx.transaction_time}</span>
          )}
        </span>
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
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [ownedOnly, setOwnedOnly] = useState(true);

  useEffect(() => {
    document.title = 'My Portfolio — LUMNA';
  }, []);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([
      axios.get<{ accounts: Account[] }>('/api/investing/accounts'),
      axios.get<{ transactions: Transaction[] }>('/api/investing/transactions'),
    ])
      .then(([a, t]) => {
        setAccounts(a.data.accounts);
        setTransactions(t.data.transactions);
      })
      .catch((err) => {
        setAccounts(null);
        setTransactions(null);
        setError(err?.response?.data?.error ?? 'Could not load your portfolio.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setAccounts(null);
      setTransactions(null);
      return;
    }
    reload();
  }, [isAuthenticated, reload]);

  // Account pills come from the accounts list (so empty accounts still show),
  // with counts from the transactions. An "Unassigned" pill appears only if
  // some transactions have no account. Most-active first.
  const pills = useMemo<AccountPill[]>(() => {
    const counts = new Map<string, number>();
    for (const t of transactions ?? []) {
      const k = acctKey(t);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const list: AccountPill[] = (accounts ?? []).map((a) => ({
      key: String(a.id),
      label: a.name,
      accountId: a.id,
      count: counts.get(String(a.id)) ?? 0,
    }));
    const noneCount = counts.get('none') ?? 0;
    if (noneCount > 0) {
      list.push({ key: 'none', label: 'Unassigned', accountId: null, count: noneCount });
    }
    return list.sort((a, b) => b.count - a.count);
  }, [accounts, transactions]);

  // Default to the first pill; keep selection valid as data changes.
  useEffect(() => {
    if (pills.length === 0) return;
    if (selectedKey === null || !pills.some((p) => p.key === selectedKey)) {
      setSelectedKey(pills[0].key);
    }
  }, [pills, selectedKey]);

  const visible = useMemo(() => {
    if (!transactions) return [];
    if (selectedKey === null) return transactions;
    return transactions.filter((t) => acctKey(t) === selectedKey);
  }, [transactions, selectedKey]);

  const accountChoices = useMemo<AccountChoice[]>(
    () => (accounts ?? []).map((a) => ({ key: String(a.id), label: a.name, accountId: a.id })),
    [accounts],
  );

  // Tickers still held in the selected account. When "owned only" is on, the
  // transaction list (and the graphs built on top of it) is restricted to
  // these, dropping transactions for positions that were fully sold.
  const owned = useMemo(() => ownedTickers(visible), [visible]);
  const displayTransactions = useMemo(
    () => (ownedOnly ? visible.filter((t) => owned.has(t.stock_ticker)) : visible),
    [ownedOnly, visible, owned],
  );

  const handleAdd = useCallback(async (tx: NewTransaction) => {
    const res = await axios.post<{ transaction: Transaction }>('/api/investing/transactions', tx);
    const created = res.data.transaction;
    setTransactions((prev) => (prev ? [created, ...prev] : [created]));
    setSelectedKey(acctKey(created)); // jump to the account it landed in
  }, []);

  const handleDeleteTx = useCallback(
    (id: number) => {
      setTransactions((prev) => (prev ? prev.filter((t) => t.id !== id) : prev));
      axios.delete(`/api/investing/transactions/${id}`).catch(() => reload());
    },
    [reload],
  );

  const handleCreateAccount = useCallback(async (name: string) => {
    const res = await axios.post<{ account: Account }>('/api/investing/accounts', { name });
    const acct = res.data.account;
    setAccounts((prev) => (prev ? [...prev, acct] : [acct]));
    setSelectedKey(String(acct.id));
  }, []);

  const handleDeleteAccount = useCallback(async (accountId: number) => {
    await axios.delete(`/api/investing/accounts/${accountId}`);
    setAccounts((prev) => (prev ? prev.filter((a) => a.id !== accountId) : prev));
    setTransactions((prev) => (prev ? prev.filter((t) => t.account_id !== accountId) : prev));
    setSelectedKey(null); // selection resets to the first remaining pill
  }, []);

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

  const ready = accounts !== null && transactions !== null;

  return (
    <div className="px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <Wallet className="h-6 w-6 text-emerald-400" />
          <h1 className="text-2xl font-bold text-slate-100">My Portfolio</h1>
        </div>

        {ready && (
          <div className="mb-6">
            <AccountBar
              pills={pills}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              onCreate={handleCreateAccount}
              onDelete={handleDeleteAccount}
            />
          </div>
        )}

        {(authLoading || loading) && (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-500" />
          </div>
        )}

        {error && !loading && <p className="text-rose-400">{error}</p>}

        {ready && !loading && (
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

              <button
                onClick={() => setOwnedOnly((v) => !v)}
                role="switch"
                aria-checked={ownedOnly}
                className="mx-auto mb-5 flex items-center gap-2.5 text-sm text-slate-400 transition-colors hover:text-slate-200"
              >
                <span
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                    ownedOnly ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      ownedOnly ? 'translate-x-[22px]' : 'translate-x-0.5'
                    }`}
                  />
                </span>
                Only currently owned stocks
              </button>

              <p className="mb-5 text-center text-sm text-slate-500">
                {displayTransactions.length}{' '}
                {displayTransactions.length === 1 ? 'transaction' : 'transactions'} shown
              </p>

              {adding && (
                <AddTransactionForm
                  accounts={accountChoices}
                  defaultAccountKey={selectedKey}
                  onAdd={handleAdd}
                  onClose={() => setAdding(false)}
                />
              )}

              {displayTransactions.length === 0 ? (
                <p className="text-center text-slate-500">
                  {ownedOnly && visible.length > 0
                    ? 'No transactions for currently owned stocks.'
                    : 'No transactions in this account.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {displayTransactions.map((tx) => (
                    <TransactionRow key={tx.id} tx={tx} onDelete={handleDeleteTx} />
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
