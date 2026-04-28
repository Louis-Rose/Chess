// Invite landing page — student clicks invite link, logs in, gets linked

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Check, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LumnaBrand } from '../components/LumnaBrand';
import { LoginButton } from '../../../components/LoginButton';
import { LanguageToggle } from '../components/LanguageToggle';
import { Avatar } from '../components/Avatar';

interface InviteInfo {
  coach_name: string;
  coach_picture: string | null;
  student_name: string;
}

export function InvitePage() {
  // URL can be /invite/<token> (legacy) or /invite/from-foo-to-bar/<token>
  // (pretty). The raw random token is always the last path segment.
  const params = useParams();
  const splat = params['*'] ?? '';
  const token = splat.split('/').filter(Boolean).pop() || '';
  const { t } = useLanguage();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // Fetch invite info
  useEffect(() => {
    if (!token) return;
    fetch(`/api/invite/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setInvite(d);
      })
      .catch(() => setError('Failed to load invite'))
      .finally(() => setLoading(false));
  }, [token]);

  // Auto-accept when user logs in
  useEffect(() => {
    if (!isAuthenticated || !invite || accepted || accepting || !token) return;
    setAccepting(true);
    fetch(`/api/invite/${token}/accept`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setAccepted(true);
      })
      .catch(() => setError('Failed to accept invite'))
      .finally(() => setAccepting(false));
  }, [isAuthenticated, invite, accepted, accepting, token]);

  // Redirect to student dashboard after acceptance
  useEffect(() => {
    if (accepted) {
      const timer = setTimeout(() => {
        window.location.href = '/app'; // Full reload to pick up new role
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [accepted]);

  if (loading || authLoading) {
    return (
      <div className="h-dvh bg-slate-800 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-600 border-t-purple-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-dvh bg-slate-800 font-sans text-slate-100 flex flex-col items-center justify-center px-4">
      <div className="max-w-sm w-full space-y-6 text-center">
        <LumnaBrand />

        {error ? (
          <div className="space-y-3">
            <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
            <p className="text-slate-300">{error}</p>
          </div>
        ) : accepted ? (
          <div className="space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-emerald-400" />
            </div>
            <p className="text-slate-200 text-lg font-medium">
              {t('coaches.invite.accepted') || 'Account linked!'}
            </p>
            <p className="text-slate-400 text-sm">
              {t('coaches.invite.redirecting') || 'Redirecting to your dashboard...'}
            </p>
          </div>
        ) : accepting ? (
          <div className="space-y-3">
            <div className="w-8 h-8 border-2 border-slate-600 border-t-purple-500 rounded-full animate-spin mx-auto" />
            <p className="text-slate-400 text-sm">{t('coaches.invite.linking') || 'Linking your account...'}</p>
          </div>
        ) : invite ? (
          <div className="space-y-6">
            {/* Coach info */}
            <div className="space-y-3">
              <Avatar name={invite.coach_name} picture={invite.coach_picture} size="2xl" className="mx-auto" />
              <div>
                <p className="text-slate-200 text-lg font-medium">
                  {invite.coach_name}
                </p>
                <p className="text-slate-400 text-sm">
                  {t('coaches.invite.invitedYou') || 'invited you to join LUMNA'}
                </p>
              </div>
            </div>

            <div className="h-px bg-slate-700" />

            <p className="text-slate-300 text-sm">
              {t('coaches.invite.signInPrompt') || 'Sign in with Google to access your lessons and packs.'}
            </p>

            <div className="flex justify-center">
              <LanguageToggle />
            </div>

            <div className="flex justify-center">
              <LoginButton size="large" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
