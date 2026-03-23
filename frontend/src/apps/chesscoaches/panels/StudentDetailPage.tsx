// Student detail page — full page for a single student

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Clock, Pencil, Trash2, Calendar, X, Check,
  AlertTriangle, RefreshCw,
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  CITY_TIMEZONES, getTimezoneAbbr, getCurrencyForTimezone,
  buildCurrencyList, CURRENCY_NAMES,
} from './StudentsPanel';

// ── Types ──

interface Student {
  id: number;
  student_name: string;
  timezone: string;
  currency: string | null;
  recurring_day: number | null;
  recurring_time: string | null;
  is_active: number;
  created_at: string;
}

interface Lesson {
  id: number;
  student_id: number;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  paid: number;
  created_at: string;
}

// ── Constants ──

const DAY_NAMES_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_NAMES_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

// ── Helpers ──

import { authFetch } from '../utils/authFetch';

function formatLocalTime(tz: string, lang: string): string {
  try {
    const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: lang !== 'fr',
    }).format(new Date());
  } catch { return '--:--'; }
}

function formatHHMM(time: string, lang: string): string {
  if (lang === 'fr') return time;
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function formatDate(iso: string, lang: string): string {
  try {
    const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: lang !== 'fr',
    }).format(new Date(iso));
  } catch { return iso; }
}

