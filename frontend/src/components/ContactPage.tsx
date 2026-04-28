import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Send } from 'lucide-react';
import axios from 'axios';
import { useLanguage } from '../contexts/LanguageContext';
import { SiteNav } from './SiteNav';

const COPY = {
  fr: {
    title: 'Réserver une démo',
    subtitle: 'Remplissez le formulaire et nous reviendrons vers vous sous 48h.',
    name: 'Nom complet',
    namePh: 'James Bond',
    email: 'Email',
    emailPh: 'james@example.com',
    company: 'Entreprise / Club',
    companyOptional: '(optionnel)',
    companyPh: 'Club Échecs Paris',
    message: 'Message',
    messagePh: 'Parlez-nous de votre activité et de vos besoins…',
    submit: 'Envoyer le message',
    submitting: 'Envoi…',
    successTitle: 'Message envoyé !',
    successBody: 'Merci, nous reviendrons vers vous très bientôt.',
    successBack: 'Retour à l\'accueil',
    errorGeneric: 'Une erreur est survenue. Veuillez réessayer.',
    errorRate: 'Trop de tentatives. Réessayez dans une minute.',
    errorEmail: 'Adresse email invalide.',
    errorMessage: 'Le message doit contenir entre 5 et 3000 caractères.',
  },
  es: {
    title: 'Reservar una demo',
    subtitle: 'Rellena el formulario y te responderemos en 48h.',
    name: 'Nombre completo',
    namePh: 'James Bond',
    email: 'Email',
    emailPh: 'james@example.com',
    company: 'Empresa / Club',
    companyOptional: '(opcional)',
    companyPh: 'Club de Ajedrez Madrid',
    message: 'Mensaje',
    messagePh: 'Cuéntanos sobre tu actividad y tus necesidades…',
    submit: 'Enviar mensaje',
    submitting: 'Enviando…',
    successTitle: '¡Mensaje enviado!',
    successBody: 'Gracias, te responderemos muy pronto.',
    successBack: 'Volver al inicio',
    errorGeneric: 'Ha ocurrido un error. Inténtalo de nuevo.',
    errorRate: 'Demasiados intentos. Vuelve a intentarlo en un minuto.',
    errorEmail: 'Email no válido.',
    errorMessage: 'El mensaje debe tener entre 5 y 3000 caracteres.',
  },
  en: {
    title: 'Book a demo',
    subtitle: 'Fill out the form and we\'ll get back to you within 48 hours.',
    name: 'Full name',
    namePh: 'James Bond',
    email: 'Email',
    emailPh: 'james@example.com',
    company: 'Company / Club',
    companyOptional: '(optional)',
    companyPh: 'Paris Chess Club',
    message: 'Message',
    messagePh: 'Tell us about your activity and what you\'re looking for…',
    submit: 'Send message',
    submitting: 'Sending…',
    successTitle: 'Message sent!',
    successBody: 'Thanks. We\'ll get back to you very soon.',
    successBack: 'Back to home',
    errorGeneric: 'Something went wrong. Please try again.',
    errorRate: 'Too many attempts. Try again in a minute.',
    errorEmail: 'Invalid email address.',
    errorMessage: 'Message must be 5–3000 characters.',
  },
};

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function ContactPage() {
  const { language } = useLanguage();
  const t = COPY[language];

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'LUMNA · ' + t.title;
  }, [t.title]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMsg(t.errorEmail);
      return;
    }
    if (message.trim().length < 5 || message.trim().length > 3000) {
      setErrorMsg(t.errorMessage);
      return;
    }

    setStatus('submitting');
    try {
      await axios.post('/api/contact', { name: name.trim(), email: email.trim(), company: company.trim(), message: message.trim(), website });
      setStatus('success');
    } catch (err: unknown) {
      setStatus('error');
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 429) setErrorMsg(t.errorRate);
      else setErrorMsg(t.errorGeneric);
    }
  };

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 font-sans">
      <SiteNav />

      <main className="max-w-2xl mx-auto px-6 lg:px-12 py-16">
        {status === 'success' ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center mx-auto mb-6">
              <Check className="w-8 h-8 text-emerald-400" />
            </div>
            <h1 className="text-3xl font-bold mb-3">{t.successTitle}</h1>
            <p className="text-slate-400 mb-8">{t.successBody}</p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
            >
              {t.successBack}
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-center text-emerald-400">{t.title}</h1>
            <p className="mt-4 text-center text-slate-400">{t.subtitle}</p>

            <form onSubmit={handleSubmit} className="mt-10 space-y-6" noValidate>
              <Field label={t.name} required>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t.namePh}
                  required
                  maxLength={100}
                  className={inputCls}
                />
              </Field>

              <Field label={t.email} required>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t.emailPh}
                  required
                  maxLength={200}
                  className={inputCls}
                />
              </Field>

              <Field label={t.company} hint={t.companyOptional}>
                <input
                  type="text"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  placeholder={t.companyPh}
                  maxLength={100}
                  className={inputCls}
                />
              </Field>

              <Field label={t.message} required>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder={t.messagePh}
                  required
                  minLength={5}
                  maxLength={3000}
                  rows={6}
                  className={inputCls + ' resize-y min-h-[140px]'}
                />
              </Field>

              {/* Honeypot — hidden from users, bots fill it */}
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={e => setWebsite(e.target.value)}
                aria-hidden="true"
                className="hidden"
              />

              {errorMsg && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'submitting'}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold transition-colors shadow-lg shadow-emerald-600/20"
              >
                {status === 'submitting' ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    {t.submitting}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {t.submit}
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}

const inputCls =
  'w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 focus:outline-none text-slate-100 placeholder:text-slate-500 transition-colors';

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-200 mb-2">
        {label}
        {required && <span className="text-emerald-400 ml-0.5">*</span>}
        {hint && <span className="ml-2 text-xs font-normal text-slate-500">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
