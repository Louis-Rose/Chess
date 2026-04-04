// My Students panel — student roster + scheduling

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Clock, ChevronRight,
  AlertTriangle, Users,
} from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelShell, btnPrimary, BTN_GHOST } from '../components/PanelShell';

// ── Types ──

interface Student {
  id: number;
  student_name: string;
  timezone: string;
  currency: string | null;
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
export const CITY_TIMEZONES: [string, string][] = [
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

// Timezone → currency mapping
const TZ_CURRENCY: Record<string, string> = {
  'America/New_York': 'USD', 'America/Chicago': 'USD', 'America/Denver': 'USD', 'America/Los_Angeles': 'USD',
  'America/Phoenix': 'USD', 'America/Detroit': 'USD',
  'America/Toronto': 'CAD', 'America/Vancouver': 'CAD', 'America/Edmonton': 'CAD',
  'America/Mexico_City': 'MXN', 'America/Monterrey': 'MXN',
  'America/Sao_Paulo': 'BRL',
  'America/Argentina/Buenos_Aires': 'ARS', 'America/Lima': 'PEN', 'America/Bogota': 'COP',
  'America/Santiago': 'CLP', 'America/Caracas': 'VES',
  'Europe/London': 'GBP', 'Europe/Dublin': 'EUR',
  'Europe/Paris': 'EUR', 'Europe/Berlin': 'EUR', 'Europe/Madrid': 'EUR', 'Europe/Rome': 'EUR',
  'Europe/Amsterdam': 'EUR', 'Europe/Brussels': 'EUR', 'Europe/Vienna': 'EUR',
  'Europe/Lisbon': 'EUR', 'Europe/Helsinki': 'EUR', 'Europe/Athens': 'EUR',
  'Europe/Zurich': 'CHF', 'Europe/Prague': 'CZK', 'Europe/Warsaw': 'PLN',
  'Europe/Budapest': 'HUF', 'Europe/Bucharest': 'RON',
  'Europe/Copenhagen': 'DKK', 'Europe/Stockholm': 'SEK', 'Europe/Oslo': 'NOK',
  'Europe/Moscow': 'RUB', 'Europe/Istanbul': 'TRY', 'Europe/Kyiv': 'UAH',
  'Asia/Dubai': 'AED', 'Asia/Qatar': 'QAR', 'Asia/Riyadh': 'SAR',
  'Asia/Jerusalem': 'ILS', 'Asia/Beirut': 'LBP', 'Asia/Tehran': 'IRR',
  'Asia/Kolkata': 'INR', 'Asia/Karachi': 'PKR', 'Asia/Dhaka': 'BDT', 'Asia/Colombo': 'LKR',
  'Asia/Shanghai': 'CNY', 'Asia/Hong_Kong': 'HKD', 'Asia/Taipei': 'TWD',
  'Asia/Tokyo': 'JPY', 'Asia/Seoul': 'KRW',
  'Asia/Singapore': 'SGD', 'Asia/Bangkok': 'THB', 'Asia/Jakarta': 'IDR',
  'Asia/Kuala_Lumpur': 'MYR', 'Asia/Manila': 'PHP', 'Asia/Ho_Chi_Minh': 'VND',
  'Africa/Cairo': 'EGP', 'Africa/Lagos': 'NGN', 'Africa/Nairobi': 'KES',
  'Africa/Johannesburg': 'ZAR', 'Africa/Casablanca': 'MAD', 'Africa/Accra': 'GHS',
  'Africa/Addis_Ababa': 'ETB',
  'Australia/Sydney': 'AUD', 'Australia/Melbourne': 'AUD', 'Australia/Brisbane': 'AUD', 'Australia/Perth': 'AUD',
  'Pacific/Auckland': 'NZD',
};

export const CURRENCY_NAMES: Record<string, string> = {
  USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', CAD: 'Canadian Dollar',
  AUD: 'Australian Dollar', CHF: 'Swiss Franc', JPY: 'Japanese Yen', CNY: 'Chinese Yuan',
  INR: 'Indian Rupee', BRL: 'Brazilian Real', MXN: 'Mexican Peso', KRW: 'South Korean Won',
  SGD: 'Singapore Dollar', HKD: 'Hong Kong Dollar', SEK: 'Swedish Krona', NOK: 'Norwegian Krone',
  DKK: 'Danish Krone', NZD: 'New Zealand Dollar', ZAR: 'South African Rand', PLN: 'Polish Zloty',
  CZK: 'Czech Koruna', HUF: 'Hungarian Forint', TRY: 'Turkish Lira', ILS: 'Israeli Shekel',
  AED: 'UAE Dirham', SAR: 'Saudi Riyal', THB: 'Thai Baht', MYR: 'Malaysian Ringgit',
  PHP: 'Philippine Peso', IDR: 'Indonesian Rupiah', TWD: 'Taiwan Dollar', ARS: 'Argentine Peso',
  COP: 'Colombian Peso', CLP: 'Chilean Peso', PEN: 'Peruvian Sol', EGP: 'Egyptian Pound',
  NGN: 'Nigerian Naira', KES: 'Kenyan Shilling', RON: 'Romanian Leu', UAH: 'Ukrainian Hryvnia',
  PKR: 'Pakistani Rupee', BDT: 'Bangladeshi Taka', VND: 'Vietnamese Dong', QAR: 'Qatari Riyal',
  LKR: 'Sri Lankan Rupee', MAD: 'Moroccan Dirham', GHS: 'Ghanaian Cedi', ETB: 'Ethiopian Birr',
  IRR: 'Iranian Rial', LBP: 'Lebanese Pound', VES: 'Venezuelan Bolivar',
};

const TOP_20_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY', 'CNY', 'INR', 'BRL',
  'MXN', 'KRW', 'SGD', 'SEK', 'NOK', 'PLN', 'TRY', 'ZAR', 'NZD', 'AED',
];

/** Build currency list: top 20 + coach currency + student currency (deduped) */
export function buildCurrencyList(extras: string[]): string[] {
  const set = new Set(TOP_20_CURRENCIES);
  for (const c of extras) { if (c) set.add(c); }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function getCurrencyForTimezone(tz: string): string {
  return TZ_CURRENCY[tz] || '';
}

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

export function getTimezoneAbbr(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz, timeZoneName: 'short',
    }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || tz;
  } catch { return tz; }
}

