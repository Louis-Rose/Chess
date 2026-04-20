// Knowledge Center — Positions panel

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Folder, FolderPlus, Pencil, Trash2, Loader2, Check, X, Send } from 'lucide-react';
import { PanelShell } from '../components/PanelShell';
import { useLanguage } from '../../../contexts/LanguageContext';

interface FolderRow {
  id: number;
  name: string;
  position_count: number;
}

interface PositionRow {
  id: number;
  folder_id: number | null;
  fen: string;
  white_player: string | null;
  black_player: string | null;
  active_color: string | null;
  diagram_number: number | null;
  crop_data_url: string | null;
  notes: string | null;
  created_at: string;
}

export function PositionsPanel() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null); // null = All positions
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState('');

  const treeQuery = useQuery({
    queryKey: ['knowledge-tree'],
    queryFn: async () => {
      const res = await axios.get('/api/knowledge/tree');
      return res.data as { folders: FolderRow[]; root_count: number };
    },
  });

  const folders = treeQuery.data?.folders ?? [];

  // Auto-select the first folder when none is selected (e.g. on first load or
  // after the selected folder is deleted).
  useEffect(() => {
    if (selectedFolderId === null && folders.length > 0) {
      setSelectedFolderId(folders[0].id);
    }
  }, [folders, selectedFolderId]);

  const positionsQuery = useQuery({
    queryKey: ['knowledge-positions', selectedFolderId],
    queryFn: async () => {
      if (selectedFolderId === null) return { positions: [] as PositionRow[] };
      const res = await axios.get('/api/knowledge/positions', {
        params: { folder_id: selectedFolderId },
      });
      return res.data as { positions: PositionRow[] };
    },
    enabled: selectedFolderId !== null,
  });

  const positions = positionsQuery.data?.positions ?? [];

  const refreshTree = () => qc.invalidateQueries({ queryKey: ['knowledge-tree'] });
  const refreshPositions = () => qc.invalidateQueries({ queryKey: ['knowledge-positions'] });

  const createFolder = async () => {
    const name = createDraft.trim();
    if (!name) { setCreating(false); return; }
    await axios.post('/api/knowledge/folders', { name });
    setCreating(false);
    setCreateDraft('');
    refreshTree();
  };

  const renameFolder = async (id: number) => {
    const name = renameDraft.trim();
    if (!name) { setRenamingId(null); return; }
    await axios.patch(`/api/knowledge/folders/${id}`, { name });
    setRenamingId(null);
    refreshTree();
  };

  const deleteFolder = async (id: number) => {
    if (!confirm(t('coaches.positions.confirmDeleteFolder'))) return;
    await axios.delete(`/api/knowledge/folders/${id}`);
    if (selectedFolderId === id) setSelectedFolderId(null);
    refreshTree();
    refreshPositions();
  };

  const deletePosition = async (id: number) => {
    if (!confirm(t('coaches.positions.confirmDeletePosition'))) return;
    await axios.delete(`/api/knowledge/positions/${id}`);
    refreshPositions();
    refreshTree();
  };

  const selectedFolderName = folders.find(f => f.id === selectedFolderId)?.name ?? '';

  return (
    <PanelShell title={t('coaches.navPositions')}>
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
        {/* Flat folder list */}
        <aside className="rounded-lg border border-slate-700 bg-slate-800/40 p-2 h-fit">
          <div className="flex items-center mb-2 px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('coaches.positions.folders')}</h3>
          </div>
          <button
            type="button"
            onClick={() => {
              setCreating(prev => !prev);
              setCreateDraft('');
            }}
            className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-xs rounded border transition-colors mb-1 ${
              creating
                ? 'bg-slate-700 border-slate-500 text-white'
                : 'border-slate-600 text-slate-200 hover:text-white hover:border-slate-500'
            }`}
          >
            <FolderPlus className="w-4 h-4" />
            <span>{t('coaches.positions.createNewFolder')}</span>
          </button>
          {creating && (
            <FolderEditInput
              value={createDraft}
              onChange={setCreateDraft}
              onSubmit={createFolder}
              onCancel={() => { setCreating(false); setCreateDraft(''); }}
              placeholder={t('coaches.positions.newFolderNamePlaceholder')}
            />
          )}
          {treeQuery.isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            </div>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {folders.map(folder => (
                <FolderRowItem
                  key={folder.id}
                  folder={folder}
                  isSelected={selectedFolderId === folder.id}
                  isRenaming={renamingId === folder.id}
                  renameDraft={renameDraft}
                  setRenameDraft={setRenameDraft}
                  onSelect={() => setSelectedFolderId(folder.id)}
                  onStartRename={() => { setRenamingId(folder.id); setRenameDraft(folder.name); }}
                  onSubmitRename={() => renameFolder(folder.id)}
                  onCancelRename={() => setRenamingId(null)}
                  onDelete={() => deleteFolder(folder.id)}
                  t={t}
                />
              ))}
            </ul>
          )}
        </aside>

        {/* Positions list */}
        <section className="space-y-3">
          {selectedFolderId !== null && (
            <div className="relative">
              <h2 className="text-xl font-bold text-slate-100 text-center capitalize">{selectedFolderName}</h2>
              <span className="absolute right-0 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                {positions.length} {t(positions.length === 1 ? 'coaches.positions.position' : 'coaches.positions.positions')}
              </span>
            </div>
          )}
          {selectedFolderId === null ? (
            <div className="rounded-lg border border-dashed border-slate-700 py-12 text-center text-sm text-slate-500">
              {t('coaches.positions.noFolderYet')}
            </div>
          ) : positionsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : positions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700 py-12 text-center text-sm text-slate-500">
              {t('coaches.positions.empty')}
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3">
              {positions.map(p => (
                <PositionCard key={p.id} position={p} onDelete={() => deletePosition(p.id)} refresh={refreshPositions} t={t} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </PanelShell>
  );
}

function FolderRowItem({
  folder, isSelected, isRenaming, renameDraft, setRenameDraft,
  onSelect, onStartRename, onSubmitRename, onCancelRename, onDelete, t,
}: {
  folder: FolderRow;
  isSelected: boolean;
  isRenaming: boolean;
  renameDraft: string;
  setRenameDraft: (v: string) => void;
  onSelect: () => void;
  onStartRename: () => void;
  onSubmitRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
  t: (k: string) => string;
}) {
  return (
    <li>
      <div
        className={`group flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
          isSelected ? 'bg-slate-700 text-slate-100' : 'text-slate-300 hover:bg-slate-700/50'
        }`}
      >
        <Folder className="w-4 h-4 text-slate-400 flex-shrink-0" />
        {isRenaming ? (
          <FolderEditInput
            value={renameDraft}
            onChange={setRenameDraft}
            onSubmit={onSubmitRename}
            onCancel={onCancelRename}
            placeholder={t('coaches.positions.folderNamePlaceholder')}
            inline
          />
        ) : (
          <>
            <button type="button" onClick={onSelect} className="flex-1 text-left truncate">
              {folder.name}
            </button>
            <span className="text-xs text-slate-500 tabular-nums">{folder.position_count}</span>
            <button
              type="button"
              onClick={onStartRename}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-slate-200 transition-opacity"
              title={t('coaches.positions.rename')}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-red-400 transition-opacity"
              title={t('coaches.positions.delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function FolderEditInput({ value, onChange, onSubmit, onCancel, placeholder, inline = false }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  placeholder?: string;
  inline?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1 py-1 ${inline ? 'flex-1' : 'px-2'}`}>
      <input
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onSubmit();
          else if (e.key === 'Escape') onCancel();
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-0.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
      />
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={onSubmit} className="flex-shrink-0 p-0.5 text-emerald-400 hover:text-emerald-300"><Check className="w-3.5 h-3.5" /></button>
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={onCancel} className="flex-shrink-0 p-0.5 text-slate-500 hover:text-slate-200"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

