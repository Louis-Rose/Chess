// Packs panel — lesson credit tracking dashboard

import { useState, useEffect, useCallback } from 'react';
import { Plus, Package, ChevronDown, ChevronUp, Trash2, X } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelShell, btnPrimary } from '../components/PanelShell';
import { authFetch } from '../utils/authFetch';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ── Types ──

interface Pack {
  id: number;
  student_id: number;
  total_lessons: number;
  lessons_done: number;
  lessons_paid: number;
  price: number | null;
  currency: string | null;
  source: string | null;
  note: string | null;
  status: string;           // 'active' | 'completed'
  created_at: string;
  student_name: string;
  student_currency: string | null;
  consumed: number;
}

interface Student {
  id: number;
  student_name: string;
  currency: string | null;
}

interface PackFormData {
  student_id: number | null;
  total_lessons: string;
  lessons_done: string;
  lessons_paid: string;
  price: string;
  currency: string;
}


const EMPTY_FORM: PackFormData = {
  student_id: null,
  total_lessons: '',
  lessons_done: '0',
  lessons_paid: '0',
  price: '',
  currency: 'EUR',
};

// ── Pack Form ──

function PackForm({ students, initial, onSave, onCancel, t }: {
  students: Student[];
  initial: PackFormData;
  onSave: (data: PackFormData) => void;
  onCancel: () => void;
  t: (key: string) => string;
}) {
  const [form, setForm] = useState<PackFormData>(initial);


  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
      {/* Student selector (only for new packs) */}
      {initial.student_id === null && (
        <div>
          <label className="text-xs text-slate-400 block mb-1">{t('coaches.packs.student')}</label>
          <select
            value={form.student_id ?? ''}
            onChange={e => setForm({ ...form, student_id: Number(e.target.value) || null })}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200"
          >
            <option value="">—</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.student_name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-400 block mb-1">{t('coaches.packs.totalLessons')}</label>
          <input type="number" min="1" value={form.total_lessons} onChange={e => setForm({ ...form, total_lessons: e.target.value })} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">{t('coaches.packs.price')}</label>
          <div className="flex gap-1.5">
            <input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
            <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} className="w-20 bg-slate-900 border border-slate-600 rounded-lg px-2 py-2 text-sm text-slate-200">
              {['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'BRL', 'INR'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-400 block mb-1">{t('coaches.packs.lessonsDone')}</label>
          <input type="number" min="0" value={form.lessons_done} onChange={e => setForm({ ...form, lessons_done: e.target.value })} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">{t('coaches.packs.lessonsPaid')}</label>
          <input type="number" min="0" value={form.lessons_paid} onChange={e => setForm({ ...form, lessons_paid: e.target.value })} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200" />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          {t('coaches.packs.cancel')}
        </button>
        <button
          onClick={() => onSave(form)}
          disabled={!form.total_lessons || Number(form.total_lessons) < 1 || (initial.student_id === null && !form.student_id)}
          className={btnPrimary('emerald')}
        >
          {t('coaches.packs.save')}
        </button>
      </div>
    </div>
  );
}

// ── Source Badge ──

function SourceBadge({ source }: { source: string | null }) {
  if (!source) return null;
  const colors: Record<string, string> = {
    'chess.com': 'bg-green-500/15 text-green-400 border-green-500/30',
    lichess: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    superprof: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    'my website': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  };
  const style = colors[source] || 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${style}`}>
      {capitalize(source)}
    </span>
  );
}

// ── Progress Bar ──

function CreditBar({ consumed, total }: { consumed: number; total: number }) {
  const pct = total > 0 ? Math.min((consumed / total) * 100, 100) : 0;
  const remaining = total - consumed;
  const full = remaining <= 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${full ? 'bg-slate-500' : 'bg-emerald-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-medium tabular-nums ${full ? 'text-slate-500' : 'text-emerald-400'}`}>
        {consumed}/{total}
      </span>
    </div>
  );
}

// ── Student Pack Group ──

