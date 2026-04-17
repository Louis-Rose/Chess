// Single home page for the coaches app — adapts to coach, student, or
// no-role-yet (first login). Always renders inside the shared layout
// (sidebar + header), unlike the old standalone RoleSelectionPage.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Sparkles, Check, Users, GraduationCap, Clock } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useAuth } from '../../../contexts/AuthContext';
import { NAV_SECTIONS } from '../ChessCoachesLayout';
import { authFetch } from '../utils/authFetch';
import { PanelShell } from '../components/PanelShell';
import { CreditBar } from '../components/CreditBar';
import { Avatar } from '../components/Avatar';

type Role = 'coach' | 'student' | null;

export function HomePage({ role }: { role: Role }) {
  if (role === null) return <RoleSelectionView />;
  if (role === 'student') return <StudentHome />;
  return <CoachHome />;
}

// ──────────────────────────────────────────────────────────────────────
//  Role selection — shown to brand-new users on first login
// ──────────────────────────────────────────────────────────────────────

function RoleSelectionView() {
  const { t } = useLanguage();
  const { user, setUser } = useAuth();
  const [loading, setLoading] = useState(false);

  const selectCoach = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/set-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: 'coach' }),
      });
      if (res.ok && user) setUser({ ...user, role: 'coach' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto text-center py-12 px-4">
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-8">
        <h2 className="text-xl font-semibold text-slate-100 text-center mb-6">{t('coaches.roleSelection.question')}</h2>
        <div className="grid grid-cols-2 gap-6">
          <button
            onClick={selectCoach}
            disabled={loading}
            className="aspect-square flex flex-col items-center justify-center gap-5 p-6 bg-slate-700/50 border border-slate-600 rounded-xl hover:border-blue-500/50 hover:bg-slate-700 transition-all disabled:opacity-50"
          >
            <div className="w-24 h-24 rounded-full bg-blue-600/20 flex items-center justify-center">
              <Users className="w-12 h-12 text-blue-400" />
            </div>
            <p className="text-slate-100 font-semibold text-xl">{t('coaches.roleSelection.coach')}</p>
            {/* Invisible spacer to mirror the student tile's "Coming soon" line height */}
            <p aria-hidden="true" className="text-sm invisible">{t('coaches.comingSoon')}</p>
          </button>
          <div
            aria-disabled="true"
            className="aspect-square flex flex-col items-center justify-center gap-5 p-6 bg-slate-700/30 border border-slate-700 rounded-xl opacity-50 cursor-not-allowed select-none"
          >
            <div className="w-24 h-24 rounded-full bg-purple-600/10 flex items-center justify-center">
              <GraduationCap className="w-12 h-12 text-purple-400/60" />
            </div>
            <p className="text-slate-300 font-semibold text-xl">{t('coaches.roleSelection.student')}</p>
            <p className="text-slate-400 text-sm">{t('coaches.comingSoon')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  Coach home — onboarding banner + feature grid
// ──────────────────────────────────────────────────────────────────────

interface OnboardingStatus {
  has_profile: boolean;
  has_students: boolean;
  has_lessons: boolean;
}

function OnboardingBanner({ status }: { status: OnboardingStatus }) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  if (status.has_lessons) return null;

  const steps = [
    { done: status.has_profile, before: t('coaches.onboarding.step.profile.before.coach'), link: t('coaches.onboarding.step.profile.link.coach'), after: '', path: '/profile' },
    { done: status.has_students, before: t('coaches.onboarding.step.students.before'), link: t('coaches.onboarding.step.students.link'), after: '', path: '/students' },
    { done: status.has_lessons, before: t('coaches.onboarding.step.calendar.before'), link: t('coaches.onboarding.step.calendar.link'), after: '', path: '/schedule' },
  ];

  const remainingSteps = steps.filter(s => !s.done);

  return (
    <div className="max-w-4xl w-full mx-auto px-[5%] mb-4 mt-4">
      <div className="rounded-xl border border-blue-500/30 bg-gradient-to-r from-blue-500/10 to-purple-500/10 p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sparkles className="w-6 h-6 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-slate-100 mb-3">
              {t('coaches.onboarding.welcome.coach')}
            </h3>
            <div className="space-y-2.5">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  {step.done ? (
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs text-white font-bold">{remainingSteps.indexOf(step) + 1}</span>
                    </div>
                  )}
                  <span className={`text-base ${step.done ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                    {step.before}
                    <button
                      onClick={() => navigate(step.path)}
                      className={`font-semibold underline underline-offset-2 transition-colors ${
                        step.done ? 'text-slate-500' : 'text-blue-400 hover:text-blue-300'
                      }`}
                    >
                      {step.link}
                    </button>
                    {step.after}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CoachHome() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    authFetch('/api/coaches/onboarding')
      .then(r => r.json())
      .then(setOnboarding)
      .catch(() => {});
  }, []);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-2 flex flex-col min-h-[calc(100dvh-80px)]">
      {onboarding && <OnboardingBanner status={onboarding} />}

      <div className="max-w-4xl w-full mx-auto px-[5%] space-y-4">
        {NAV_SECTIONS.map(({ titleKey, items }) => {
          const visibleItems = items.filter(i => !i.hidden);
          if (visibleItems.length === 0) return null;
          const highlightPath = onboarding && !onboarding.has_lessons
            ? (!onboarding.has_profile ? '/profile' : !onboarding.has_students ? '/students' : '/schedule')
            : null;
          return (
            <div key={titleKey} className="rounded-xl border border-slate-700 overflow-hidden">
              <div className="border-b border-slate-700 bg-slate-800/50 py-3">
                <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider text-center">
                  {t(titleKey)}
                </h2>
              </div>
              <div className="p-4">
                <div className="flex flex-wrap justify-center gap-4">
                  {visibleItems.map(({ path, labelKey, icon: Icon, bgColor, hoverColor, comingSoon }) => {
                    const isHighlighted = path === highlightPath;
                    return (
                      <div
                        key={path}
                        onClick={comingSoon ? undefined : () => navigate(path)}
                        className={`relative bg-slate-800 rounded-xl p-5 h-[100px] flex items-center w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.7rem)] ${comingSoon ? 'opacity-50 cursor-default border border-slate-700' : isHighlighted ? 'border-2 border-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.3)] cursor-pointer' : `border border-slate-700 ${hoverColor} hover:bg-slate-750 cursor-pointer`} transition-colors`}
                      >
                        <div className={`w-10 h-10 ${comingSoon ? 'bg-slate-600' : bgColor} rounded-lg flex items-center justify-center flex-shrink-0`}>
                          <Icon className="w-5 h-5 text-white" />
                        </div>
                        <div className="ml-4">
                          <span className="text-base font-semibold text-slate-100">{t(labelKey)}</span>
                          {comingSoon && <p className="text-xs text-slate-400 mt-0.5">{t('coaches.comingSoon')}</p>}
                        </div>
                        {!comingSoon && <ChevronRight className="w-5 h-5 text-slate-400 absolute top-3 right-3" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex-1" />
      <div className="text-center pt-8 pb-6">
        <button
          onClick={() => navigate('/about')}
          className="text-sm text-slate-500 hover:text-slate-400 transition-colors"
        >
          {t('coaches.navAbout')}
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
//  Student home — coach card, packs, recent lessons
// ──────────────────────────────────────────────────────────────────────

interface DashboardData {
  student: { id: number; name: string };
  coach_user_id: number;
  coach: { name: string; picture: string | null; city: string | null };
  packs: { id: number; total_lessons: number; consumed: number; price: number | null; currency: string | null; source: string | null; status: string }[];
  lessons: { id: number; scheduled_at: string; duration_minutes: number; status: string }[];
}

function StudentHome() {
  const { t } = useLanguage();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/api/student/dashboard')
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <PanelShell title={t('coaches.navHome')}>
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-slate-600 border-t-purple-500 rounded-full animate-spin" />
        </div>
      </PanelShell>
    );
  }

  if (!data) {
    return (
      <PanelShell title={t('coaches.navHome')}>
        <div className="text-center py-20">
          <p className="text-slate-400">{t('coaches.studentDashboard.noAccount')}</p>
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell title={t('coaches.navHome')}>
      <div className="max-w-xl mx-auto space-y-6">
        {/* Coach card */}
        <div className="bg-slate-700/50 rounded-xl p-4 flex items-center gap-4">
          <Avatar name={data.coach.name} picture={data.coach.picture} size="xl" />
          <div>
            <p className="text-slate-400 text-xs">{t('coaches.studentDashboard.coachLabel')}</p>
            <p className="text-slate-100 font-medium text-lg">{data.coach.name}</p>
            {data.coach.city && <p className="text-slate-400 text-sm">{data.coach.city}</p>}
          </div>
        </div>

        {/* Active packs */}
        {data.packs.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              {t('coaches.studentDashboard.activePacks')}
            </h2>
            {data.packs.map(p => {
              const remaining = p.total_lessons - p.consumed;
              return (
                <div key={p.id} className="bg-slate-700/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-200">
                      {p.total_lessons} {t('coaches.packs.lessons')}
                    </span>
                    <span className={`text-sm font-bold ${remaining > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {remaining} {t('coaches.packs.remaining')}
                    </span>
                  </div>
                  <CreditBar consumed={p.consumed} total={p.total_lessons} />
                  <div className="text-xs text-slate-500 mt-1">
                    {p.consumed} {t('coaches.packs.used')} {t('coaches.packs.of')} {p.total_lessons}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-700/50 rounded-xl p-6 text-center">
            <p className="text-slate-400 text-sm">{t('coaches.studentDashboard.noPacks')}</p>
          </div>
        )}

        {/* Recent lessons */}
        {data.lessons.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              {t('coaches.studentDashboard.recentLessons')}
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
      </div>
    </PanelShell>
  );
}
