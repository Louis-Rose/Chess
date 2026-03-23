// My Students panel — student roster + scheduling

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Trash2, Pencil, Clock, X, Calendar, ChevronDown, ChevronUp,
  AlertTriangle, RefreshCw, Users,
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelShell } from '../components/PanelShell';

// ── Types ──

interface Student {
  id: number;
  student_name: string;
  timezone: string;
  recurring_day: number | null;   // 0=Mon .. 6=Sun, null=no recurring
  recurring_time: string | null;  // "HH:MM" in coach's TZ
  is_active: number;
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

// ── Constants ──

const COMMON_TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Toronto', 'America/Sao_Paulo', 'America/Mexico_City',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome',
  'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Moscow',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
  'Asia/Singapore', 'Asia/Hong_Kong',
  'Australia/Sydney', 'Australia/Melbourne',
  'Africa/Cairo', 'Africa/Johannesburg',
  'Pacific/Auckland',
  'UTC',
];

const DAY_NAMES_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_NAMES_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DAY_NAMES_SHORT_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES_SHORT_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// ── Helpers ──

function authFetch(url: string, opts: RequestInit = {}) {
  return fetch(url, { ...opts, credentials: 'include' });
}

function formatLocalTime(tz: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date());
  } catch { return '--:--'; }
}

function formatLessonTime(iso: string, tz?: string): string {
  try {
    const d = new Date(iso);
    const opts: Intl.DateTimeFormatOptions = {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    };
    if (tz) opts.timeZone = tz;
    return new Intl.DateTimeFormat(undefined, opts).format(d);
  } catch { return iso; }
}

function getWeekBounds(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const start = new Date(now);
  start.setDate(now.getDate() + diffToMon);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

/** Check if any student's TZ has a DST transition in the next 7 days */
function getDstAlerts(students: Student[]): string[] {
  const alerts: string[] = [];
  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 86400000);

  const checkedTz = new Set<string>();
  for (const s of students) {
    if (checkedTz.has(s.timezone)) continue;
    checkedTz.add(s.timezone);
    try {
      const nowOffset = getUtcOffset(s.timezone, now);
      const futureOffset = getUtcOffset(s.timezone, in7d);
      if (nowOffset !== futureOffset) {
        const city = s.timezone.split('/').pop()?.replace(/_/g, ' ') || s.timezone;
        const diff = futureOffset - nowOffset;
        alerts.push(`${city}: ${diff > 0 ? '+' : ''}${diff}h in the next 7 days`);
      }
    } catch { /* ignore invalid tz */ }
  }
  return alerts;
}

function getUtcOffset(tz: string, date: Date): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = date.toLocaleString('en-US', { timeZone: tz });
  return (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 3600000;
}

function isStudentInDifferentTz(studentTz: string): boolean {
  const coachTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (studentTz === coachTz) return false;
  const now = new Date();
  return getUtcOffset(studentTz, now) !== getUtcOffset(coachTz, now);
}

// ── Live Clock Hook ──

function useLiveClock(interval = 30000) {
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
}

// ── Student Form ──

interface StudentFormData {
  student_name: string;
  timezone: string;
  recurring_day: number | null;
  recurring_time: string;
}

const EMPTY_FORM: StudentFormData = {
  student_name: '',
  timezone: '',
  recurring_day: null,
  recurring_time: '',
};

