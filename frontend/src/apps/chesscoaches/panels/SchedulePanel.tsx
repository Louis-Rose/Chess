// Weekly schedule — calendar view of all coach lessons

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Video } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelShell } from '../components/PanelShell';
import { authFetch } from '../utils/authFetch';

interface ScheduleLesson {
  id: number;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  notes: string | null;
  meet_link: string | null;
  student_id: number;
  student_name: string;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'border-l-blue-500 bg-blue-500/10',
  completed: 'border-l-emerald-500 bg-emerald-500/10',
  cancelled: 'border-l-slate-500 bg-slate-500/10 opacity-50',
  rescheduled: 'border-l-amber-500 bg-amber-500/10',
};

export function SchedulePanel() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [lessons, setLessons] = useState<ScheduleLesson[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    const start = fmtDate(weekStart);
    const end = fmtDate(addDays(weekStart, 7));
    const res = await authFetch(`/api/coaches/schedule?start=${start}&end=${end}`);
    if (res.ok) {
      const data = await res.json();
      setLessons(data.lessons);
    }
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isCurrentWeek = getMonday(today).getTime() === weekStart.getTime();

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const lessonsByDay: Record<string, ScheduleLesson[]> = {};
  for (const day of days) lessonsByDay[fmtDate(day)] = [];
  for (const l of lessons) {
    const key = l.scheduled_at.slice(0, 10);
    if (lessonsByDay[key]) lessonsByDay[key].push(l);
  }

  const weekLabel = `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — ${addDays(weekStart, 6).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <PanelShell title={t('coaches.calendar.title')}>
      <div className="max-w-3xl mx-auto">
        {/* Week navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-200">{weekLabel}</span>
            {!isCurrentWeek && (
              <button
                onClick={() => setWeekStart(getMonday(new Date()))}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                {t('coaches.calendar.today')}
              </button>
            )}
          </div>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-1">
            {days.map(day => {
              const key = fmtDate(day);
              const dayLessons = lessonsByDay[key] || [];
              const isToday = key === fmtDate(today);
              const dayName = day.toLocaleDateString(undefined, { weekday: 'short' });
              const dayNum = day.getDate();
              const isPast = day < today;

              return (
                <div
                  key={key}
                  className={`rounded-lg border transition-colors ${
                    isToday
                      ? 'border-blue-500/50 bg-blue-500/5'
                      : 'border-slate-700/50 bg-slate-800/30'
                  }`}
                >
                  <div className={`flex items-center gap-3 px-4 py-2 ${isPast && !isToday ? 'opacity-60' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      isToday ? 'bg-blue-500 text-white' : 'text-slate-400'
                    }`}>
                      {dayNum}
                    </div>
                    <span className={`text-xs uppercase tracking-wider font-medium ${
                      isToday ? 'text-blue-400' : 'text-slate-500'
                    }`}>
                      {dayName}
                    </span>
                    {dayLessons.length > 0 && (
                      <span className="text-xs text-slate-500 ml-auto">
                        {dayLessons.length} {dayLessons.length === 1 ? t('coaches.calendar.lesson') : t('coaches.calendar.lessons')}
                      </span>
                    )}
                  </div>

                  {dayLessons.length > 0 && (
                    <div className="px-4 pb-3 space-y-2">
                      {dayLessons.map(l => {
                        const time = new Date(l.scheduled_at);
                        const timeStr = time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                        const endTime = new Date(time.getTime() + l.duration_minutes * 60000);
                        const endStr = endTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                        const colors = STATUS_COLORS[l.status] || STATUS_COLORS.scheduled;

                        return (
                          <div
                            key={l.id}
                            onClick={() => navigate(`/students/${l.student_id}`)}
                            className={`border-l-3 rounded-r-lg px-3 py-2 cursor-pointer hover:brightness-125 transition-all ${colors}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-100">
                                  {l.student_name}
                                </span>
                                {l.meet_link && (
                                  <a
                                    href={l.meet_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    className="text-blue-400 hover:text-blue-300"
                                  >
                                    <Video className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                              <span className="text-xs text-slate-400 tabular-nums">
                                {timeStr} — {endStr}
                              </span>
                            </div>
                            {l.notes && (
                              <p className="text-xs text-slate-400 mt-1 line-clamp-1">{l.notes}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Empty state */}
        {!loading && lessons.length === 0 && (
          <div className="text-center py-8">
            <p className="text-slate-400 text-sm">{t('coaches.calendar.noLessons')}</p>
          </div>
        )}
      </div>
    </PanelShell>
  );
}
