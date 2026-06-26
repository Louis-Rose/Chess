import type { ReactNode } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';

// Rules & strategy reference for Mon Petit Prono's World Cup 2026 scoring.
// Sourced from the official LFP / Ligue 1 rules article and corroborating
// guides; see the link at the bottom.
export function MppRules() {
  const { t } = useLanguage();
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-sm leading-relaxed text-slate-300 sm:px-6">
      <header>
        <h2 className="text-center text-xl font-bold text-slate-100">{t('mpp.nav.rules')}</h2>
      </header>

      <Section title={t('mpp.rules.basicsTitle')}>
        <p>
          {t('mpp.rules.basicsIntro')}
        </p>
        <ul className="mt-2 space-y-1.5">
          <li>
            <Tag className="bg-emerald-500/15 text-emerald-300">{t('mpp.rules.tagRightResult')}</Tag> {t('mpp.rules.basicsRightResult')}
          </li>
          <li>
            <Tag className="bg-sky-500/15 text-sky-300">{t('mpp.rules.tagExactScore')}</Tag> {t('mpp.rules.basicsExactScore')}
          </li>
          <li>
            <Tag className="bg-red-500/15 text-red-300">{t('mpp.rules.tagWrong')}</Tag> {t('mpp.rules.basicsWrong')}
          </li>
        </ul>
        <p className="mt-2">
          {t('mpp.rules.basicsBonsExacts')}
        </p>
      </Section>

      <Section title={t('mpp.rules.cotesTitle')}>
        <p>
          {t('mpp.rules.cotesDesc')}
        </p>
        <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">
          {t('mpp.rules.cotesTableCaption')}
        </p>
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-800">
          <Row head cells={[t('mpp.rules.colOutcome'), t('mpp.rules.colPlayersBacking'), t('mpp.rules.colPoints')]} />
          <Row cells={[t('mpp.rules.outcomeFavouriteWin'), '91%', '31']} />
          <Row cells={[t('mpp.rules.outcomeDraw'), '6%', '157']} />
          <Row cells={[t('mpp.rules.outcomeUnderdogWin'), '3%', '184']} />
        </div>
        <p className="mt-2 text-slate-400">
          {t('mpp.rules.cotesTableNote')}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {t('mpp.rules.cotesApiNote1')} (<code className="text-emerald-300">quotations</code>{' '}
          {t('mpp.rules.cotesApiNote2')} <code className="text-emerald-300">stats.bets</code> {t('mpp.rules.cotesApiNote3')}
        </p>
      </Section>

      <Section title={t('mpp.rules.rarityTitle')}>
        <p>
          {t('mpp.rules.rarityDesc')}
        </p>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-800">
          <Row head cells={[t('mpp.rules.colTier'), t('mpp.rules.colShareCorrect'), t('mpp.rules.colBonus')]} />
          <Row cells={[t('mpp.rules.tierExact'), t('mpp.rules.shareOver30'), '+20']} />
          <Row cells={[t('mpp.rules.tierRare'), t('mpp.rules.share20to30'), '+30']} />
          <Row cells={[t('mpp.rules.tierVeryRare'), t('mpp.rules.share5to20'), '+50']} />
          <Row cells={[t('mpp.rules.tierMegaRare'), t('mpp.rules.share05to5'), '+70']} />
          <Row cells={[t('mpp.rules.tierUltraRare'), t('mpp.rules.shareUnder05'), '+100']} />
        </div>
      </Section>

      <Section title={t('mpp.rules.knockoutTitle')}>
        <p>
          {t('mpp.rules.knockoutDesc')}
        </p>
        <p className="mt-2 text-slate-400">
          {t('mpp.rules.knockoutExample')}
        </p>
      </Section>

    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-2xl border border-slate-800 bg-slate-800/40 p-5">
      <h3 className="font-semibold text-slate-100">{title}</h3>
      {children}
    </section>
  );
}

function Tag({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span className={`mr-1 rounded px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${className}`}>
      {children}
    </span>
  );
}

function Row({ cells, head }: { cells: string[]; head?: boolean }) {
  return (
    <div
      className={`grid ${
        head
          ? 'border-b border-slate-800 bg-slate-900/40 text-xs uppercase tracking-wide text-slate-500'
          : 'border-b border-slate-800/60 last:border-0'
      }`}
      style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}
    >
      {cells.map((c, i) => (
        <span
          key={i}
          className={`px-4 py-2 text-center ${i > 0 ? 'border-l border-slate-800' : ''} ${
            i === cells.length - 1 && !head ? 'font-semibold text-slate-100' : ''
          }`}
        >
          {c}
        </span>
      ))}
    </div>
  );
}
