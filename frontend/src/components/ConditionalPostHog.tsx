// Conditional PostHog provider - only loads when consent is given

import { useEffect, type ReactNode } from 'react';
import { PostHogProvider } from 'posthog-js/react';
import posthog from 'posthog-js';
import { useCookieConsent } from '../contexts/CookieConsentContext';

const posthogOptions = {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  person_profiles: 'identified_only' as const,
  session_idle_timeout_seconds: 600,
  session_recording: {
    maskInputFn: (text: string, element: HTMLElement | null) => {
      // Don't mask search inputs (stock search, etc.)
      const placeholder = element?.getAttribute('placeholder')?.toLowerCase() || '';
      if (
        element?.getAttribute('type') === 'search' ||
        placeholder.includes('search') ||
        placeholder.includes('rechercher') ||
        element?.getAttribute('data-ph-unmask') === 'true'
      ) {
        return text;
      }
      // Mask everything else (passwords, etc.)
      return '*'.repeat(text.length);
    },
  },
};

interface ConditionalPostHogProps {
  children: ReactNode;
}

export function ConditionalPostHog({ children }: ConditionalPostHogProps) {
  const { consentStatus } = useCookieConsent();

  useEffect(() => {
    // If user refuses, opt out of capturing
    if (consentStatus === 'refused') {
      posthog.opt_out_capturing();
    }
    // If user accepts after refusing, opt back in
    if (consentStatus === 'accepted') {
      posthog.opt_in_capturing();
    }
  }, [consentStatus]);

  // Only initialize PostHog if consent was given
  if (consentStatus === 'accepted') {
    return (
      <PostHogProvider
        apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
        options={posthogOptions}
      >
        {children}
      </PostHogProvider>
    );
  }

  // No PostHog tracking
  return <>{children}</>;
}
