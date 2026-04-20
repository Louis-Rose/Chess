// Weekly schedule — Google Calendar-style grid (days as columns, hours as rows)

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Video, Clock, Users, X, Video as VideoIcon, Check, Ban, HelpCircle, ExternalLink, Trash2, Pencil } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelShell } from '../components/PanelShell';
import { TimeSelect } from '../components/TimeSelect';
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

type UndoAction =
  | { kind: 'edit'; lessonId: number; prevScheduledAt: string; prevDuration: number }
  | { kind: 'delete'; lessonId: number };

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
  // Local YYYY-MM-DD. toISOString() uses UTC, which shifts Monday 00:00 local
  // onto Sunday in non-UTC time zones and breaks day-column keys.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

const STATUS_BG: Record<string, string> = {
  scheduled: 'bg-blue-500/80 hover:bg-blue-500/90 border-blue-400/50',
  done: 'bg-emerald-500/70 hover:bg-emerald-500/80 border-emerald-400/50',
  cancelled: 'bg-slate-600/50 hover:bg-slate-600/60 border-slate-500/50 opacity-50',
  tbd: 'bg-amber-500/70 hover:bg-amber-500/80 border-amber-400/50',
};

const HOUR_HEIGHT = 42; // px per hour
const START_HOUR = 7;
const END_HOUR = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR;

// ── Create Event Popup ──

