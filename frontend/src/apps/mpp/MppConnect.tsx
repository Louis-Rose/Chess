import { useState } from 'react';
import axios from 'axios';
import { Copy, Check } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';

// One snippet, run in the MPP browser console, pulls the refresh token out of
// the Auth0 session in localStorage. The owner pastes the result below; it goes
// straight to the Lumna backend and is never shown again.
const EXTRACT_SNIPPET =
  "(()=>{for(const k of Object.keys(localStorage)){try{const v=JSON.parse(localStorage[k]);const t=v?.body?.refresh_token||v?.refresh_token;if(t)return t;}catch(e){}}return'NOT FOUND';})()";

export function MppConnect({ onConnected }: { onConnected: () => void }) {
  const { t } = useLanguage();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const copySnippet = () => {
    navigator.clipboard.writeText(EXTRACT_SNIPPET).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const connect = () => {
    const value = token.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    axios
      .post('/api/mpp/connect', { refresh_token: value })
      .then(() => onConnected())
      .catch((e) => {
        setError(e?.response?.data?.error || t('mpp.connect.error'));
        setBusy(false);
      });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-100">{t('mpp.connect.title')}</h2>
        <p className="mt-1 text-sm text-slate-400">{t('mpp.connect.intro')}</p>
      </div>

      <ol className="space-y-4 text-sm text-slate-300">
        <li>
          <span className="font-semibold text-slate-100">1.</span> {t('mpp.connect.step1Pre')}{' '}
          <a
            href="https://mpp.football"
            target="_blank"
            rel="noreferrer"
            className="text-emerald-400 hover:underline"
          >
            mpp.football
          </a>{' '}
          {t('mpp.connect.step1Post')}
        </li>
        <li>
          <span className="font-semibold text-slate-100">2.</span> {t('mpp.connect.step2')}
          <div className="mt-2 flex items-start gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-emerald-300">
              {EXTRACT_SNIPPET}
            </code>
            <button
              onClick={copySnippet}
              className="shrink-0 rounded-lg border border-slate-700 bg-slate-800/60 p-2 text-slate-300 hover:border-emerald-500 hover:text-emerald-400"
              title={t('mpp.connect.copySnippet')}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </li>
        <li>
          <span className="font-semibold text-slate-100">3.</span> {t('mpp.connect.step3')}
        </li>
      </ol>

      <textarea
        value={token}
        onChange={(e) => setToken(e.target.value)}
        rows={3}
        placeholder={t('mpp.connect.placeholder')}
        className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
      />

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={connect}
        disabled={busy || !token.trim()}
        className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-emerald-400 disabled:opacity-50"
      >
        {busy ? t('mpp.connect.connecting') : t('mpp.connect.connect')}
      </button>
    </div>
  );
}
