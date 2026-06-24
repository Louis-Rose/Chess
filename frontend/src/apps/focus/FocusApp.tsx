import { useEffect, useState } from 'react';
import { Ban, X, Plus } from 'lucide-react';
import { AppHeader } from '../../components/AppHeader';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteBlock, type BlockItem, type BlockKind } from '../../hooks/useSiteBlock';

const OWNER_EMAIL = 'rose.louis.mail@gmail.com';

// Owner-only page at /focus: a big switch for blocking, plus editable lists of
// blocked websites and macOS apps. Same state as the profile-menu toggle.
export function FocusApp() {
  useEffect(() => {
    document.title = 'Focus | LUMNA';
  }, []);

  const { user } = useAuth();
  const isOwner = user?.email === OWNER_EMAIL;

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100">
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-8">
        <AppHeader title="Focus" />
        {isOwner ? (
          <FocusPanel />
        ) : (
          <p className="rounded-2xl border border-slate-800 bg-slate-800/40 p-8 text-center text-sm text-slate-400">
            This is a private tool. Sign in as the owner to use it.
          </p>
        )}
      </div>
    </div>
  );
}

function FocusPanel() {
  const { blocking, busy, toggle, items, addItem, removeItem } = useSiteBlock();
  const sites = items.filter((i) => i.kind === 'site');
  const apps = items.filter((i) => i.kind === 'app');

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Blocking</h2>
            <p className="mt-0.5 text-sm text-slate-400">
              {blocking ? 'On. Distracting tabs and apps are being closed.' : 'Off.'}
            </p>
          </div>
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            role="switch"
            aria-checked={blocking}
            aria-label="Site blocking"
            className={`relative h-8 w-14 flex-shrink-0 rounded-full transition-colors disabled:opacity-60 ${
              blocking ? 'bg-emerald-500' : 'bg-slate-600'
            }`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${
                blocking ? 'left-[26px]' : 'left-1'
              }`}
            />
          </button>
        </div>
      </div>

      <BlockList
        title="Websites"
        kind="site"
        placeholder="e.g. reddit.com"
        items={sites}
        onAdd={addItem}
        onRemove={removeItem}
      />
      <BlockList
        title="Mac apps"
        kind="app"
        placeholder="e.g. WhatsApp"
        items={apps}
        onAdd={addItem}
        onRemove={removeItem}
      />
    </div>
  );
}

function BlockList({
  title,
  kind,
  placeholder,
  items,
  onAdd,
  onRemove,
}: {
  title: string;
  kind: BlockKind;
  placeholder: string;
  items: BlockItem[];
  onAdd: (kind: BlockKind, value: string) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || saving) return;
    setSaving(true);
    try {
      await onAdd(kind, value);
      setValue('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-6">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>

      {items.length > 0 ? (
        <ul className="mb-3 flex flex-wrap gap-2">
          {items.map((i) => (
            <li
              key={i.id}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/50 py-1 pl-2.5 pr-1 text-sm text-slate-300"
            >
              {i.kind === 'site' ? (
                <a
                  href={`https://${i.value}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 transition-colors hover:text-emerald-400"
                >
                  <Ban className="h-3.5 w-3.5 text-slate-500" />
                  {i.value}
                </a>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Ban className="h-3.5 w-3.5 text-slate-500" />
                  {i.value}
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemove(i.id)}
                aria-label={`Remove ${i.value}`}
                className="ml-0.5 rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-700 hover:text-red-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-slate-500">Nothing yet.</p>
      )}

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!value.trim() || saving}
          className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-semibold transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </form>
    </div>
  );
}