function addMinutes(hhmm: string, delta: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = ((h * 60 + m + delta) % (24 * 60) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function minutesBetween(startHHMM: string, endHHMM: string): number {
  const [sh, sm] = startHHMM.split(':').map(Number);
  const [eh, em] = endHHMM.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function CreateEventPopup({ event, students, locale, use24h, onClose, onCreated }: {
  event: NewEventState;
  students: StudentOption[];
  locale: string;
  use24h: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useLanguage();
  const [studentId, setStudentId] = useState<number | ''>('');
  const initialStart = `${String(event.hour).padStart(2, '0')}:${String(event.minute).padStart(2, '0')}`;
  const [startTime, setStartTime] = useState(initialStart);
  const [endTime, setEndTime] = useState(addMinutes(initialStart, 60));
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

  // Shift end by the same delta so duration is preserved, Google-Meet-style.
  const handleStartChange = (next: string) => {
    const duration = minutesBetween(startTime, endTime);
    setStartTime(next);
    setEndTime(addMinutes(next, duration > 0 ? duration : 60));
  };

  const d = new Date(`${event.date}T${startTime}:00`);
  const dateLabel = d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });
  const duration = minutesBetween(startTime, endTime);
  const validDuration = duration > 0;

  // Ghost highlight + side-placed popup, Google Calendar-style.
  const [sh, sm] = startTime.split(':').map(Number);
  const startFloat = sh + sm / 60;
  const highlightTop = (startFloat - START_HOUR) * HOUR_HEIGHT;
  const highlightHeight = Math.max((duration / 60) * HOUR_HEIGHT, 4);
  const colWidthPct = 100 / 7;
  const dayLeftPct = event.dayIdx * colWidthPct;
  const placeRight = event.dayIdx < 4;
  const popupTop = Math.max(0, Math.min(highlightTop - 8, TOTAL_HOURS * HOUR_HEIGHT - 280));

  const handleSave = async () => {
    if (!studentId || saving || !validDuration) return;
    setSaving(true);
    try {
      const scheduled_at = `${event.date}T${startTime}:00`;
      const res = await authFetch(`/api/coaches/students/${studentId}/lessons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_at, duration_minutes: duration, create_meet: createMeet }),
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
    <>
      {/* Ghost highlight showing the proposed lesson slot */}
      {validDuration && (
        <div
          className="absolute z-20 rounded border-2 border-blue-400 bg-blue-500/25 pointer-events-none"
          style={{
            left: `calc(${dayLeftPct}% + 2px)`,
            width: `calc(${colWidthPct}% - 4px)`,
            top: highlightTop,
            height: highlightHeight,
          }}
        />
      )}
    <div ref={popupRef}
      className="absolute z-30 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-72 animate-in fade-in zoom-in-95 duration-150"
      style={{
        left: placeRight
          ? `calc(${dayLeftPct + colWidthPct}% + 8px)`
          : `calc(${dayLeftPct}% - 288px - 8px)`,
        top: popupTop,
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
              <TimeSelect value={startTime} onChange={handleStartChange} use24h={use24h} />
              <span className="text-slate-500 text-xs">–</span>
              <TimeSelect value={endTime} onChange={setEndTime} use24h={use24h} />
            </div>
          </div>
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
          <button onClick={handleSave} disabled={!studentId || saving || !validDuration}
            className="px-5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors">
            {saving ? '...' : t('coaches.calendar.save')}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

// ── Lesson Detail Popup ──

const STATUS_OPTIONS = [
  { value: 'done', icon: Check, label: 'coaches.lessons.status.done', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  { value: 'cancelled', icon: Ban, label: 'coaches.lessons.status.cancelled', color: 'bg-red-500/15 text-red-400 border-red-500/30' },
  { value: 'tbd', icon: HelpCircle, label: 'coaches.lessons.status.tbd', color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
] as const;

function LessonDetailPopup({ lesson, locale, use24h, onClose, onUpdated, onRecordUndo }: {
  lesson: ScheduleLesson;
  locale: string;
  use24h: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onRecordUndo: (action: UndoAction, toastText: string) => void;
}) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const popupRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState(lesson.status);

  const d = new Date(lesson.scheduled_at);
  const endDate = new Date(d.getTime() + lesson.duration_minutes * 60000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const initialStart = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const initialEnd = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;
  const lessonDateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const [editing, setEditing] = useState(false);
  const [startTime, setStartTime] = useState(initialStart);
  const [endTime, setEndTime] = useState(initialEnd);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const dateLabel = d.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });
  const timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const endStr = endDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const isPast = d < new Date();

  const handleStartChange = (next: string) => {
    const dur = minutesBetween(startTime, endTime);
    setStartTime(next);
    setEndTime(addMinutes(next, dur > 0 ? dur : 60));
  };

  const editedDuration = minutesBetween(startTime, endTime);
  const dirty = startTime !== initialStart || endTime !== initialEnd;

  const handleSaveEdit = async () => {
    if (savingEdit || editedDuration <= 0) return;
    setSavingEdit(true);
    try {
      const res = await authFetch(`/api/coaches/lessons/${lesson.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_at: `${lessonDateStr}T${startTime}:00`,
          duration_minutes: editedDuration,
        }),
      });
      if (res.ok) {
        onRecordUndo(
          { kind: 'edit', lessonId: lesson.id, prevScheduledAt: lesson.scheduled_at, prevDuration: lesson.duration_minutes },
          t('coaches.calendar.lessonUpdated'),
        );
        setEditing(false);
        onUpdated();
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCancelEdit = () => {
    setStartTime(initialStart);
    setEndTime(initialEnd);
    setEditing(false);
  };

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
    const res = await authFetch(`/api/coaches/lessons/${lesson.id}`, { method: 'DELETE' });
    if (res.ok) {
      onRecordUndo({ kind: 'delete', lessonId: lesson.id }, t('coaches.calendar.lessonDeleted'));
    }
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
        <div className="flex items-center gap-2">
          {!editing && (
            <button onClick={() => setEditing(true)}
              className="text-slate-400 hover:text-slate-200 transition-colors" title={t('coaches.calendar.editLesson')}>
              <Pencil className="w-4 h-4" />
            </button>
          )}
          <button onClick={handleDelete}
            className="text-slate-400 hover:text-red-400 transition-colors" title={t('coaches.calendar.deleteLesson')}>
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {/* Date & time */}
        <div className="flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
          {editing ? (
            <div className="flex-1">
              <p className="text-sm text-slate-200 capitalize">{dateLabel}</p>
              <div className="flex items-center gap-2 mt-1">
                <TimeSelect value={startTime} onChange={handleStartChange} use24h={use24h} />
                <span className="text-slate-500 text-xs">–</span>
                <TimeSelect value={endTime} onChange={setEndTime} use24h={use24h} />
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-slate-200 capitalize">{dateLabel}</p>
              <p className="text-xs text-slate-400">{timeStr} – {endStr} ({lesson.duration_minutes}min)</p>
            </div>
          )}
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
          {editing && (
            <div className="flex items-center gap-2">
              <button onClick={handleCancelEdit}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
                {t('coaches.calendar.cancel')}
              </button>
              <button onClick={handleSaveEdit} disabled={savingEdit || !dirty || editedDuration <= 0}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors">
                {savingEdit ? '...' : t('coaches.calendar.save')}
              </button>
            </div>
          )}
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
  const undoStackRef = useRef<UndoAction[]>([]);
  const [toast, setToast] = useState<{ text: string; canUndo: boolean; key: number } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

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

  const showToast = useCallback((text: string, canUndo: boolean) => {
    setToast({ text, canUndo, key: Date.now() });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 5000);
  }, []);

  const recordUndo = useCallback((action: UndoAction, toastText: string) => {
    undoStackRef.current.push(action);
    if (undoStackRef.current.length > 20) undoStackRef.current.shift();
    showToast(toastText, true);
  }, [showToast]);

  const performUndo = useCallback(async () => {
    const action = undoStackRef.current.pop();
    if (!action) return;
    try {
      if (action.kind === 'edit') {
        await authFetch(`/api/coaches/lessons/${action.lessonId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scheduled_at: action.prevScheduledAt,
            duration_minutes: action.prevDuration,
          }),
        });
      } else {
        await authFetch(`/api/coaches/lessons/${action.lessonId}/restore`, { method: 'POST' });
      }
      showToast(t('coaches.calendar.undone'), false);
      fetchSchedule();
    } catch {
      /* silently swallow — UI state will refetch */
    }
  }, [fetchSchedule, showToast, t]);

  // Cmd/Ctrl+Z → undo most recent edit or delete. Skip when typing in a field.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z';
      if (!isUndo) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      e.preventDefault();
      performUndo();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [performUndo]);

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

  const locale = language === 'fr' ? 'fr-FR' : language === 'es' ? 'es-ES' : 'en-US';
  const use24h = language === 'fr' || language === 'es';
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
              <div className="relative flex my-3" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
                {/* Hour labels */}
                <div className="w-14 flex-shrink-0 relative">
                  {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
                    const h = START_HOUR + i;
                    const label = use24h
                      ? `${String(h).padStart(2, '0')}:00`
                      : `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
                    return (
                      <div
                        key={i}
                        className="absolute w-full text-right pr-2 text-xs text-slate-300 tabular-nums"
                        style={{ top: i * HOUR_HEIGHT - 8 }}
                      >
                        {label}
                      </div>
                    );
                  })}
                </div>

                {/* Day columns */}
                <div className="flex-1 flex relative border-r border-slate-500/60">
                  {/* Horizontal hour lines */}
                  {Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => (
                    <div
                      key={i}
                      className="absolute left-0 right-0 border-t border-slate-500/60"
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
                      use24h={use24h}
                      onClose={() => setNewEvent(null)}
                      onCreated={fetchSchedule}
                    />
                  )}

                  {/* Lesson detail popup */}
                  {selectedLesson && (
                    <LessonDetailPopup
                      lesson={selectedLesson}
                      locale={locale}
                      use24h={use24h}
                      onClose={() => setSelectedLesson(null)}
                      onUpdated={fetchSchedule}
                      onRecordUndo={recordUndo}
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
                          isToday ? 'border-l-blue-500/30 bg-blue-500/[0.03]' : 'border-l-slate-500/60'
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

      {/* Undo toast — stays bottom-left, ⌘Z also undoes */}
      {toast && (
        <div
          key={toast.key}
          className="fixed bottom-6 left-6 z-50 flex items-center gap-3 px-4 py-2.5 bg-slate-800 border border-slate-600 rounded-lg shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <span className="text-sm text-slate-100">{toast.text}</span>
          {toast.canUndo && (
            <button
              onClick={performUndo}
              className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
            >
              {t('coaches.calendar.undo')}
            </button>
          )}
        </div>
      )}
    </PanelShell>
  );
}
