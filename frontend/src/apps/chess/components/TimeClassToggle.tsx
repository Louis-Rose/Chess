import type { TimeClass } from '../utils/types';
import { useLanguage } from '../../../contexts/LanguageContext';

export function TimeClassToggle({ selected, onChange }: { selected: TimeClass; onChange: (tc: TimeClass) => void }) {
  const { language } = useLanguage();

  return (
    <div className="relative flex bg-slate-700 rounded-lg p-1">
      <div
        className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-slate-500 rounded-md transition-transform duration-200 ease-in-out"
        style={{ transform: selected === 'rapid' ? 'translateX(0)' : 'translateX(100%)' }}
      />
      <button
        onClick={() => onChange('rapid')}
        className={`relative z-10 flex-1 px-4 py-1 text-sm font-medium rounded-md text-center transition-colors ${
          selected === 'rapid' ? 'text-white' : 'text-slate-400'
        }`}
      >
        {language === 'fr' ? 'Rapide' : 'Rapid'}
      </button>
      <button
        onClick={() => onChange('blitz')}
        className={`relative z-10 flex-1 px-4 py-1 text-sm font-medium rounded-md text-center transition-colors ${
          selected === 'blitz' ? 'text-white' : 'text-slate-400'
        }`}
      >
        Blitz
      </button>
    </div>
  );
}