function StudentForm({ initial, onSave, onCancel, saving, lang }: {
  initial: StudentFormData;
  onSave: (data: StudentFormData) => void;
  onCancel: () => void;
  saving: boolean;
  lang: string;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState(initial);
  const set = (k: keyof StudentFormData, v: string | number | null) => setForm(prev => ({ ...prev, [k]: v }));

  const dayNames = lang === 'fr' ? DAY_NAMES_FR : DAY_NAMES_EN;
  const input = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors';
  const label = 'text-xs font-medium text-slate-400 mb-1';

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
      {/* Row 1: Name + Timezone */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className={label}>{t('coaches.students.name')} *</div>
          <input className={input} value={form.student_name} onChange={e => set('student_name', e.target.value)} placeholder={lang === 'fr' ? 'Nom de l\'élève' : 'Student name'} />
        </div>
        <div>
          <div className={label}>{t('coaches.students.timezone')}</div>
          <select className={input} value={form.timezone} onChange={e => set('timezone', e.target.value)}>
            <option value="">{lang === 'fr' ? 'Choisir le fuseau' : 'Pick timezone'}</option>
            {COMMON_TIMEZONES.map(tz => (
              <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2: Recurring slot (optional) */}
      <div>
        <div className={label}>{t('coaches.students.recurringSlot')}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            className={input}
            value={form.recurring_day === null ? '' : form.recurring_day}
            onChange={e => set('recurring_day', e.target.value === '' ? null : parseInt(e.target.value))}
          >
            <option value="">{t('coaches.students.noRecurring')}</option>
            {dayNames.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
          {form.recurring_day !== null && (
            <div className="grid grid-cols-2 gap-2">
              <select
                className={input}
                value={form.recurring_time ? form.recurring_time.split(':')[0] : ''}
                onChange={e => {
                  const h = e.target.value;
                  const m = form.recurring_time ? form.recurring_time.split(':')[1] : '00';
                  set('recurring_time', h ? `${h}:${m}` : '');
                }}
              >
                <option value="">{lang === 'fr' ? 'Choisir l\'heure' : 'Pick hour'}</option>
                {Array.from({ length: 24 }, (_, i) => {
                  const h = String(i).padStart(2, '0');
                  return <option key={i} value={h}>{h}h</option>;
                })}
              </select>
              <select
                className={input}
                value={form.recurring_time ? form.recurring_time.split(':')[1] : ''}
                disabled={!form.recurring_time}
                onChange={e => {
                  const h = form.recurring_time?.split(':')[0];
                  if (!h) return;
                  set('recurring_time', `${h}:${e.target.value}`);
                }}
              >
                {!form.recurring_time && <option value="">--</option>}
                {['00', '15', '30', '45'].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => onSave(form)}
          disabled={!form.student_name.trim() || !form.timezone || saving}
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

// ── Lesson Scheduling Form ──

function LessonForm({ studentId, defaultTime, onSaved, onCancel }: {
  studentId: number;
  defaultTime: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [scheduledAt, setScheduledAt] = useState(defaultTime);
  const [duration, setDuration] = useState('60');
  const [saving, setSaving] = useState(false);

  const input = 'bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500 transition-colors';

  const handleSave = async () => {
    if (!scheduledAt) return;
    setSaving(true);
    try {
      await authFetch(`/api/coaches/students/${studentId}/lessons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_at: scheduledAt, duration_minutes: parseInt(duration) }),
      });
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-slate-750 border border-slate-600 rounded-lg p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-xs text-slate-400 mb-1">{t('coaches.students.when')}</div>
          <input type="datetime-local" className={input + ' w-full'} value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
        </div>
        <div>
          <div className="text-xs text-slate-400 mb-1">{t('coaches.students.duration')}</div>
          <select className={input + ' w-full'} value={duration} onChange={e => setDuration(e.target.value)}>
            {[30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} {t('coaches.students.minutes')}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={!scheduledAt || saving} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
          {saving ? '...' : t('coaches.students.save')}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs transition-colors">
          {t('coaches.students.cancel')}
        </button>
      </div>
    </div>
  );
}

// ── Reschedule Form ──

function RescheduleForm({ lesson, onSaved, onCancel }: {
  lesson: Lesson;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [scheduledAt, setScheduledAt] = useState(lesson.scheduled_at.slice(0, 16));
  const [saving, setSaving] = useState(false);

  const input = 'bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500 transition-colors';

  const handleSave = async () => {
    if (!scheduledAt) return;
    setSaving(true);
    try {
      await authFetch(`/api/coaches/lessons/${lesson.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_at: scheduledAt, status: 'rescheduled' }),
      });
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div className="flex items-center gap-2">
      <input type="datetime-local" className={input} value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
      <button onClick={handleSave} disabled={!scheduledAt || saving} className="px-2 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
        {saving ? '...' : t('coaches.students.save')}
      </button>
      <button onClick={onCancel} className="text-slate-400 hover:text-slate-200">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Student Card ──

function StudentCard({ student, onRefresh, lang }: {
  student: Student;
  onRefresh: () => void;
  lang: string;
}) {
  const { t } = useLanguage();
  useLiveClock();

  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showLessonForm, setShowLessonForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const dayNamesShort = lang === 'fr' ? DAY_NAMES_SHORT_FR : DAY_NAMES_SHORT_EN;
  const differentTz = isStudentInDifferentTz(student.timezone);
  const studentLocalTime = formatLocalTime(student.timezone);

  // Compute default time for lesson form: next recurring slot or empty
  const getDefaultLessonTime = (): string => {
    if (student.recurring_day === null || !student.recurring_time) return '';
    const now = new Date();
    const currentDay = (now.getDay() + 6) % 7; // JS Sun=0 -> Mon=0
    let daysAhead = student.recurring_day - currentDay;
    if (daysAhead <= 0) daysAhead += 7;
    const next = new Date(now);
    next.setDate(now.getDate() + daysAhead);
    const [h, m] = student.recurring_time.split(':');
    next.setHours(parseInt(h), parseInt(m), 0, 0);
    return next.toISOString().slice(0, 16);
  };

  const handleDelete = async () => {
    await authFetch(`/api/coaches/students/${student.id}`, { method: 'DELETE' });
    onRefresh();
  };

  const handleUpdate = async (form: StudentFormData) => {
    setSaving(true);
    try {
      await authFetch(`/api/coaches/students/${student.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setEditing(false);
      onRefresh();
    } finally { setSaving(false); }
  };

  if (editing) {
    return (
      <StudentForm
        initial={{
          student_name: student.student_name,
          timezone: student.timezone,
          recurring_day: student.recurring_day,
          recurring_time: student.recurring_time || '',
        }}
        onSave={handleUpdate}
        onCancel={() => setEditing(false)}
        saving={saving}
        lang={lang}
      />
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl transition-colors">
      {/* Header row */}
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center text-purple-400 font-bold text-sm flex-shrink-0">
          {student.student_name.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <span className="text-slate-100 font-medium text-sm truncate block">{student.student_name}</span>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
            {/* Timezone */}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {studentLocalTime}
              <span className="text-slate-600">({student.timezone.split('/').pop()?.replace(/_/g, ' ')})</span>
              {differentTz && <span className="text-amber-400/70 ml-0.5" title="Different timezone">*</span>}
            </span>
            {/* Recurring slot */}
            {student.recurring_day !== null && student.recurring_time && (
              <span className="text-slate-400">
                {dayNamesShort[student.recurring_day]} {student.recurring_time}
              </span>
            )}
          </div>
        </div>

        {/* Next lesson badge */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {student.next_lesson && (
            <span className="text-xs px-2 py-1 rounded-lg border bg-blue-500/20 text-blue-400 border-blue-500/30">
              {formatLessonTime(student.next_lesson.scheduled_at)}
            </span>
          )}
          <div className="text-slate-500">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="border-t border-slate-700 px-4 pb-4 space-y-3">
          {/* Lesson form */}
          {showLessonForm && (
            <div className="pt-3">
              <LessonForm
                studentId={student.id}
                defaultTime={getDefaultLessonTime()}
                onSaved={() => { setShowLessonForm(false); onRefresh(); }}
                onCancel={() => setShowLessonForm(false)}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={(e) => { e.stopPropagation(); setShowLessonForm(!showLessonForm); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 rounded-lg text-xs font-medium transition-colors"
            >
              <Calendar className="w-3.5 h-3.5" />{t('coaches.students.scheduleLesson')}
            </button>
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs transition-colors">
              <Pencil className="w-3.5 h-3.5" />{t('coaches.students.editStudent')}
            </button>

            {confirmDelete ? (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-red-400">{t('coaches.students.deleteConfirm')}</span>
                <button onClick={handleDelete} className="px-2 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-500 transition-colors">
                  {t('coaches.students.deleteStudent')}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-xs text-slate-400 hover:text-slate-200">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-slate-500 hover:text-red-400 text-xs transition-colors ml-auto">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Week View ──

function WeekView({ lessons, onRefresh, lang }: {
  lessons: Lesson[];
  onRefresh: () => void;
  lang: string;
}) {
  const { t } = useLanguage();
  const [rescheduleId, setRescheduleId] = useState<number | null>(null);

  const statusColors: Record<string, string> = {
    scheduled: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    cancelled: 'bg-slate-600 text-slate-400 border-slate-500',
    rescheduled: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  };

  const statusLabels: Record<string, string> = {
    scheduled: t('coaches.students.scheduled'),
    completed: t('coaches.students.completedStatus'),
    cancelled: t('coaches.students.cancelledStatus'),
    rescheduled: t('coaches.students.rescheduledStatus'),
  };

  const handleStatusChange = async (lessonId: number, newStatus: string) => {
    await authFetch(`/api/coaches/lessons/${lessonId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    onRefresh();
  };

  const handleCancel = async (lessonId: number) => {
    await authFetch(`/api/coaches/lessons/${lessonId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    onRefresh();
  };

  if (lessons.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500 text-sm">
        {t('coaches.students.noLessonsThisWeek')}
      </div>
    );
  }

  // Group by day
  const dayNames = lang === 'fr' ? DAY_NAMES_FR : DAY_NAMES_EN;
  const grouped = new Map<number, Lesson[]>();
  for (const l of lessons) {
    const d = new Date(l.scheduled_at);
    const dayIdx = (d.getDay() + 6) % 7; // Mon=0
    if (!grouped.has(dayIdx)) grouped.set(dayIdx, []);
    grouped.get(dayIdx)!.push(l);
  }

  return (
    <div className="space-y-3">
      {Array.from(grouped.entries())
        .sort(([a], [b]) => a - b)
        .map(([dayIdx, dayLessons]) => (
          <div key={dayIdx}>
            <div className="text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
              {dayNames[dayIdx]}
            </div>
            <div className="space-y-1.5">
              {dayLessons
                .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
                .map(l => (
                  <div key={l.id} className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5">
                    {/* Time */}
                    <span className="text-sm font-mono text-slate-200 w-12 flex-shrink-0">
                      {new Date(l.scheduled_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </span>
                    {/* Student name */}
                    <span className="text-sm text-slate-100 flex-1 truncate">{l.student_name}</span>
                    {/* Duration */}
                    <span className="text-xs text-slate-500">{l.duration_minutes}{t('coaches.students.minutes')}</span>
                    {/* Status badge */}
                    <select
                      value={l.status}
                      onChange={e => handleStatusChange(l.id, e.target.value)}
                      className={`text-xs rounded px-1.5 py-0.5 border cursor-pointer ${statusColors[l.status] || statusColors.scheduled}`}
                    >
                      {Object.entries(statusLabels).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                    {/* Reschedule */}
                    {rescheduleId === l.id ? (
                      <RescheduleForm
                        lesson={l}
                        onSaved={() => { setRescheduleId(null); onRefresh(); }}
                        onCancel={() => setRescheduleId(null)}
                      />
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setRescheduleId(l.id)}
                          className="text-slate-500 hover:text-slate-300 transition-colors"
                          title={t('coaches.students.reschedule')}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        {l.status !== 'cancelled' && (
                          <button
                            onClick={() => handleCancel(l.id)}
                            className="text-slate-500 hover:text-red-400 transition-colors"
                            title={t('coaches.students.cancel')}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>
        ))}
    </div>
  );
}

// ── Main Panel ──

type Tab = 'roster' | 'week';

export function StudentsPanel() {
  const { t, language } = useLanguage();

  const [students, setStudents] = useState<Student[]>([]);
  const [weekLessons, setWeekLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('week');
  const [dstAlerts, setDstAlerts] = useState<string[]>([]);

  const fetchStudents = useCallback(async () => {
    try {
      const res = await authFetch('/api/coaches/students');
      const json = await res.json();
      const list = json.students || [];
      setStudents(list);
      setDstAlerts(getDstAlerts(list));
    } catch { /* ignore */ }
  }, []);

  const fetchWeekLessons = useCallback(async () => {
    try {
      const { start, end } = getWeekBounds();
      const res = await authFetch(`/api/coaches/lessons/week?start=${start.toISOString()}&end=${end.toISOString()}`);
      const json = await res.json();
      setWeekLessons(json.lessons || []);
    } catch { /* ignore */ }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchStudents(), fetchWeekLessons()]);
  }, [fetchStudents, fetchWeekLessons]);

  useEffect(() => {
    Promise.all([fetchStudents(), fetchWeekLessons()]).then(() => setLoading(false));
  }, [fetchStudents, fetchWeekLessons]);

  const handleAddStudent = async (form: StudentFormData) => {
    setSaving(true);
    try {
      await authFetch('/api/coaches/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setShowAddForm(false);
      refreshAll();
    } finally { setSaving(false); }
  };

  // Filter students by search
  const filtered = students.filter(s => {
    if (!search) return true;
    return s.student_name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <PanelShell title={t('coaches.students.title')}>
      <div className="max-w-3xl mx-auto space-y-4">
        {/* DST alerts */}
        {dstAlerts.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-300">
              <span className="font-medium">{t('coaches.students.dstAlert')}:</span>
              {dstAlerts.map((a, i) => <div key={i}>{a}</div>)}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab('week')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'week' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />{t('coaches.students.weekView')}</span>
          </button>
          <button
            onClick={() => setTab('roster')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'roster' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" />{t('coaches.students.roster')}</span>
          </button>
        </div>

        {/* Week view */}
        {tab === 'week' && (
          loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-800 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <WeekView lessons={weekLessons} onRefresh={refreshAll} lang={language} />
          )
        )}

        {/* Roster view */}
        {tab === 'roster' && (
          <>
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('coaches.students.search')}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
              >
                <Plus className="w-4 h-4" />
                {t('coaches.students.addStudent')}
              </button>
            </div>

            {/* Add form */}
            {showAddForm && (
              <StudentForm
                initial={EMPTY_FORM}
                onSave={handleAddStudent}
                onCancel={() => setShowAddForm(false)}
                saving={saving}
                lang={language}
              />
            )}

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
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-purple-600/10 flex items-center justify-center mb-4">
                  <Users className="w-8 h-8 text-purple-400" />
                </div>
                <p className="text-slate-400 text-sm">{t('coaches.students.empty')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered
                  .sort((a, b) => a.student_name.localeCompare(b.student_name))
                  .map(s => (
                    <StudentCard key={s.id} student={s} onRefresh={refreshAll} lang={language} />
                  ))}
              </div>
            )}
          </>
        )}
      </div>
    </PanelShell>
  );
}
