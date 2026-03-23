// My Students panel — student roster + scheduling

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Pencil, Clock, X, Calendar, ChevronDown, ChevronUp,
  AlertTriangle, Users,
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

// City → IANA timezone mapping (covers major cities worldwide)
const CITY_TIMEZONES: [string, string][] = [
  // North America
  ['New York', 'America/New_York'], ['Los Angeles', 'America/Los_Angeles'],
  ['Chicago', 'America/Chicago'], ['Houston', 'America/Chicago'],
  ['Phoenix', 'America/Phoenix'], ['Philadelphia', 'America/New_York'],
  ['San Antonio', 'America/Chicago'], ['San Diego', 'America/Los_Angeles'],
  ['Dallas', 'America/Chicago'], ['San Francisco', 'America/Los_Angeles'],
  ['Seattle', 'America/Los_Angeles'], ['Denver', 'America/Denver'],
  ['Boston', 'America/New_York'], ['Atlanta', 'America/New_York'],
  ['Miami', 'America/New_York'], ['Washington DC', 'America/New_York'],
  ['Detroit', 'America/Detroit'], ['Minneapolis', 'America/Chicago'],
  ['Toronto', 'America/Toronto'], ['Montreal', 'America/Toronto'],
  ['Vancouver', 'America/Vancouver'], ['Calgary', 'America/Edmonton'],
  ['Ottawa', 'America/Toronto'], ['Mexico City', 'America/Mexico_City'],
  ['Guadalajara', 'America/Mexico_City'], ['Monterrey', 'America/Monterrey'],
  // South America
  ['Sao Paulo', 'America/Sao_Paulo'], ['Rio de Janeiro', 'America/Sao_Paulo'],
  ['Buenos Aires', 'America/Argentina/Buenos_Aires'], ['Lima', 'America/Lima'],
  ['Bogota', 'America/Bogota'], ['Santiago', 'America/Santiago'],
  ['Caracas', 'America/Caracas'], ['Medellin', 'America/Bogota'],
  // Europe
  ['London', 'Europe/London'], ['Manchester', 'Europe/London'],
  ['Birmingham', 'Europe/London'], ['Edinburgh', 'Europe/London'],
  ['Paris', 'Europe/Paris'], ['Lyon', 'Europe/Paris'],
  ['Marseille', 'Europe/Paris'], ['Toulouse', 'Europe/Paris'],
  ['Bordeaux', 'Europe/Paris'], ['Lille', 'Europe/Paris'],
  ['Nice', 'Europe/Paris'], ['Strasbourg', 'Europe/Paris'],
  ['Berlin', 'Europe/Berlin'], ['Munich', 'Europe/Berlin'],
  ['Hamburg', 'Europe/Berlin'], ['Frankfurt', 'Europe/Berlin'],
  ['Cologne', 'Europe/Berlin'], ['Stuttgart', 'Europe/Berlin'],
  ['Madrid', 'Europe/Madrid'], ['Barcelona', 'Europe/Madrid'],
  ['Valencia', 'Europe/Madrid'], ['Seville', 'Europe/Madrid'],
  ['Rome', 'Europe/Rome'], ['Milan', 'Europe/Rome'],
  ['Naples', 'Europe/Rome'], ['Turin', 'Europe/Rome'],
  ['Florence', 'Europe/Rome'], ['Venice', 'Europe/Rome'],
  ['Amsterdam', 'Europe/Amsterdam'], ['Rotterdam', 'Europe/Amsterdam'],
  ['Brussels', 'Europe/Brussels'], ['Antwerp', 'Europe/Brussels'],
  ['Zurich', 'Europe/Zurich'], ['Geneva', 'Europe/Zurich'],
  ['Vienna', 'Europe/Vienna'], ['Prague', 'Europe/Prague'],
  ['Warsaw', 'Europe/Warsaw'], ['Krakow', 'Europe/Warsaw'],
  ['Budapest', 'Europe/Budapest'], ['Bucharest', 'Europe/Bucharest'],
  ['Lisbon', 'Europe/Lisbon'], ['Porto', 'Europe/Lisbon'],
  ['Dublin', 'Europe/Dublin'], ['Copenhagen', 'Europe/Copenhagen'],
  ['Stockholm', 'Europe/Stockholm'], ['Oslo', 'Europe/Oslo'],
  ['Helsinki', 'Europe/Helsinki'], ['Athens', 'Europe/Athens'],
  ['Moscow', 'Europe/Moscow'], ['Saint Petersburg', 'Europe/Moscow'],
  ['Istanbul', 'Europe/Istanbul'], ['Ankara', 'Europe/Istanbul'],
  ['Kyiv', 'Europe/Kyiv'],
  // Middle East
  ['Dubai', 'Asia/Dubai'], ['Abu Dhabi', 'Asia/Dubai'],
  ['Riyadh', 'Asia/Riyadh'], ['Doha', 'Asia/Qatar'],
  ['Tel Aviv', 'Asia/Jerusalem'], ['Jerusalem', 'Asia/Jerusalem'],
  ['Beirut', 'Asia/Beirut'], ['Tehran', 'Asia/Tehran'],
  // Africa
  ['Cairo', 'Africa/Cairo'], ['Lagos', 'Africa/Lagos'],
  ['Nairobi', 'Africa/Nairobi'], ['Johannesburg', 'Africa/Johannesburg'],
  ['Cape Town', 'Africa/Johannesburg'], ['Casablanca', 'Africa/Casablanca'],
  ['Accra', 'Africa/Accra'], ['Addis Ababa', 'Africa/Addis_Ababa'],
  // South Asia
  ['Mumbai', 'Asia/Kolkata'], ['Delhi', 'Asia/Kolkata'],
  ['Bangalore', 'Asia/Kolkata'], ['Chennai', 'Asia/Kolkata'],
  ['Hyderabad', 'Asia/Kolkata'], ['Kolkata', 'Asia/Kolkata'],
  ['Pune', 'Asia/Kolkata'], ['Karachi', 'Asia/Karachi'],
  ['Lahore', 'Asia/Karachi'], ['Dhaka', 'Asia/Dhaka'],
  ['Colombo', 'Asia/Colombo'],
  // East/Southeast Asia
  ['Shanghai', 'Asia/Shanghai'], ['Beijing', 'Asia/Shanghai'],
  ['Shenzhen', 'Asia/Shanghai'], ['Guangzhou', 'Asia/Shanghai'],
  ['Hong Kong', 'Asia/Hong_Kong'], ['Taipei', 'Asia/Taipei'],
  ['Tokyo', 'Asia/Tokyo'], ['Osaka', 'Asia/Tokyo'],
  ['Seoul', 'Asia/Seoul'], ['Busan', 'Asia/Seoul'],
  ['Singapore', 'Asia/Singapore'], ['Bangkok', 'Asia/Bangkok'],
  ['Jakarta', 'Asia/Jakarta'], ['Kuala Lumpur', 'Asia/Kuala_Lumpur'],
  ['Manila', 'Asia/Manila'], ['Ho Chi Minh City', 'Asia/Ho_Chi_Minh'],
  ['Hanoi', 'Asia/Ho_Chi_Minh'],
  // Oceania
  ['Sydney', 'Australia/Sydney'], ['Melbourne', 'Australia/Melbourne'],
  ['Brisbane', 'Australia/Brisbane'], ['Perth', 'Australia/Perth'],
  ['Auckland', 'Pacific/Auckland'], ['Wellington', 'Pacific/Auckland'],
];

