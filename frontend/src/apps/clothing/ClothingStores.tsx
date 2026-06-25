import { useState } from 'react';
import { ExternalLink } from 'lucide-react';

// The stores your agent searches, and where to browse them yourself. Logos live
// in frontend/public/logos/ and are referenced by their root path.
interface StoreItem {
  name: string;
  city: string;
  url: string;
  logo: string;
}

const STORES: StoreItem[] = [
  {
    name: 'Octobre Éditions',
    city: 'Paris',
    url: 'https://www.octobre-editions.com/',
    logo: '/logos/octobre.png',
  },
];

export function ClothingStores() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <h2 className="mb-1 text-lg font-semibold">Stores</h2>
      <p className="mb-6 text-sm text-slate-400">
        The shops your agent searches. Tap one to browse it yourself.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {STORES.map((s) => (
          <StoreCard key={s.url} store={s} />
        ))}
      </div>
    </div>
  );
}

function StoreCard({ store }: { store: StoreItem }) {
  const [imgError, setImgError] = useState(false);

  return (
    <a
      href={store.url}
      target="_blank"
      rel="noreferrer"
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-800/40 transition-colors hover:border-emerald-500/60"
    >
      <div className="flex h-28 items-center justify-center bg-[#f4f1ea] p-6">
        {imgError ? (
          <span className="text-center font-serif text-xl tracking-wide text-neutral-900">
            {store.name}
          </span>
        ) : (
          <img
            src={store.logo}
            alt={store.name}
            className="max-h-full max-w-full object-contain"
            onError={() => setImgError(true)}
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{store.name}</p>
          <p className="text-xs text-slate-400">{store.city}</p>
        </div>
        <ExternalLink className="h-4 w-4 flex-shrink-0 text-emerald-400 transition-transform group-hover:translate-x-0.5" />
      </div>
    </a>
  );
}
