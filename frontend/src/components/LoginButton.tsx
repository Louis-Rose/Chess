import { GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useState } from 'react';

export function LoginButton({ size = 'medium' }: { size?: 'small' | 'medium' | 'large' }) {
  const { login } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const handleSuccess = async (credential: string | undefined) => {
    setError(null);
    try {
      if (credential) {
        await login(credential);
        navigate('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  const handleError = () => setError('Google login failed');

  const h = size === 'large' ? 'h-[56px] min-h-[56px] max-h-[56px]' : 'h-[48px] min-h-[48px] max-h-[48px]';

  return (
    <div className={`relative ${h} flex items-center justify-center overflow-hidden`}>
      {/* Render both locales, show only the active one */}
      {(['en', 'fr'] as const).map(lang => (
        <div key={lang} className={language === lang ? '' : 'absolute pointer-events-none opacity-0 h-0 overflow-hidden'}>
          <GoogleLogin
            locale={lang}
            onSuccess={cr => handleSuccess(cr.credential)}
            onError={handleError}
            size={size}
            theme="outline"
            text="signin"
            shape="rectangular"
          />
        </div>
      ))}
      {error && (
        <div className="absolute top-full mt-2 right-0 bg-red-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  );
}
