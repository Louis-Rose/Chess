// IndexedDB-backed store for Notice.ai uploads. Documents (PDFs) live entirely
// in the browser, persisted across reloads and scoped to this device. There is
// no backend: the blob bytes never leave the machine.

export interface NoticeFile {
  id: string;
  name: string;
  type: string;
  size: number;
  addedAt: number; // epoch ms
  hash?: string; // SHA-256 of the bytes; absent on records added before de-dup
  data: Blob;
}

// Lightweight view for the library list — everything but the blob bytes.
export type NoticeFileMeta = Omit<NoticeFile, 'data'>;

const DB_NAME = 'notice-ai';
const DB_VERSION = 2;
const STORE = 'files';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.objectStoreNames.contains(STORE)
        ? req.transaction!.objectStore(STORE)
        : db.createObjectStore(STORE, { keyPath: 'id' });
      if (!store.indexNames.contains('addedAt')) store.createIndex('addedAt', 'addedAt');
      if (!store.indexNames.contains('hash')) store.createIndex('hash', 'hash');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// SHA-256 of a blob's bytes, hex. Returns null if Web Crypto is unavailable
// (e.g. an insecure context) so callers can fall back to storing without dedup.
async function sha256(blob: Blob): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

function findByHash(hash: string): Promise<NoticeFile | undefined> {
  return tx<NoticeFile | undefined>('readonly', (s) => s.index('hash').get(hash));
}

// Run a single-store transaction and resolve with its request result. The db
// handle is closed once the transaction settles so versions can upgrade later.
function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

function genId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `f_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function addFile(file: File): Promise<NoticeFile> {
  const hash = await sha256(file);
  // De-dupe by content: the same PDF — even renamed — returns the existing
  // record instead of storing another copy.
  if (hash) {
    const existing = await findByHash(hash);
    if (existing) return existing;
  }
  const rec: NoticeFile = {
    id: genId(),
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    addedAt: Date.now(),
    hash: hash ?? undefined,
    data: file,
  };
  await tx('readwrite', (s) => s.put(rec));
  return rec;
}

// Collapse any pre-existing duplicates (same bytes, possibly different names):
// backfill content hashes for records added before de-dup, then keep the newest
// copy per hash and delete the rest. New uploads are de-duped at add time, so
// this only needs to run once per device. Returns how many copies were removed.
export async function dedupeLibrary(): Promise<number> {
  const all = await tx<NoticeFile[]>('readonly', (s) => s.getAll());
  for (const rec of all) {
    if (!rec.hash) {
      const h = await sha256(rec.data);
      if (h) {
        rec.hash = h;
        await tx('readwrite', (s) => s.put(rec));
      }
    }
  }
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const rec of all.slice().sort((a, b) => b.addedAt - a.addedAt)) {
    if (!rec.hash) continue; // un-hashable: leave it alone
    if (seen.has(rec.hash)) dupes.push(rec.id);
    else seen.add(rec.hash);
  }
  for (const id of dupes) await deleteFile(id);
  return dupes.length;
}

export function getFile(id: string): Promise<NoticeFile | undefined> {
  return tx<NoticeFile | undefined>('readonly', (s) => s.get(id));
}

// Library listing, newest first, without pulling blob bytes into the result.
export async function listFiles(): Promise<NoticeFileMeta[]> {
  const all = await tx<NoticeFile[]>('readonly', (s) => s.getAll());
  return all
    .sort((a, b) => b.addedAt - a.addedAt)
    .map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      size: r.size,
      addedAt: r.addedAt,
      hash: r.hash,
    }));
}

export function deleteFile(id: string): Promise<void> {
  return tx<undefined>('readwrite', (s) => s.delete(id)).then(() => undefined);
}