function StudentGroup({ studentName, packs, onEdit, onDelete, editForm, t }: {
  studentName: string;
  packs: Pack[];
  onEdit: (pack: Pack) => void;
  onDelete: (pack: Pack) => void;
  editForm: React.ReactNode;
  t: (key: string) => string;
}) {
  const [showHistory, setShowHistory] = useState(false);

  const activePacks = packs.filter(p => p.lessons_done < p.total_lessons);
  const completedPacks = packs.filter(p => p.lessons_done >= p.total_lessons);

  const studentRemaining = activePacks.reduce((sum, p) => sum + (p.total_lessons - p.lessons_done), 0);

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-slate-200 uppercase tracking-wider">
        {studentName}
        {activePacks.length > 0 && (
          <span> ({studentRemaining} {t('coaches.packs.lessons')} {t('coaches.packs.remaining')})</span>
        )}
      </div>

      {editForm}

      {activePacks.map(p => (
        <PackCard key={p.id} pack={p} onEdit={onEdit} onDelete={onDelete} t={t} />
      ))}

      {activePacks.length === 0 && completedPacks.length > 0 && (
        <div className="text-xs text-slate-500 italic px-1">
          {t('coaches.packs.completed')}
        </div>
      )}

      {completedPacks.length > 0 && (
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors px-1"
        >
          {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {t('coaches.packs.history')} ({completedPacks.length})
        </button>
      )}

      {showHistory && completedPacks.map(p => (
        <PackCard key={p.id} pack={p} onEdit={onEdit} onDelete={onDelete} t={t} />
      ))}
    </div>
  );
}

// ── Pack Card ──

