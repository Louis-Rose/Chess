import { useEffect, useState } from 'react';
import axios from 'axios';
import { Ban, X, Plus, Copy, Check } from 'lucide-react';
import { SidebarLayout } from '../../components/SidebarLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteBlock, type BlockItem, type BlockKind } from '../../hooks/useSiteBlock';
import { OWNER_EMAIL } from '../../config';

// macOS apps that register a URL scheme can be launched from a link. Browsers
// can't open arbitrary native apps, so only the ones listed here are clickable.
const APP_SCHEMES: Record<string, string> = {
  whatsapp: 'whatsapp://',
  messages: 'imessage://',
  telegram: 'tg://',
  spotify: 'spotify://',
  slack: 'slack://',
  discord: 'discord://',
  notion: 'notion://',
};

// Clickable target for a chip: websites open in the browser; apps open via their
// URL scheme when known, otherwise the chip isn't a link.
function itemHref(i: BlockItem): string | null {
  if (i.kind === 'site') return `https://${i.value}`;
  return APP_SCHEMES[i.value.toLowerCase()] ?? null;
}

// Per-user page at /focus: a big switch for blocking, plus editable lists of
// blocked websites and macOS apps. Each logged-in user owns their own state.
export function FocusApp() {
  useEffect(() => {
    document.title = 'Focus | LUMNA';
  }, []);

  const { user, isAuthenticated, isLoading } = useAuth();
  const isOwner = user?.email === OWNER_EMAIL;

  return (
    <SidebarLayout title="Focus">
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-8">
        {isLoading ? null : isAuthenticated ? (
          <FocusPanel isOwner={isOwner} />
        ) : (
          <p className="rounded-2xl border border-slate-800 bg-slate-800/40 p-8 text-center text-sm text-slate-400">
            Sign in to use Focus.
          </p>
        )}
      </div>
    </SidebarLayout>
  );
}

function FocusPanel({ isOwner }: { isOwner: boolean }) {
  const { blocking, busy, toggle, items, addItem, removeItem } = useSiteBlock();
  const sites = items.filter((i) => i.kind === 'site');
  const apps = items.filter((i) => i.kind === 'app');

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-6 sm:p-8">
        <div className="relative flex items-center justify-center gap-4">
          <div className="text-center">
            <h2 className="text-lg font-semibold">Blocking</h2>
            <p className="mt-2 text-sm text-slate-400">
              {blocking
                ? isOwner
                  ? 'On. Distracting tabs and apps are being closed.'
                  : 'On.'
                : 'Off.'}
            </p>
          </div>
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            role="switch"
            aria-checked={blocking}
            aria-label="Site blocking"
            className={`absolute right-0 top-1/2 h-8 w-14 flex-shrink-0 -translate-y-1/2 rounded-full transition-colors disabled:opacity-60 ${
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

      <BlockList sites={sites} apps={apps} onAdd={addItem} onRemove={removeItem} blocking={blocking} />
      <ExtensionConnect />
    </div>
  );
}

// Shows the user's personal token for the LUMNA Focus browser extension, which
// blocks the listed websites in their own browser. Websites only; Mac apps are
// only enforced by the owner's desktop watcher.
function ExtensionConnect() {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    axios
      .get<{ token: string }>('/api/workblock/token')
      .then((r) => setToken(r.data.token))
      .catch(() => undefined);
  }, []);

  const copy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be blocked; the field is selectable as a fallback.
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-6">
      <h3 className="mb-1 text-lg font-semibold">Block in your browser</h3>
      <p className="mb-4 text-sm text-slate-400">
        Install the LUMNA Focus browser extension and paste this token to block these
        websites in your browser. Websites only. Blocking Mac apps needs the desktop watcher.
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          value={token ?? 'Loading...'}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-1.5 font-mono text-sm text-slate-200"
        />
        <button
          type="button"
          onClick={copy}
          disabled={!token}
          className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-semibold transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

function BlockList({
  sites,
  apps,
  onAdd,
  onRemove,
  blocking,
}: {
  sites: BlockItem[];
  apps: BlockItem[];
  onAdd: (kind: BlockKind, value: string) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
  blocking: boolean;
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
      <h3 className="mb-4 text-center text-lg font-semibold">Blocked</h3>

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

      <BlockGroup label="Websites" items={sites} onRemove={onRemove} blocking={blocking} />
      <div className="mt-5">
        <BlockGroup label="Mac apps" items={apps} onRemove={onRemove} blocking={blocking} />
      </div>
    </div>
  );
}

function BlockGroup({
  label,
  items,
  onRemove,
  blocking,
}: {
  label: string;
  items: BlockItem[];
  onRemove: (id: number) => Promise<void>;
  blocking: boolean;
}) {
  return (
    <div>
      <h4 className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</h4>
      {items.length > 0 ? (
        <ul className="flex flex-wrap justify-center gap-2">
          {items.map((i) => (
            <li
              key={i.id}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/50 py-1 pl-2.5 pr-1 text-sm text-slate-300"
            >
              {(() => {
                const href = blocking ? null : itemHref(i);
                const inner = (
                  <>
                    <Ban className="h-3.5 w-3.5 text-slate-500" />
                    {i.value}
                  </>
                );
                return href ? (
                  <a
                    href={href}
                    {...(i.kind === 'site' ? { target: '_blank', rel: 'noreferrer' } : {})}
                    className="flex items-center gap-1.5 transition-colors hover:text-emerald-400"
                  >
                    {inner}
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5">{inner}</span>
                );
              })()}
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
        <p className="text-center text-sm text-slate-500">Nothing yet.</p>
      )}
    </div>
  );
}
