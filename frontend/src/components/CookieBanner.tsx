// Cookie consent banner for GDPR/CNIL compliance

import { useEffect, useRef } from 'react';
import axios from 'axios';
import { useCookieConsent } from '../contexts/CookieConsentContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

export function CookieBanner() {
  const { consentStatus, acceptCookies, refuseCookies, syncFromServer } = useCookieConsent();
  const { language } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const hasSyncedRef = useRef(false);

  // Sync consent between local and server when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user && !hasSyncedRef.current) {
      hasSyncedRef.current = true;
      // If user has accepted on server, sync to local state
      if (user.cookie_consent === 'accepted') {
        syncFromServer('accepted');
      }
      // If user accepted locally before logging in, sync to server
      else if (consentStatus === 'accepted' && user.cookie_consent !== 'accepted') {
        axios.post('/api/cookie-consent', { consent: 'accepted' }).catch((error) => {
          console.error('Failed to sync cookie consent to server:', error);
        });
      }
    }
    // Reset sync flag when user logs out
    if (!isAuthenticated) {
      hasSyncedRef.current = false;
    }
  }, [isAuthenticated, user, syncFromServer, consentStatus]);

  const handleAccept = async () => {
    acceptCookies();
    // Save to server if logged in
    if (isAuthenticated) {
      try {
        await axios.post('/api/cookie-consent', { consent: 'accepted' });
      } catch (error) {
        console.error('Failed to save cookie consent:', error);
      }
    }
  };

  const handleRefuse = async () => {
    refuseCookies();
    // Save to server if logged in (server ignores refusals, but we send for consistency)
    if (isAuthenticated) {
      try {
        await axios.post('/api/cookie-consent', { consent: 'refused' });
      } catch (error) {
        console.error('Failed to save cookie consent:', error);
      }
    }
  };

  if (consentStatus !== 'pending') {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 p-4 z-50 shadow-lg">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-slate-300 text-sm text-center sm:text-left">
          {language === 'fr'
            ? 'Nous utilisons des cookies pour analyser l\'utilisation de la plateforme et l\'améliorer. Acceptez-vous le suivi de votre navigation ?'
            : 'We use cookies to analyze platform usage and improve it. Do you accept tracking of your browsing?'}
        </p>
        <div className="flex gap-3 flex-shrink-0">
          <button
            onClick={handleRefuse}
            className="px-4 py-2 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >
            {language === 'fr' ? 'Refuser' : 'Refuse'}
          </button>
          <button
            onClick={handleAccept}
            className="px-4 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors"
          >
            {language === 'fr' ? 'Accepter' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  );
}