function PackCard({ pack, onEdit, onDelete, t }: {
  pack: Pack;
  onEdit: (pack: Pack) => void;
  onDelete: (pack: Pack) => void;
  t: (key: string) => string;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const remaining = pack.total_lessons - pack.lessons_done;
  const isCompleted = pack.lessons_done >= pack.total_lessons;
  const currency = pack.currency || pack.student_currency || '';

  return (
    <div
      className={`bg-slate-800 border rounded-xl p-3 cursor-pointer hover:border-emerald-500/50 transition-colors ${isCompleted ? 'border-slate-700/50 opacity-60' : 'border-slate-700'}`}
      onClick={() => onEdit(pack)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-200">
            {pack.total_lessons} {t('coaches.packs.lessons')}
          </span>
          {pack.price != null && (
            <span className="text-xs text-slate-400">
              {pack.price}{currency ? ` ${currency}` : ''}
            </span>
          )}
          <SourceBadge source={pack.source} />
          {isCompleted && (
            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-slate-600/20 text-slate-500 border-slate-600/30 font-medium">
              {t('coaches.packs.completed')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onDelete(pack)}
                className="px-2 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-500 transition-colors"
              >
                {t('coaches.packs.deletePack')}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <CreditBar consumed={pack.lessons_done} total={pack.total_lessons} />

      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs text-slate-200">
          {remaining > 0
            ? `${remaining} ${t('coaches.packs.remaining')}`
            : `${pack.lessons_done} ${t('coaches.packs.used')}`}
        </span>
        {pack.note && (
          <span className="text-xs text-slate-600 truncate max-w-[200px]">{pack.note}</span>
        )}
      </div>
    </div>
  );
}

// ── Main Panel ──

export function PaymentsPanel() {
  const { t } = useLanguage();

  const [packs, setPacks] = useState<Pack[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingPack, setEditingPack] = useState<Pack | null>(null);

  const fetchPacks = useCallback(async () => {
    try {
      const res = await authFetch('/api/coaches/packs');
      const json = await res.json();
      setPacks(json.packs || []);
    } catch { /* ignore */ }
  }, []);

  const fetchStudents = useCallback(async () => {
    try {
      const res = await authFetch('/api/coaches/students');
      const json = await res.json();
      setStudents((json.students || []).map((s: Student & Record<string, unknown>) => ({
        id: s.id,
        student_name: s.student_name,
        currency: s.currency,
      })));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    Promise.all([fetchPacks(), fetchStudents()]).then(() => setLoading(false));
  }, [fetchPacks, fetchStudents]);

  const handleSave = async (form: PackFormData) => {
    const payload = {
      total_lessons: Number(form.total_lessons),
      lessons_done: Number(form.lessons_done) || 0,
      lessons_paid: Number(form.lessons_paid) || 0,
      price: form.price ? Number(form.price) : null,
      currency: form.currency || null,
    };
    if (editingPack) {
      await authFetch(`/api/coaches/packs/${editingPack.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await authFetch(`/api/coaches/students/${form.student_id}/packs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    setShowForm(false);
    setEditingPack(null);
    fetchPacks();
  };

  const handleEdit = (pack: Pack) => {
    setEditingPack(pack);
    setShowForm(true);
  };

  const handleDelete = async (pack: Pack) => {
    await authFetch(`/api/coaches/packs/${pack.id}`, { method: 'DELETE' });
    fetchPacks();
  };


  // Filter packs by source
  const filtered = sourceFilter
    ? packs.filter(p => (p.source || 'other') === sourceFilter)
    : packs;

  // Group by student
  const grouped = new Map<string, Pack[]>();
  for (const p of filtered) {
    if (!grouped.has(p.student_name)) grouped.set(p.student_name, []);
    grouped.get(p.student_name)!.push(p);
  }
  const sortedGroups = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));

  // Collect unique sources for filter
  const allSources = [...new Set(packs.map(p => p.source).filter(Boolean))] as string[];

  return (
    <PanelShell title={t('coaches.packs.title')}>
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-end">
          <button
            onClick={() => { setEditingPack(null); setShowForm(!showForm); }}
            className={`flex items-center gap-1.5 ${btnPrimary('emerald')}`}
          >
            {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showForm ? t('coaches.packs.cancel') : t('coaches.packs.newPack')}
          </button>
        </div>

        {/* Source filter chips */}
        {allSources.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSourceFilter(null)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                !sourceFilter
                  ? 'bg-slate-600/30 text-slate-200 border-slate-500'
                  : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-500'
              }`}
            >
              {t('coaches.packs.allSources')}
            </button>
            {allSources.map(s => (
              <button
                key={s}
                onClick={() => setSourceFilter(sourceFilter === s ? null : s)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                  sourceFilter === s
                    ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40'
                    : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-500'
                }`}
              >
                {capitalize(s)}
              </button>
            ))}
          </div>
        )}

        {/* New Pack Form (top-level, only for creating new packs) */}
        {showForm && !editingPack && (
          <PackForm
            students={students}
            initial={EMPTY_FORM}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditingPack(null); }}
            t={t}
          />
        )}

        {/* Content */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-800 rounded-xl animate-pulse" />)}
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-600/10 flex items-center justify-center mb-4">
              <Package className="w-8 h-8 text-emerald-400" />
            </div>
            <p className="text-slate-200 text-lg">{t('coaches.packs.noStudents')}</p>
          </div>
        ) : packs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-600/10 flex items-center justify-center mb-4">
              <Package className="w-8 h-8 text-emerald-400" />
            </div>
            <p className="text-slate-400 text-sm">{t('coaches.packs.empty')}</p>
          </div>
        ) : sortedGroups.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-500">
            {t('coaches.packs.empty')}
          </div>
        ) : (
          <div className="space-y-5">
            {sortedGroups.map(([studentName, studentPacks]) => (
              <StudentGroup
                key={studentName}
                studentName={studentName}
                packs={studentPacks}
                onEdit={handleEdit}
                onDelete={handleDelete}

                editForm={editingPack && editingPack.student_name === studentName ? (
                  <PackForm
                    students={students}
                    initial={{
                      student_id: editingPack.student_id,
                      total_lessons: String(editingPack.total_lessons),
                      lessons_done: String(editingPack.lessons_done || 0),
                      lessons_paid: String(editingPack.lessons_paid || 0),
                      price: editingPack.price != null ? String(editingPack.price) : '',
                      currency: editingPack.currency || editingPack.student_currency || '',
                    }}
                    onSave={handleSave}
                    onCancel={() => { setShowForm(false); setEditingPack(null); }}
                    t={t}
                  />
                ) : null}
                t={t}
              />
            ))}
          </div>
        )}
      </div>
    </PanelShell>
  );
}