function formatDuration(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`;
  if (minutes >= 60) return `${(minutes / 60).toFixed(1)}h`;
  return `${minutes}min`;
}

function getDstAlert(tz: string): string | null {
  try {
    const now = new Date();
    const in7d = new Date(now.getTime() + 7 * 86400000);
    const getOffset = (d: Date) => {
      const utcStr = d.toLocaleString('en-US', { timeZone: 'UTC' });
      const tzStr = d.toLocaleString('en-US', { timeZone: tz });
      return (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 3600000;
    };
    const nowOffset = getOffset(now);
    const futureOffset = getOffset(in7d);
    if (nowOffset !== futureOffset) {
      const diff = futureOffset - nowOffset;
      const absDiff = Math.abs(diff);
      return `${diff > 0 ? '+' : '-'}${absDiff} ${absDiff === 1 ? 'hour' : 'hours'} in 7 days`;
    }
  } catch { /* ignore */ }
  return null;
}

function useLiveClock(interval = 30000) {
  const [, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
}

// ── Student Form (inline) ──

interface StudentFormData {
  student_name: string;
  timezone: string;
  city: string;
  currency: string;
  recurring_day: number | null;
  recurring_time: string;
}

function StudentEditForm({ student, onSave, onCancel, lang }: {
  student: Student;
  onSave: (data: StudentFormData) => void;
  onCancel: () => void;
  lang: string;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState<StudentFormData>({
    student_name: student.student_name,
    timezone: student.timezone,
    city: CITY_TIMEZONES.find(([, tz]) => tz === student.timezone)?.[0] || '',
    currency: student.currency || '',
    recurring_day: student.recurring_day,
    recurring_time: student.recurring_time || '',
  });
  const [saving, setSaving] = useState(false);
  const [cityQuery, setCityQuery] = useState(form.city);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const set = (k: keyof StudentFormData, v: string | number | null) => setForm(prev => ({ ...prev, [k]: v }));

  const citySuggestions = cityQuery.length >= 2
    ? CITY_TIMEZONES.filter(([city]) => city.toLowerCase().includes(cityQuery.toLowerCase())).slice(0, 8)
    : [];

  const handleCitySelect = (city: string, tz: string) => {
    setCityQuery(city);
    const deducedCurrency = getCurrencyForTimezone(tz);
    setForm(prev => ({ ...prev, timezone: tz, city, currency: prev.currency || deducedCurrency }));
    setShowSuggestions(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  const dayNames = lang === 'fr' ? DAY_NAMES_FR : DAY_NAMES_EN;
  const input = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors';
  const label = 'text-xs font-medium text-slate-400 mb-1';

  const coachTzData = localStorage.getItem('lumna_coach_tz');
  const coachCurrency = coachTzData ? getCurrencyForTimezone(JSON.parse(coachTzData).timezone || '') : '';
  const studentCurrency = getCurrencyForTimezone(form.timezone);
  const currencies = buildCurrencyList([coachCurrency, studentCurrency].filter(Boolean));

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className={label}>{t('coaches.students.name')} *</div>
          <input className={input} value={form.student_name} onChange={e => set('student_name', e.target.value)} />
        </div>
        <div className="relative">
          <div className={label}>{t('coaches.students.city')} *</div>
          <input
            className={input}
            value={cityQuery}
            onChange={e => { setCityQuery(e.target.value); setShowSuggestions(true); set('timezone', ''); }}
            onFocus={() => setShowSuggestions(true)}
            placeholder={lang === 'fr' ? 'Rechercher une ville...' : 'Search city...'}
          />
          {showSuggestions && citySuggestions.length > 0 && (
            <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {citySuggestions.map(([city, tz]) => (
                <button
                  key={`${city}-${tz}`}
                  onClick={() => handleCitySelect(city, tz)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-600 transition-colors flex justify-between items-center"
                >
                  <span className="text-slate-100">{city}</span>
                  <span className="text-xs text-slate-400">{getTimezoneAbbr(tz)}</span>
                </button>
              ))}
            </div>
          )}
          {form.timezone && (
            <div className="mt-1 text-xs text-slate-400">
              {t('coaches.students.timezone')}: {getTimezoneAbbr(form.timezone)}
            </div>
          )}
        </div>
      </div>

      {form.timezone && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className={label}>{t('coaches.students.currency')}</div>
            <select className={input} value={form.currency} onChange={e => set('currency', e.target.value)}>
              <option value="">{lang === 'fr' ? 'Pas de devise' : 'No currency'}</option>
              {currencies.map(c => <option key={c} value={c}>{c} ({CURRENCY_NAMES[c] || c})</option>)}
            </select>
          </div>
        </div>
      )}

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
                <option value="">{lang === 'fr' ? "Choisir l'heure" : 'Pick hour'}</option>
                {Array.from({ length: 24 }, (_, i) => {
                  const h24 = String(i).padStart(2, '0');
                  if (lang === 'fr') return <option key={i} value={h24}>{h24}h</option>;
                  const period = i < 12 ? 'AM' : 'PM';
                  const h12 = i === 0 ? 12 : i > 12 ? i - 12 : i;
                  return <option key={i} value={h24}>{h12} {period}</option>;
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

      <div className="flex items-center justify-center gap-3 pt-1">
        <button
          onClick={handleSave}
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

// ── Lesson Form ──

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
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
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

// ── Main Page ──

export function StudentDetailPage() {
  const { t, language: lang } = useLanguage();
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  useLiveClock();

  const [student, setStudent] = useState<Student | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showLessonForm, setShowLessonForm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rescheduleId, setRescheduleId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await authFetch(`/api/coaches/students/${studentId}/lessons`);
      if (!res.ok) { navigate('/students'); return; }
      const json = await res.json();
      setStudent(json.student);
      setLessons(json.lessons || []);
    } catch { navigate('/students'); }
  }, [studentId, navigate]);

  useEffect(() => {
    fetchData().then(() => setLoading(false));
  }, [fetchData]);

  const handleUpdate = async (form: StudentFormData) => {
    await authFetch(`/api/coaches/students/${studentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setEditing(false);
    fetchData();
  };

  const handleDelete = async () => {
    await authFetch(`/api/coaches/students/${studentId}`, { method: 'DELETE' });
    navigate('/students');
  };

  const handleStatusChange = async (lessonId: number, newStatus: string) => {
    await authFetch(`/api/coaches/lessons/${lessonId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchData();
  };

  const handleMarkPaid = async (lessonId: number) => {
    await authFetch(`/api/coaches/lessons/${lessonId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid: 1 }),
    });
    fetchData();
  };

  const getDefaultLessonTime = (): string => {
    if (!student || student.recurring_day === null || !student.recurring_time) return '';
    const now = new Date();
    const currentDay = (now.getDay() + 6) % 7;
    let daysAhead = student.recurring_day - currentDay;
    if (daysAhead <= 0) daysAhead += 7;
    const next = new Date(now);
    next.setDate(now.getDate() + daysAhead);
    const [h, m] = student.recurring_time.split(':');
    next.setHours(parseInt(h), parseInt(m), 0, 0);
    return next.toISOString().slice(0, 16);
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
          <div className="h-16 bg-slate-800 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!student) return null;

  const dayNames = lang === 'fr' ? DAY_NAMES_FR : DAY_NAMES_EN;
  const dstAlert = getDstAlert(student.timezone);
  const cityName = CITY_TIMEZONES.find(([, tz]) => tz === student.timezone)?.[0] || '';

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

  // Split lessons into upcoming and past
  const now = new Date();
  const upcoming = lessons.filter(l => new Date(l.scheduled_at) >= now && l.status !== 'cancelled');
  const past = lessons.filter(l => new Date(l.scheduled_at) < now || l.status === 'cancelled');

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
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-slate-200">{formatLocalTime(student.timezone, lang)}</span>
                      <span>({getTimezoneAbbr(student.timezone)}{cityName ? ` - ${cityName}` : ''})</span>
                    </span>
                    {dstAlert && (
                      <span className="flex items-center gap-1 text-amber-400 text-xs">
                        <AlertTriangle className="w-3 h-3" />
                        {dstAlert}
                      </span>
                    )}
                  </div>
                  {student.recurring_day !== null && student.recurring_time && (
                    <div className="mt-1.5 text-sm text-slate-400">
                      {t('coaches.students.recurringLabel')} {dayNames[student.recurring_day]} {formatHHMM(student.recurring_time, lang)}
                    </div>
                  )}
                  {student.currency && (
                    <div className="mt-1 text-sm text-slate-500">
                      {t('coaches.students.currency')}: {student.currency}
                    </div>
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

            {/* Actions row */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowLessonForm(!showLessonForm)}
                className="flex items-center gap-1.5 px-4 py-2 bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 rounded-lg text-sm font-medium transition-colors"
              >
                <Calendar className="w-4 h-4" />
                {t('coaches.students.scheduleLessonFull')}
              </button>
            </div>

            {/* Lesson form */}
            {showLessonForm && (
              <LessonForm
                studentId={student.id}
                defaultTime={getDefaultLessonTime()}
                onSaved={() => { setShowLessonForm(false); fetchData(); }}
                onCancel={() => setShowLessonForm(false)}
              />
            )}
          </>
        )}

        {/* Upcoming lessons */}
        {upcoming.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-2">
              {t('coaches.student.upcoming')} ({upcoming.length})
            </h2>
            <div className="space-y-1.5">
              {upcoming.map(l => (
                <div key={l.id} className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5">
                  <span className="text-sm text-slate-200 flex-shrink-0">{formatDate(l.scheduled_at, lang)}</span>
                  <span className="text-xs text-slate-400">{formatDuration(l.duration_minutes)}</span>
                  <div className="flex-1" />
                  <select
                    value={l.status}
                    onChange={e => handleStatusChange(l.id, e.target.value)}
                    className={`text-xs rounded px-1.5 py-0.5 border cursor-pointer ${statusColors[l.status] || statusColors.scheduled}`}
                  >
                    {Object.entries(statusLabels).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                  {rescheduleId === l.id ? (
                    <RescheduleForm lesson={l} onSaved={() => { setRescheduleId(null); fetchData(); }} onCancel={() => setRescheduleId(null)} />
                  ) : (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setRescheduleId(l.id)} className="text-slate-500 hover:text-slate-300 transition-colors" title={t('coaches.students.reschedule')}>
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleStatusChange(l.id, 'cancelled')}
                        className="text-slate-500 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Past lessons / history */}
        {past.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-2">
              {t('coaches.student.history')} ({past.length})
            </h2>
            <div className="space-y-1.5">
              {past.map(l => (
                <div key={l.id} className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5">
                  <span className="text-sm text-slate-200 flex-shrink-0">{formatDate(l.scheduled_at, lang)}</span>
                  <span className="text-xs text-slate-400">{formatDuration(l.duration_minutes)}</span>
                  <div className="flex-1" />
                  <select
                    value={l.status}
                    onChange={e => handleStatusChange(l.id, e.target.value)}
                    className={`text-xs rounded px-1.5 py-0.5 border cursor-pointer ${statusColors[l.status] || statusColors.scheduled}`}
                  >
                    {Object.entries(statusLabels).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                  {l.status === 'completed' && !l.paid && (
                    <button
                      onClick={() => handleMarkPaid(l.id)}
                      className="flex items-center gap-1 px-2 py-1 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded text-xs font-medium transition-colors"
                    >
                      <Check className="w-3 h-3" />
                      {t('coaches.payments.markPaid')}
                    </button>
                  )}
                  {l.paid === 1 && (
                    <span className="text-xs text-emerald-500/60">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No lessons at all */}
        {lessons.length === 0 && !showLessonForm && (
          <div className="text-center py-8 text-slate-500 text-sm">
            {t('coaches.student.noLessons')}
          </div>
        )}

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
              <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-slate-500 hover:text-red-400 text-xs transition-colors">
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
