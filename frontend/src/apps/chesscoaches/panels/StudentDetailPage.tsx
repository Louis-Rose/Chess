// Student detail page — student info + packs + lessons

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Pencil, Trash2, X, Link, Check } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { authFetch } from '../utils/authFetch';
import { StudentForm } from '../components/StudentForm';
import { LessonsSection } from '../components/LessonsSection';
import { CreditBar } from '../components/CreditBar';
import { Avatar } from '../components/Avatar';
import { PanelHeader } from '../components/PanelHeader';
import type { StudentFormData } from '../components/StudentForm';
import type { Lesson } from '../components/LessonsSection';

// ── Types ──

interface Student {
  id: number;
  student_name: string;
  email: string | null;
  phone_number: string | null;
  city: string | null;
  timezone: string;
  source: string | null;
  chesscom_username: string | null;
  lichess_username: string | null;
  fide_arena_profile_url: string | null;
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
    const res = await authFetch(`/api/coaches/students/${studentId}`, { method: 'DELETE' });
    if (res.ok) navigate('/students');
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
  const past = lessons.filter(l => new Date(l.scheduled_at) < now || l.status !== 'scheduled');

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-2">
      <PanelHeader />


      <div className="max-w-3xl mx-[5%] md:mx-auto mt-4 space-y-6">
        {editing ? (
          <StudentForm
            initial={{
              student_name: student.student_name,
              email: student.email || '',
              phone_number: student.phone_number || '',
              city: student.city || '',
              timezone: student.timezone || 'UTC',
              source: student.source || '',
              chesscom_username: student.chesscom_username || '',
              lichess_username: student.lichess_username || '',
              fide_arena_profile_url: student.fide_arena_profile_url || '',
            }}
            onSave={handleUpdate}
            onCancel={() => setEditing(false)}
            saving={editSaving}
          />
        ) : (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            <div className="flex items-start gap-4">
              <Avatar name={student.student_name} size="xl" />
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold text-slate-100">{student.student_name}</h1>
                <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5">
                  <div>
                    {student.email && (
                      <span className="text-sm text-slate-400 mt-0.5 block">{student.email}</span>
                    )}
                    {student.phone_number && (
                      <a href={`https://wa.me/${student.phone_number.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors mt-0.5 block">
                        {student.phone_number} (WhatsApp)
                      </a>
                    )}
                  </div>
                  <div>
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
                    {student.fide_arena_profile_url && (
                      <a href={student.fide_arena_profile_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 transition-colors mt-0.5 block">
                        FIDE Arena profile
                      </a>
                    )}
                  </div>
                </div>
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
                  <InviteButton studentId={student.id} studentName={student.student_name} studentEmail={student.email} />
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
        )}

        {/* Active pack credit meter */}
        {packs.filter(p => p.status === 'active').map(p => {
          const remaining = p.total_lessons - p.consumed;
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
              <CreditBar consumed={p.consumed} total={p.total_lessons} />
              <div className="text-xs text-slate-500 mt-1">
                {p.consumed} {t('coaches.packs.used')} {t('coaches.packs.of')} {p.total_lessons}
              </div>
            </div>
          );
        })}

        <LessonsSection upcoming={upcoming} past={past} onRefresh={fetchStudent} />

        {/* Delete student */}
        {!editing && (
          <div className="flex justify-center pt-8 pb-4">
            {confirmDelete ? (
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs text-red-400">{t('coaches.students.deleteConfirm')}</span>
                <div className="flex items-center gap-3">
                  <button onClick={handleDelete} className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-500 transition-colors">
                    {t('coaches.students.deleteStudentFull')}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="text-slate-400 hover:text-slate-200">
                    <X className="w-4 h-4" />
                  </button>
                </div>
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

// ── Invite Button ──

function InviteButton({ studentId, studentName, studentEmail }: { studentId: number; studentName: string; studentEmail: string | null }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const openModal = () => {
    setMessage(t('coaches.students.inviteDefault').replace('{name}', studentName));
    setSent(false);
    setOpen(true);
  };

  const send = async () => {
    if (sending || !studentEmail) return;
    setSending(true);
    try {
      const res = await authFetch(`/api/coaches/students/${studentId}/invite/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (res.ok) {
        setSent(true);
        setTimeout(() => setOpen(false), 1500);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-purple-500/30 bg-purple-500/10 text-purple-400 text-xs rounded-lg transition-colors hover:bg-purple-500/20"
      >
        <Link className="w-3.5 h-3.5" />
        {t('coaches.students.inviteToPlatform')}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
          onClick={() => !sending && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-900 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700">
              <h3 className="text-sm font-medium text-slate-100">
                {t('coaches.students.inviteModalTitle').replace('{name}', studentName)}
              </h3>
              <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-200" disabled={sending}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {!studentEmail ? (
                <p className="text-sm text-amber-400">{t('coaches.students.inviteNoEmail')}</p>
              ) : (
                <>
                  <p className="text-xs text-slate-400">
                    {t('coaches.students.inviteRecipient').replace('{email}', studentEmail)}
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      {t('coaches.students.inviteMessageLabel')}
                    </label>
                    <textarea
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      rows={5}
                      className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-slate-700">
              <button onClick={() => setOpen(false)} disabled={sending} className="px-3 py-1.5 text-sm rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600">
                {t('coaches.students.cancel')}
              </button>
              <button
                onClick={send}
                disabled={sending || sent || !studentEmail}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 disabled:opacity-70"
              >
                {sent ? <><Check className="w-4 h-4" /> {t('coaches.students.inviteSent')}</>
                  : sending ? '...'
                  : t('coaches.students.inviteSend')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
