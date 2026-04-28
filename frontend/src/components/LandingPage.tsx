import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, Grid3X3, Users, Calendar } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { LumnaLogo } from '../apps/chesscoaches/components/LumnaBrand';
import { LanguageToggle } from '../apps/chesscoaches/components/LanguageToggle';
import { BoardPreview } from '../apps/chesscoaches/components/BoardPreview';

const COPY = {
  fr: {
    navProduct: 'Produit',
    navAbout: 'À propos',
    navContact: 'Contact',
    signIn: 'Espace beta',
    bookDemo: 'Demander une démo',
    badge: 'IA pour entraîneurs d\'échecs',
    headlineBefore: 'L\'intelligence artificielle au service de',
    headlineAccent: 'vos cours d\'échecs.',
    subhead: 'Gagnez du temps sur la préparation, la correction et le suivi de vos élèves grâce à des outils dédiés.',
    cta: 'Demander un accès',
    livePill: 'Conversion en direct',
    inputLabel: 'Diagramme',
    outputLabel: 'Position numérique',
    featuresTitle: 'Conçu pour les entraîneurs d\'échecs',
    f1Title: 'Diagramme vers FEN',
    f1Body: 'Photographiez n\'importe quel diagramme : LUMNA reconstruit la position en quelques secondes.',
    f2Title: 'Suivi des élèves',
    f2Body: 'Centralisez les profils, leçons et paiements de vos élèves au même endroit.',
    f3Title: 'Calendrier intégré',
    f3Body: 'Planifiez vos cours et suivez votre activité en un coup d\'œil.',
    footerTagline: 'Outils d\'IA pour les entraîneurs d\'échecs.',
  },
  es: {
    navProduct: 'Producto',
    navAbout: 'Acerca de',
    navContact: 'Contacto',
    signIn: 'Acceso beta',
    bookDemo: 'Reservar demo',
    badge: 'IA para entrenadores de ajedrez',
    headlineBefore: 'Inteligencia artificial al servicio de',
    headlineAccent: 'tus clases de ajedrez.',
    subhead: 'Ahorra tiempo en preparación, corrección y seguimiento de tus alumnos con herramientas dedicadas.',
    cta: 'Solicitar acceso',
    livePill: 'Conversión en vivo',
    inputLabel: 'Diagrama',
    outputLabel: 'Posición digital',
    featuresTitle: 'Diseñado para entrenadores de ajedrez',
    f1Title: 'Diagrama a FEN',
    f1Body: 'Fotografía cualquier diagrama: LUMNA reconstruye la posición en segundos.',
    f2Title: 'Seguimiento de alumnos',
    f2Body: 'Perfiles, lecciones y pagos de tus alumnos en un único lugar.',
    f3Title: 'Calendario integrado',
    f3Body: 'Planifica las clases y consulta tu actividad de un vistazo.',
    footerTagline: 'Herramientas de IA para entrenadores de ajedrez.',
  },
  en: {
    navProduct: 'Product',
    navAbout: 'About',
    navContact: 'Contact',
    signIn: 'Beta access',
    bookDemo: 'Book a demo',
    badge: 'AI for chess coaches',
    headlineBefore: 'Artificial intelligence to power',
    headlineAccent: 'your chess lessons.',
    subhead: 'Save time on lesson prep, correction, and student tracking with tools built for coaches.',
    cta: 'Request access',
    livePill: 'Live conversion',
    inputLabel: 'Diagram',
    outputLabel: 'Digital position',
    featuresTitle: 'Built for chess coaches',
    f1Title: 'Diagram to FEN',
    f1Body: 'Snap any diagram: LUMNA reconstructs the exact position in seconds.',
    f2Title: 'Student tracking',
    f2Body: 'Profiles, lessons, and payments for every student in one place.',
    f3Title: 'Built-in calendar',
    f3Body: 'Schedule lessons and review activity at a glance.',
    footerTagline: 'AI tools for chess coaches.',
  },
};

const DEMO_FEN = 'r3k2r/pp1n1ppp/2p1pn2/q2p4/1bPP4/2NBPN2/PP3PPP/R1BQ1RK1 w kq - 0 1';

