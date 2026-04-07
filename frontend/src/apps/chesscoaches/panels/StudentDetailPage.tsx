// Student detail page — student info + packs + lessons

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Trash2, X, Link, Copy, Check, Plus, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { authFetch } from '../utils/authFetch';
import { StudentForm } from '../components/StudentForm';
import type { StudentFormData } from '../components/StudentForm';

// ── Types ──

interface Student {
  id: number;
  student_name: string;
  source: string | null;
  chesscom_username: string | null;
  lichess_username: string | null;
  linked_user_id: number | null;
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

interface Lesson {
  id: number;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  notes: string | null;
  created_at: string;
}

// ── Main Page ──

export function StudentDetailPage() {
  const { t } = useLanguage();
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();

  const [student, setStudent] = useState<Student | null>(null);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchStudent = useCallback(async () => {
    try {
      const res = await authFetch(`/api/coaches/students/${studentId}/lessons`);
      if (!res.ok) { navigate('/students'); return; }
      const json = await res.json();
      setStudent(json.student);
      setLessons(json.lessons || []);
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

  const [editSaving, setEditSaving] = useState(false);
  const handleUpdate = async (form: StudentFormData) => {
    setEditSaving(true);
    try {
      const res = await authFetch(`/api/coaches/students/${studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) return;
      setEditing(false);
      fetchStudent();
    } finally {
      setEditSaving(false);
    }
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

  const now = new Date();
  const upcoming = lessons.filter(l => new Date(l.scheduled_at) >= now && l.status === 'scheduled');
  const past = lessons.filter(l => new Date(l.scheduled_at) < now || l.status === 'completed');

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
          <StudentForm
            initial={{
              student_name: student.student_name,
              source: student.source || '',
              chesscom_username: student.chesscom_username || '',
              lichess_username: student.lichess_username || '',
            }}
            onSave={handleUpdate}
            onCancel={() => setEditing(false)}
            saving={editSaving}
          />
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
                  {student.chesscom_username && (
                    <a href={`https://www.chess.com/member/${student.chesscom_username}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 transition-colors mt-0.5 block">
                      {student.chesscom_username} (Chess.com)
                    </a>
                  )}
                  {student.lichess_username && (
                    <a href={`https://lichess.org/@/${student.lichess_username}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 transition-colors mt-0.5 block">
                      {student.lichess_username} (Lichess)
                    </a>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-600 hover:border-slate-500 text-slate-400 hover:text-slate-200 text-xs rounded-lg transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {t('coaches.students.editStudent')}
                  </button>
                  {!student.linked_user_id && (
                    <InviteButton studentId={student.id} />
                  )}
                  {student.linked_user_id && (
                    <span className="flex items-center gap-1.5 px-3 py-1.5 text-emerald-400 text-xs">
                      <Check className="w-3.5 h-3.5" />
                      {t('coaches.students.accountLinked')}
                    </span>
                  )}
                </div>
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

        {/* Lessons section */}
        <LessonsSection
          studentId={student.id}
          upcoming={upcoming}
          past={past}
          onRefresh={fetchStudent}
        />

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

// ── Lessons Section ──

function LessonsSection({ studentId, upcoming, past, onRefresh }: {
  studentId: number;
  upcoming: Lesson[];
  past: Lesson[];
  onRefresh: () => void;
}) {
  const { t } = useLanguage();
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDate, setAddDate] = useState('');
  const [addTime, setAddTime] = useState('');
  const [addDuration, setAddDuration] = useState('60');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!addDate || !addTime || adding) return;
    setAdding(true);
    try {
      const scheduled_at = `${addDate}T${addTime}:00`;
      await authFetch(`/api/coaches/students/${studentId}/lessons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_at, duration_minutes: parseInt(addDuration) }),
      });
      setShowAddForm(false);
      setAddDate('');
      setAddTime('');
      onRefresh();
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
          {t('coaches.lessons.title') || 'Lessons'}
        </h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('coaches.lessons.add') || 'Add lesson'}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Date</label>
              <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)}
                className="w-full bg-slate-700 text-slate-100 text-sm px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Time</label>
              <input type="time" value={addTime} onChange={e => setAddTime(e.target.value)}
                className="w-full bg-slate-700 text-slate-100 text-sm px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Duration</label>
              <select value={addDuration} onChange={e => setAddDuration(e.target.value)}
                className="w-full bg-slate-700 text-slate-100 text-sm px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none">
                <option value="60">1 hour</option>
                <option value="90">1h30</option>
                <option value="120">2 hours</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={!addDate || !addTime || adding}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs rounded-lg transition-colors">
              {adding ? '...' : 'Create'}
            </button>
            <button onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-slate-400 hover:text-slate-200 text-xs transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Upcoming lessons */}
      {upcoming.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs text-blue-400 font-medium uppercase tracking-wider">
            {t('coaches.lessons.upcoming') || 'Upcoming'}
          </h3>
          {upcoming.map(l => (
            <LessonCard key={l.id} lesson={l} variant="upcoming" onRefresh={onRefresh} />
          ))}
        </div>
      )}

      {/* Past lessons */}
      {past.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs text-slate-400 font-medium uppercase tracking-wider">
            {t('coaches.lessons.past') || 'Past lessons'}
          </h3>
          {past.map(l => (
            <LessonCard key={l.id} lesson={l} variant="past" onRefresh={onRefresh} />
          ))}
        </div>
      )}

      {upcoming.length === 0 && past.length === 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center">
          <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">{t('coaches.lessons.empty') || 'No lessons yet'}</p>
        </div>
      )}
    </div>
  );
}

