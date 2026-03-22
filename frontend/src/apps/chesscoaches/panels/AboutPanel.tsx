// About page — credits and licenses

import { PanelShell } from '../components/PanelShell';
import { useLanguage } from '../../../contexts/LanguageContext';

export function AboutPanel() {
  const { t } = useLanguage();

  return (
    <PanelShell title={t('coaches.navAbout')}>
      <div className="max-w-xl mx-auto space-y-6">
        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-2">LUMNA Chess Coaches</h2>
          <p className="text-slate-300 text-sm leading-relaxed">
            {t('coaches.about.description')}
          </p>
        </section>

        <div className="border-t border-slate-700" />

        <section>
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">{t('coaches.about.credits')}</h2>
          <div className="space-y-3">
            <div className="bg-slate-700/40 rounded-lg px-4 py-3">
              <p className="text-slate-200 text-sm font-medium">Chess pieces</p>
              <p className="text-slate-400 text-xs mt-0.5">
                CBurnett — <a href="https://github.com/lichess-org/lila/tree/master/public/piece/cburnett" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">Lichess</a>
              </p>
              <p className="text-slate-500 text-xs mt-0.5">
                Licensed under <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">CC BY-SA 3.0</a>
              </p>
            </div>

            <div className="bg-slate-700/40 rounded-lg px-4 py-3">
              <p className="text-slate-200 text-sm font-medium">Chess.com API</p>
              <p className="text-slate-400 text-xs mt-0.5">{t('coaches.about.chesscomApi')}</p>
            </div>

            <div className="bg-slate-700/40 rounded-lg px-4 py-3">
              <p className="text-slate-200 text-sm font-medium">Google Gemini</p>
              <p className="text-slate-400 text-xs mt-0.5">{t('coaches.about.gemini')}</p>
            </div>
          </div>
        </section>
      </div>
    </PanelShell>
  );
}
