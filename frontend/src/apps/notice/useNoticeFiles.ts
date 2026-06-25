import { useCallback, useEffect, useState } from 'react';
import { addFile, dedupeLibrary, deleteFile, listFiles, type NoticeFileMeta } from './noticeStore';

const DEDUPE_FLAG = 'notice.deduped.v1';

// Reactive view over the IndexedDB file store, shared by the viewer and the
// library so both stay in sync after an upload or delete. `files` is null while
// the first read is in flight.
export function useNoticeFiles() {
  const [files, setFiles] = useState<NoticeFileMeta[] | null>(null);

  const refresh = useCallback(async () => {
    setFiles(await listFiles());
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      // One-time per device: collapse duplicates uploaded before content de-dup
      // existed. New uploads are de-duped at add time, so this runs just once.
      try {
        if (!localStorage.getItem(DEDUPE_FLAG)) {
          await dedupeLibrary();
          localStorage.setItem(DEDUPE_FLAG, '1');
        }
      } catch {
        // best-effort; fall through to a normal listing
      }
      if (alive) await refresh();
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  const add = useCallback(
    async (file: File) => {
      const rec = await addFile(file);
      await refresh();
      return rec;
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteFile(id);
      await refresh();
    },
    [refresh],
  );

  return { files, add, remove, refresh };
}