// ── Lesson Card ──

function LessonCard({ lesson, variant, onRefresh }: { lesson: Lesson; variant: 'upcoming' | 'past'; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(lesson.notes || '');
  const [saving, setSaving] = useState(false);

  const d = new Date(lesson.scheduled_at);
  const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await authFetch(`/api/coaches/lessons/${lesson.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      setEditingNotes(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleMarkCompleted = async () => {
    await authFetch(`/api/coaches/lessons/${lesson.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    onRefresh();
  };

  const handleDelete = async () => {
    await authFetch(`/api/coaches/lessons/${lesson.id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-750 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <Clock className={`w-4 h-4 ${variant === 'upcoming' ? 'text-blue-400' : 'text-slate-500'}`} />
          <div>
            <span className="text-sm text-slate-200">{dateStr}</span>
            <span className="text-xs text-slate-500 ml-2">{timeStr}</span>
            <span className="text-xs text-slate-600 ml-2">{lesson.duration_minutes}min</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            lesson.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400' :
            lesson.status === 'scheduled' ? 'bg-blue-500/15 text-blue-400' :
            lesson.status === 'cancelled' ? 'bg-red-500/15 text-red-400' :
            'bg-slate-600 text-slate-400'
          }`}>
            {lesson.status}
          </span>
          {lesson.notes && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Has notes" />}
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-700 px-4 py-3 space-y-3">
          {/* Notes */}
          {editingNotes ? (
            <div className="space-y-2">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Lesson summary / notes..."
                rows={4}
                className="w-full bg-slate-700 text-slate-100 text-sm px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none resize-none"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={handleSaveNotes} disabled={saving}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs rounded-lg transition-colors">
                  {saving ? '...' : 'Save'}
                </button>
                <button onClick={() => { setEditingNotes(false); setNotes(lesson.notes || ''); }}
                  className="px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              {lesson.notes ? (
                <div className="bg-slate-700/50 rounded-lg px-3 py-2">
                  <p className="text-xs text-slate-400 mb-1 font-medium">Notes</p>
                  <p className="text-sm text-slate-200 whitespace-pre-wrap">{lesson.notes}</p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">No notes yet</p>
              )}
              <button onClick={() => setEditingNotes(true)}
                className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                {lesson.notes ? 'Edit notes' : 'Add notes'}
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-700/50">
            {lesson.status === 'scheduled' && (
              <button onClick={handleMarkCompleted}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg transition-colors">
                <Check className="w-3 h-3" /> Mark completed
              </button>
            )}
            <button onClick={handleDelete}
              className="flex items-center gap-1 px-3 py-1.5 text-slate-500 hover:text-red-400 text-xs transition-colors ml-auto">
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Invite Button ──

function InviteButton({ studentId }: { studentId: number }) {
  const { t } = useLanguage();
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleInvite = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/coaches/students/${studentId}/invite`, { method: 'POST' });
      const data = await res.json();
      if (data.token) {
        setInviteToken(data.token);
        const url = `${window.location.origin}/invite/${data.token}`;
        try { await navigator.clipboard.writeText(url); setCopied(true); } catch {}
      }
    } finally {
      setLoading(false);
    }
  };

  if (inviteToken) {
    const url = `${window.location.origin}/invite/${inviteToken}`;
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={async () => {
            try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs rounded-lg transition-colors hover:bg-emerald-500/20"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? t('coaches.students.linkCopied') : t('coaches.students.copyInviteLink')}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleInvite}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 border border-purple-500/30 bg-purple-500/10 text-purple-400 text-xs rounded-lg transition-colors hover:bg-purple-500/20 disabled:opacity-50"
    >
      <Link className="w-3.5 h-3.5" />
      {loading ? '...' : t('coaches.students.inviteToPlatform')}
    </button>
  );
}
