// My Calendar panel — weekly lesson schedule

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, X, Calendar } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelShell } from '../components/PanelShell';

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

export function CalendarPanel() {
  const { t, language } = useLanguage();

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLessons = useCallback(async () => {
    try {
      const { start, end } = getWeekBounds();
      const res = await authFetch(`/api/coaches/lessons/week?start=${start.toISOString()}&end=${end.toISOString()}`);
      const json = await res.json();
      setLessons(json.lessons || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchLessons().then(() => setLoading(false));
  }, [fetchLessons]);

  return (
    <PanelShell title={t('coaches.calendar.title')}>
      <div className="max-w-3xl mx-auto space-y-4">
        {loading ? (
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
