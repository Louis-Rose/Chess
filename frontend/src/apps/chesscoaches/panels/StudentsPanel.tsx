// My Students panel — student roster + scheduling

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronRight, Users } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelShell, btnPrimary, BTN_GHOST } from '../components/PanelShell';

// ── Types ──

interface Student {
  id: number;
  student_name: string;
  timezone: string;
  currency: string | null;
  source: string | null;
  recurring_day: number | null;   // 0=Mon .. 6=Sun, null=no recurring
  recurring_time: string | null;  // "HH:MM" in coach's TZ
  created_at: string;
  next_lesson: Lesson | null;
}

interface Lesson {
  id: number;
  student_id: number;
  student_name?: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;          // 'scheduled' | 'completed' | 'cancelled' | 'rescheduled'
  created_at: string;
}

import { authFetch } from '../utils/authFetch';

export function getTimezoneAbbr(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz, timeZoneName: 'short',
    }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || tz;
  } catch { return tz; }
}

// ── Student Form ──

interface StudentFormData {
  student_name: string;
  source: string;
  chesscom_username: string;
  lichess_username: string;
}

const EMPTY_FORM: StudentFormData = {
  student_name: '',
  source: '',
  chesscom_username: '',
  lichess_username: '',
};

const SOURCES = ['chess.com', 'lichess', 'superprof', 'my website'] as const;

function StudentForm({ initial, onSave, onCancel, saving, lang }: {
  initial: StudentFormData;
  onSave: (data: StudentFormData) => void;
  onCancel: () => void;
  saving: boolean;
  lang: string;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState(initial);

  const input = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors';
  const label = 'text-xs font-medium text-slate-400 mb-1';

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

      {/* Actions */}
      <div className="flex items-center justify-center gap-3 pt-1">
        <button
          onClick={() => onSave(form)}
          disabled={!form.student_name.trim() || saving}
          className={btnPrimary('purple')}
        >
          {saving ? '...' : t('coaches.students.save')}
        </button>
        <button onClick={onCancel} className={BTN_GHOST}>
          {t('coaches.students.cancel')}
        </button>
      </div>
    </div>
  );
}

// ── Student Card ──

function StudentCard({ student }: {
  student: Student;
}) {
  const navigate = useNavigate();

  return (
    <div
      className="bg-slate-800 border border-slate-700 rounded-xl hover:border-purple-500/50 transition-colors cursor-pointer"
      onClick={() => navigate(`/students/${student.id}`)}
    >
      <div className="flex items-center gap-3 p-4">
        <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center text-purple-400 font-bold text-sm flex-shrink-0">
          {student.student_name.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <span className="text-slate-100 font-medium text-sm truncate block">{student.student_name}</span>
        </div>

        <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
      </div>
    </div>
  );
}

// ── Main Panel ──

export function StudentsPanel() {
  const { t, language } = useLanguage();

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const fetchStudents = useCallback(async () => {
    try {
      const res = await authFetch('/api/coaches/students');
      const json = await res.json();
      setStudents(json.students || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStudents().then(() => setLoading(false));
  }, [fetchStudents]);

  const handleAddStudent = async (form: StudentFormData) => {
    setSaving(true);
    try {
      await authFetch('/api/coaches/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setShowAddForm(false);
      fetchStudents();
    } finally { setSaving(false); }
  };

  return (
    <PanelShell title={t('coaches.students.title')}>
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Student list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-700" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-slate-700 rounded" />
                    <div className="h-3 w-48 bg-slate-700 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-purple-600/10 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-purple-400" />
            </div>
            <p className="text-slate-200 text-lg whitespace-pre-line">{t('coaches.students.empty')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {students
              .sort((a, b) => a.student_name.localeCompare(b.student_name))
              .map(s => (
                <StudentCard key={s.id} student={s} />
              ))}
          </div>
        )}

        {/* Add student */}
        {showAddForm ? (
          <StudentForm
            initial={EMPTY_FORM}
            onSave={handleAddStudent}
            onCancel={() => setShowAddForm(false)}
            saving={saving}
            lang={language}
          />
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className={`flex items-center gap-1.5 mx-auto ${btnPrimary('purple')}`}
          >
            <Plus className="w-4 h-4" />
            {t('coaches.students.addStudent')}
          </button>
        )}
      </div>
    </PanelShell>
  );
}