const DAY_NAMES_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_NAMES_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

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

function getTimezoneAbbr(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz, timeZoneName: 'short',
    }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || tz;
  } catch { return tz; }
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

/** Check if a timezone has a DST transition in the next 7 days. Returns description or null. */
function getDstAlert(tz: string): string | null {
  try {
    const now = new Date();
    const in7d = new Date(now.getTime() + 7 * 86400000);
    const nowOffset = getUtcOffset(tz, now);
    const futureOffset = getUtcOffset(tz, in7d);
    if (nowOffset !== futureOffset) {
      const diff = futureOffset - nowOffset;
      const absDiff = Math.abs(diff);
      const unit = absDiff === 1 ? 'hour' : 'hours';
      return `${diff > 0 ? '+' : '-'}${absDiff} ${unit} in 7 days`;
    }
  } catch { /* ignore */ }
  return null;
}

function getUtcOffset(tz: string, date: Date): number {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = date.toLocaleString('en-US', { timeZone: tz });
  return (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 3600000;
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
  city: string;
  recurring_day: number | null;
  recurring_time: string;
}

const EMPTY_FORM: StudentFormData = {
  student_name: '',
  timezone: '',
  city: '',
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

  const [cityQuery, setCityQuery] = useState(initial.city || '');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const citySuggestions = cityQuery.length >= 2
    ? CITY_TIMEZONES.filter(([city]) => city.toLowerCase().includes(cityQuery.toLowerCase())).slice(0, 8)
    : [];

  const handleCitySelect = (city: string, tz: string) => {
    setCityQuery(city);
    setForm(prev => ({ ...prev, timezone: tz, city }));
    setShowSuggestions(false);
  };

  const dayNames = lang === 'fr' ? DAY_NAMES_FR : DAY_NAMES_EN;
  const input = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors';
  const label = 'text-xs font-medium text-slate-400 mb-1';

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
      {/* Row 1: Name + City */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className={label}>{t('coaches.students.name')} *</div>
          <input className={input} value={form.student_name} onChange={e => set('student_name', e.target.value)} placeholder={lang === 'fr' ? 'Nom de l\'élève' : 'Student name'} />
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
          {/* Suggestions dropdown */}
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
          {/* Show deduced timezone */}
          {form.timezone && (
            <div className="mt-1 text-xs text-slate-400">
              {t('coaches.students.timezone')}: {getTimezoneAbbr(form.timezone)} ({form.timezone.replace(/_/g, ' ')})
            </div>
          )}
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

  const dayNamesFull = lang === 'fr' ? DAY_NAMES_FR : DAY_NAMES_EN;
  const studentLocalTime = formatLocalTime(student.timezone);
  const dstAlert = getDstAlert(student.timezone);

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
          city: CITY_TIMEZONES.find(([, tz]) => tz === student.timezone)?.[0] || '',
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
              <span className="text-slate-200">{studentLocalTime}</span>
              <span className="text-slate-200">({getTimezoneAbbr(student.timezone)})</span>
            </span>
            {dstAlert && (
              <span className="flex items-center gap-1 text-amber-400">
                <AlertTriangle className="w-3 h-3" />
                {dstAlert}
              </span>
            )}
            {/* Recurring slot */}
            {student.recurring_day !== null && student.recurring_time && (
              <span className="text-slate-400">
                {t('coaches.students.recurringLabel')} {dayNamesFull[student.recurring_day]} {student.recurring_time}
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
            <p className="text-slate-400 text-sm">{t('coaches.students.empty')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {students
              .sort((a, b) => a.student_name.localeCompare(b.student_name))
              .map(s => (
                <StudentCard key={s.id} student={s} onRefresh={fetchStudents} lang={language} />
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
            className="flex items-center gap-1.5 mx-auto px-4 py-2 text-slate-400 hover:text-purple-400 text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('coaches.students.addStudent')}
          </button>
        )}
      </div>
    </PanelShell>
  );
}
