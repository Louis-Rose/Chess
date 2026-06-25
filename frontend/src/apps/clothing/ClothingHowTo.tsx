import { useLanguage } from '../../contexts/LanguageContext';

// The How to tab: static dressing guides. Starts with a summer colour guide.
const SUMMER_COLORS = [
  { nameKey: 'clothing.howTo.white', hex: '#FFFFFF', noteKey: 'clothing.howTo.whiteNote' },
  { nameKey: 'clothing.howTo.sand', hex: '#E4D5B7', noteKey: 'clothing.howTo.sandNote' },
  { nameKey: 'clothing.howTo.paleBlue', hex: '#BBD7F0', noteKey: 'clothing.howTo.paleBlueNote' },
];

export function ClothingHowTo() {
  const { t } = useLanguage();
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="rounded-2xl border border-slate-800 bg-slate-800/40 p-5 sm:p-6">
        <h2 className="mb-1 text-center text-lg font-semibold">{t('clothing.howTo.summerTitle')}</h2>
        <p className="mb-6 text-center text-sm text-slate-400">{t('clothing.howTo.summerIntro')}</p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SUMMER_COLORS.map((c) => (
            <div
              key={c.nameKey}
              className="flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-900/40 p-3"
            >
              <span
                className="h-12 w-12 flex-shrink-0 rounded-lg border border-white/10"
                style={{ backgroundColor: c.hex }}
              />
              <div>
                <p className="text-sm font-semibold">{t(c.nameKey)}</p>
                <p className="text-xs text-slate-400">{t(c.noteKey)}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 rounded-xl border border-slate-700/60 bg-slate-900/40 p-3 text-center text-sm text-slate-400">
          <span className="font-semibold text-slate-200">{t('clothing.howTo.skipBold')}</span>{' '}
          {t('clothing.howTo.skipRest')}
        </p>
      </div>
    </div>
  );
}
