// "Save to Knowledge Center" button — modal picks a folder and saves notes alongside a position.

import { useState, useEffect } from 'react';
import axios from 'axios';
import { BookOpen, X, Loader2, Check, FolderPlus } from 'lucide-react';
import { useLanguage } from '../../../../contexts/LanguageContext';
import type { DiagramExtract } from '../../contexts/CoachesDataContext';

interface KnowledgeFolder { id: number; name: string; position_count: number; }

export function SaveToKnowledgeButton({ diagram, editedFen }: { diagram: DiagramExtract; editedFen: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<KnowledgeFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [folderId, setFolderId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingInFlight, setCreatingInFlight] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingFolders(true);
    axios.get('/api/knowledge/tree')
      .then(r => {
        const list = (r.data.folders ?? []) as KnowledgeFolder[];
        setFolders(list);
        // Auto-pick the first folder; if the user has none, keep folderId=null
        // and surface the inline "+ New folder" input immediately.
        if (list.length > 0) {
          setFolderId(prev => prev ?? list[0].id);
        } else {
          setCreatingFolder(true);
        }
      })
      .finally(() => setLoadingFolders(false));
  }, [open]);

  const sortedFolders = [...folders].sort((a, b) => a.name.localeCompare(b.name));

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name || creatingInFlight) return;
    setCreatingInFlight(true);
    try {
      const res = await axios.post('/api/knowledge/folders', { name });
      const created = res.data as KnowledgeFolder;
      setFolders(prev => [...prev, created]);
      setFolderId(created.id);
      setNewFolderName('');
      setCreatingFolder(false);
    } finally {
      setCreatingInFlight(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const activeColor = editedFen.split(' ')[1] ?? 'w';
      await axios.post('/api/knowledge/positions', {
        folder_id: folderId,
        fen: editedFen,
        white_player: diagram.white_player || null,
        black_player: diagram.black_player || null,
        active_color: activeColor,
        diagram_number: diagram.diagram_number ?? null,
        crop_data_url: diagram.crop_data_url || null,
        notes: notes || null,
      });
      setSaved(true);
      setTimeout(() => { setSaved(false); setOpen(false); setNotes(''); setFolderId(null); }, 1200);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-2 text-sm font-medium rounded-lg border bg-slate-800 border-slate-600 text-slate-200 hover:bg-slate-700 hover:border-slate-500 flex items-center justify-center gap-2"
      >
        <BookOpen className="w-4 h-4" /> {t('coaches.positions.saveToKnowledge')}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onClick={() => !saving && setOpen(false)}>
          <div className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
              <h3 className="text-sm font-medium text-slate-100">{t('coaches.positions.saveToKnowledge')}</h3>
              <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-200" disabled={saving}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">{t('coaches.positions.chooseFolder')}</label>
                {loadingFolders ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={folderId ?? ''}
                      onChange={e => setFolderId(e.target.value === '' ? null : Number(e.target.value))}
                      disabled={sortedFolders.length === 0}
                      className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                    >
                      {sortedFolders.length === 0 && <option value="">—</option>}
                      {sortedFolders.map(folder => (
                        <option key={folder.id} value={folder.id}>{folder.name}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => { setCreatingFolder(true); setNewFolderName(''); }}
                      className="p-1.5 text-slate-300 hover:text-slate-100 border border-slate-600 rounded hover:border-slate-500"
                      title={t('coaches.positions.newFolder')}
                    >
                      <FolderPlus className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {creatingFolder && (
                  <div className="mt-2 flex items-center gap-1">
                    <input
                      autoFocus
                      value={newFolderName}
                      onChange={e => setNewFolderName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') createFolder();
                        else if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); }
                      }}
                      placeholder={t('coaches.positions.folderNamePlaceholder')}
                      className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={createFolder}
                      disabled={!newFolderName.trim() || creatingInFlight}
                      className="p-1 text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setCreatingFolder(false); setNewFolderName(''); }}
                      className="p-1 text-slate-500 hover:text-slate-200"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">{t('coaches.positions.notesPlaceholder')}</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder={t('coaches.positions.notesPlaceholder')}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-slate-700">
              <button onClick={() => setOpen(false)} disabled={saving} className="px-3 py-1.5 text-sm rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600">{t('coaches.positions.cancel')}</button>
              <button onClick={save} disabled={saving || saved || folderId === null} className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 disabled:opacity-70">
                {saved ? <><Check className="w-4 h-4" /> {t('coaches.positions.saved')}</> : saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('coaches.positions.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
