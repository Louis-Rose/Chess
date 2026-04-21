// My Students panel — student roster + scheduling

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ChevronRight, Users } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelShell, btnPrimary } from '../components/PanelShell';
import { StudentForm, EMPTY_STUDENT_FORM } from '../components/StudentForm';
import type { StudentFormData } from '../components/StudentForm';
import { Avatar } from '../components/Avatar';
import { EmptyState } from '../components/EmptyState';

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
        <Avatar name={student.student_name} size="lg" />

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
  const { t } = useLanguage();

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
        ) : students.length === 0 && !showAddForm ? (
          <EmptyState icon={Users} color="purple" title={t('coaches.students.empty')} />
        ) : students.length > 0 ? (
          <div className="space-y-2">
            {students
              .sort((a, b) => a.student_name.localeCompare(b.student_name))
              .map(s => (
                <StudentCard key={s.id} student={s} />
              ))}
          </div>
        ) : null}

        {/* Add student */}
        {showAddForm ? (
          <StudentForm
            initial={EMPTY_STUDENT_FORM}
            onSave={handleAddStudent}
            onCancel={() => setShowAddForm(false)}
            saving={saving}
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
