// Shared LUMNA brand block — logo + title + subtitle, used on login and homepage

import { useLanguage } from '../../../contexts/LanguageContext';

export function LumnaLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 128" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="8" width="112" height="112" rx="20" fill="#16a34a"/>
      <rect x="32" y="64" width="16" height="40" rx="2" fill="white"/>
      <rect x="56" y="48" width="16" height="56" rx="2" fill="white"/>
      <rect x="80" y="32" width="16" height="72" rx="2" fill="white"/>
    </svg>
  );
}

export function LumnaBrand() {
  const { t } = useLanguage();
  return (
    <a href="/coach" className="flex flex-col items-center hover:opacity-80 transition-opacity">
      <div className="relative flex items-center">
        <LumnaLogo className="w-9 h-9 absolute -left-11" />
        <span className="text-2xl font-bold text-white tracking-wide">LUMNA</span>
      </div>
      <span className="text-lg font-bold text-slate-100 mt-1">{t('coaches.title')}</span>
    </a>
  );
}
