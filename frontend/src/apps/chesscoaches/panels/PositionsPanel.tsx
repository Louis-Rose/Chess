// Knowledge Center — Positions panel

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { BookOpen, Folder, FolderOpen, FolderPlus, Pencil, Trash2, ChevronRight, ChevronDown, Loader2, Check, X } from 'lucide-react';
import { PanelShell } from '../components/PanelShell';
import { useLanguage } from '../../../contexts/LanguageContext';

interface FolderRow {
  id: number;
  parent_id: number | null;
  name: string;
  position_count: number;
}

interface TreeNode extends FolderRow {
  children: TreeNode[];
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

function buildTree(folders: FolderRow[]): TreeNode[] {
  const byId = new Map<number, TreeNode>();
  folders.forEach(f => byId.set(f.id, { ...f, children: [] }));
  const roots: TreeNode[] = [];
  byId.forEach(node => {
    if (node.parent_id === null) roots.push(node);
    else {
      const parent = byId.get(node.parent_id);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  });
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach(n => sort(n.children));
  };
  sort(roots);
  return roots;
}

export function PositionsPanel() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null); // null = root (unfoldered)
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [creatingUnder, setCreatingUnder] = useState<number | null | 'root'>(null);
  const [createDraft, setCreateDraft] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  // Close the folder-row menu when clicking anywhere outside it
  useEffect(() => {
    if (menuOpenId === null) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-folder-menu]') && !target.closest('[data-folder-row]')) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpenId]);

  const treeQuery = useQuery({
    queryKey: ['knowledge-tree'],
    queryFn: async () => {
      const res = await axios.get('/api/knowledge/tree');
      return res.data as { folders: FolderRow[]; root_count: number };
    },
  });

  const folders = treeQuery.data?.folders ?? [];
  const rootCount = treeQuery.data?.root_count ?? 0;
  const tree = useMemo(() => buildTree(folders), [folders]);
  const folderById = useMemo(() => new Map(folders.map(f => [f.id, f])), [folders]);

  const positionsQuery = useQuery({
    queryKey: ['knowledge-positions', selectedFolderId],
    queryFn: async () => {
      const res = await axios.get('/api/knowledge/positions', {
        params: { folder_id: selectedFolderId ?? 'null' },
      });
      return res.data as { positions: PositionRow[] };
    },
  });

  const positions = positionsQuery.data?.positions ?? [];

  const refreshTree = () => qc.invalidateQueries({ queryKey: ['knowledge-tree'] });
  const refreshPositions = () => qc.invalidateQueries({ queryKey: ['knowledge-positions'] });

  const toggleExpand = useCallback((id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const createFolder = async (parentId: number | null) => {
    const name = createDraft.trim();
    if (!name) { setCreatingUnder(null); return; }
    await axios.post('/api/knowledge/folders', { name, parent_id: parentId });
    setCreatingUnder(null);
    setCreateDraft('');
    if (parentId !== null) setExpanded(prev => new Set(prev).add(parentId));
    refreshTree();
  };

  const renameFolder = async (id: number) => {
    const name = renameDraft.trim();
    if (!name) { setRenaming(null); return; }
    await axios.patch(`/api/knowledge/folders/${id}`, { name });
    setRenaming(null);
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

  const pathLabel = useMemo(() => {
    if (selectedFolderId === null) return t('coaches.positions.rootFolder');
    const parts: string[] = [];
    let cur: number | null | undefined = selectedFolderId;
    while (cur !== null && cur !== undefined) {
      const f = folderById.get(cur);
      if (!f) break;
      parts.unshift(f.name);
      cur = f.parent_id;
    }
    return parts.join(' / ');
  }, [selectedFolderId, folderById, t]);

  return (
    <PanelShell title={t('coaches.navPositions')}>
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
        {/* Folder tree */}
        <aside className="rounded-lg border border-slate-700 bg-slate-800/40 p-2 h-fit">
          <div className="flex items-center justify-between mb-2 px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('coaches.positions.folders')}</h3>
            <button
              type="button"
              onClick={() => { setCreatingUnder('root'); setCreateDraft(''); }}
              className="p-1 rounded hover:bg-slate-700/50 text-slate-300"
              title={t('coaches.positions.newFolder')}
            >
              <FolderPlus className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSelectedFolderId(null)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm ${
              selectedFolderId === null ? 'bg-slate-700 text-slate-100' : 'text-slate-300 hover:bg-slate-700/50'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span className="flex-1 text-left truncate">{t('coaches.positions.rootFolder')}</span>
            <span className="text-xs text-slate-500">{rootCount}</span>
          </button>
          {creatingUnder === 'root' && (
            <FolderEditInput
              value={createDraft}
              onChange={setCreateDraft}
              onSubmit={() => createFolder(null)}
              onCancel={() => { setCreatingUnder(null); setCreateDraft(''); }}
              placeholder={t('coaches.positions.folderNamePlaceholder')}
              depth={0}
            />
          )}
          {treeQuery.isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            </div>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {tree.map(node => (
                <FolderItem
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedId={selectedFolderId}
                  onSelect={(id) => { setSelectedFolderId(id); setMenuOpenId(null); }}
                  expanded={expanded}
                  onToggle={toggleExpand}
                  renamingId={renaming}
                  renameDraft={renameDraft}
                  setRenameDraft={setRenameDraft}
                  startRename={(id, name) => { setRenaming(id); setRenameDraft(name); setMenuOpenId(null); }}
                  submitRename={renameFolder}
                  cancelRename={() => setRenaming(null)}
                  onDelete={(id) => { setMenuOpenId(null); deleteFolder(id); }}
                  creatingUnder={creatingUnder}
                  startCreateUnder={(id) => { setCreatingUnder(id); setCreateDraft(''); setMenuOpenId(null); }}
                  createDraft={createDraft}
                  setCreateDraft={setCreateDraft}
                  submitCreate={createFolder}
                  cancelCreate={() => { setCreatingUnder(null); setCreateDraft(''); }}
                  menuOpenId={menuOpenId}
                  setMenuOpenId={setMenuOpenId}
                  t={t}
                />
              ))}
            </ul>
          )}
        </aside>

        {/* Positions list */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm text-slate-300">{pathLabel}</h2>
            <span className="text-xs text-slate-500">{positions.length} {t('coaches.positions.positions')}</span>
          </div>
          {positionsQuery.isLoading ? (
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

interface FolderItemProps {
  node: TreeNode;
  depth: number;
  selectedId: number | null;
  onSelect: (id: number) => void;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  renamingId: number | null;
  renameDraft: string;
  setRenameDraft: (v: string) => void;
  startRename: (id: number, name: string) => void;
  submitRename: (id: number) => void;
  cancelRename: () => void;
  onDelete: (id: number) => void;
  creatingUnder: number | null | 'root';
  startCreateUnder: (id: number) => void;
  createDraft: string;
  setCreateDraft: (v: string) => void;
  submitCreate: (parentId: number | null) => void;
  cancelCreate: () => void;
  menuOpenId: number | null;
  setMenuOpenId: (id: number | null) => void;
  t: (k: string) => string;
}

function FolderItem(props: FolderItemProps) {
  const {
    node, depth, selectedId, onSelect, expanded, onToggle,
    renamingId, renameDraft, setRenameDraft, startRename, submitRename, cancelRename,
    onDelete,
    creatingUnder, startCreateUnder, createDraft, setCreateDraft, submitCreate, cancelCreate,
    menuOpenId, setMenuOpenId,
    t,
  } = props;
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children.length > 0;
  const isRenaming = renamingId === node.id;
  const isMenuOpen = menuOpenId === node.id;

  return (
    <li>
      <div
        data-folder-row
        className={`relative flex items-center gap-1 rounded px-1 py-1 text-sm ${
          isSelected ? 'bg-slate-700 text-slate-100' : 'text-slate-300 hover:bg-slate-700/50'
        }`}
        style={{ paddingLeft: `${4 + depth * 14}px` }}
      >
        <button
          type="button"
          className="p-0.5 text-slate-500 hover:text-slate-200"
          onClick={() => onToggle(node.id)}
        >
          {hasChildren ? (isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />) : <span className="inline-block w-3" />}
        </button>
        {isOpen ? <FolderOpen className="w-4 h-4 text-slate-400" /> : <Folder className="w-4 h-4 text-slate-400" />}
        {isRenaming ? (
          <FolderEditInput
            value={renameDraft}
            onChange={setRenameDraft}
            onSubmit={() => submitRename(node.id)}
            onCancel={cancelRename}
            placeholder={t('coaches.positions.folderNamePlaceholder')}
            inline
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => setMenuOpenId(isMenuOpen ? null : node.id)}
              className="flex-1 text-left truncate"
            >
              {node.name}
            </button>
            <span className="text-xs text-slate-500">{node.position_count}</span>
            {isMenuOpen && (
              <div
                data-folder-menu
                className="absolute left-6 top-full z-40 mt-1 min-w-[180px] rounded-lg border border-slate-600 bg-slate-900 shadow-xl py-1"
                onMouseDown={e => e.stopPropagation()}
              >
                <FolderMenuItem icon={<FolderOpen className="w-4 h-4 text-slate-400" />} label={t('coaches.positions.openFolder')} onClick={() => onSelect(node.id)} />
                <FolderMenuItem icon={<FolderPlus className="w-4 h-4 text-slate-400" />} label={t('coaches.positions.newSubfolder')} onClick={() => startCreateUnder(node.id)} />
                <FolderMenuItem icon={<Pencil className="w-4 h-4 text-slate-400" />} label={t('coaches.positions.rename')} onClick={() => startRename(node.id, node.name)} />
                <FolderMenuItem icon={<Trash2 className="w-4 h-4 text-red-400" />} label={t('coaches.positions.delete')} danger onClick={() => onDelete(node.id)} />
              </div>
            )}
          </>
        )}
      </div>
      {creatingUnder === node.id && (
        <FolderEditInput
          value={createDraft}
          onChange={setCreateDraft}
          onSubmit={() => submitCreate(node.id)}
          onCancel={cancelCreate}
          placeholder={t('coaches.positions.folderNamePlaceholder')}
          depth={depth + 1}
        />
      )}
      {isOpen && hasChildren && (
        <ul className="space-y-0.5">
          {node.children.map(child => (
            <FolderItem {...props} key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function FolderMenuItem({ icon, label, onClick, danger = false }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-slate-700/70 ${danger ? 'text-red-400' : 'text-slate-200'}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function FolderEditInput({ value, onChange, onSubmit, onCancel, placeholder, depth = 0, inline = false }: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  placeholder?: string;
  depth?: number;
  inline?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1 py-1 ${inline ? 'flex-1' : ''}`}
      style={inline ? undefined : { paddingLeft: `${4 + depth * 14 + 24}px` }}
    >
      <input
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onSubmit();
          else if (e.key === 'Escape') onCancel();
        }}
        placeholder={placeholder}
        className="flex-1 bg-slate-900 border border-slate-600 rounded px-2 py-0.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
      />
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={onSubmit} className="p-0.5 text-emerald-400 hover:text-emerald-300"><Check className="w-3.5 h-3.5" /></button>
      <button type="button" onMouseDown={e => e.preventDefault()} onClick={onCancel} className="p-0.5 text-slate-500 hover:text-slate-200"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

function PositionCard({ position, onDelete, refresh, t }: { position: PositionRow; onDelete: () => void; refresh: () => void; t: (k: string) => string }) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(position.notes ?? '');

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
        {position.crop_data_url ? (
          <img src={position.crop_data_url} alt="" className="w-28 h-28 object-contain rounded border border-slate-600 shrink-0" />
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
          <div className="text-xs font-mono text-slate-500 break-all">{position.fen}</div>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="self-start p-1 text-slate-500 hover:text-red-400"
          title={t('coaches.positions.delete')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
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
