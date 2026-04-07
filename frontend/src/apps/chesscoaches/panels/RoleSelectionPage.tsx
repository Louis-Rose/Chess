// Role selection screen — shown to new users after first Google login

import { useState } from 'react';
import { GraduationCap, Users } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LumnaBrand } from '../components/LumnaBrand';
import { LanguageToggle } from '../components/LanguageToggle';

export function RoleSelectionPage() {
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
      if (res.ok && user) {
        setUser({ ...user, role: 'coach' });
      }
    } finally {
      setLoading(false);
    }
  };

  const selectStudent = () => {
    setShowInviteInput(true);
  };

  const submitInviteCode = async () => {
    const code = inviteCode.trim();
    if (!code) return;

    // Extract token from full URL or raw token
    const token = code.includes('/invite/') ? code.split('/invite/').pop()! : code;

    setLoading(true);
    setError('');
    try {
      // First set role to student
      const roleRes = await fetch('/api/auth/set-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role: 'student' }),
      });
      if (!roleRes.ok) {
        setError('Failed to set role');
        return;
      }

      // Then accept the invite
      const inviteRes = await fetch(`/api/invite/${token}/accept`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await inviteRes.json();
      if (!inviteRes.ok) {
        setError(data.error || 'Invalid invite code');
        return;
      }

      // Success — update user and reload
      if (user) setUser({ ...user, role: 'student' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-dvh bg-slate-800 font-sans text-slate-100 flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <LumnaBrand />
          <p className="text-slate-400 text-sm mt-4">
            {t('coaches.roleSelection.welcome') || `Welcome, ${user?.name?.split(' ')[0] || ''}!`}
          </p>
        </div>

        <div className="flex justify-center">
          <LanguageToggle />
        </div>

        {showInviteInput ? (
          <div className="space-y-4">
            <p className="text-slate-300 text-sm">
              {t('coaches.roleSelection.enterInvite') || 'Enter the invite link or code from your coach:'}
            </p>
            <input
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitInviteCode()}
              placeholder={t('coaches.roleSelection.invitePlaceholder') || 'Paste invite link or code...'}
              className="w-full bg-slate-700 text-slate-100 text-sm px-4 py-3 rounded-xl border border-slate-600 focus:border-purple-500 focus:outline-none text-center"
              autoFocus
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3 justify-center">
              <button
                onClick={submitInviteCode}
                disabled={loading || !inviteCode.trim()}
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {loading ? '...' : (t('coaches.roleSelection.join') || 'Join')}
              </button>
              <button
                onClick={() => { setShowInviteInput(false); setError(''); }}
                className="px-6 py-2.5 text-slate-400 hover:text-slate-200 text-sm transition-colors"
              >
                {t('coaches.roleSelection.back') || 'Back'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-slate-300">
              {t('coaches.roleSelection.question') || 'How will you use LUMNA?'}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={selectCoach}
                disabled={loading}
                className="flex flex-col items-center gap-3 p-6 bg-slate-700/50 border border-slate-600 rounded-xl hover:border-blue-500/50 hover:bg-slate-700 transition-all disabled:opacity-50"
              >
                <div className="w-14 h-14 rounded-full bg-blue-600/20 flex items-center justify-center">
                  <Users className="w-7 h-7 text-blue-400" />
                </div>
                <div>
                  <p className="text-slate-100 font-medium">{t('coaches.roleSelection.coach') || "I'm a coach"}</p>
                  <p className="text-slate-500 text-xs mt-1">{t('coaches.roleSelection.coachDesc') || 'Manage students & lessons'}</p>
                </div>
              </button>
              <button
                onClick={selectStudent}
                disabled={loading}
                className="flex flex-col items-center gap-3 p-6 bg-slate-700/50 border border-slate-600 rounded-xl hover:border-purple-500/50 hover:bg-slate-700 transition-all disabled:opacity-50"
              >
                <div className="w-14 h-14 rounded-full bg-purple-600/20 flex items-center justify-center">
                  <GraduationCap className="w-7 h-7 text-purple-400" />
                </div>
                <div>
                  <p className="text-slate-100 font-medium">{t('coaches.roleSelection.student') || "I'm a student"}</p>
                  <p className="text-slate-500 text-xs mt-1">{t('coaches.roleSelection.studentDesc') || 'Join my coach on LUMNA'}</p>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
