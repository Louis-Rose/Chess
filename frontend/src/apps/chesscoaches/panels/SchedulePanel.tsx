// Weekly schedule — Google Calendar-style grid (days as columns, hours as rows)

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Video, Clock, Users, X, Video as VideoIcon, Check, Ban, HelpCircle, ExternalLink, Trash2 } from 'lucide-react';
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
  student_timezone: string | null;
}

interface StudentOption {
  id: number;
  student_name: string;
}

interface NewEventState {
  date: string;       // YYYY-MM-DD
  hour: number;       // 0-23
  minute: number;     // 0 or 30
  dayIdx: number;     // column index for positioning
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
  done: 'bg-emerald-500/70 hover:bg-emerald-500/80 border-emerald-400/50',
  cancelled: 'bg-slate-600/50 hover:bg-slate-600/60 border-slate-500/50 opacity-50',
  tbd: 'bg-amber-500/70 hover:bg-amber-500/80 border-amber-400/50',
};

const HOUR_HEIGHT = 60; // px per hour
const START_HOUR = 7;
const END_HOUR = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR;

// ── Create Event Popup ──

function CreateEventPopup({ event, students, locale, onClose, onCreated }: {
  event: NewEventState;
  students: StudentOption[];
  locale: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useLanguage();
  const [studentId, setStudentId] = useState<number | ''>('');
  const [time, setTime] = useState(`${String(event.hour).padStart(2, '0')}:${String(event.minute).padStart(2, '0')}`);
  const [duration, setDuration] = useState('60');
  const [createMeet, setCreateMeet] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    authFetch('/api/auth/google-calendar/status')
      .then(r => r.json())
      .then(d => setCalendarConnected(d.connected))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const d = new Date(`${event.date}T${time}:00`);
  const dateLabel = d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });
  const endTime = new Date(d.getTime() + parseInt(duration) * 60000);
  const timeRange = `${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} – ${endTime.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;

  const handleSave = async () => {
    if (!studentId || saving) return;
    setSaving(true);
    try {
      const scheduled_at = `${event.date}T${time}:00`;
      const res = await authFetch(`/api/coaches/students/${studentId}/lessons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_at, duration_minutes: parseInt(duration), create_meet: createMeet }),
      });
      if (res.ok) {
        onCreated();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={popupRef}
      className="absolute z-30 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-72 animate-in fade-in zoom-in-95 duration-150"
      style={{
        left: `calc(${(event.dayIdx / 7) * 100}% + ${100 / 7 / 2}% - 144px)`,
        top: Math.min((event.hour - START_HOUR + event.minute / 60) * HOUR_HEIGHT, TOTAL_HOURS * HOUR_HEIGHT - 320),
      }}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-sm font-semibold text-slate-100">{t('coaches.calendar.newLesson')}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {/* Student selector */}
        <div className="flex items-center gap-2.5">
          <Users className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <select
            value={studentId}
            onChange={e => setStudentId(e.target.value ? Number(e.target.value) : '')}
            className="flex-1 bg-slate-700 text-slate-100 text-sm rounded-lg px-2.5 py-1.5 border border-slate-600 focus:border-blue-500 focus:outline-none"
            autoFocus
          >
            <option value="">{t('coaches.calendar.selectStudent')}</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.student_name}</option>
            ))}
          </select>
        </div>

        {/* Date & time */}
        <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-slate-200 capitalize">{dateLabel}</p>
            <div className="flex items-center gap-2 mt-1">
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                className="bg-slate-700 text-slate-100 text-xs rounded px-2 py-1 border border-slate-600 focus:border-blue-500 focus:outline-none w-24" />
              <span className="text-slate-500 text-xs">–</span>
              <span className="text-xs text-slate-400">{timeRange.split('–')[1]?.trim()}</span>
            </div>
          </div>
        </div>

        {/* Duration */}
        <div className="flex items-center gap-2.5 pl-6">
          <select value={duration} onChange={e => setDuration(e.target.value)}
            className="bg-slate-700 text-slate-100 text-xs rounded-lg px-2.5 py-1.5 border border-slate-600 focus:border-blue-500 focus:outline-none">
            <option value="60">1 hour</option>
            <option value="90">1h30</option>
            <option value="120">2 hours</option>
          </select>
        </div>

        {/* Google Meet */}
        {calendarConnected && (
          <div className="flex items-center gap-2.5">
            <VideoIcon className="w-4 h-4 text-slate-400 flex-shrink-0" />
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={createMeet} onChange={e => setCreateMeet(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-slate-300">Google Meet</span>
            </label>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={handleSave} disabled={!studentId || saving}
            className="px-5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors">
            {saving ? '...' : t('coaches.calendar.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Lesson Detail Popup ──

const STATUS_OPTIONS = [
  { value: 'done', icon: Check, label: 'coaches.lessons.status.done', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  { value: 'cancelled', icon: Ban, label: 'coaches.lessons.status.cancelled', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  { value: 'tbd', icon: HelpCircle, label: 'coaches.lessons.status.tbd', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
] as const;

function LessonDetailPopup({ lesson, locale, onClose, onUpdated }: {
  lesson: ScheduleLesson;
  locale: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const popupRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState(lesson.status);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const d = new Date(lesson.scheduled_at);
  const dateLabel = d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });
  const timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const endTime = new Date(d.getTime() + lesson.duration_minutes * 60000);
  const endStr = endTime.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const isPast = d < new Date();

  const handleSetStatus = async (newStatus: string) => {
    setStatus(newStatus);
    await authFetch(`/api/coaches/lessons/${lesson.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    onUpdated();
  };

  const handleDelete = async () => {
    await authFetch(`/api/coaches/lessons/${lesson.id}`, { method: 'DELETE' });
    onClose();
    onUpdated();
  };

  // Position near the lesson block
  const startH = d.getHours() + d.getMinutes() / 60;
  const top = Math.min((startH - START_HOUR) * HOUR_HEIGHT, TOTAL_HOURS * HOUR_HEIGHT - 280);

  return (
    <div ref={popupRef}
      className="absolute z-30 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-72 animate-in fade-in zoom-in-95 duration-150"
      style={{ left: '50%', transform: 'translateX(-50%)', top }}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-sm font-semibold text-slate-100">{lesson.student_name}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {/* Date & time */}
        <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <div>
            <p className="text-sm text-slate-200 capitalize">{dateLabel}</p>
            <p className="text-xs text-slate-400">{timeStr} – {endStr} ({lesson.duration_minutes}min)</p>
          </div>
        </div>

        {/* Meet link */}
        {lesson.meet_link && (
          <a
            href={lesson.meet_link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/10 border border-blue-500/30 rounded-lg text-blue-400 hover:bg-blue-600/20 transition-colors text-xs"
          >
            <Video className="w-3.5 h-3.5" />
            Google Meet
            <ExternalLink className="w-3 h-3 ml-auto" />
          </a>
        )}

        {/* Status toggle (for past lessons) */}
        {isPast && (
          <div>
            <p className="text-xs text-slate-500 mb-1.5">{t('coaches.calendar.lessonStatus')}</p>
            <div className="flex gap-1.5">
              {STATUS_OPTIONS.map(opt => {
                const active = status === opt.value;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleSetStatus(opt.value)}
                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      active ? opt.color : 'border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {t(opt.label)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-700/50">
          <button
            onClick={() => { onClose(); navigate(`/students/${lesson.student_id}`); }}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            {t('coaches.calendar.viewStudent')}
          </button>
          <button onClick={handleDelete}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-400 transition-colors">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──

export function SchedulePanel() {
  const { t, language } = useLanguage();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [lessons, setLessons] = useState<ScheduleLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [newEvent, setNewEvent] = useState<NewEventState | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<ScheduleLesson | null>(null);
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

  // Fetch students list once
  useEffect(() => {
    authFetch('/api/coaches/students')
      .then(r => r.json())
      .then(data => setStudents((data.students || []).map((s: StudentOption) => ({ id: s.id, student_name: s.student_name }))))
      .catch(() => {});
  }, []);

  // Scroll to 8am on mount
  useEffect(() => {
    if (!loading && gridRef.current) {
      gridRef.current.scrollTop = HOUR_HEIGHT;
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

  // Click on empty grid area → open create popup
  const handleGridClick = (dayIdx: number, e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const rawHour = START_HOUR + y / HOUR_HEIGHT;
    const hour = Math.floor(rawHour);
    const minute = Math.round((rawHour - hour) * 60 / 30) * 30;
    const adjustedHour = minute === 60 ? hour + 1 : hour;
    const adjustedMinute = minute === 60 ? 0 : minute;

    if (adjustedHour < START_HOUR || adjustedHour >= END_HOUR) return;

    setSelectedLesson(null);
    setNewEvent({
      date: fmtDate(days[dayIdx]),
      hour: adjustedHour,
      minute: adjustedMinute,
      dayIdx,
    });
  };

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
              <div className="w-14 flex-shrink-0" />
              {days.map(day => {
                const key = fmtDate(day);
                const isToday = key === fmtDate(today);
                return (
                  <div key={key} className="flex-1 text-center py-2 min-w-0">
                    <div className={`text-xs uppercase tracking-wider ${isToday ? 'text-blue-400' : 'text-slate-300'}`}>
                      {day.toLocaleDateString(locale, { weekday: 'short' })}
                    </div>
                    <div className={`text-lg font-bold mt-0.5 ${
                      isToday
                        ? 'w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center mx-auto'
                        : 'text-slate-100'
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
                {/* Hour labels */}
                <div className="w-14 flex-shrink-0 relative">
                  {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                    <div
                      key={i}
                      className="absolute w-full text-right pr-2 text-xs text-slate-300 tabular-nums"
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

                  {/* Create event popup */}
                  {newEvent && (
                    <CreateEventPopup
                      event={newEvent}
                      students={students}
                      locale={locale}
                      onClose={() => setNewEvent(null)}
                      onCreated={fetchSchedule}
                    />
                  )}

                  {/* Lesson detail popup */}
                  {selectedLesson && (
                    <LessonDetailPopup
                      lesson={selectedLesson}
                      locale={locale}
                      onClose={() => setSelectedLesson(null)}
                      onUpdated={fetchSchedule}
                    />
                  )}

                  {days.map((day, dayIdx) => {
                    const key = fmtDate(day);
                    const dayLessons = lessonsByDay[key] || [];
                    const isToday = key === fmtDate(today);

                    return (
                      <div
                        key={key}
                        onClick={e => handleGridClick(dayIdx, e)}
                        className={`flex-1 relative border-l min-w-0 cursor-pointer ${
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

                          // Student's local time in their timezone
                          const studentTz = l.student_timezone && l.student_timezone !== 'UTC' ? l.student_timezone : null;
                          let studentTimeLabel = '';
                          if (studentTz) {
                            try {
                              const studentTime = start.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: studentTz });
                              const tzAbbr = new Intl.DateTimeFormat(locale, { timeZone: studentTz, timeZoneName: 'short' })
                                .formatToParts(start).find(p => p.type === 'timeZoneName')?.value || '';
                              if (studentTime !== timeStr) {
                                studentTimeLabel = `${studentTime} ${tzAbbr}`;
                              }
                            } catch { /* invalid tz */ }
                          }

                          return (
                            <div
                              key={l.id}
                              onClick={e => { e.stopPropagation(); setSelectedLesson(l); setNewEvent(null); }}
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
                                  <div>
                                    <span className="text-[10px] text-white/70 tabular-nums">{timeStr}</span>
                                    {studentTimeLabel && (
                                      <span className="text-[10px] text-white/50 tabular-nums ml-1">
                                        ({studentTimeLabel})
                                      </span>
                                    )}
                                  </div>
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
