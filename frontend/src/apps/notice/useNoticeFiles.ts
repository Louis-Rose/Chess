import { useCallback, useEffect, useState } from 'react';
import { addFile, deleteFile, listFiles, type NoticeFileMeta } from './noticeStore';

// Reactive view over the IndexedDB file store, shared by the viewer and the
// library so both stay in sync after an upload or delete. `files` is null while
// the first read is in flight.
export function useNoticeFiles() {
  const [files, setFiles] = useState<NoticeFileMeta[] | null>(null);

  const refresh = useCallback(async () => {
    setFiles(await listFiles());
  }, []);

  useEffect(() => {
    refresh();
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
