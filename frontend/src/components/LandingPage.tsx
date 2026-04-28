import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ScanLine, Users, Calendar } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { LumnaLogo } from '../apps/chesscoaches/components/LumnaBrand';
import { SiteNav } from './SiteNav';

const COPY = {
  fr: {
    navContact: 'Contact',
    headlineBefore: 'L\'intelligence artificielle au service de',
    headlineAccent: 'vos cours d\'échecs.',
    subhead: 'Le système d\'exploitation IA pour les entraîneurs d\'échecs en ligne. Automatisez la planification, les paiements et le suivi des élèves. Tout au même endroit.',
    cta: 'Réserver une démo',
    featuresTitle: 'Conçu pour les entraîneurs d\'échecs',
    f1Title: 'Calendrier et suivi des paiements',
    f1Body: 'Planifiez vos cours et suivez les paiements de vos élèves en un coup d\'œil.',
    f2Title: 'Gestion des élèves et des devoirs',
    f2Body: 'Centralisez profils, leçons et devoirs de vos élèves au même endroit.',
    f3Title: 'Scanner de positions et feuilles de partie',
    f3Body: 'Photographiez n\'importe quel diagramme ou feuille de partie : LUMNA les numérise en quelques secondes.',
    testimonialsTitle: 'Ils nous font confiance',
    testimonialQuote: "We're using it at our academy to manage our virtual classes. I recommend it for organizing the chaos that coaches often face when managing their weekly tasks. Schedule classes, manage students and payments, prepare lessons, assign tasks, digitize chess books. All in one place.",
    testimonialRole: 'FIDE Instructor · Chess Teacher · Writer',
    footerTagline: 'Outils d\'IA pour les entraîneurs d\'échecs.',
  },
  es: {
    navContact: 'Contacto',
    headlineBefore: 'Inteligencia artificial al servicio de',
    headlineAccent: 'tus clases de ajedrez.',
    subhead: 'El sistema operativo con IA para entrenadores de ajedrez online. Automatiza la planificación, los pagos y el seguimiento de alumnos. Todo en un solo lugar.',
    cta: 'Reservar una demo',
    featuresTitle: 'Diseñado para entrenadores de ajedrez',
    f1Title: 'Calendario y seguimiento de pagos',
    f1Body: 'Planifica las clases y controla los pagos de tus alumnos de un vistazo.',
    f2Title: 'Gestión de alumnos y deberes',
    f2Body: 'Perfiles, lecciones y deberes de tus alumnos en un único lugar.',
    f3Title: 'Escáner de posiciones y planillas',
    f3Body: 'Fotografía cualquier diagrama o planilla: LUMNA los digitaliza en segundos.',
    testimonialsTitle: 'Confían en nosotros',
    testimonialQuote: "We're using it at our academy to manage our virtual classes. I recommend it for organizing the chaos that coaches often face when managing their weekly tasks. Schedule classes, manage students and payments, prepare lessons, assign tasks, digitize chess books. All in one place.",
    testimonialRole: 'FIDE Instructor · Chess Teacher · Writer',
    footerTagline: 'Herramientas de IA para entrenadores de ajedrez.',
  },
  en: {
    navContact: 'Contact',
    headlineBefore: 'Artificial intelligence to power',
    headlineAccent: 'your chess lessons.',
    subhead: 'The AI operating system for online chess coaches. Automate scheduling, payments, and student tracking. All in one place.',
    cta: 'Book a demo',
    featuresTitle: 'Built for chess coaches',
    f1Title: 'Calendar & payments monitoring',
    f1Body: 'Schedule lessons and keep an eye on every student\'s payments at a glance.',
    f2Title: 'Student & homework management',
    f2Body: 'Profiles, lessons, and homework for every student in one place.',
    f3Title: 'Positions & Scoresheets scanner',
    f3Body: 'Snap any diagram or scoresheet: LUMNA digitizes them in seconds.',
    testimonialsTitle: 'Trusted by coaches',
    testimonialQuote: "We're using it at our academy to manage our virtual classes. I recommend it for organizing the chaos that coaches often face when managing their weekly tasks. Schedule classes, manage students and payments, prepare lessons, assign tasks, digitize chess books. All in one place.",
    testimonialRole: 'FIDE Instructor · Chess Teacher · Writer',
    footerTagline: 'AI tools for chess coaches.',
  },
};

