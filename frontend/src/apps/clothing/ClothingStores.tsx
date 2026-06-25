import { useState } from 'react';
import { ExternalLink, Plus, X } from 'lucide-react';
import { useStores, type Store } from './StoresContext';

// The stores your agent searches, shared with the Find tab's source chips.
// Logos live in frontend/public/logos/ and are referenced by their root path.
export function ClothingStores() {
  const { stores, addStore, removeStore } = useStores();
  const [site, setSite] = useState('');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);

  const submit = () => {
    if (!site.trim()) return;
    addStore({ url: site.trim(), domain: site.trim(), name: name.trim() || undefined });
    setSite('');
    setName('');
    setAdding(false);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <h2 className="mb-6 text-center text-2xl font-semibold">Stores</h2>

      <div className="flex flex-wrap justify-center gap-3">
        {stores.map((s) => (
          <div key={s.domain} className="w-full sm:w-[calc(50%-0.375rem)]">
            <StoreCard store={s} onRemove={() => removeStore(s.domain)} />
          </div>
        ))}
      </div>

      {/* Add a store: collapsed to a small button until opened */}
      <div className="mt-6 flex justify-center">
        {adding ? (
          <div className="relative w-full rounded-2xl border border-slate-800 bg-slate-800/30 p-4">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setSite('');
                setName('');
              }}
              aria-label="Close"
              className="absolute right-3 top-3 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="mb-3 text-center text-sm font-semibold">Add a store</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={site}
                onChange={(e) => setSite(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), submit())}
                placeholder="site or URL, e.g. sezane.com"
                autoFocus
                className="flex-1 rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
              />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), submit())}
                placeholder="name (optional)"
                className="rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none sm:w-48"
              />
              <button
                type="button"
                onClick={submit}
                disabled={!site.trim()}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 transition-colors hover:border-emerald-500 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/40 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-emerald-500 hover:text-emerald-300"
          >
            <Plus className="h-4 w-4" />
            Add a store
          </button>
        )}
      </div>
    </div>
  );
}

function StoreCard({ store, onRemove }: { store: Store; onRemove: () => void }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-800/40 transition-colors hover:border-emerald-500/60">
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${store.name}`}
        className="absolute right-2 top-2 z-10 rounded-full bg-slate-900/70 p-1 text-slate-400 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
      <a href={store.url} target="_blank" rel="noreferrer" className="flex flex-col">
        <div className="flex h-28 items-center justify-center bg-[#f4f1ea] p-6">
          {store.logo && !imgError ? (
            <img
              src={store.logo}
              alt={store.name}
              className="max-h-full max-w-full object-contain"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className="text-center font-serif text-xl tracking-wide text-neutral-900">
              {store.name}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{store.name}</p>
            {store.city && <p className="text-xs text-slate-400">{store.city}</p>}
          </div>
          <ExternalLink className="h-4 w-4 flex-shrink-0 text-emerald-400 transition-transform group-hover:translate-x-0.5" />
        </div>
      </a>
    </div>
  );
}
