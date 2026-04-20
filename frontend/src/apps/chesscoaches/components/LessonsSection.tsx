// Lessons section — upcoming + past lessons with expandable cards

import { useState, useEffect } from 'react';
import { Plus, Clock, ChevronDown, ChevronRight, Video, ExternalLink, Check, Trash2 } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { authFetch } from '../utils/authFetch';

export interface Lesson {
  id: number;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  notes: string | null;
  meet_link: string | null;
  created_at: string;
}

const PAST_STATUSES = ['done', 'cancelled', 'tbd'] as const;

export function LessonsSection({ studentId, upcoming, past, onRefresh }: {
  studentId: number;
  upcoming: Lesson[];
  past: Lesson[];
  onRefresh: () => void;
}) {
  const { t } = useLanguage();
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDate, setAddDate] = useState('');
  const [addTime, setAddTime] = useState('');
  const [addDuration, setAddDuration] = useState('60');
  const [createMeet, setCreateMeet] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    authFetch('/api/auth/google-calendar/status')
      .then(r => r.json())
      .then(d => setCalendarConnected(d.connected))
      .catch(() => {});
  }, []);

  const handleConnectCalendar = async () => {
    const res = await authFetch('/api/auth/google-calendar/connect', { method: 'POST' });
    const data = await res.json();
    if (data.auth_url) {
      const popup = window.open(data.auth_url, 'google-calendar', 'width=500,height=600');
      const check = setInterval(() => {
        if (popup?.closed) {
          clearInterval(check);
          window.removeEventListener('message', onMessage);
          authFetch('/api/auth/google-calendar/status')
            .then(r => r.json())
            .then(d => { setCalendarConnected(d.connected); if (d.connected) setCreateMeet(true); });
        }
      }, 1000);
      const onMessage = (e: MessageEvent) => {
        if (e.origin === window.location.origin && e.data === 'calendar-connected') {
          clearInterval(check);
          window.removeEventListener('message', onMessage);
          setCalendarConnected(true);
          setCreateMeet(true);
        }
      };
      window.addEventListener('message', onMessage);
    }
  };

  const handleAdd = async () => {
    if (!addDate || !addTime || adding) return;
    setAdding(true);
    try {
      const scheduled_at = `${addDate}T${addTime}:00`;
      await authFetch(`/api/coaches/students/${studentId}/lessons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_at, duration_minutes: parseInt(addDuration), create_meet: createMeet }),
      });
      setShowAddForm(false);
      setAddDate('');
      setAddTime('');
      onRefresh();
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
          {t('coaches.lessons.title')}
        </h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('coaches.lessons.add')}
        </button>
      </div>

      {showAddForm && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Date</label>
              <input type="date" value={addDate} onChange={e => setAddDate(e.target.value)}
                className="w-full bg-slate-700 text-slate-100 text-sm px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Time</label>
              <input type="time" value={addTime} onChange={e => setAddTime(e.target.value)}
                className="w-full bg-slate-700 text-slate-100 text-sm px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Duration</label>
              <select value={addDuration} onChange={e => setAddDuration(e.target.value)}
                className="w-full bg-slate-700 text-slate-100 text-sm px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none">
                <option value="60">1 hour</option>
                <option value="90">1h30</option>
                <option value="120">2 hours</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {calendarConnected ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={createMeet} onChange={e => setCreateMeet(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500" />
                <Video className="w-4 h-4 text-blue-400" />
                <span className="text-sm text-slate-300">Create Google Meet link</span>
              </label>
            ) : calendarConnected === false ? (
              <button onClick={handleConnectCalendar}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-lg transition-colors">
                <Video className="w-3.5 h-3.5" />
                Connect Google Calendar for Meet links
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={!addDate || !addTime || adding}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs rounded-lg transition-colors">
              {adding ? '...' : 'Create'}
            </button>
            <button onClick={() => setShowAddForm(false)}
              className="px-4 py-2 text-slate-400 hover:text-slate-200 text-xs transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs text-blue-400 font-medium uppercase tracking-wider">
            {t('coaches.lessons.upcoming')}
          </h3>
          {upcoming.map(l => (
            <LessonCard key={l.id} lesson={l} variant="upcoming" onRefresh={onRefresh} />
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs text-slate-400 font-medium uppercase tracking-wider">
            {t('coaches.lessons.past')}
          </h3>
          {past.map(l => (
            <LessonCard key={l.id} lesson={l} variant="past" onRefresh={onRefresh} />
          ))}
        </div>
      )}

      {upcoming.length === 0 && past.length === 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center">
          <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">{t('coaches.lessons.empty')}</p>
        </div>
      )}
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  scheduled: 'bg-blue-500/15 text-blue-400',
  done: 'bg-emerald-500/15 text-emerald-400',
  cancelled: 'bg-red-500/15 text-red-400',
  tbd: 'bg-amber-500/15 text-amber-400',
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  scheduled: 'coaches.lessons.status.scheduled',
  done: 'coaches.lessons.status.done',
  cancelled: 'coaches.lessons.status.cancelled',
  tbd: 'coaches.lessons.status.tbd',
};

function LessonCard({ lesson, variant, onRefresh }: { lesson: Lesson; variant: 'upcoming' | 'past'; onRefresh: () => void }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(lesson.notes || '');
  const [saving, setSaving] = useState(false);

  const d = new Date(lesson.scheduled_at);
  const endD = new Date(d.getTime() + lesson.duration_minutes * 60000);
  const dateStr = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const endTimeStr = endD.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await authFetch(`/api/coaches/lessons/${lesson.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      setEditingNotes(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const handleSetStatus = async (status: string) => {
    const res = await authFetch(`/api/coaches/lessons/${lesson.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) onRefresh();
  };

  const handleDelete = async () => {
    const res = await authFetch(`/api/coaches/lessons/${lesson.id}`, { method: 'DELETE' });
    if (res.ok) onRefresh();
  };

  const badgeClass = STATUS_BADGE[lesson.status] || 'bg-slate-600 text-slate-400';
  const statusLabel = t(STATUS_LABEL_KEYS[lesson.status] || '') || lesson.status;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-750 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <Clock className={`w-4 h-4 ${variant === 'upcoming' ? 'text-blue-400' : 'text-slate-500'}`} />
          <div>
            <span className="text-sm text-slate-200 capitalize">{dateStr}</span>
            <span className="text-sm text-slate-100 ml-2 tabular-nums">{timeStr} – {endTimeStr}</span>
            <span className="text-sm text-slate-100 ml-2 tabular-nums">({lesson.duration_minutes}min)</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${badgeClass}`}>
            {statusLabel}
          </span>
          {lesson.meet_link && <Video className="w-3.5 h-3.5 text-blue-400" />}
          {lesson.notes && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Has notes" />}
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-700 px-4 py-3 space-y-3">
          {lesson.meet_link && (
            <a
              href={lesson.meet_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 bg-blue-600/10 border border-blue-500/30 rounded-lg text-blue-400 hover:bg-blue-600/20 transition-colors text-sm"
            >
              <Video className="w-4 h-4" />
              Join Google Meet
              <ExternalLink className="w-3 h-3 ml-auto" />
            </a>
          )}

          {editingNotes ? (
            <div className="space-y-2">
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Lesson summary / notes..."
                rows={4}
                className="w-full bg-slate-700 text-slate-100 text-sm px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 focus:outline-none resize-none"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={handleSaveNotes} disabled={saving}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs rounded-lg transition-colors">
                  {saving ? '...' : 'Save'}
                </button>
                <button onClick={() => { setEditingNotes(false); setNotes(lesson.notes || ''); }}
                  className="px-3 py-1.5 text-slate-400 hover:text-slate-200 text-xs transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              {lesson.notes ? (
                <div className="bg-slate-700/50 rounded-lg px-3 py-2">
                  <p className="text-xs text-slate-400 mb-1 font-medium">Notes</p>
                  <p className="text-sm text-slate-200 whitespace-pre-wrap">{lesson.notes}</p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic">No notes yet</p>
              )}
              <button onClick={() => setEditingNotes(true)}
                className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                {lesson.notes ? 'Edit notes' : 'Add notes'}
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1 border-t border-slate-700/50">
            {variant === 'past' && (
              <div className="flex items-center gap-1">
                {PAST_STATUSES.map(s => (
                  <button
                    key={s}
                    onClick={() => handleSetStatus(s)}
                    disabled={lesson.status === s}
                    className={`px-2.5 py-1 text-xs rounded-lg transition-colors ${
                      lesson.status === s
                        ? `${STATUS_BADGE[s]} font-medium`
                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {s === 'done' && <Check className="w-3 h-3 inline mr-1" />}
                    {t(STATUS_LABEL_KEYS[s])}
                  </button>
                ))}
              </div>
            )}
            <button onClick={handleDelete}
              className="flex items-center gap-1 px-3 py-1.5 text-slate-500 hover:text-red-400 text-xs transition-colors ml-auto">
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
