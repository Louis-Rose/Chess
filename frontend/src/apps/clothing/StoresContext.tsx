import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// Single source of truth for the shops the clothing app knows about. Both the
// Find tab (search-source chips) and the Stores tab read and write this list,
// so adding or removing a store in one place updates the other. Persisted to
// localStorage; migrates the old domain-only `clothing.sources` list.
export interface Store {
  domain: string;
  name: string;
  url: string;
  logo?: string;
  city?: string;
}

export interface StoreInput {
  domain?: string;
  name?: string;
  url?: string;
  logo?: string;
  city?: string;
}

const STORES_KEY = 'clothing.stores';
const LEGACY_SOURCES_KEY = 'clothing.sources';

const DEFAULT_STORES: Store[] = [
  {
    domain: 'octobre-editions.com',
    name: 'Octobre Éditions',
    url: 'https://www.octobre-editions.com/',
    logo: '/logos/octobre.png',
    city: 'Paris',
  },
];

export function cleanDomain(raw: string): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .trim();
}

function titleCase(domain: string): string {
  const base = domain.split('.')[0];
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function normalize(input: StoreInput): Store | null {
  const domain = input.domain ? cleanDomain(input.domain) : input.url ? cleanDomain(input.url) : '';
  if (!domain || !domain.includes('.')) return null;
  const url = input.url && /^https?:\/\//.test(input.url) ? input.url : `https://www.${domain}/`;
  const name = input.name?.trim() || titleCase(domain);
  return { domain, name, url, logo: input.logo, city: input.city?.trim() || undefined };
}

function loadStores(): Store[] {
  try {
    const raw = localStorage.getItem(STORES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((s) => s && typeof s.domain === 'string');
        if (valid.length) return valid as Store[];
      }
    }
    // Migrate the legacy domain-only sources list.
    const legacy = localStorage.getItem(LEGACY_SOURCES_KEY);
    if (legacy) {
      const domains = JSON.parse(legacy);
      if (Array.isArray(domains)) {
        const migrated = domains
          .map((d: string) => DEFAULT_STORES.find((s) => s.domain === cleanDomain(d)) || normalize({ domain: d }))
          .filter(Boolean) as Store[];
        if (migrated.length) return migrated;
      }
    }
  } catch {
    /* fall through to default */
  }
  return DEFAULT_STORES;
}

interface StoresCtx {
  stores: Store[];
  addStore: (input: StoreInput) => void;
  removeStore: (domain: string) => void;
}

const StoresContext = createContext<StoresCtx | null>(null);

export function StoresProvider({ children }: { children: ReactNode }) {
  const [stores, setStores] = useState<Store[]>(loadStores);

  useEffect(() => {
    localStorage.setItem(STORES_KEY, JSON.stringify(stores));
  }, [stores]);

  const addStore = useCallback((input: StoreInput) => {
    const s = normalize(input);
    if (!s) return;
    setStores((prev) => (prev.some((p) => p.domain === s.domain) ? prev : [...prev, s]));
  }, []);

  const removeStore = useCallback((domain: string) => {
    setStores((prev) => prev.filter((p) => p.domain !== domain));
  }, []);

  const value = useMemo(() => ({ stores, addStore, removeStore }), [stores, addStore, removeStore]);
  return <StoresContext.Provider value={value}>{children}</StoresContext.Provider>;
}

export function useStores(): StoresCtx {
  const ctx = useContext(StoresContext);
  if (!ctx) throw new Error('useStores must be used within a StoresProvider');
  return ctx;
}
