// Weekly schedule — Google Calendar-style grid (days as columns, hours as rows)

import { useState, useEffect, useCallback, useRef } from 'react';
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
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
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

const STATUS_BG: Record<string, string> = {
  scheduled: 'bg-blue-500/80 hover:bg-blue-500/90 border-blue-400/50',
  completed: 'bg-emerald-500/70 hover:bg-emerald-500/80 border-emerald-400/50',
  cancelled: 'bg-slate-600/50 hover:bg-slate-600/60 border-slate-500/50 opacity-50',
  rescheduled: 'bg-amber-500/70 hover:bg-amber-500/80 border-amber-400/50',
};

const HOUR_HEIGHT = 60; // px per hour
const START_HOUR = 7;
const END_HOUR = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR;

export function SchedulePanel() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [lessons, setLessons] = useState<ScheduleLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const gridRef = useRef<HTMLDivElement>(null);

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

  // Scroll to 8am on mount
  useEffect(() => {
    if (!loading && gridRef.current) {
      gridRef.current.scrollTop = HOUR_HEIGHT; // 1 hour below START_HOUR (=8am)
    }
  }, [loading]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isCurrentWeek = getMonday(today).getTime() === weekStart.getTime();

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const weekLabel = `${weekStart.toLocaleDateString(locale, { month: 'long', day: 'numeric' })} — ${addDays(weekStart, 6).toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' })}`;

  // Group lessons by day key
  const lessonsByDay: Record<string, ScheduleLesson[]> = {};
  for (const day of days) lessonsByDay[fmtDate(day)] = [];
  for (const l of lessons) {
    const key = l.scheduled_at.slice(0, 10);
    if (lessonsByDay[key]) lessonsByDay[key].push(l);
  }

  return (
    <PanelShell title={t('coaches.calendar.title')}>
      <div className="max-w-6xl mx-auto">
        {/* Week navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-200 capitalize">{weekLabel}</span>
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

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-slate-600 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Day headers */}
            <div className="flex border-b border-slate-700">
              {/* Time gutter */}
              <div className="w-14 flex-shrink-0" />
              {days.map(day => {
                const key = fmtDate(day);
                const isToday = key === fmtDate(today);
                return (
                  <div key={key} className="flex-1 text-center py-2 min-w-0">
                    <div className={`text-xs uppercase tracking-wider ${isToday ? 'text-blue-400' : 'text-slate-500'}`}>
                      {day.toLocaleDateString(locale, { weekday: 'short' })}
                    </div>
                    <div className={`text-lg font-bold mt-0.5 ${
                      isToday
                        ? 'w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center mx-auto'
                        : 'text-slate-300'
                    }`}>
                      {day.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time grid */}
            <div ref={gridRef} className="overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 240px)' }}>
              <div className="relative flex" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
                {/* Hour labels + grid lines */}
                <div className="w-14 flex-shrink-0 relative">
                  {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                    <div
                      key={i}
                      className="absolute w-full text-right pr-2 text-xs text-slate-500 tabular-nums"
                      style={{ top: i * HOUR_HEIGHT - 8 }}
                    >
                      {String(START_HOUR + i).padStart(2, '0')}:00
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                <div className="flex-1 flex relative">
                  {/* Horizontal hour lines */}
                  {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                    <div
                      key={i}
                      className="absolute left-0 right-0 border-t border-slate-700/50"
                      style={{ top: i * HOUR_HEIGHT }}
                    />
                  ))}

                  {/* Current time indicator */}
                  {isCurrentWeek && (() => {
                    const now = new Date();
                    const h = now.getHours();
                    const m = now.getMinutes();
                    if (h < START_HOUR || h >= END_HOUR) return null;
                    const top = (h - START_HOUR + m / 60) * HOUR_HEIGHT;
                    const todayIdx = days.findIndex(d => fmtDate(d) === fmtDate(today));
                    if (todayIdx < 0) return null;
                    const colPct = (todayIdx / 7) * 100;
                    const widthPct = 100 / 7;
                    return (
                      <div
                        className="absolute z-20 pointer-events-none"
                        style={{ top, left: `${colPct}%`, width: `${widthPct}%` }}
                      >
                        <div className="relative">
                          <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-red-500" />
                          <div className="h-0.5 bg-red-500 w-full" />
                        </div>
                      </div>
                    );
                  })()}

                  {days.map((day) => {
                    const key = fmtDate(day);
                    const dayLessons = lessonsByDay[key] || [];
                    const isToday = key === fmtDate(today);

                    return (
                      <div
                        key={key}
                        className={`flex-1 relative border-l min-w-0 ${
                          isToday ? 'border-l-blue-500/30 bg-blue-500/[0.03]' : 'border-l-slate-700/50'
                        }`}
                      >
                        {dayLessons.map(l => {
                          const start = new Date(l.scheduled_at);
                          const startH = start.getHours() + start.getMinutes() / 60;
                          if (startH < START_HOUR || startH >= END_HOUR) return null;
                          const top = (startH - START_HOUR) * HOUR_HEIGHT;
                          const height = Math.max((l.duration_minutes / 60) * HOUR_HEIGHT, 24);
                          const colors = STATUS_BG[l.status] || STATUS_BG.scheduled;
                          const timeStr = start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

                          return (
                            <div
                              key={l.id}
                              onClick={() => navigate(`/students/${l.student_id}`)}
                              className={`absolute left-0.5 right-0.5 rounded border cursor-pointer transition-colors overflow-hidden z-10 ${colors}`}
                              style={{ top, height }}
                            >
                              <div className="px-1.5 py-0.5">
                                <div className="flex items-center gap-1">
                                  <span className="text-xs font-semibold text-white truncate">
                                    {l.student_name}
                                  </span>
                                  {l.meet_link && (
                                    <a
                                      href={l.meet_link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={e => e.stopPropagation()}
                                      className="text-white/70 hover:text-white flex-shrink-0"
                                    >
                                      <Video className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                                {height >= 40 && (
                                  <span className="text-[10px] text-white/70 tabular-nums">
                                    {timeStr}
                                  </span>
                                )}
                                {height >= 56 && l.notes && (
                                  <p className="text-[10px] text-white/60 line-clamp-1 mt-0.5">{l.notes}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Empty state */}
            {lessons.length === 0 && (
              <div className="text-center py-8">
                <p className="text-slate-400 text-sm">{t('coaches.calendar.noLessons')}</p>
              </div>
            )}
          </>
        )}
      </div>
    </PanelShell>
  );
}
