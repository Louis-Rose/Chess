import { useMemo, useState } from 'react';
import { Copy, Check, Download, Code2 } from 'lucide-react';
import { MPP_API, type MppEndpoint } from './mppEndpoints';

// MPP Docs tab: a human-readable reference for the reverse-engineered Mon Petit
// Prono API, backed by the MPP_API catalog. The same catalog is the
// machine-readable source, offered here as copy / download JSON.
export function MppDocs() {
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const json = useMemo(() => JSON.stringify(MPP_API, null, 2), []);
  const count = useMemo(
    () => MPP_API.groups.reduce((n, g) => n + g.endpoints.length, 0),
    [],
  );

  const copyJson = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const downloadJson = () => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mpp-api.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-100">MPP Docs</h2>
          <div className="flex items-center gap-2">
            <button onClick={copyJson} className={btnClass}>
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
            <button onClick={downloadJson} className={btnClass}>
              <Download className="h-4 w-4" />
              Download
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-400">
          Reverse-engineered map of the Mon Petit Prono API. {count} endpoints across{' '}
          {MPP_API.groups.length} areas, extracted from the production web bundle on{' '}
          {MPP_API.extractedAt}.
        </p>
      </header>

      {/* Base + auth */}
      <section className="space-y-2 rounded-2xl border border-slate-800 bg-slate-800/40 p-5">
        <Field label="Base URL" value={MPP_API.baseUrl} mono />
        <Field label="Auth" value={MPP_API.auth.scheme} mono />
        <Field label="Token" value={MPP_API.auth.tokenEndpoint} mono />
        <Field label="Audience" value={MPP_API.auth.audience} mono />
        <p className="pt-1 text-xs text-slate-500">{MPP_API.methodsNote}</p>
      </section>

      {/* Groups */}
      {MPP_API.groups.map((g) => (
        <section key={g.title} className="space-y-3">
          <div>
            <h3 className="text-base font-semibold text-slate-100">{g.title}</h3>
            <p className="text-xs text-slate-500">{g.description}</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-800">
            {g.endpoints.map((e, i) => (
              <EndpointRow key={e.path + i} endpoint={e} last={i === g.endpoints.length - 1} />
            ))}
          </div>
        </section>
      ))}

      {/* Raw JSON (machine-readable, inline) */}
      <section className="space-y-2">
        <button onClick={() => setShowRaw((v) => !v)} className={btnClass}>
          <Code2 className="h-4 w-4" />
          {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
        </button>
        {showRaw && (
          <pre className="max-h-96 overflow-auto rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-300">
            {json}
          </pre>
        )}
      </section>
    </div>
  );
}

function EndpointRow({ endpoint: e, last }: { endpoint: MppEndpoint; last: boolean }) {
  return (
    <div
      className={`flex items-start gap-3 bg-slate-800/40 px-4 py-3 ${
        last ? '' : 'border-b border-slate-800'
      }`}
    >
      <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${methodClass(e.method)}`}>
        {e.method}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-mono text-sm text-slate-200">
          <span className="break-all">{e.path}</span>
          {e.verified && (
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
              Verified
            </span>
          )}
        </p>
        <p className="text-xs text-slate-500">{e.summary}</p>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className={`break-all text-sm text-slate-200 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

const btnClass =
  'flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:border-emerald-500 hover:text-emerald-400';

function methodClass(method: string): string {
  switch (method) {
    case 'GET':
      return 'bg-sky-500/15 text-sky-300';
    case 'POST':
      return 'bg-emerald-500/15 text-emerald-300';
    case 'PUT':
    case 'PATCH':
      return 'bg-amber-500/15 text-amber-300';
    case 'DELETE':
      return 'bg-red-500/15 text-red-300';
    default:
      return 'bg-slate-700/60 text-slate-400';
  }
}
