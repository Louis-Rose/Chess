// Student dashboard — what students see after logging in

import { useState, useEffect } from 'react';
import { Clock, LogOut } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LumnaBrand } from '../components/LumnaBrand';
import { LanguageToggle } from '../components/LanguageToggle';

interface DashboardData {
  student: { id: number; name: string };
  coach: { name: string; picture: string | null; city: string | null };
  packs: { id: number; total_lessons: number; lessons_done: number; price: number | null; currency: string | null; source: string | null; status: string }[];
  lessons: { id: number; scheduled_at: string; duration_minutes: number; status: string }[];
}

export function StudentDashboard() {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/student/dashboard', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="h-dvh bg-slate-800 font-sans text-slate-100 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <LumnaBrand hideSubtitle />
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <button
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-red-400 hover:bg-slate-700 rounded-lg text-sm transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-xl mx-auto space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-slate-600 border-t-purple-500 rounded-full animate-spin" />
            </div>
          ) : !data ? (
            <div className="text-center py-20">
              <p className="text-slate-400">{t('coaches.students.noAccountLinked') || 'No student account linked yet.'}</p>
            </div>
          ) : (
            <>
              {/* Welcome */}
              <div className="text-center space-y-1">
                <h1 className="text-2xl font-bold text-slate-100">
                  {t('coaches.studentDashboard.welcome') || 'Welcome'}, {data.student.name}
                </h1>
                <p className="text-slate-400 text-sm">
                  {t('coaches.studentDashboard.coachLabel') || 'Your coach'}: {data.coach.name}
                </p>
              </div>

              {/* Coach card */}
              <div className="bg-slate-700/50 rounded-xl p-4 flex items-center gap-4">
                {data.coach.picture ? (
                  <img src={data.coach.picture} alt="" className="w-14 h-14 rounded-full" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-purple-600/20 flex items-center justify-center text-purple-400 font-bold text-xl">
                    {data.coach.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-slate-100 font-medium text-lg">{data.coach.name}</p>
                  {data.coach.city && <p className="text-slate-400 text-sm">{data.coach.city}</p>}
                </div>
              </div>

              {/* Active packs */}
              {data.packs.length > 0 ? (
                <div className="space-y-3">
                  <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                    {t('coaches.studentDashboard.activePacks') || 'Your Lesson Packs'}
                  </h2>
                  {data.packs.map(p => {
                    const remaining = p.total_lessons - p.lessons_done;
                    const pct = p.total_lessons > 0 ? Math.min((p.lessons_done / p.total_lessons) * 100, 100) : 0;
                    return (
                      <div key={p.id} className="bg-slate-700/50 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-slate-200">
                            {p.total_lessons} {t('coaches.packs.lessons') || 'lessons'}
                          </span>
                          <span className={`text-sm font-bold ${remaining > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {remaining} {t('coaches.packs.remaining') || 'remaining'}
                          </span>
                        </div>
                        <div className="h-2 bg-slate-600 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${remaining <= 0 ? 'bg-slate-500' : 'bg-emerald-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {p.lessons_done} {t('coaches.packs.used') || 'used'} {t('coaches.packs.of') || 'of'} {p.total_lessons}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-slate-700/50 rounded-xl p-6 text-center">
                  <p className="text-slate-400 text-sm">{t('coaches.studentDashboard.noPacks') || 'No active lesson packs yet.'}</p>
                </div>
              )}

              {/* Recent lessons */}
              {data.lessons.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                    {t('coaches.studentDashboard.recentLessons') || 'Recent Lessons'}
                  </h2>
                  <div className="bg-slate-700/50 rounded-xl divide-y divide-slate-600/30">
                    {data.lessons.map(l => (
                      <div key={l.id} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-500" />
                          <span className="text-sm text-slate-200">
                            {new Date(l.scheduled_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          l.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400' :
                          l.status === 'scheduled' ? 'bg-blue-500/15 text-blue-400' :
                          'bg-slate-600 text-slate-400'
                        }`}>
                          {l.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
