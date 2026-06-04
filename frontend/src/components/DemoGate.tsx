import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import axios from 'axios';
import { useLanguage } from '../contexts/LanguageContext';
import { LumnaLogo } from '../apps/chesscoaches/components/LumnaBrand';
import { LanguageToggle } from '../apps/chesscoaches/components/LanguageToggle';

const STORAGE_KEY = 'demo-gate-passed';

const COPY = {
  fr: {
    title: 'Accès restreint',
    subtitle: 'Entrez le mot de passe pour tester le produit.',
    placeholder: 'Mot de passe',
    submit: 'Accéder',
    submitting: 'Vérification…',
    errorWrong: 'Mot de passe incorrect.',
    errorRate: 'Trop de tentatives. Réessayez dans une minute.',
    errorGeneric: 'Une erreur est survenue. Réessayez.',
  },
  es: {
    title: 'Acceso restringido',
    subtitle: 'Introduce la contraseña para probar el producto.',
    placeholder: 'Contraseña',
    submit: 'Acceder',
    submitting: 'Comprobando…',
    errorWrong: 'Contraseña incorrecta.',
    errorRate: 'Demasiados intentos. Vuelve a intentarlo en un minuto.',
    errorGeneric: 'Ha ocurrido un error. Inténtalo de nuevo.',
  },
  en: {
    title: 'Restricted access',
    subtitle: 'Enter the password to try the product.',
    placeholder: 'Password',
    submit: 'Enter',
    submitting: 'Checking…',
    errorWrong: 'Incorrect password.',
    errorRate: 'Too many attempts. Try again in a minute.',
    errorGeneric: 'Something went wrong. Please try again.',
  },
};

export function DemoGate({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const t = COPY[language];

  const [unlocked, setUnlocked] = useState(() => localStorage.getItem(STORAGE_KEY) === '1');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (unlocked) return <>{children}</>;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await axios.post('/api/demo-gate', { password });
      localStorage.setItem(STORAGE_KEY, '1');
      setUnlocked(true);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) setError(t.errorWrong);
      else if (status === 429) setError(t.errorRate);
      else setError(t.errorGeneric);
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 font-sans flex flex-col">
      <header className="sticky top-0 z-40 backdrop-blur bg-slate-900/80 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 h-16 flex items-center">
          <div className="flex-1 flex">
            <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <LumnaLogo className="w-7 h-7" />
              <span className="text-lg font-bold tracking-wide">LUMNA</span>
            </Link>
          </div>
          <div className="flex-1 flex justify-end">
            <LanguageToggle flagsOnly />
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center mx-auto mb-6">
            <Lock className="w-6 h-6 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-center mb-2">{t.title}</h1>
          <p className="text-sm text-slate-400 text-center mb-8">{t.subtitle}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t.placeholder}
              className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-100 placeholder-slate-500"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !password.trim()}
              className="w-full px-4 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold transition-colors"
            >
              {submitting ? t.submitting : t.submit}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