export function LandingPage() {
  const { language } = useLanguage();
  const t = COPY[language];

  useEffect(() => {
    document.title = 'LUMNA · AI for Chess Coaches';
  }, []);

  return (
    <div className="min-h-dvh bg-slate-900 text-slate-100 font-sans">
      <SiteNav />

      <main className="relative">
        <BackgroundGlow />
        <div className="relative max-w-7xl mx-auto px-6 lg:px-12 pt-10 pb-4 lg:pt-12 lg:pb-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
                {t.headlineBefore}{' '}
                <span className="text-emerald-400">{t.headlineAccent}</span>
              </h1>
              <p className="mt-6 text-lg text-slate-400 max-w-xl leading-relaxed">{t.subhead}</p>
              <div className="mt-10 max-w-xl flex flex-wrap items-center justify-center gap-4">
                <Link
                  to="/contact"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors shadow-lg shadow-emerald-600/20"
                >
                  {t.cta}
                </Link>
              </div>
            </div>

            <DemoCard />
          </div>
        </div>

        <TestimonialsSection t={t} />
        <FeaturesSection t={t} />
      </main>

      <Footer t={t} />
    </div>
  );
}

function BackgroundGlow() {
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[80rem] h-[40rem] rounded-full bg-emerald-600/10 blur-3xl" />
    </div>
  );
}

function DemoCard() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 bg-emerald-600/10 blur-2xl rounded-3xl" aria-hidden />
      <div className="relative rounded-2xl overflow-hidden border border-slate-700 bg-slate-800/60 shadow-2xl aspect-video">
        <iframe
          src="https://www.loom.com/embed/46aba7d1ebf14efcbf9469ca9813ad50?autoplay=0&muted=0&hide_owner=true&hide_share=true&hide_title=true&hideEmbedTopBar=true&hide_reactions=true&disable_reactions=true"
          allow="autoplay; fullscreen"
          allowFullScreen
          title="LUMNA demo"
          className="absolute inset-0 w-full h-full"
        />
      </div>
    </div>
  );
}

function FeaturesSection({ t }: { t: typeof COPY['en'] }) {
  const features = [
    { icon: Calendar, title: t.f1Title, body: t.f1Body },
    { icon: Users, title: t.f2Title, body: t.f2Body },
    { icon: ScanLine, title: t.f3Title, body: t.f3Body },
  ];
  return (
    <section id="features" className="border-t border-slate-800 bg-slate-900/60">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 pt-6 pb-10 lg:pt-8 lg:pb-14">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center">{t.featuresTitle}</h2>
        <div className="mt-8 grid md:grid-cols-3 gap-6">
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

function TestimonialsSection({ t }: { t: typeof COPY['en'] }) {
  return (
    <section className="border-t border-slate-800">
      <div className="max-w-6xl mx-auto px-6 lg:px-12 py-8 lg:py-10">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center">{t.testimonialsTitle}</h2>
        <figure className="mt-6 rounded-2xl border border-slate-700 bg-slate-800/40 p-5 sm:p-6">
          <figcaption className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center font-semibold text-sm">
              EG
            </div>
            <div>
              <div className="font-semibold text-white text-sm">E. G. S.</div>
              <div className="text-xs text-slate-400">{t.testimonialRole}</div>
            </div>
          </figcaption>
          <blockquote className="text-sm sm:text-base text-slate-200 leading-relaxed">
            <span aria-hidden className="text-emerald-500 font-serif mr-0.5">“</span>
            {t.testimonialQuote}
            <span aria-hidden className="text-emerald-500 font-serif ml-0.5">”</span>
          </blockquote>
        </figure>
      </div>
    </section>
  );
}

function Footer({ t }: { t: typeof COPY['en'] }) {
  return (
    <footer id="contact" className="border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-10 flex flex-col items-center gap-3 text-white">
        <div className="flex items-center gap-2">
          <LumnaLogo className="w-8 h-8" />
          <span className="text-lg font-bold tracking-wide">LUMNA</span>
        </div>
        <span className="text-lg">{t.footerTagline}</span>
      </div>
    </footer>
  );
}
