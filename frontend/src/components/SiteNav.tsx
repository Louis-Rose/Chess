import { Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { LumnaLogo } from '../apps/chesscoaches/components/LumnaBrand';
import { LanguageToggle } from '../apps/chesscoaches/components/LanguageToggle';

const COPY = {
  fr: { signIn: 'Tester le produit', cta: 'Réserver une démo' },
  es: { signIn: 'Probar el producto', cta: 'Reservar una demo' },
  en: { signIn: 'Try the product', cta: 'Book a demo' },
};

export function SiteNav() {
  const { language } = useLanguage();
  const t = COPY[language];

  return (
    <header className="sticky top-0 z-40 backdrop-blur bg-slate-900/80 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-6 lg:px-12 h-16 flex items-center">
        <div className="flex-1 flex">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <LumnaLogo className="w-7 h-7" />
            <span className="text-lg font-bold tracking-wide">LUMNA</span>
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/contact"
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            {t.cta}
          </Link>
          <Link
            to="/app"
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-100 transition-colors"
          >
            {t.signIn}
          </Link>
        </div>
        <div className="flex-1 flex justify-end">
          <LanguageToggle flagsOnly />
        </div>
      </div>
    </header>
  );
}
