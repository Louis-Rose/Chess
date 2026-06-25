import { useEffect, useState } from 'react';
import axios from 'axios';
import { Copy, Check, X } from 'lucide-react';
import { focusHeaders } from './focusToken';
import { pingExtension, isExtensionPresentMessage } from './extensionBridge';

// Focus is not a full app, just token management for the LUMNA Focus browser
// extension. It lives in the account dropdown as a modal: hand out the connection
// token, let the user copy or rotate it. Blocking and the block list are managed
// in the extension itself.

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

// Modal shell: centered overlay, close on backdrop click or Escape.
export function FocusSettingsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Focus"
        className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Focus</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ExtensionConnect />
      </div>
    </div>
  );
}

// Shows the signed-in user's stable server token for the LUMNA Focus extension.
function ExtensionConnect() {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [forceShow, setForceShow] = useState(false); // reveal token while connected
  const [rotated, setRotated] = useState(false); // the shown token is a freshly rotated one
  const extensionPresent = useExtensionPresent();

  useEffect(() => {
    axios
      .get<{ token: string }>('/api/workblock/token', { headers: focusHeaders() })
      .then((r) => setToken(r.data.token))
      .catch(() => undefined);
  }, []);

  // Once the extension is detected, the token has done its job, so collapse it.
  const showToken = !extensionPresent || forceShow;

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

  // Issue a fresh token; the old one stops working, so reveal the new one to
  // paste into the extension.
  const rotate = async () => {
    setRotating(true);
    try {
      const r = await axios.post<{ token: string }>(
        '/api/workblock/token',
        {},
        { headers: focusHeaders() },
      );
      setToken(r.data.token);
      setRotated(true);
      setForceShow(true);
    } catch {
      // ignore
    } finally {
      setRotating(false);
    }
  };

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-200">Block in your browser</h3>
        {extensionPresent && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
            <Check className="h-3 w-3" />
            Connected
          </span>
        )}
      </div>

      {showToken ? (
        <>
          <p className="mb-4 text-sm text-slate-400">
            {rotated
              ? 'New token generated. Your old one stopped working. Paste this into your extension.'
              : extensionPresent
                ? 'Paste this token into your LUMNA Focus extension.'
                : 'Install the LUMNA Focus browser extension and paste this token into it. You manage blocking and your block list right from the extension.'}
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={token ?? 'Loading...'}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950/50 px-3 py-1.5 font-mono text-sm text-slate-200"
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
          {extensionPresent && (
            <button
              type="button"
              onClick={() => {
                setForceShow(false);
                setRotated(false);
              }}
              className="mt-3 text-sm text-slate-500 transition-colors hover:text-slate-300"
            >
              Done
            </button>
          )}
        </>
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-400">
            Your extension is connected. Manage blocking and your block list from the extension.
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={rotate}
              disabled={rotating}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-semibold transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 disabled:opacity-60"
            >
              {rotating ? 'Generating...' : 'Generate new token'}
            </button>
            <button
              type="button"
              onClick={() => setForceShow(true)}
              className="text-sm text-slate-500 transition-colors hover:text-slate-300"
            >
              Show token
            </button>
          </div>
        </>
      )}
    </div>
  );
}
