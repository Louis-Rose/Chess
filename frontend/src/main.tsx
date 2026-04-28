import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { PostHogProvider } from 'posthog-js/react'
import axios from 'axios'
import { AuthProvider } from './contexts/AuthContext'
import { LanguageProvider } from './contexts/LanguageContext'
import { CookieConsentProvider } from './contexts/CookieConsentContext'
import posthog from 'posthog-js'
import './index.css'
import App from './App.tsx'

// Always dark mode
document.documentElement.classList.add('dark')

// Allow opting out of tracking via ?no_track URL param (persists in localStorage)
if (new URLSearchParams(window.location.search).has('no_track')) {
  posthog.opt_out_capturing()
}

const isPostHogExcluded = localStorage.getItem('posthog-excluded') === 'true'

const posthogOptions = {
  api_host: window.location.origin + '/ph',
  ui_host: 'https://eu.posthog.com',
  person_profiles: 'identified_only' as const,
  session_idle_timeout_seconds: 600,
  enable_recording_console_log: false,
  // Auto-capture $pageview on SPA route changes (pushState / popstate).
  // Also gives rrweb a clean segment boundary so session replays don't
  // stack DOM from two routes on top of each other.
  capture_pageview: 'history_change' as const,
  capture_pageleave: true,
  session_recording: {
    maskAllInputs: false,
    maskTextSelector: '',
  },
}

axios.defaults.withCredentials = true

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 30,
      gcTime: 1000 * 60 * 60,
      refetchOnWindowFocus: false,
    },
  },
})

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

const appTree = (
  <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </GoogleOAuthProvider>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <CookieConsentProvider>
        {isPostHogExcluded ? appTree : (
          <PostHogProvider
            apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
            options={posthogOptions}
          >
            {appTree}
          </PostHogProvider>
        )}
      </CookieConsentProvider>
    </LanguageProvider>
  </StrictMode>
)
