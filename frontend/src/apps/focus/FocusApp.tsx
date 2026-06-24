import { useEffect, useState } from 'react';
import axios from 'axios';
import { Ban, X, Plus, Copy, Check } from 'lucide-react';
import { SidebarLayout } from '../../components/SidebarLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useSiteBlock, type BlockItem } from '../../hooks/useSiteBlock';
import { getFocusToken, focusHeaders } from './focusToken';
import { pingExtension, isExtensionPresentMessage } from './extensionBridge';

// Page at /focus: a big switch for blocking, plus an editable list of blocked
// websites. Same experience for everyone (no owner special case); each user owns
// their own state, logged in or anonymous.
export function FocusApp() {
  useEffect(() => {
    document.title = 'Focus | LUMNA';
  }, []);

  const { isAuthenticated } = useAuth();

  return (
    <SidebarLayout title="Focus">
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-8">
        <FocusPanel isAuthenticated={isAuthenticated} />
      </div>
    </SidebarLayout>
  );
}

function FocusPanel({ isAuthenticated }: { isAuthenticated: boolean }) {
  const { blocking, busy, toggle, items, addItem, removeItem } = useSiteBlock();

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-6 sm:p-8">
        <div className="flex flex-col items-center gap-3">
          <h2 className="text-lg font-semibold">Blocking</h2>
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
          <p className="text-sm text-slate-400">{blocking ? 'On.' : 'Off.'}</p>
        </div>
      </div>

      <BlockList items={items} onAdd={addItem} onRemove={removeItem} blocking={blocking} />
      <ExtensionConnect isAuthenticated={isAuthenticated} />
      {!isAuthenticated && (
        <p className="px-1 text-center text-xs text-slate-500">
          Your list is saved on this device. Sign in to sync it across devices.
        </p>
      )}
    </div>
  );
}

// Shows the caller's token for the LUMNA Focus browser extension, which blocks
// the listed websites in their own browser. Logged-in users get a stable server
// token; anonymous users use their browser token. Websites only; Mac apps are
// only enforced by the owner's desktop watcher.
// True once the LUMNA Focus extension's content script announces itself (on load
// or in reply to our ping). Drives the "Connected" badge.
function useExtensionPresent(): boolean {
  const [present, setPresent] = useState(false);
  useEffect(() => {
    let alive = true;
    const onMsg = (e: MessageEvent) => {
      if (alive && isExtensionPresentMessage(e)) setPresent(true);
    };
    window.addEventListener('message', onMsg);
    pingExtension().then((p) => {
      if (alive && p) setPresent(true);
    });
    return () => {
      alive = false;
      window.removeEventListener('message', onMsg);
    };
  }, []);
  return present;
}

function ExtensionConnect({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const extensionPresent = useExtensionPresent();

  useEffect(() => {
    if (!isAuthenticated) {
      setToken(getFocusToken());
      return;
    }
    axios
      .get<{ token: string }>('/api/workblock/token', { headers: focusHeaders() })
      .then((r) => setToken(r.data.token))
      .catch(() => undefined);
  }, [isAuthenticated]);

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
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-lg font-semibold">Block in your browser</h3>
        {extensionPresent && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
            <Check className="h-3 w-3" />
            Connected
          </span>
        )}
      </div>
      <p className="mb-4 text-sm text-slate-400">
        Install the LUMNA Focus browser extension and paste this token to block these
        websites in your browser.
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
  items,
  onAdd,
  onRemove,
  blocking,
}: {
  items: BlockItem[];
  onAdd: (value: string) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
  blocking: boolean;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || saving) return;
    setSaving(true);
    try {
      await onAdd(value);
      setValue('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-6">
      <h3 className="mb-4 text-center text-lg font-semibold">Blocked websites</h3>

      <form onSubmit={submit} className="mb-5 flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. reddit.com"
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

      {items.length > 0 ? (
        <ul className="flex flex-wrap justify-center gap-2">
          {items.map((i) => {
            const href = blocking ? null : `https://${i.value}`;
            const inner = (
              <>
                <Ban className="h-3.5 w-3.5 text-slate-500" />
                {i.value}
              </>
            );
            return (
              <li
                key={i.id}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/50 py-1 pl-2.5 pr-1 text-sm text-slate-300"
              >
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 transition-colors hover:text-emerald-400"
                  >
                    {inner}
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5">{inner}</span>
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
            );
          })}
        </ul>
      ) : (
        <p className="text-center text-sm text-slate-500">Nothing yet.</p>
      )}
    </div>
  );
}
