// My Calendar panel — weekly lesson schedule

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, X, Calendar, MapPin } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelShell } from '../components/PanelShell';
import { CITY_TIMEZONES, getTimezoneAbbr } from './StudentsPanel';

// ── Types ──

interface Lesson {
  id: number;
  student_id: number;
  student_name?: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  created_at: string;
}

// ── Constants ──

const DAY_NAMES_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_NAMES_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

// ── Helpers ──

function authFetch(url: string, opts: RequestInit = {}) {
  return fetch(url, { ...opts, credentials: 'include' });
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

// ── Week View ──

function formatTime(iso: string, lang: string): string {
  const d = new Date(iso);
  if (lang === 'fr') {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

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
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-blue-600/10 flex items-center justify-center mb-4">
          <Calendar className="w-8 h-8 text-blue-400" />
        </div>
        <p className="text-slate-400 text-sm">{t('coaches.calendar.noLessons')}</p>
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
                    <span className="text-sm font-mono text-slate-200 w-20 flex-shrink-0">
                      {formatTime(l.scheduled_at, lang)}
                    </span>
                    {/* Student name */}
                    <span className="text-sm text-slate-100 flex-1 truncate">{l.student_name}</span>
                    {/* Duration */}
                    <span className="text-xs text-slate-200">{l.duration_minutes >= 60 ? `${l.duration_minutes / 60}h` : `${l.duration_minutes}min`}</span>
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

// ── Coach Timezone Storage ──

const COACH_TZ_KEY = 'lumna_coach_tz';

function getCoachTz(): { city: string; timezone: string } | null {
  try {
    const saved = localStorage.getItem(COACH_TZ_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

function saveCoachTz(city: string, timezone: string) {
  localStorage.setItem(COACH_TZ_KEY, JSON.stringify({ city, timezone }));
}

// ── Coach City Setup ──

function detectCity(): { city: string; timezone: string } | null {
  try {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const match = CITY_TIMEZONES.find(([, tz]) => tz === browserTz);
    if (match) return { city: match[0], timezone: match[1] };
    // Fallback: use the timezone city part (e.g. "Europe/Paris" → "Paris")
    const city = browserTz.split('/').pop()?.replace(/_/g, ' ');
    if (city) return { city, timezone: browserTz };
  } catch { /* ignore */ }
  return null;
}

function CoachCitySetup({ onSave, onCancel, lang }: { onSave: (city: string, tz: string) => void; onCancel?: () => void; lang: string }) {
  const { t } = useLanguage();
  const detected = detectCity();
  const [showManual, setShowManual] = useState(false);
  const [query, setQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = query.length >= 2
    ? CITY_TIMEZONES.filter(([city]) => city.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  return (
    <div className="relative flex flex-col items-center justify-center py-16 text-center">
      {onCancel && (
        <button onClick={onCancel} className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors">
          <X className="w-5 h-5" />
        </button>
      )}
      <div className="w-16 h-16 rounded-full bg-blue-600/10 flex items-center justify-center mb-4">
        <MapPin className="w-8 h-8 text-blue-400" />
      </div>

      {detected && !showManual ? (
        <>
          <p className="text-slate-300 text-sm font-medium mb-1">{t('coaches.calendar.detectTitle')}</p>
          <p className="text-slate-200 text-lg font-semibold mb-1">{detected.city}</p>
          <p className="text-slate-500 text-xs mb-4">{getTimezoneAbbr(detected.timezone)}</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onSave(detected.city, detected.timezone)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {t('coaches.calendar.confirm')}
            </button>
            <button
              onClick={() => setShowManual(true)}
              className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm transition-colors"
            >
              {t('coaches.calendar.changeCity')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-slate-300 text-sm font-medium mb-1">{t('coaches.calendar.setupTitle')}</p>
          <p className="text-slate-500 text-xs mb-4">{t('coaches.calendar.setupDesc')}</p>
          <div className="relative w-64">
            <input
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              value={query}
              onChange={e => { setQuery(e.target.value); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              placeholder={lang === 'fr' ? 'Rechercher votre ville...' : 'Search your city...'}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {suggestions.map(([city, tz]) => (
                  <button
                    key={`${city}-${tz}`}
                    onClick={() => onSave(city, tz)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-slate-600 transition-colors flex justify-between items-center"
                  >
                    <span className="text-slate-100">{city}</span>
                    <span className="text-xs text-slate-400">{getTimezoneAbbr(tz)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Panel ──

export function CalendarPanel() {
  const { t, language } = useLanguage();

  const [coachTz, setCoachTz] = useState(getCoachTz);
  const [changingCity, setChangingCity] = useState(false);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLessons = useCallback(async () => {
    const tz = getCoachTz();
    if (!tz) { setLoading(false); return; }
    try {
      const { start, end } = getWeekBounds();
      const res = await authFetch(
        `/api/coaches/lessons/week?start=${start.toISOString()}&end=${end.toISOString()}&tz=${encodeURIComponent(tz.timezone)}`
      );
      const json = await res.json();
      setLessons(json.lessons || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchLessons().then(() => setLoading(false));
  }, [fetchLessons]);

  const handleSetCity = (city: string, timezone: string) => {
    saveCoachTz(city, timezone);
    setCoachTz({ city, timezone });
    setChangingCity(false);
    setTimeout(() => fetchLessons(), 100);
  };

  return (
    <PanelShell title={t('coaches.calendar.title')}>
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Coach city display */}
        {coachTz && !changingCity && (
          <button
            onClick={() => setChangingCity(true)}
            className="flex items-center gap-2 text-sm text-slate-300 hover:text-purple-400 transition-colors"
          >
            <MapPin className="w-3.5 h-3.5" />
            {t('coaches.calendar.myCity')}: {coachTz.city} ({getTimezoneAbbr(coachTz.timezone)})
          </button>
        )}

        {!coachTz || changingCity ? (
          <CoachCitySetup
            onSave={handleSetCity}
            onCancel={coachTz ? () => setChangingCity(false) : undefined}
            lang={language}
          />
        ) : loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-800 rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <WeekView lessons={lessons} onRefresh={fetchLessons} lang={language} />
        )}
      </div>
    </PanelShell>
  );
}
