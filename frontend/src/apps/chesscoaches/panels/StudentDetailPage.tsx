// Student detail page — student info + packs

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, X } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { authFetch } from '../utils/authFetch';

// ── Types ──

interface Student {
  id: number;
  student_name: string;
  source: string | null;
  chesscom_username: string | null;
  lichess_username: string | null;
  is_active: number;
  created_at: string;
}

interface Pack {
  id: number;
  student_id: number;
  total_lessons: number;
  price: number | null;
  currency: string | null;
  source: string | null;
  note: string | null;
  status: string;
  created_at: string;
  student_name: string;
  student_currency: string | null;
  consumed: number;
}

// ── Main Page ──

export function StudentDetailPage() {
  const { t, language: lang } = useLanguage();
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();

  const [student, setStudent] = useState<Student | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchStudent = useCallback(async () => {
    try {
      const res = await authFetch(`/api/coaches/students/${studentId}/lessons`);
      if (!res.ok) { navigate('/students'); return; }
      const json = await res.json();
      setStudent(json.student);
    } catch { navigate('/students'); }
  }, [studentId, navigate]);

  const fetchPacks = useCallback(async () => {
    try {
      const res = await authFetch(`/api/coaches/packs?student_id=${studentId}`);
      const json = await res.json();
      setPacks(json.packs || []);
    } catch { /* ignore */ }
  }, [studentId]);

  useEffect(() => {
    Promise.all([fetchStudent(), fetchPacks()]).then(() => setLoading(false));
  }, [fetchStudent, fetchPacks]);

  const handleUpdate = async (form: { student_name: string; source: string; chesscom_username: string; lichess_username: string }) => {
    await authFetch(`/api/coaches/students/${studentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setEditing(false);
    fetchStudent();
  };

  const handleDelete = async () => {
    await authFetch(`/api/coaches/students/${studentId}`, { method: 'DELETE' });
    navigate('/students');
  };

  if (loading) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-2">
        <div className="flex flex-col pt-2">
          <div className="h-6 w-24 bg-slate-700 rounded animate-pulse mx-4" />
          <div className="border-t border-slate-700 mt-2 mb-6" />
        </div>
        <div className="max-w-3xl mx-[5%] md:mx-auto space-y-4">
          <div className="h-24 bg-slate-800 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!student) return null;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-2">
      {/* Header */}
      <div className="flex flex-col pt-2">
        <button
          onClick={() => navigate('/students')}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors text-base px-2 md:px-4"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>{t('coaches.students.title')}</span>
        </button>
        <div className="border-t border-slate-700 mt-2" />
      </div>

      <div className="max-w-3xl mx-[5%] md:mx-auto mt-4 space-y-6">
        {editing ? (
          <StudentEditForm student={student} onSave={handleUpdate} onCancel={() => setEditing(false)} lang={lang} />
        ) : (
          <>
            {/* Student info card */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full bg-purple-600/20 flex items-center justify-center text-purple-400 font-bold text-xl flex-shrink-0">
                  {student.student_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-bold text-slate-100">{student.student_name}</h1>
                  {student.source && (
                    <div className="mt-1 text-sm text-slate-400">
                      {student.source.charAt(0).toUpperCase() + student.source.slice(1)}
                    </div>
                  )}
                  {student.chesscom_username && (
                    <div className="mt-0.5 text-sm text-slate-500">Chess.com: {student.chesscom_username}</div>
                  )}
                  {student.lichess_username && (
                    <div className="mt-0.5 text-sm text-slate-500">Lichess: {student.lichess_username}</div>
                  )}
                </div>
                <button
                  onClick={() => setEditing(true)}
                  className="text-slate-500 hover:text-slate-300 transition-colors p-1.5"
                  title={t('coaches.students.editStudent')}
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}

        {/* Active pack credit meter */}
        {packs.filter(p => p.status === 'active').map(p => {
          const remaining = p.total_lessons - p.consumed;
          const pct = p.total_lessons > 0 ? Math.min((p.consumed / p.total_lessons) * 100, 100) : 0;
          return (
            <div key={p.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-200">
                    {p.total_lessons} {t('coaches.packs.lessons')}
                  </span>
                  {p.source && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-medium">
                      {p.source}
                    </span>
                  )}
                </div>
                <span className={`text-sm font-bold ${remaining > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {remaining} {t('coaches.packs.remaining')}
                </span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${remaining <= 0 ? 'bg-slate-500' : 'bg-emerald-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {p.consumed} {t('coaches.packs.used')} {t('coaches.packs.of')} {p.total_lessons}
              </div>
            </div>
          );
        })}

        {/* Delete student — bottom of page */}
        {!editing && (
          <div className="flex justify-center pt-8 pb-4">
            {confirmDelete ? (
              <div className="flex items-center gap-3">
                <span className="text-xs text-red-400">{t('coaches.students.deleteConfirm')}</span>
                <button onClick={handleDelete} className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-500 transition-colors">
                  {t('coaches.students.deleteStudentFull')}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-slate-400 hover:text-slate-200">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-600 hover:border-red-500/50 hover:bg-red-600/10 text-slate-400 hover:text-red-400 text-xs rounded-lg transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
                {t('coaches.students.deleteStudentFull')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Edit Form ──

const SOURCES = ['chess.com', 'lichess', 'superprof', 'my website'] as const;

function StudentEditForm({ student, onSave, onCancel, lang }: {
  student: Student;
  onSave: (data: { student_name: string; source: string; chesscom_username: string; lichess_username: string }) => void;
  onCancel: () => void;
  lang: string;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    student_name: student.student_name,
    source: student.source || '',
    chesscom_username: student.chesscom_username || '',
    lichess_username: student.lichess_username || '',
  });
  const [saving, setSaving] = useState(false);

  const input = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors';
  const label = 'text-xs font-medium text-slate-400 mb-1';

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-3 max-w-sm mx-auto">
      <div>
        <div className={label}>{t('coaches.students.name')} *</div>
        <input className={input} value={form.student_name} onChange={e => setForm({ ...form, student_name: e.target.value })} placeholder={lang === 'fr' ? 'Nom de l\'élève' : 'Student name'} />
      </div>
      <div>
        <div className={label}>{t('coaches.packs.source')}</div>
        <select className={input} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
          <option value=""></option>
          {SOURCES.map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>
      {form.source === 'chess.com' && (
        <div>
          <div className={label}>Chess.com username</div>
          <input className={input} value={form.chesscom_username} onChange={e => setForm({ ...form, chesscom_username: e.target.value })} placeholder="e.g. MagnusCarlsen" />
        </div>
      )}
      {form.source === 'lichess' && (
        <div>
          <div className={label}>Lichess username</div>
          <input className={input} value={form.lichess_username} onChange={e => setForm({ ...form, lichess_username: e.target.value })} placeholder="e.g. DrNykterstein" />
        </div>
      )}
      <div className="flex items-center justify-center gap-3 pt-1">
        <button
          onClick={handleSave}
          disabled={!form.student_name.trim() || saving}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? '...' : t('coaches.students.save')}
        </button>
        <button onClick={onCancel} className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm transition-colors">
          {t('coaches.students.cancel')}
        </button>
      </div>
    </div>
  );
}
