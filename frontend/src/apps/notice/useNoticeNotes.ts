import { useEffect, useState } from 'react';
import axios from 'axios';
import { useLanguage } from '../../contexts/LanguageContext';

// Fetches the editable "MVP Notes" for the current language: one entry per
// assembly step, ordered by position (index i is step i+1). Stored in the
// backend so copy can change without a rebuild. Shared by the Notes page and
// the Viewer's per-step info tooltips.
export function useNoticeNotes() {
  const { language } = useLanguage();
  const [notes, setNotes] = useState<string[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setNotes(null);
    setError(false);
    axios
      .get<{ notes: string[] }>('/api/notice/notes', { params: { lang: language } })
      .then(({ data }) => {
        if (active) setNotes(data.notes ?? []);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [language]);

  return { notes, error };
}
