// Coaches home — card grid grouped by section + onboarding banner

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Sparkles, Check, Users, GraduationCap } from 'lucide-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useAuth } from '../../../contexts/AuthContext';
import { NAV_SECTIONS } from '../ChessCoachesLayout';
import { authFetch } from '../utils/authFetch';

interface OnboardingStatus {
  has_profile: boolean;
  has_students: boolean;
  has_lessons: boolean;
}

function OnboardingBanner({ status }: { status: OnboardingStatus }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  // All done → no banner
  if (status.has_lessons) return null;

  const isStudent = user?.role === 'student';
  const role = isStudent ? 'student' : 'coach';
  const steps = [
    { done: status.has_profile, before: t(`coaches.onboarding.step.profile.before.${role}`), link: t(`coaches.onboarding.step.profile.link.${role}`), after: '', path: '/profile' },
    { done: status.has_students, before: t('coaches.onboarding.step.students.before'), link: t('coaches.onboarding.step.students.link'), after: '', path: '/students' },
    { done: status.has_lessons, before: t('coaches.onboarding.step.calendar.before'), link: t('coaches.onboarding.step.calendar.link'), after: '', path: '/schedule' },
  ];

  const remainingSteps = steps.filter(s => !s.done);

  return (
    <div className="max-w-4xl mx-[5%] md:mx-auto mb-4 mt-4">
      <div className="rounded-xl border border-blue-500/30 bg-gradient-to-r from-blue-500/10 to-purple-500/10 p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-slate-100 mb-2">
              {t(isStudent ? 'coaches.onboarding.welcome.student' : 'coaches.onboarding.welcome.coach')}
            </h3>
            <div className="space-y-1.5">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  {step.done ? (
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-emerald-400" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] text-white font-bold">{remainingSteps.indexOf(step) + 1}</span>
                    </div>
                  )}
                  <span className={`text-sm ${step.done ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
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

function InlineRoleSelection() {
  const { t } = useLanguage();
  const { user, setUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showInviteInput, setShowInviteInput] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');

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

  const selectStudent = async () => {
    if (user?.is_admin) {
      setLoading(true);
      try {
        const res = await fetch('/api/auth/debug-student', { method: 'POST', credentials: 'include' });
        if (res.ok && user) { setUser({ ...user, role: 'student' }); return; }
      } finally { setLoading(false); }
    }
    setShowInviteInput(true);
  };

  const submitInviteCode = async () => {
    const code = inviteCode.trim();
    if (!code) return;
    const token = code.includes('/invite/') ? code.split('/invite/').pop()! : code;
    setLoading(true);
    setError('');
    try {
      const roleRes = await fetch('/api/auth/set-role', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ role: 'student' }),
      });
      if (!roleRes.ok) { setError('Failed to set role'); return; }
      const inviteRes = await fetch(`/api/invite/${token}/accept`, { method: 'POST', credentials: 'include' });
      const data = await inviteRes.json();
      if (!inviteRes.ok) { setError(data.error || 'Invalid invite code'); return; }
      if (user) setUser({ ...user, role: 'student' });
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-md mx-auto text-center py-12">
      {showInviteInput ? (
        <div className="space-y-4">
          <p className="text-slate-200 text-lg">{t('coaches.roleSelection.enterInvite')}</p>
          <input
            value={inviteCode}
            onChange={e => setInviteCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitInviteCode()}
            placeholder={t('coaches.roleSelection.invitePlaceholder')}
            className="w-full bg-slate-700 text-slate-100 text-sm px-4 py-3 rounded-xl border border-slate-600 focus:border-purple-500 focus:outline-none text-center"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 justify-center">
            <button onClick={submitInviteCode} disabled={loading || !inviteCode.trim()}
              className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
              {loading ? '...' : t('coaches.roleSelection.join')}
            </button>
            <button onClick={() => { setShowInviteInput(false); setError(''); }}
              className="px-6 py-2.5 text-slate-400 hover:text-slate-200 text-sm transition-colors">
              {t('coaches.roleSelection.back')}
            </button>
          </div>
        </div>
      ) : (
        <div className="max-w-lg mx-auto rounded-xl border border-slate-700 bg-slate-800/50 p-8">
          <h2 className="text-xl font-semibold text-slate-100 text-center mb-6">{t('coaches.roleSelection.question')}</h2>
          <div className="grid grid-cols-2 gap-6">
            <button onClick={selectCoach} disabled={loading}
              className="flex flex-col items-center gap-4 p-8 bg-slate-700/50 border border-slate-600 rounded-xl hover:border-blue-500/50 hover:bg-slate-700 transition-all disabled:opacity-50">
              <div className="w-20 h-20 rounded-full bg-blue-600/20 flex items-center justify-center">
                <Users className="w-10 h-10 text-blue-400" />
              </div>
              <p className="text-slate-100 font-semibold text-xl">{t('coaches.roleSelection.coach')}</p>
            </button>
            <button onClick={selectStudent} disabled={loading}
              className="flex flex-col items-center gap-4 p-8 bg-slate-700/50 border border-slate-600 rounded-xl hover:border-purple-500/50 hover:bg-slate-700 transition-all disabled:opacity-50">
              <div className="w-20 h-20 rounded-full bg-purple-600/20 flex items-center justify-center">
                <GraduationCap className="w-10 h-10 text-purple-400" />
              </div>
              <p className="text-slate-100 font-semibold text-xl">{t('coaches.roleSelection.student')}</p>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ScoresheetPanel() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    if (user?.role) {
      authFetch('/api/coaches/onboarding')
        .then(r => r.json())
        .then(setOnboarding)
        .catch(() => {});
    }
  }, [user?.role]);

  // Role not yet chosen — show inline selection
  if (user && user.role === null) {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-2 flex flex-col min-h-[calc(100dvh-80px)]">
        <InlineRoleSelection />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 mt-2 flex flex-col min-h-[calc(100dvh-80px)]">
      {onboarding && <OnboardingBanner status={onboarding} />}

      <div className="max-w-4xl mx-[5%] md:mx-auto space-y-4 w-full">
        {NAV_SECTIONS.map(({ titleKey, items }) => {
          const visibleItems = items.filter(i => !i.hidden);
          if (visibleItems.length === 0) return null;
          // Determine which card to highlight based on onboarding progress
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
      <div className="text-center pb-4">
        <button
          onClick={() => navigate('/about')}
          className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
        >
          {t('coaches.navAbout')}
        </button>
      </div>
    </div>
  );
}
