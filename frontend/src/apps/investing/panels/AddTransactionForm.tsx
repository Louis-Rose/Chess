import { useState } from 'react';

export interface AccountChoice {
  key: string;
  label: string;
  accountId: number | null;
}

export interface NewTransaction {
  stock_ticker: string;
  transaction_type: 'BUY' | 'SELL';
  quantity: number;
  price_per_share: number;
  price_currency: string;
  transaction_date: string;
  account_id: number | null;
}

const today = () => new Date().toISOString().slice(0, 10);

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none';

// Inline form to add a transaction. Account defaults to whichever account is
// currently selected on the page.
export function AddTransactionForm({
  accounts,
  defaultAccountKey,
  onAdd,
  onClose,
}: {
  accounts: AccountChoice[];
  defaultAccountKey: string | null;
  onAdd: (tx: NewTransaction) => Promise<void>;
  onClose: () => void;
}) {
  const [type, setType] = useState<'BUY' | 'SELL'>('BUY');
  const [ticker, setTicker] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [date, setDate] = useState(today());
  const [accountKey, setAccountKey] = useState(defaultAccountKey ?? accounts[0]?.key ?? 'none');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity);
    const px = Number(price);
    if (!ticker.trim()) return setError('Ticker is required.');
    if (!Number.isFinite(qty) || qty <= 0) return setError('Quantity must be positive.');
    if (!Number.isFinite(px) || px < 0) return setError('Price must be a number.');

    setSaving(true);
    setError(null);
    try {
      const account = accounts.find((a) => a.key === accountKey);
      await onAdd({
        stock_ticker: ticker.trim().toUpperCase(),
        transaction_type: type,
        quantity: qty,
        price_per_share: px,
        price_currency: currency.trim().toUpperCase() || 'EUR',
        transaction_date: date,
        account_id: account ? account.accountId : null,
      });
      onClose();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Could not add the transaction.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mb-4 rounded-xl border border-slate-800 bg-slate-800/40 p-4"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="flex overflow-hidden rounded-lg border border-slate-700">
          {(['BUY', 'SELL'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 px-3 py-2 text-sm font-bold transition-colors ${
                type === t
                  ? t === 'BUY'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/20 text-rose-300'
                  : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          className={inputClass}
          placeholder="Ticker (e.g. AAPL)"
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          autoFocus
        />
        <input
          className={inputClass}
          type="number"
          step="any"
          placeholder="Quantity"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <input
          className={inputClass}
          type="number"
          step="any"
          placeholder="Price / share"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <input
          className={inputClass}
          placeholder="Currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        />
        <input
          className={inputClass}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        {accounts.length > 0 && (
          <select
            className={`${inputClass} col-span-2 sm:col-span-3`}
            value={accountKey}
            onChange={(e) => setAccountKey(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-emerald-400 disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add transaction'}
        </button>
      </div>
    </form>
  );
}
