import { useEffect, useState } from 'react';
import { Ban, X, Plus } from 'lucide-react';
import { SidebarLayout } from '../../components/SidebarLayout';
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
    <SidebarLayout title="Focus">
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-8">
        {isOwner ? (
          <FocusPanel />
        ) : (
          <p className="rounded-2xl border border-slate-800 bg-slate-800/40 p-8 text-center text-sm text-slate-400">
            This is a private tool. Sign in as the owner to use it.
          </p>
        )}
      </div>
    </SidebarLayout>
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

      <BlockList sites={sites} apps={apps} onAdd={addItem} onRemove={removeItem} />
    </div>
  );
}

function BlockList({
  sites,
  apps,
  onAdd,
  onRemove,
}: {
  sites: BlockItem[];
  apps: BlockItem[];
  onAdd: (kind: BlockKind, value: string) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || saving) return;
    // A value with a dot (reddit.com) is a website; anything else is an app.
    const kind: BlockKind = value.includes('.') ? 'site' : 'app';
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
      <h3 className="mb-4 text-lg font-semibold">Blocked</h3>

      <form onSubmit={submit} className="mb-5 flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. reddit.com or whatsapp"
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

      <BlockGroup label="Websites" items={sites} onRemove={onRemove} />
      <div className="mt-5">
        <BlockGroup label="Mac apps" items={apps} onRemove={onRemove} />
      </div>
    </div>
  );
}

function BlockGroup({
  label,
  items,
  onRemove,
}: {
  label: string;
  items: BlockItem[];
  onRemove: (id: number) => Promise<void>;
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</h4>
      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
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
        <p className="text-sm text-slate-500">Nothing yet.</p>
      )}
    </div>
  );
}
