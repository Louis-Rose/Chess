import type { TimeClass } from '../utils/types';
import { useLanguage } from '../../../contexts/LanguageContext';

const TIME_CLASSES: { value: TimeClass; labelEn: string; labelFr: string }[] = [
  { value: 'bullet', labelEn: 'Bullet', labelFr: 'Bullet' },
  { value: 'blitz', labelEn: 'Blitz', labelFr: 'Blitz' },
  { value: 'rapid', labelEn: 'Rapid', labelFr: 'Rapide' },
];

export function TimeClassToggle({ selected, onChange, disabled = false }: { selected: TimeClass; onChange: (tc: TimeClass) => void; disabled?: boolean }) {
  const { language } = useLanguage();
  const selectedIdx = TIME_CLASSES.findIndex(tc => tc.value === selected);

  return (
    <div className={`relative inline-flex bg-slate-700 rounded-lg p-1${disabled ? ' opacity-50 pointer-events-none' : ''}`}>
      <div
        className="absolute top-1 bottom-1 w-[calc(33.333%-3px)] bg-slate-500 rounded-md transition-transform duration-200 ease-in-out"
        style={{ transform: `translateX(${selectedIdx * 100}%)` }}
      />
      {TIME_CLASSES.map(tc => (
        <button
          key={tc.value}
          onClick={() => onChange(tc.value)}
          disabled={disabled}
          className={`relative z-10 w-20 py-1 text-sm font-medium rounded-md text-center transition-colors ${
            selected === tc.value ? 'text-white' : 'text-slate-400'
          }`}
        >
          {language === 'fr' ? tc.labelFr : tc.labelEn}
        </button>
      ))}
    </div>
  );
}
