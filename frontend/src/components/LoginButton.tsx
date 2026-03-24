import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useState, useEffect, useRef } from 'react';

export function LoginButton() {
  const { login } = useAuth();
  const { language } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const prevLang = useRef(language);

  useEffect(() => {
    if (prevLang.current !== language) {
      prevLang.current = language;
      setHidden(true);
      const timer = setTimeout(() => setHidden(false), 600);
      return () => clearTimeout(timer);
    }
  }, [language]);

  return (
    <div className="relative h-[48px] min-h-[48px] max-h-[48px] flex items-center justify-center overflow-hidden">
      <div className={`transition-opacity duration-200 ${hidden ? 'opacity-0' : 'opacity-100'}`}>
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
