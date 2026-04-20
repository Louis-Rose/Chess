// Lessons section — upcoming + past lessons with expandable cards

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, ChevronDown, ChevronRight, Video, ExternalLink, Trash2, CalendarDays } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { authFetch } from '../utils/authFetch';

export interface Lesson {
  id: number;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  paid: number;           // 0 or 1 (PostgreSQL INTEGER)
  notes: string | null;
  meet_link: string | null;
  created_at: string;
}

export function LessonsSection({ upcoming, past, onRefresh }: {
  upcoming: Lesson[];
  past: Lesson[];
  onRefresh: () => void;
}) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
        {t('coaches.lessons.title')}
      </h2>

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
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 text-center space-y-3">
          <Clock className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-slate-500 text-sm">{t('coaches.lessons.empty')}</p>
          <button
            onClick={() => navigate('/schedule')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <CalendarDays className="w-3.5 h-3.5" />
            {t('coaches.lessons.goToCalendar')}
          </button>
        </div>
      )}
    </div>
  );
}

// Two pills per lesson: Paid/Not paid + Done/Scheduled.
// Legacy cancelled/tbd rows read as "Scheduled" — toggling flips them back
// into the two-state world.
const PILL_ON = 'bg-emerald-500/15 text-emerald-400';
const PILL_OFF = 'bg-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-600';

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

  const patchLesson = async (patch: Record<string, unknown>) => {
    const res = await authFetch(`/api/coaches/lessons/${lesson.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) onRefresh();
  };

  const handleDelete = async () => {
    const res = await authFetch(`/api/coaches/lessons/${lesson.id}`, { method: 'DELETE' });
    if (res.ok) onRefresh();
  };

  const isDone = lesson.status === 'done';
  const isPaid = !!lesson.paid;

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
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); patchLesson({ paid: !isPaid }); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); patchLesson({ paid: !isPaid }); } }}
            className={`text-xs px-2 py-0.5 rounded-full transition-colors cursor-pointer ${isPaid ? PILL_ON : PILL_OFF}`}
          >
            {t(isPaid ? 'coaches.lessons.paid' : 'coaches.lessons.notPaid')}
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); patchLesson({ status: isDone ? 'scheduled' : 'done' }); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); patchLesson({ status: isDone ? 'scheduled' : 'done' }); } }}
            className={`text-xs px-2 py-0.5 rounded-full transition-colors cursor-pointer ${isDone ? PILL_ON : PILL_OFF}`}
          >
            {t(isDone ? 'coaches.lessons.status.done' : 'coaches.lessons.status.scheduled')}
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

          <div className="flex items-center pt-1 border-t border-slate-700/50">
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
