import { useRef, useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, config: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export function LoginButton({ size = 'medium' }: { size?: 'small' | 'medium' | 'large' }) {
  const { login } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const enRef = useRef<HTMLDivElement>(null);
  const frRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  const handleCredential = useCallback(async (response: { credential?: string }) => {
    setError(null);
    try {
      if (response.credential) {
        await login(response.credential);
        navigate('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }, [login, navigate]);

  useEffect(() => {
    if (initializedRef.current) return;

    const render = () => {
      const g = window.google;
      if (!g || !enRef.current || !frRef.current) return;

      g.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: handleCredential,
        auto_select: true,
        use_fedcm_for_button: true,
        use_fedcm_for_prompt: true,
      });

      const btnConfig = { size, theme: 'outline', text: 'signin', shape: 'rectangular' };

      g.accounts.id.renderButton(enRef.current, { ...btnConfig, locale: 'en' });
      g.accounts.id.renderButton(frRef.current, { ...btnConfig, locale: 'fr' });

      initializedRef.current = true;

      // Watch for the iframe to reach its final size, then reveal
      const observer = new MutationObserver(() => {
        const iframe = enRef.current?.querySelector('iframe') || frRef.current?.querySelector('iframe');
        if (iframe && iframe.offsetHeight > 40) {
          setReady(true);
          observer.disconnect();
        }
      });
      observer.observe(enRef.current, { childList: true, subtree: true, attributes: true });
      observer.observe(frRef.current, { childList: true, subtree: true, attributes: true });

      // Fallback: show after 1.5s no matter what
      setTimeout(() => { setReady(true); observer.disconnect(); }, 1500);
    };

    if (window.google) {
      render();
    } else {
      const interval = setInterval(() => {
        if (window.google) { clearInterval(interval); render(); }
      }, 50);
      return () => clearInterval(interval);
    }
  }, [handleCredential, size]);

  const h = size === 'large' ? 'h-[56px] min-h-[56px] max-h-[56px]' : 'h-[48px] min-h-[48px] max-h-[48px]';

  return (
    <div className={`relative ${h} flex items-center justify-center overflow-hidden transition-opacity duration-300 ${ready ? 'opacity-100' : 'opacity-0'}`}>
      <div ref={enRef} className={language === 'en' ? '' : 'absolute pointer-events-none opacity-0 h-0 overflow-hidden'} />
      <div ref={frRef} className={language === 'fr' ? '' : 'absolute pointer-events-none opacity-0 h-0 overflow-hidden'} />
      {error && (
        <div className="absolute top-full mt-2 right-0 bg-red-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  );
}
