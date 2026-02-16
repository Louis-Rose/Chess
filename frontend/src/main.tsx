import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { PostHogProvider } from 'posthog-js/react'
import axios from 'axios'
import { AuthProvider } from './contexts/AuthContext'
import { LanguageProvider } from './contexts/LanguageContext'
import { ThemeProvider } from './contexts/ThemeContext'
// Cookie consent temporarily disabled - recording all sessions
// import { CookieConsentProvider } from './contexts/CookieConsentContext'
// import { ConditionalPostHog } from './components/ConditionalPostHog'
// import { CookieBanner } from './components/CookieBanner'
import posthog from 'posthog-js'
import './index.css'
import App from './App.tsx'

// Allow opting out of tracking via ?no_track URL param (persists in localStorage)
if (new URLSearchParams(window.location.search).has('no_track')) {
  posthog.opt_out_capturing()
}

// PostHog config (previously in ConditionalPostHog)
// Note: Minimum session recording duration is configured in PostHog dashboard (Project Settings > Session Replay)
const posthogOptions = {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  person_profiles: 'identified_only' as const,
  session_idle_timeout_seconds: 600,
  enable_recording_console_log: false,
  session_replay_config: {
    captureNetworkTelemetry: false,
    throttleDelayMs: 2000,
    maskAllInputs: false,
  },
}

// Configure axios to always send cookies for authentication
axios.defaults.withCredentials = true

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 30, // Data stays fresh for 30 minutes
      gcTime: 1000 * 60 * 60, // Cache persists for 1 hour
      refetchOnWindowFocus: false,
    },
  },
})

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        {/* Cookie consent temporarily disabled - recording all sessions */}
        <PostHogProvider
          apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
          options={posthogOptions}
        >
          <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <BrowserRouter>
                  <App />
                  {/* <CookieBanner /> */}
                </BrowserRouter>
              </AuthProvider>
            </QueryClientProvider>
          </GoogleOAuthProvider>
        </PostHogProvider>
      </LanguageProvider>
    </ThemeProvider>
  </StrictMode>
)

