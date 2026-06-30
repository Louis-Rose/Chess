import { Navigate, Route, Routes } from 'react-router-dom';
import { NoticeLayout } from './NoticeLayout';
import { NoticeViewer } from './panels/NoticeViewer';
import { NoticeLibrary } from './panels/NoticeLibrary';
import { NoticeNotes } from './panels/NoticeNotes';
import { NoticePricing } from './panels/NoticePricing';

// Notice.ai: upload PDFs and read them page by page (Viewer), with a Library of
// every document kept in the browser. All storage is client-side (IndexedDB).
export function NoticeApp() {
  return (
    <Routes>
      <Route element={<NoticeLayout />}>
        <Route index element={<Navigate to="notes" replace />} />
        <Route path="notes" element={<NoticeNotes />} />
        <Route path="view" element={<NoticeViewer />} />
        <Route path="view/:id" element={<NoticeViewer />} />
        <Route path="library" element={<NoticeLibrary />} />
        <Route path="pricing" element={<NoticePricing />} />
        <Route path="*" element={<Navigate to="view" replace />} />
      </Route>
    </Routes>
  );
}