function formatHHMM(time: string, lang: string): string {
  if (lang === 'fr') return time;
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function formatLessonTime(iso: string, lang: string, tz?: string): string {
  try {
    const d = new Date(iso);
    const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
    const opts: Intl.DateTimeFormatOptions = {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: lang !== 'fr',
    };
    if (tz) opts.timeZone = tz;
    return new Intl.DateTimeFormat(locale, opts).format(d);
  } catch { return iso; }
}

/** Check if a timezone has a DST transition in the next 7 days. Returns description or null. */
function getDstAlert(tz: string, lang: string): string | null {
  try {
    const now = new Date();
    const in7d = new Date(now.getTime() + 7 * 86400000);
    const nowOffset = getUtcOffset(tz, now);
    const futureOffset = getUtcOffset(tz, in7d);
    if (nowOffset !== futureOffset) {
      const diff = futureOffset - nowOffset;
      const absDiff = Math.abs(diff);
      if (lang === 'fr') {
        return `${diff > 0 ? '+' : '-'}${absDiff} ${absDiff === 1 ? 'heure' : 'heures'} dans 7 jours`;
      }
      return `${diff > 0 ? '+' : '-'}${absDiff} ${absDiff === 1 ? 'hour' : 'hours'} in 7 days`;
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

function StudentCard({ student, lang }: {
  student: Student;
  lang: string;
}) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  useLiveClock();

  const dayNamesFull = lang === 'fr' ? DAY_NAMES_FR : DAY_NAMES_EN;
  const studentLocalTime = formatLocalTime(student.timezone, lang);
  const dstAlert = getDstAlert(student.timezone, lang);

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
          <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
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
            {student.recurring_day !== null && student.recurring_time && (
              <span className="text-slate-400">
                {t('coaches.students.recurringLabel')} {dayNamesFull[student.recurring_day]} {formatHHMM(student.recurring_time, lang)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {student.next_lesson && (
            <span className="text-xs px-2 py-1 rounded-lg border bg-blue-500/20 text-blue-400 border-blue-500/30">
              {formatLessonTime(student.next_lesson.scheduled_at, lang)}
            </span>
          )}
          <ChevronRight className="w-4 h-4 text-slate-500" />
        </div>
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
                <StudentCard key={s.id} student={s} lang={language} />
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
