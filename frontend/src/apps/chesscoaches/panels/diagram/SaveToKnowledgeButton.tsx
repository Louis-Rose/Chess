// "Save to Knowledge Center" button — modal picks a folder and saves notes alongside a position.

import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { BookOpen, X, Loader2, Check } from 'lucide-react';
import { useLanguage } from '../../../../contexts/LanguageContext';
import type { DiagramExtract } from '../../contexts/CoachesDataContext';

interface KnowledgeFolder { id: number; parent_id: number | null; name: string; position_count: number; }

export function SaveToKnowledgeButton({ diagram, editedFen }: { diagram: DiagramExtract; editedFen: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<KnowledgeFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [folderId, setFolderId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingFolders(true);
    axios.get('/api/knowledge/tree')
      .then(r => setFolders(r.data.folders ?? []))
      .finally(() => setLoadingFolders(false));
  }, [open]);

  const orderedFolders = useMemo(() => {
    // Flat list with indentation based on depth (root first, then DFS by name)
    const byParent = new Map<number | null, KnowledgeFolder[]>();
    folders.forEach(f => {
      const arr = byParent.get(f.parent_id) ?? [];
      arr.push(f);
      byParent.set(f.parent_id, arr);
    });
    byParent.forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name)));
    const out: { folder: KnowledgeFolder; depth: number }[] = [];
    const visit = (parent: number | null, depth: number) => {
      (byParent.get(parent) ?? []).forEach(f => { out.push({ folder: f, depth }); visit(f.id, depth + 1); });
    };
    visit(null, 0);
    return out;
  }, [folders]);

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
                  <select
                    value={folderId ?? ''}
                    onChange={e => setFolderId(e.target.value === '' ? null : Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">{t('coaches.positions.rootFolder')}</option>
                    {orderedFolders.map(({ folder, depth }) => (
                      <option key={folder.id} value={folder.id}>{'\u00A0\u00A0'.repeat(depth)}{folder.name}</option>
                    ))}
                  </select>
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
              <button onClick={save} disabled={saving || saved} className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 disabled:opacity-70">
                {saved ? <><Check className="w-4 h-4" /> {t('coaches.positions.saved')}</> : saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('coaches.positions.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
