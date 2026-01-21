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

      if (user.cookie_consent === 'accepted') {
        // Server has accepted → sync to local
        syncFromServer('accepted');
      } else if (consentStatus === 'accepted') {
        // Local has accepted but server doesn't → try to push to server
        // Server returns the actual saved consent in response
        axios.post('/api/cookie-consent', { consent: 'accepted' })
          .then((response) => {
            // Server returns { consent: 'accepted' } if saved, { consent: null } for test accounts
            syncFromServer(response.data.consent);
          })
          .catch((error) => {
            console.error('Failed to sync cookie consent to server:', error);
          });
      }
      // If both are null/pending, do nothing - banner will show
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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">
            {language === 'fr' ? 'Cookies et confidentialité' : 'Cookies & Privacy'}
          </h2>
        </div>

        <p className="text-slate-300 text-sm text-center mb-6 leading-relaxed">
          {language === 'fr'
            ? 'Nous utilisons des cookies pour analyser l\'utilisation de la plateforme et l\'améliorer. Acceptez-vous le suivi de votre navigation ?'
            : 'We use cookies to analyze platform usage and improve it. Do you accept tracking of your browsing?'}
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleRefuse}
            className="flex-1 px-4 py-3 text-sm font-medium rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
          >
            {language === 'fr' ? 'Refuser' : 'Refuse'}
          </button>
          <button
            onClick={handleAccept}
            className="flex-1 px-4 py-3 text-sm font-medium rounded-xl bg-green-600 hover:bg-green-500 text-white transition-colors"
          >
            {language === 'fr' ? 'Accepter' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  );
}