function PositionCard({ position, onDelete, refresh, t }: { position: PositionRow; onDelete: () => void; refresh: () => void; t: (k: string) => string }) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(position.notes ?? '');
  const [homeworkOpen, setHomeworkOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => { setNotes(position.notes ?? ''); }, [position.notes]);

  const saveNotes = async () => {
    await axios.patch(`/api/knowledge/positions/${position.id}`, { notes });
    setEditing(false);
    refresh();
  };

  const sideToMove = position.active_color === 'b' ? t('coaches.diagram.blackToPlay') : t('coaches.diagram.whiteToPlay');
  const hasPlayers = !!(position.white_player || position.black_player);

  return (
    <li className="rounded-lg border border-slate-700 bg-slate-800/40 p-3 space-y-2">
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setZoomOpen(true)}
          className="flex gap-3 flex-1 min-w-0 text-left cursor-pointer group"
        >
          {position.crop_data_url ? (
            <img src={position.crop_data_url} alt="" className="w-28 h-28 object-contain rounded border border-slate-600 shrink-0 group-hover:border-slate-500 transition-colors" />
          ) : (
            <div className="w-28 h-28 rounded border border-slate-600 bg-slate-900/40 shrink-0" />
          )}
          <div className="flex-1 min-w-0 space-y-1">
            {hasPlayers && (
              <div className="text-sm text-slate-200 truncate">
                <span className="font-medium">{position.white_player || '—'}</span>
                <span className="text-slate-500 mx-1.5">vs</span>
                <span className="font-medium">{position.black_player || '—'}</span>
              </div>
            )}
            <div className="text-xs text-slate-400">{sideToMove}</div>
          </div>
        </button>
        <div className="flex flex-col gap-1 self-start">
          <button
            type="button"
            onClick={onDelete}
            className="p-1 text-slate-500 hover:text-red-400"
            title={t('coaches.positions.delete')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setHomeworkOpen(true)}
            className="p-1 text-slate-500 hover:text-blue-400"
            title={t('coaches.positions.sendAsHomework')}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
      {zoomOpen && (
        <PositionZoomModal
          position={position}
          onClose={() => setZoomOpen(false)}
          onDelete={() => { setZoomOpen(false); onDelete(); }}
          onSendHomework={() => { setZoomOpen(false); setHomeworkOpen(true); }}
          t={t}
        />
      )}
      {homeworkOpen && (
        <SendHomeworkModal
          position={position}
          onClose={() => setHomeworkOpen(false)}
          t={t}
        />
      )}
      {editing ? (
        <div className="space-y-1.5">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
            placeholder={t('coaches.positions.notesPlaceholder')}
          />
          <div className="flex items-center gap-2">
            <button type="button" onClick={saveNotes} className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white">{t('coaches.positions.save')}</button>
            <button type="button" onClick={() => { setEditing(false); setNotes(position.notes ?? ''); }} className="px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200">{t('coaches.positions.cancel')}</button>
          </div>
        </div>
      ) : (
        <div onClick={() => setEditing(true)} className="cursor-text rounded border border-slate-700/50 bg-slate-900/30 px-2 py-1.5 text-sm text-slate-300 min-h-[2.25rem] whitespace-pre-wrap">
          {position.notes || <span className="text-slate-500 italic">{t('coaches.positions.addNotes')}</span>}
        </div>
      )}
    </li>
  );
}

