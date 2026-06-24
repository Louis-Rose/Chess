// IndexedDB-backed store for Notice.ai uploads. Documents (PDFs) live entirely
// in the browser, persisted across reloads and scoped to this device. There is
// no backend: the blob bytes never leave the machine.

export interface NoticeFile {
  id: string;
  name: string;
  type: string;
  size: number;
  addedAt: number; // epoch ms
  data: Blob;
}

// Lightweight view for the library list — everything but the blob bytes.
export type NoticeFileMeta = Omit<NoticeFile, 'data'>;

const DB_NAME = 'notice-ai';
const DB_VERSION = 1;
const STORE = 'files';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('addedAt', 'addedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
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
  const rec: NoticeFile = {
    id: genId(),
    name: file.name,
    type: file.type || 'application/octet-stream',
    size: file.size,
    addedAt: Date.now(),
    data: file,
  };
  await tx('readwrite', (s) => s.put(rec));
  return rec;
}

export function getFile(id: string): Promise<NoticeFile | undefined> {
  return tx<NoticeFile | undefined>('readonly', (s) => s.get(id));
}

// Library listing, newest first, without pulling blob bytes into the result.
export async function listFiles(): Promise<NoticeFileMeta[]> {
  const all = await tx<NoticeFile[]>('readonly', (s) => s.getAll());
  return all
    .sort((a, b) => b.addedAt - a.addedAt)
    .map((r) => ({ id: r.id, name: r.name, type: r.type, size: r.size, addedAt: r.addedAt }));
}

export function deleteFile(id: string): Promise<void> {
  return tx<undefined>('readwrite', (s) => s.delete(id)).then(() => undefined);
}
