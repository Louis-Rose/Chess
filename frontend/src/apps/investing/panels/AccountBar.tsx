import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';

export interface AccountPill {
  key: string;
  label: string;
  count: number;
  accountId: number | null; // null for the "Unassigned" pseudo-account
}

// Account filter + management: select an account, create a new one, or delete
// the selected account (with its transactions). One account is active at a time.
export function AccountBar({
  pills,
  selectedKey,
  onSelect,
  onCreate,
  onDelete,
}: {
  pills: AccountPill[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete: (accountId: number) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selected = pills.find((p) => p.key === selectedKey);
  const canDelete = !!selected && selected.accountId !== null;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onCreate(name.trim());
      setName('');
      setCreating(false);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selected || selected.accountId === null) return;
    setBusy(true);
    try {
      await onDelete(selected.accountId);
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {pills.map((p) => {
        const active = p.key === selectedKey;
        return (
          <button
            key={p.key}
            onClick={() => {
              onSelect(p.key);
              setConfirmDelete(false);
            }}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
            }`}
          >
            {p.label}
            <span className={active ? 'text-emerald-400/70' : 'text-slate-500'}>{p.count}</span>
          </button>
        );
      })}

      {/* Delete the selected account */}
      {canDelete &&
        (confirmDelete ? (
          <span className="flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-sm">
            <span className="text-rose-300">
              Delete {selected!.label} ({selected!.count})?
            </span>
            <button
              onClick={remove}
              disabled={busy}
              className="font-semibold text-rose-300 hover:text-rose-200 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete account"
            className="rounded-full border border-slate-700 p-1.5 text-slate-500 transition-colors hover:border-rose-500 hover:text-rose-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ))}

      {/* Create a new account */}
      {creating ? (
        <form onSubmit={create} className="flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Account name"
            className="w-40 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-full bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-emerald-400 disabled:opacity-50"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setName('');
            }}
            aria-label="Cancel"
            className="text-slate-500 hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </form>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 rounded-full border border-dashed border-slate-700 px-3 py-1.5 text-sm text-slate-400 transition-colors hover:border-emerald-500 hover:text-emerald-300"
        >
          <Plus className="h-4 w-4" />
          New
        </button>
      )}
    </div>
  );
}
