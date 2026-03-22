// My Students panel — student roster, bundles, timezone clocks, payment status

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, ChevronDown, ChevronUp, Trash2, Pencil, Clock,
  AlertTriangle, Archive, RotateCcw, X, Calendar, BookOpen, Send, Users,
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useCoachesData, getCoachesPrefs, saveCoachesPrefs } from '../contexts/CoachesDataContext';
import { PanelShell } from '../components/PanelShell';

// ── Types ──

interface LessonStats {
  completed: number;
  no_shows: number;
  rescheduled: number;
  cancelled: number;
}

interface Bundle {
  id: number;
  total_lessons: number;
  used_lessons: number;
  price_total: number | null;
  price_currency: string;
  purchased_at: string;
  expires_at: string | null;
}

interface NextLesson {
  id: number;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  topic: string | null;
}

interface Student {
  id: number;
  coach_username: string;
  student_name: string;
  student_chess_username: string | null;
  student_lichess_username: string | null;
  email: string | null;
  phone: string | null;
  parent_name: string | null;
  parent_email: string | null;
  parent_phone: string | null;
  is_minor: number;
  timezone: string;
  preferred_platform: string | null;
  platform_link: string | null;
  rate_amount: number | null;
  rate_currency: string;
  payment_status: string;
  notes: string | null;
  is_active: number;
  last_lesson_at: string | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
  active_bundle: Bundle | null;
  next_lesson: NextLesson | null;
  lesson_stats: LessonStats;
}

interface Lesson {
  id: number;
  student_id: number;
  bundle_id: number | null;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  topic: string | null;
  notes: string | null;
  created_at: string;
}

type SortKey = 'name' | 'next_lesson' | 'payment';

// ── Common timezones ──

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

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'INR', 'BRL', 'RUB', 'CNY', 'JPY', 'KRW', 'SGD', 'AED', 'ZAR'] as const;

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '\u20AC', USD: '$', GBP: '\u00A3', CHF: 'CHF', CAD: 'CA$', AUD: 'A$',
  INR: '\u20B9', BRL: 'R$', RUB: '\u20BD', CNY: '\u00A5', JPY: '\u00A5',
  KRW: '\u20A9', SGD: 'S$', AED: 'AED', ZAR: 'R',
};

// ── Timezone → phone prefix mapping ──

const TZ_PHONE_PREFIX: Record<string, string> = {
  'America/New_York': '+1', 'America/Chicago': '+1', 'America/Denver': '+1', 'America/Los_Angeles': '+1',
  'America/Toronto': '+1', 'America/Sao_Paulo': '+55', 'America/Mexico_City': '+52',
  'Europe/London': '+44', 'Europe/Paris': '+33', 'Europe/Berlin': '+49', 'Europe/Madrid': '+34',
  'Europe/Rome': '+39', 'Europe/Amsterdam': '+31', 'Europe/Brussels': '+32', 'Europe/Moscow': '+7',
  'Asia/Dubai': '+971', 'Asia/Kolkata': '+91', 'Asia/Shanghai': '+86', 'Asia/Tokyo': '+81',
  'Asia/Seoul': '+82', 'Asia/Singapore': '+65', 'Asia/Hong_Kong': '+852',
  'Australia/Sydney': '+61', 'Australia/Melbourne': '+61',
  'Africa/Cairo': '+20', 'Africa/Johannesburg': '+27',
  'Pacific/Auckland': '+64',
  'UTC': '',
};

function getPhonePrefix(tz: string): string {
  return TZ_PHONE_PREFIX[tz] || '';
}

// ── Helpers ──

function formatLocalTime(tz: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
  } catch {
    return '--:--';
  }
}

function formatDateTime(iso: string, tz?: string): string {
  try {
    const d = new Date(iso);
    const opts: Intl.DateTimeFormatOptions = {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    };
    if (tz) opts.timeZone = tz;
    return new Intl.DateTimeFormat(undefined, opts).format(d);
  } catch {
    return iso;
  }
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / 86400000);
}

function getPaymentColor(status: string) {
  if (status === 'paid') return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (status === 'pending') return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  return 'bg-red-500/20 text-red-400 border-red-500/30';
}

// ── Live Clock Hook ──