interface StudentWithUser {
  id: number;
  student_name: string;
  linked_user_id: number | null;
}

function PositionZoomModal({ position, onClose, onDelete, onSendHomework, t }: {
  position: PositionRow;
  onClose: () => void;
  onDelete: () => void;
  onSendHomework: () => void;
  t: (k: string) => string;
}) {
  const sideToMove = position.active_color === 'b' ? t('coaches.diagram.blackToPlay') : t('coaches.diagram.whiteToPlay');
  const hasPlayers = !!(position.white_player || position.black_player);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 md:pl-56 2xl:pl-64"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
          <button
            type="button"
            onClick={onDelete}
            className="p-1 text-slate-500 hover:text-red-400"
            title={t('coaches.positions.delete')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {position.crop_data_url ? (
            <img src={position.crop_data_url} alt="" className="w-full max-w-md mx-auto rounded border border-slate-600" />
          ) : (
            <div className="w-full max-w-md mx-auto aspect-square rounded border border-slate-600 bg-slate-800" />
          )}
          {hasPlayers && (
            <div className="text-sm text-slate-200 text-center">
              <span className="font-medium">{position.white_player || '—'}</span>
              <span className="text-slate-500 mx-1.5">vs</span>
              <span className="font-medium">{position.black_player || '—'}</span>
            </div>
          )}
          <div className="text-xs text-slate-400 text-center">{sideToMove}</div>
          {position.notes && (
            <div className="text-sm text-slate-200 whitespace-pre-wrap bg-slate-800/60 rounded px-3 py-2">{position.notes}</div>
          )}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={onSendHomework}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-base font-semibold rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
              {t('coaches.positions.sendAsHomework')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SendHomeworkModal({ position, onClose, t }: {
  position: PositionRow;
  onClose: () => void;
  t: (k: string) => string;
}) {
  const [students, setStudents] = useState<StudentWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    axios.get('/api/coaches/students')
      .then(r => {
        const list = (r.data.students ?? []) as StudentWithUser[];
        // Only students with a linked account can receive messages.
        const messageable = list.filter(s => s.linked_user_id);
        setStudents(messageable);
        if (messageable.length === 1) setSelectedId(messageable[0].linked_user_id);
      })
      .finally(() => setLoading(false));
  }, []);

  const send = async () => {
    if (selectedId === null || sending) return;
    setSending(true);
    try {
      const body: Record<string, unknown> = { position_id: position.id };
      if (message.trim()) body.content = message.trim();
      else body.content = t('coaches.positions.homeworkDefault');
      const res = await axios.post(`/api/messages/${selectedId}`, body);
      if (res.status === 201) {
        setSent(true);
        setTimeout(onClose, 900);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 md:pl-56 2xl:pl-64"
      onClick={() => !sending && onClose()}
    >
      <div
        className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
          <h3 className="text-sm font-medium text-slate-100">{t('coaches.positions.sendAsHomework')}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200" disabled={sending}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            </div>
          ) : students.length === 0 ? (
            <p className="text-sm text-slate-400">{t('coaches.positions.homeworkNoStudents')}</p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">{t('coaches.positions.homeworkChooseStudent')}</label>
                <select
                  value={selectedId ?? ''}
                  onChange={e => setSelectedId(e.target.value === '' ? null : Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="">{t('coaches.positions.homeworkPickOne')}</option>
                  {students.map(s => (
                    <option key={s.id} value={s.linked_user_id ?? ''}>{s.student_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">{t('coaches.positions.homeworkNote')}</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={3}
                  placeholder={t('coaches.positions.homeworkDefault')}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                />
              </div>
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-slate-700">
          <button onClick={onClose} disabled={sending} className="px-3 py-1.5 text-sm rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600">
            {t('coaches.positions.cancel')}
          </button>
          <button
            onClick={send}
            disabled={sending || sent || selectedId === null}
            className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 disabled:opacity-70"
          >
            {sent ? <><Check className="w-4 h-4" /> {t('coaches.positions.homeworkSent')}</>
              : sending ? <Loader2 className="w-4 h-4 animate-spin" />
              : t('coaches.positions.homeworkSend')}
          </button>
        </div>
      </div>
    </div>
  );
}
