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
      {/* One flex-wrap row that reflows by breakpoint:
          - mobile: brand + language on line 1, the two buttons wrap to line 2
            (full width, equal halves, centered).
          - sm+: single h-16 row — brand left, buttons + language on the right. */}
      <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-wrap items-center gap-y-3 py-3 sm:py-0 sm:h-16">
        <Link to="/" aria-label="LUMNA home" className="order-1 mr-auto flex items-center gap-2 hover:opacity-80 transition-opacity">
          <LumnaLogo className="w-7 h-7" />
          <span className="text-lg font-bold tracking-wide">LUMNA</span>
        </Link>

        <div className="order-2 sm:order-3 sm:ml-3">
          <LanguageToggle flagsOnly />
        </div>

        <div className="order-3 sm:order-2 w-full sm:w-auto grid grid-cols-2 items-center gap-3 sm:flex">
          <Link
            to="/contact"
            className="justify-self-center w-full max-w-[11rem] sm:w-auto sm:max-w-none inline-flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            {t.cta}
          </Link>
          <Link
            to="/chess/app"
            className="justify-self-center w-full max-w-[11rem] sm:w-auto sm:max-w-none inline-flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-100 transition-colors"
          >
            {t.signIn}
          </Link>
        </div>
      </div>
    </header>
  );
}