function useLiveClock(interval = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

// ── Student Form ──

interface StudentFormData {
  student_name: string;
  student_chess_username: string;
  student_lichess_username: string;
  email: string;
  phone: string;
  timezone: string;
  payment_status: string;
  notes: string;
}

const EMPTY_FORM: StudentFormData = {
  student_name: '', student_chess_username: '', student_lichess_username: '',
  email: '', phone: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  payment_status: 'paid', notes: '',
};

function StudentForm({ initial, onSave, onCancel, saving, isEditing }: {
  initial: StudentFormData;
  onSave: (data: StudentFormData) => void;
  onCancel: () => void;
  saving: boolean;
  isEditing?: boolean;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState(initial);
  const set = (k: keyof StudentFormData, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }));

  const input = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors';
  const label = 'text-xs font-medium text-slate-400 mb-1';

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
      {/* Row 1: Name + Chess usernames */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <div className={label}>{t('coaches.students.name')} *</div>
          <input className={input} value={form.student_name} onChange={e => set('student_name', e.target.value)} placeholder="John Doe" />
        </div>
        <div>
          <div className={label}>{t('coaches.students.chesscom')}</div>
          <input className={input} value={form.student_chess_username} onChange={e => set('student_chess_username', e.target.value)} placeholder="username" />
        </div>
        <div>
          <div className={label}>{t('coaches.students.lichess')}</div>
          <input className={input} value={form.student_lichess_username} onChange={e => set('student_lichess_username', e.target.value)} placeholder="username" />
        </div>
      </div>

      {/* Row 2: Timezone, Contact */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <div className={label}>{t('coaches.students.timezone')}</div>
          <select className={input} value={form.timezone} onChange={e => set('timezone', e.target.value)}>
            {COMMON_TIMEZONES.map(tz => (
              <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <div className={label}>{t('coaches.students.phone')}</div>
          <div className="relative">
            {getPhonePrefix(form.timezone) && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">{getPhonePrefix(form.timezone)}</span>
            )}
            <input className={`${input} ${getPhonePrefix(form.timezone) ? 'pl-12' : ''}`} type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
        </div>
        <div>
          <div className={label}>{t('coaches.students.email')}</div>
          <input className={input} type="email" value={form.email} onChange={e => set('email', e.target.value)} />
        </div>
      </div>

      {/* Payment status — only shown when editing */}
      {isEditing && (
        <div>
          <div className={label}>{t('coaches.students.paymentStatus')}</div>
          <div className="flex gap-2">
            {(['paid', 'pending', 'overdue'] as const).map(s => (
              <button
                key={s}
                onClick={() => set('payment_status', s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  form.payment_status === s ? getPaymentColor(s) : 'border-slate-600 text-slate-500 hover:border-slate-500'
                }`}
              >
                {t(`coaches.students.${s}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Notes — only shown when editing */}
      {isEditing && (
        <div>
          <div className={label}>{t('coaches.students.notes')}</div>
          <textarea className={`${input} resize-none h-20`} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => onSave(form)}
          disabled={!form.student_name.trim() || saving}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? '...' : t('coaches.students.save')}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm transition-colors"
        >
          {t('coaches.students.cancel')}
        </button>
      </div>
    </div>
  );
}

// ── Lesson Form (inline) ──

function LessonForm({ studentId, bundleId, onSaved, onCancel }: {
  studentId: number;
  bundleId: number | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [scheduledAt, setScheduledAt] = useState('');
  const [duration, setDuration] = useState('60');
  const [status, setStatus] = useState('completed');
  const [topic, setTopic] = useState('');
  const [saving, setSaving] = useState(false);

  const input = 'bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500 transition-colors';

  const handleSave = async () => {
    if (!scheduledAt) return;
    setSaving(true);
    try {
      await fetch(`/api/coaches/students/${studentId}/lessons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_at: scheduledAt,
          duration_minutes: parseInt(duration),
          status,
          topic: topic || null,
          bundle_id: bundleId,
        }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-750 border border-slate-600 rounded-lg p-3 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
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
        <div>
          <div className="text-xs text-slate-400 mb-1">{t('coaches.students.status')}</div>
          <select className={input + ' w-full'} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="completed">{t('coaches.students.completedStatus')}</option>
            <option value="scheduled">{t('coaches.students.scheduled')}</option>
            <option value="cancelled">{t('coaches.students.cancelledStatus')}</option>
            <option value="no_show">{t('coaches.students.noShow')}</option>
            <option value="rescheduled">{t('coaches.students.rescheduledStatus')}</option>
          </select>
        </div>
        <div>
          <div className="text-xs text-slate-400 mb-1">{t('coaches.students.topic')}</div>
          <input className={input + ' w-full'} value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Endgames" />
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

// ── Bundle Form (inline) ──

function BundleForm({ studentId, currency, onSaved, onCancel }: {
  studentId: number;
  currency: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [total, setTotal] = useState('10');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const input = 'bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500 transition-colors';

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/coaches/students/${studentId}/bundles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          total_lessons: parseInt(total),
          price_total: price ? parseFloat(price) : null,
          price_currency: currency,
        }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-750 border border-slate-600 rounded-lg p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-xs text-slate-400 mb-1">{t('coaches.students.totalLessons')}</div>
          <select className={input + ' w-full'} value={total} onChange={e => setTotal(e.target.value)}>
            {[1, 3, 5, 10, 15, 20, 30].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <div className="text-xs text-slate-400 mb-1">{t('coaches.students.bundlePrice')} ({CURRENCY_SYMBOLS[currency] || currency})</div>
          <input type="number" min="0" step="0.01" className={input + ' w-full'} value={price} onChange={e => setPrice(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
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

function StudentCard({ student, coachTz, coachRate, coachCurrency, onRefresh }: {
  student: Student;
  coachTz: string;
  coachRate: number | null;
  coachCurrency: string;
  onRefresh: () => void;
}) {
  const { t } = useLanguage();
  useLiveClock();

  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showLessonForm, setShowLessonForm] = useState(false);
  const [showBundleForm, setShowBundleForm] = useState(false);
  const [showLessons, setShowLessons] = useState(false);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  const bundle = student.active_bundle;
  const remaining = bundle ? bundle.total_lessons - bundle.used_lessons : null;
  const bundleLow = remaining !== null && remaining <= 2 && remaining > 0;
  const bundleEmpty = remaining !== null && remaining <= 0;

  const ghostDays = daysSince(student.last_contact_at || student.last_lesson_at);
  const isGhosting = ghostDays !== null && ghostDays >= 14;

  const studentLocalTime = formatLocalTime(student.timezone);
  const coachLocalTime = formatLocalTime(coachTz);

  const loadLessons = useCallback(async () => {
    setLessonsLoading(true);
    try {
      const res = await fetch(`/api/coaches/students/${student.id}/lessons`);
      const json = await res.json();
      setLessons(json.lessons || []);
    } finally {
      setLessonsLoading(false);
    }
  }, [student.id]);

  const handleDelete = async () => {
    await fetch(`/api/coaches/students/${student.id}?coach=${encodeURIComponent(student.coach_username)}`, { method: 'DELETE' });
    onRefresh();
  };

  const handleUpdate = async (form: StudentFormData) => {
    setSaving(true);
    try {
      await fetch(`/api/coaches/students/${student.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, coach_username: student.coach_username }),
      });
      setEditing(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveToggle = async () => {
    await fetch(`/api/coaches/students/${student.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coach_username: student.coach_username, is_active: student.is_active ? 0 : 1 }),
    });
    onRefresh();
  };

  const handlePing = () => {
    const name = student.student_name;
    const email = student.email;
    const subject = encodeURIComponent(`Chess Lesson Reminder`);
    const body = encodeURIComponent(
      `Hi ${name},\n\nThis is a reminder about ${student.student_name}'s chess lessons.\n\n` +
      (bundleEmpty ? `The current lesson bundle has been used up. Would you like to renew?\n\n` :
       bundleLow ? `There ${remaining === 1 ? 'is' : 'are'} only ${remaining} lesson${remaining === 1 ? '' : 's'} remaining in the current bundle.\n\n` :
       student.payment_status === 'overdue' ? `I noticed the payment is still pending. Could you please check?\n\n` :
       `I wanted to check in and schedule the next lesson.\n\n`) +
      `Best regards`
    );
    if (email) {
      window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
    }
  };

  // Lesson status update
  const handleLessonStatusChange = async (lessonId: number, newStatus: string) => {
    await fetch(`/api/coaches/lessons/${lessonId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    loadLessons();
    onRefresh();
  };

  if (editing) {
    return (
      <StudentForm
        initial={{
          student_name: student.student_name,
          student_chess_username: student.student_chess_username || '',
          student_lichess_username: student.student_lichess_username || '',
          email: student.email || '',
          phone: student.phone || '',
          timezone: student.timezone,
          preferred_platform: student.preferred_platform || '',
          platform_link: student.platform_link || '',
          payment_status: student.payment_status,
          notes: student.notes || '',
        }}
        onSave={handleUpdate}
        onCancel={() => setEditing(false)}
        saving={saving}
        isEditing
      />
    );
  }

  return (
    <div className={`bg-slate-800 border rounded-xl transition-colors ${
      student.payment_status === 'overdue' ? 'border-red-500/30' :
      isGhosting ? 'border-amber-500/30' :
      bundleLow || bundleEmpty ? 'border-amber-500/20' :
      'border-slate-700'
    }`}>
      {/* Header row */}
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {/* Avatar placeholder */}
        <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center text-purple-400 font-bold text-sm flex-shrink-0">
          {student.student_name.charAt(0).toUpperCase()}
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-100 font-medium text-sm truncate">{student.student_name}</span>
            {!student.is_active && (
              <span className="text-xs px-1.5 py-0.5 bg-slate-600 text-slate-400 rounded">{t('coaches.students.archived')}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
            {/* Timezone clocks */}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {studentLocalTime}
              <span className="text-slate-600">({student.timezone.split('/').pop()?.replace(/_/g, ' ')})</span>
            </span>
            {coachRate ? (
              <span>{CURRENCY_SYMBOLS[coachCurrency] || coachCurrency}{coachRate}{t('coaches.students.perLesson')}</span>
            ) : null}
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Ghost alert */}
          {isGhosting && (
            <span className="flex items-center gap-1 text-xs text-amber-400" title={`${ghostDays}d no contact`}>
              <AlertTriangle className="w-3.5 h-3.5" />
              {ghostDays}{t('coaches.students.ghostDays').charAt(0)}
            </span>
          )}

          {/* Bundle badge */}
          {bundle && (
            <span className={`text-xs px-2 py-1 rounded-lg border ${
              bundleEmpty ? 'bg-red-500/20 text-red-400 border-red-500/30' :
              bundleLow ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
              'bg-slate-700 text-slate-300 border-slate-600'
            }`}>
              {remaining}/{bundle.total_lessons}
            </span>
          )}

          {/* Payment badge */}
          <span className={`text-xs px-2 py-1 rounded-lg border font-medium ${getPaymentColor(student.payment_status)}`}>
            {t(`coaches.students.${student.payment_status}`)}
          </span>

          <div className="text-slate-500">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-slate-700 px-4 pb-4 space-y-3">
          {/* Quick stats row */}
          <div className="flex flex-wrap gap-4 pt-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">{t('coaches.students.nextLesson')}:</span>
              <span className="text-slate-300">
                {student.next_lesson ? formatDateTime(student.next_lesson.scheduled_at, student.timezone) : t('coaches.students.noUpcoming')}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">{t('coaches.students.completed')}:</span>
              <span className="text-emerald-400">{student.lesson_stats.completed}</span>
            </div>
            {student.lesson_stats.no_shows > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">{t('coaches.students.noShows')}:</span>
                <span className="text-red-400">{student.lesson_stats.no_shows}</span>
              </div>
            )}
            {student.lesson_stats.rescheduled > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">{t('coaches.students.rescheduled')}:</span>
                <span className="text-amber-400">{student.lesson_stats.rescheduled}</span>
              </div>
            )}
            {student.student_chess_username && (
              <a href={`https://www.chess.com/member/${student.student_chess_username}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/20 text-xs font-medium transition-colors">
                Chess.com <span className="text-green-500/60">@{student.student_chess_username}</span>
              </a>
            )}
            {student.student_lichess_username && (
              <a href={`https://lichess.org/@/${student.student_lichess_username}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-orange-500/30 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 text-xs font-medium transition-colors">
                Lichess <span className="text-orange-500/60">@{student.student_lichess_username}</span>
              </a>
            )}
          </div>

          {/* Timezone detail */}
          <div className="flex items-center gap-4 text-xs bg-slate-750 rounded-lg px-3 py-2">
            <div>
              <span className="text-slate-500">{t('coaches.students.localTime')}: </span>
              <span className="text-slate-200 font-mono">{studentLocalTime}</span>
              <span className="text-slate-600 ml-1">({student.timezone.replace(/_/g, ' ')})</span>
            </div>
            <div className="text-slate-600">|</div>
            <div>
              <span className="text-slate-500">{t('coaches.students.yourTime')}: </span>
              <span className="text-slate-200 font-mono">{coachLocalTime}</span>
            </div>
          </div>

          {/* Notes */}
          {student.notes && (
            <div className="text-xs text-slate-400 bg-slate-750 rounded-lg px-3 py-2 italic">
              {student.notes}
            </div>
          )}

          {/* Bundle info */}
          {bundle && (
            <div className="text-xs bg-slate-750 rounded-lg px-3 py-2 flex items-center gap-3">
              <BookOpen className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
              <span className="text-slate-300">
                {t('coaches.students.bundle')}: {remaining} {remaining === 1 ? t('coaches.students.lessonRemaining') : t('coaches.students.lessonsRemaining')}
                {' '}({bundle.used_lessons}/{bundle.total_lessons})
              </span>
              {bundle.price_total && (
                <span className="text-slate-500">
                  {CURRENCY_SYMBOLS[bundle.price_currency] || bundle.price_currency}{bundle.price_total}
                </span>
              )}
            </div>
          )}

          {/* Bundle form */}
          {showBundleForm && (
            <BundleForm
              studentId={student.id}
              currency={coachCurrency}
              onSaved={() => { setShowBundleForm(false); onRefresh(); }}
              onCancel={() => setShowBundleForm(false)}
            />
          )}

          {/* Lesson form */}
          {showLessonForm && (
            <LessonForm
              studentId={student.id}
              bundleId={bundle?.id || null}
              onSaved={() => { setShowLessonForm(false); onRefresh(); if (showLessons) loadLessons(); }}
              onCancel={() => setShowLessonForm(false)}
            />
          )}

          {/* Lesson history */}
          {showLessons && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-400 mb-2">{t('coaches.students.lessonHistory')}</div>
              {lessonsLoading ? (
                <div className="text-xs text-slate-500 italic">Loading...</div>
              ) : lessons.length === 0 ? (
                <div className="text-xs text-slate-500 italic">No lessons logged yet.</div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {lessons.map(l => (
                    <div key={l.id} className="flex items-center gap-2 text-xs bg-slate-750 rounded-lg px-3 py-2">
                      <span className="text-slate-400 font-mono">{formatDateTime(l.scheduled_at)}</span>
                      <span className="text-slate-500">{l.duration_minutes}{t('coaches.students.minutes')}</span>
                      <select
                        value={l.status}
                        onChange={e => handleLessonStatusChange(l.id, e.target.value)}
                        className={`text-xs rounded px-1.5 py-0.5 border ${
                          l.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                          l.status === 'no_show' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                          l.status === 'cancelled' ? 'bg-slate-600 text-slate-400 border-slate-500' :
                          l.status === 'rescheduled' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                          'bg-blue-500/20 text-blue-400 border-blue-500/30'
                        }`}
                      >
                        <option value="completed">{t('coaches.students.completedStatus')}</option>
                        <option value="scheduled">{t('coaches.students.scheduled')}</option>
                        <option value="cancelled">{t('coaches.students.cancelledStatus')}</option>
                        <option value="no_show">{t('coaches.students.noShow')}</option>
                        <option value="rescheduled">{t('coaches.students.rescheduledStatus')}</option>
                      </select>
                      {l.topic && <span className="text-slate-500 truncate">{l.topic}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={() => { setShowLessonForm(!showLessonForm); setShowBundleForm(false); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 rounded-lg text-xs font-medium transition-colors">
              <Calendar className="w-3.5 h-3.5" />{t('coaches.students.logLesson')}
            </button>
            <button onClick={() => { setShowBundleForm(!showBundleForm); setShowLessonForm(false); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-300 hover:bg-slate-600 rounded-lg text-xs font-medium transition-colors">
              <BookOpen className="w-3.5 h-3.5" />{t('coaches.students.addBundle')}
            </button>
            <button onClick={() => { setShowLessons(!showLessons); if (!showLessons) loadLessons(); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-300 hover:bg-slate-600 rounded-lg text-xs font-medium transition-colors">
              <Clock className="w-3.5 h-3.5" />{t('coaches.students.lessonHistory')}
            </button>
            {student.email && (
              <button onClick={handlePing} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 text-slate-300 hover:bg-slate-600 rounded-lg text-xs font-medium transition-colors">
                <Send className="w-3.5 h-3.5" />{t('coaches.students.pingReminder')}
              </button>
            )}
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs transition-colors">
              <Pencil className="w-3.5 h-3.5" />{t('coaches.students.editStudent')}
            </button>
            <button onClick={handleArchiveToggle} className="flex items-center gap-1.5 px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs transition-colors">
              {student.is_active ? <Archive className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
              {student.is_active ? t('coaches.students.archive') : t('coaches.students.restore')}
            </button>

            {/* Delete with confirm */}
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
  const { t } = useLanguage();
  const { playerInfo } = useCoachesData();
  const coachUsername = playerInfo?.username || '';
  const coachTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const prefs = getCoachesPrefs();
  const [coachRate, setCoachRate] = useState<number | null>(prefs.lesson_rate);
  const [coachCurrency, setCoachCurrency] = useState(prefs.lesson_currency);
  const [showRateForm, setShowRateForm] = useState(false);
  const [rateInput, setRateInput] = useState(prefs.lesson_rate?.toString() || '');
  const [currencyInput, setCurrencyInput] = useState(prefs.lesson_currency);

  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');

  const saveRate = () => {
    const rate = rateInput ? parseFloat(rateInput) : null;
    saveCoachesPrefs({ lesson_rate: rate, lesson_currency: currencyInput });
    setCoachRate(rate);
    setCoachCurrency(currencyInput);
    setShowRateForm(false);
  };

  const fetchStudents = useCallback(async () => {
    if (!coachUsername) return;
    try {
      const res = await fetch(`/api/coaches/students?coach=${encodeURIComponent(coachUsername)}`);
      const json = await res.json();
      setStudents(json.students || []);
    } finally {
      setLoading(false);
    }
  }, [coachUsername]);

  useEffect(() => { fetchStudents(); }, [fetchStudents]);

  const handleAddStudent = async (form: StudentFormData) => {
    setSaving(true);
    try {
      await fetch('/api/coaches/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coach_username: coachUsername,
          ...form,
        }),
      });
      setShowAddForm(false);
      fetchStudents();
    } finally {
      setSaving(false);
    }
  };

  // Filter & sort
  const filtered = students.filter(s => {
    if (search) {
      const q = search.toLowerCase();
      return s.student_name.toLowerCase().includes(q) ||
        (s.student_chess_username || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q);
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'name') return a.student_name.localeCompare(b.student_name);
    if (sortKey === 'payment') {
      const order = { overdue: 0, pending: 1, paid: 2 };
      return (order[a.payment_status as keyof typeof order] ?? 2) - (order[b.payment_status as keyof typeof order] ?? 2);
    }
    if (sortKey === 'next_lesson') {
      const aTime = a.next_lesson ? new Date(a.next_lesson.scheduled_at).getTime() : Infinity;
      const bTime = b.next_lesson ? new Date(b.next_lesson.scheduled_at).getTime() : Infinity;
      return aTime - bTime;
    }
    return 0;
  });

  return (
    <PanelShell title={t('coaches.students.title')}>
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('coaches.students.search')}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>

          {/* Sort */}
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-purple-500"
          >
            <option value="name">{t('coaches.students.sortName')}</option>
            <option value="next_lesson">{t('coaches.students.sortNextLesson')}</option>
            <option value="payment">{t('coaches.students.sortPayment')}</option>
          </select>

          {/* Add button */}
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            {t('coaches.students.addStudent')}
          </button>
        </div>

        {/* Lesson rate setting */}
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-500">{t('coaches.students.rate')}:</span>
          {showRateForm ? (
            <div className="flex items-center gap-2">
              <input
                type="number" min="0" step="0.01" value={rateInput}
                onChange={e => setRateInput(e.target.value)}
                className="w-24 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
              />
              <select
                value={currencyInput}
                onChange={e => setCurrencyInput(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-sm text-slate-100 focus:outline-none focus:border-purple-500"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={saveRate} className="text-purple-400 hover:text-purple-300 text-xs font-medium">{t('coaches.students.save')}</button>
              <button onClick={() => setShowRateForm(false)} className="text-slate-500 hover:text-slate-300 text-xs">{t('coaches.students.cancel')}</button>
            </div>
          ) : (
            <button onClick={() => setShowRateForm(true)} className="text-slate-300 hover:text-purple-400 transition-colors">
              {coachRate ? `${CURRENCY_SYMBOLS[coachCurrency] || coachCurrency}${coachRate}${t('coaches.students.perLesson')}` : t('coaches.students.setRate')}
            </button>
          )}
        </div>

        {/* Add student form */}
        {showAddForm && (
          <StudentForm
            initial={EMPTY_FORM}
            onSave={handleAddStudent}
            onCancel={() => setShowAddForm(false)}
            saving={saving}
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
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-purple-600/10 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-purple-500" />
            </div>
            <p className="text-slate-400 text-sm">{search ? `No students matching "${search}"` : t('coaches.students.empty')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map(s => (
              <StudentCard key={s.id} student={s} coachTz={coachTz} coachRate={coachRate} coachCurrency={coachCurrency} onRefresh={fetchStudents} />
            ))}
          </div>
        )}
      </div>
    </PanelShell>
  );
}

