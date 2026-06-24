import { useEffect, useState } from 'react';
import axios from 'axios';
import { Copy, Check } from 'lucide-react';
import { SidebarLayout } from '../../components/SidebarLayout';
import { useAuth } from '../../contexts/AuthContext';
import { getFocusToken, focusHeaders } from './focusToken';
import { pingExtension, isExtensionPresentMessage } from './extensionBridge';

// Page at /focus: hands out the connection token for the LUMNA Focus browser
// extension. Blocking and the block list are managed in the extension itself.
export function FocusApp() {
  useEffect(() => {
    document.title = 'Focus | LUMNA';
  }, []);

  const { isAuthenticated } = useAuth();

  return (
    <SidebarLayout title="Focus">
      <div className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="space-y-4">
          <ExtensionConnect isAuthenticated={isAuthenticated} />
          {!isAuthenticated && (
            <p className="px-1 text-center text-xs text-slate-500">
              This token is tied to this device. Sign in to use the same one everywhere.
            </p>
          )}
        </div>
      </div>
    </SidebarLayout>
  );
}

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

// Shows the caller's token for the LUMNA Focus browser extension. Logged-in
// users get a stable server token; anonymous users use their browser token.
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
        Install the LUMNA Focus browser extension and paste this token into it. You manage
        blocking and your block list right from the extension.
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
