import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useState, useEffect, useRef } from 'react';

export function LoginButton() {
  const { login } = useAuth();
  const { language } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const prevLang = useRef(language);

  // Detect language change synchronously during render
  if (prevLang.current !== language) {
    prevLang.current = language;
    setVisible(false);
  }

  // Re-show after Google SDK has time to reinitialize
  useEffect(() => {
    if (!visible) {
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  return (
    <div className="relative h-[48px] min-h-[48px] max-h-[48px] flex items-center justify-center overflow-hidden">
      <div className={visible ? 'opacity-100' : 'opacity-0'}>
        <GoogleLogin
          key={language}
          locale={language === 'fr' ? 'fr' : 'en'}
          onSuccess={async (credentialResponse) => {
            setError(null);
            try {
              if (credentialResponse.credential) {
                await login(credentialResponse.credential);
              }
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Login failed');
            }
          }}
          onError={() => {
            setError('Google login failed');
          }}
          size="medium"
          theme="outline"
          text="signin"
          shape="rectangular"
        />
      </div>
      {error && (
        <div className="absolute top-full mt-2 right-0 bg-red-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  );
}
