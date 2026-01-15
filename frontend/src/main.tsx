import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GoogleOAuthProvider } from '@react-oauth/google'
import axios from 'axios'
import { AuthProvider } from './contexts/AuthContext'
import { LanguageProvider } from './contexts/LanguageContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { CookieConsentProvider } from './contexts/CookieConsentContext'
import { ConditionalPostHog } from './components/ConditionalPostHog'
import { CookieBanner } from './components/CookieBanner'
import './index.css'
import App from './App.tsx'

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
        <CookieConsentProvider>
          <ConditionalPostHog>
            <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
              <QueryClientProvider client={queryClient}>
                <AuthProvider>
                  <BrowserRouter>
                    <App />
                    <CookieBanner />
                  </BrowserRouter>
                </AuthProvider>
              </QueryClientProvider>
            </GoogleOAuthProvider>
          </ConditionalPostHog>
        </CookieConsentProvider>
      </LanguageProvider>
    </ThemeProvider>
  </StrictMode>
)

