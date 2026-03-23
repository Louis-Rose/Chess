// Payments panel — unpaid lessons tracker

import { useState, useEffect, useCallback } from 'react';
import { Check, DollarSign } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { PanelShell } from '../components/PanelShell';

interface UnpaidLesson {
  id: number;
  student_id: number;
  student_name: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  paid: number;
}

import { authFetch } from '../utils/authFetch';

function formatDate(iso: string, lang: string): string {
  try {
    const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
    return new Date(iso).toLocaleDateString(locale, {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  } catch { return iso; }
}

function formatDuration(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`;
  if (minutes >= 60) return `${(minutes / 60).toFixed(1)}h`;
  return `${minutes}min`;
}

export function PaymentsPanel() {
  const { t, language } = useLanguage();

  const [lessons, setLessons] = useState<UnpaidLesson[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUnpaid = useCallback(async () => {
    try {
      const res = await authFetch('/api/coaches/lessons/unpaid');
      const json = await res.json();
      setLessons(json.lessons || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchUnpaid().then(() => setLoading(false));
  }, [fetchUnpaid]);

  const markPaid = async (lessonId: number) => {
    await authFetch(`/api/coaches/lessons/${lessonId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paid: 1 }),
    });
    fetchUnpaid();
  };

  // Group by student
  const grouped = new Map<string, UnpaidLesson[]>();
  for (const l of lessons) {
    if (!grouped.has(l.student_name)) grouped.set(l.student_name, []);
    grouped.get(l.student_name)!.push(l);
  }

  const sortedGroups = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <PanelShell title={t('coaches.payments.title')}>
      <div className="max-w-3xl mx-auto space-y-4">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-800 rounded-lg animate-pulse" />)}
          </div>
        ) : lessons.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-600/10 flex items-center justify-center mb-4">
              <DollarSign className="w-8 h-8 text-emerald-400" />
            </div>
            <p className="text-slate-400 text-sm">{t('coaches.payments.allPaid')}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-400">
              {lessons.length} {lessons.length === 1 ? t('coaches.payments.lessonUnpaid') : t('coaches.payments.lessonsUnpaid')}
            </p>
            {sortedGroups.map(([studentName, studentLessons]) => (
              <div key={studentName} className="space-y-1.5">
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  {studentName} ({studentLessons.length})
                </div>
                {studentLessons.map(l => (
                  <div key={l.id} className="flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5">
                    <span className="text-sm text-slate-200 flex-shrink-0">
                      {formatDate(l.scheduled_at, language)}
                    </span>
                    <span className="text-xs text-slate-200">{formatDuration(l.duration_minutes)}</span>
                    <div className="flex-1" />
                    <button
                      onClick={() => markPaid(l.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded-lg text-xs font-medium transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {t('coaches.payments.markPaid')}
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}
      </div>
    </PanelShell>
  );
}
