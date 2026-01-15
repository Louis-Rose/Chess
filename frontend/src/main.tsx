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


// const options = {
//   api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
//   defaults: '2025-11-30',
// } as const

// 👇 UPDATED OPTIONS
const options = {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  // This explicitly handles the property causing your error
  person_profiles: 'identified_only', 
  // Remove 'defaults' - it is not a valid PostHog config
} as const

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PostHogProvider apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY} options={options}>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <LanguageProvider>
              <AuthProvider>
                <BrowserRouter>
                  <App />
                </BrowserRouter>
              </AuthProvider>
            </LanguageProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </GoogleOAuthProvider>
    </PostHogProvider>
  </StrictMode>
)

