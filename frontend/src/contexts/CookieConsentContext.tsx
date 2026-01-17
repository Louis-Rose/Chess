// Cookie consent context for GDPR/CNIL compliance
//
// Consent logic:
// - 'accepted': stored in localStorage AND server (permanent)
// - 'refused': NOT stored anywhere - user will be asked again next session
// - 'pending': default state, shows banner

import { createContext, useContext, useState, type ReactNode } from 'react';

type ConsentStatus = 'pending' | 'accepted' | 'refused';

interface CookieConsentContextType {
  consentStatus: ConsentStatus;
  acceptCookies: () => void;
  refuseCookies: () => void;
  syncFromServer: (serverConsent: string | null) => void;
  resetConsent: () => void;
}

const CookieConsentContext = createContext<CookieConsentContextType | null>(null);

const STORAGE_KEY = 'cookie-consent';

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  // Only load 'accepted' from localStorage - refused is not persisted
  const [consentStatus, setConsentStatus] = useState<ConsentStatus>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'accepted') {
        return 'accepted';
      }
    }
    return 'pending';
  });

  // Accept cookies - store in localStorage (server call done separately)
  const acceptCookies = () => {
    setConsentStatus('accepted');
    localStorage.setItem(STORAGE_KEY, 'accepted');
  };

  // Refuse cookies - don't persist, just for current session
  const refuseCookies = () => {
    setConsentStatus('refused');
    // Don't store in localStorage - will be 'pending' next session
  };

  // Sync consent from server (called when user logs in)
  const syncFromServer = (serverConsent: string | null) => {
    if (serverConsent === 'accepted') {
      setConsentStatus('accepted');
      localStorage.setItem(STORAGE_KEY, 'accepted');
    }
    // If server has no consent, keep current local state
  };

  const resetConsent = () => {
    localStorage.removeItem(STORAGE_KEY);
    setConsentStatus('pending');
  };

  return (
    <CookieConsentContext.Provider
      value={{ consentStatus, acceptCookies, refuseCookies, syncFromServer, resetConsent }}
    >
      {children}
    </CookieConsentContext.Provider>
  );
}

export function useCookieConsent() {
  const context = useContext(CookieConsentContext);
  if (!context) {
    throw new Error('useCookieConsent must be used within a CookieConsentProvider');
  }
  return context;
}