export function LandingPage() {
  const { user, isLoading } = useAuth();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const t = COPY[language];

  useEffect(() => {
    document.title = 'LUMNA — AI for Chess Coaches';
  }, []);

  useEffect(() => {
    if (!isLoading && user) navigate('/app', { replace: true });
  }, [isLoading, user, navigate]);

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 font-sans">
      <Nav t={t} />

      <main className="relative">
        <BackgroundGlow />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-12 pt-12 pb-24 lg:pt-20 lg:pb-32">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <Badge text={t.badge} />
              <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
                {t.headlineBefore}{' '}
                <span className="text-emerald-400">{t.headlineAccent}</span>
              </h1>
              <p className="mt-6 text-lg text-slate-400 max-w-xl leading-relaxed">{t.subhead}</p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link
                  to="/contact"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors shadow-lg shadow-emerald-600/20"
                >
                  {t.cta}
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            <DemoCard t={t} />
          </div>
        </div>

        <FeaturesSection t={t} />
      </main>

      <Footer t={t} />
    </div>
  );
}

function Nav({ t }: { t: typeof COPY['en'] }) {
  return (
    <header className="sticky top-0 z-40 backdrop-blur bg-slate-900/80 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <LumnaLogo className="w-7 h-7" />
          <span className="text-lg font-bold tracking-wide">LUMNA</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-slate-300">
          <a href="#features" className="hover:text-white transition-colors">{t.navProduct}</a>
          <a href="#about" className="hover:text-white transition-colors">{t.navAbout}</a>
          <Link to="/contact" className="hover:text-white transition-colors">{t.navContact}</Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link
            to="/app"
            className="hidden sm:inline-flex text-sm text-slate-300 hover:text-white transition-colors px-3 py-2"
          >
            {t.signIn}
          </Link>
          <Link
            to="/contact"
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            {t.bookDemo}
          </Link>
          <LanguageToggle flagsOnly />
        </div>
      </div>
    </header>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-sm font-medium">
      <Sparkles className="w-3.5 h-3.5" />
      {text}
    </span>
  );
}

function BackgroundGlow() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[80rem] h-[40rem] rounded-full bg-emerald-600/10 blur-3xl" />
    </div>
  );
}

function DemoCard({ t }: { t: typeof COPY['en'] }) {
  return (
    <div className="relative">
      <div className="absolute -inset-4 bg-emerald-600/10 blur-2xl rounded-3xl" aria-hidden />
      <div className="relative rounded-2xl border border-slate-700 bg-slate-800/60 backdrop-blur p-4 sm:p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">LUMNA · Diagram → FEN</span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {t.livePill}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{t.inputLabel}</div>
            <div className="rounded-lg overflow-hidden border border-slate-700 bg-slate-900 aspect-square">
              <img
                src="/cropping_example.jpeg"
                alt=""
                className="w-full h-full object-cover"
                loading="eager"
              />
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">{t.outputLabel}</div>
            <div className="rounded-lg overflow-hidden border border-slate-700 aspect-square">
              <BoardPreview fen={DEMO_FEN} />
            </div>
          </div>
        </div>

        <div className="mt-4 px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-xs text-slate-400 overflow-x-auto whitespace-nowrap">
          {DEMO_FEN}
        </div>
      </div>
    </div>
  );
}

function FeaturesSection({ t }: { t: typeof COPY['en'] }) {
  const features = [
    { icon: Grid3X3, title: t.f1Title, body: t.f1Body },
    { icon: Users, title: t.f2Title, body: t.f2Body },
    { icon: Calendar, title: t.f3Title, body: t.f3Body },
  ];
  return (
    <section id="features" className="border-t border-slate-800 bg-slate-900/60">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-20 lg:py-28">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-center">{t.featuresTitle}</h2>
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          {features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-slate-700 bg-slate-800/40 p-6 hover:border-emerald-500/40 hover:bg-slate-800/70 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-emerald-600/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm text-slate-400 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer({ t }: { t: typeof COPY['en'] }) {
  return (
    <footer id="contact" className="border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <LumnaLogo className="w-6 h-6" />
          <span className="text-sm font-bold tracking-wide">LUMNA</span>
          <span className="text-sm text-slate-500 ml-2">— {t.footerTagline}</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-slate-400">
          <a href="mailto:rose.louis.mail@gmail.com" className="hover:text-white transition-colors">
            rose.louis.mail@gmail.com
          </a>
          <Link to="/app" className="hover:text-white transition-colors">{t.signIn}</Link>
        </div>
      </div>
    </footer>
  );
}
