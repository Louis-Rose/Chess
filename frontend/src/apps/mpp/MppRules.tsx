import type { ReactNode } from 'react';

// Rules & strategy reference for Mon Petit Prono's World Cup 2026 scoring.
// Sourced from the official LFP / Ligue 1 rules article and corroborating
// guides; see the link at the bottom.
export function MppRules() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-sm leading-relaxed text-slate-300 sm:px-6">
      <header>
        <h2 className="text-xl font-bold text-slate-100">Rules &amp; strategy</h2>
        <p className="mt-1 text-slate-400">
          How MPP turns your score predictions into points, and how to climb the ranking.
        </p>
      </header>

      <Section title="The basics">
        <p>
          For every match you predict a final score. Three outcomes:
        </p>
        <ul className="mt-2 space-y-1.5">
          <li>
            <Tag className="bg-emerald-500/15 text-emerald-300">Right result</Tag> You called the
            winner (or the draw): you win <strong>the cote points</strong> shown under the match.
          </li>
          <li>
            <Tag className="bg-sky-500/15 text-sky-300">Exact score</Tag> You also nailed the exact
            scoreline: you add a <strong>rarity bonus</strong> on top of the cote points.
          </li>
          <li>
            <Tag className="bg-red-500/15 text-red-300">Wrong</Tag> Wrong result: zero points.
          </li>
        </ul>
        <p className="mt-2">
          Your prediction is the same across all your leagues and challenges. In MPP terms,{' '}
          <strong>Bons</strong> counts your correct results and <strong>Exacts</strong> your exact
          scores.
        </p>
      </Section>

      <Section title="The cotes (odds) decide the points">
        <p>
          Each match shows a cote (betting-style odds) for each outcome. Points are indexed to that
          cote: <strong>the less likely the result, the more it pays</strong>. A favourite win
          earns little; an upset earns a lot.
        </p>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-800">
          <Row head cells={['Example: France vs Senegal', 'Result points']} />
          <Row cells={['France win (favourite)', '~46']} />
          <Row cells={['Draw', '~125']} />
          <Row cells={['Senegal win (upset)', '~150']} />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Illustrative values. The real numbers are set per match from the odds and shown in the app
          before kickoff.
        </p>
      </Section>

      <Section title="Exact-score rarity bonus">
        <p>
          If you get the exact score, the bonus depends on how rare your scoreline was, measured as
          the share of players (among those with the right result) who also had it. Rarer is worth
          more.
        </p>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-800">
          <Row head cells={['Tier', 'Share of correct players', 'Bonus']} />
          <Row cells={['Exact', 'over 30%', '+20']} />
          <Row cells={['Rare', '20 to 30%', '+30']} />
          <Row cells={['Very rare', '5 to 20%', '+50']} />
          <Row cells={['Mega rare', '0.5 to 5%', '+70']} />
          <Row cells={['Ultra rare', 'under 0.5%', '+100']} />
        </div>
      </Section>

      <Section title="The X2 bonus">
        <p>
          One single X2 for the whole tournament (104 matches). Apply it to a prediction before
          kickoff. If you get the result right, it doubles all of that match's points, the rarity
          bonus included, in every one of your leagues. Spend it once, so spend it well.
        </p>
      </Section>

      <Section title="Pre-tournament favourites">
        <p>
          Before the first match (Mexico vs South Africa, Thu 11 June, 21:00) you pick the World Cup
          winner and the top scorer. Each carries its own cote. The points land after the final
          (Mon 20 July). You can edit your picks until the first match kicks off. If several players
          tie for top scorer, only the official Golden Boot winner scores.
        </p>
      </Section>

      <Section title="Knockout stage (from the round of 16)">
        <p>
          On a draw the tie goes to extra time, and your prediction counts for the full 120 minutes.
          Penalty shootouts do not count, so a match settled on penalties scores as a draw.
        </p>
        <p className="mt-2 text-slate-400">
          Example: 1-1 after 90 minutes, then 3-1 after extra time. Predicting 2-1 wins the result
          points; predicting 1-1 scores nothing.
        </p>
      </Section>

      <Section title="Strategy">
        <ul className="space-y-1.5">
          <li>
            <strong>Be right when others are wrong.</strong> You do not climb by agreeing with the
            crowd. Bold but reasoned upset calls on high cotes are where ranks are won.
          </li>
          <li>
            <strong>Bank the result first.</strong> The cote points are the bulk of your score. Get
            the 1/X/2 right on high-cote matches before chasing exact scores.
          </li>
          <li>
            <strong>Hunt uncommon exacts.</strong> A 1-0 everyone picked pays +20. A plausible but
            rare line (a 3-2, a 2-2) can pay +70 or +100. Aim for unusual-but-credible scores.
          </li>
          <li>
            <strong>Save the X2 for a high-cote conviction.</strong> Doubling a favourite barely
            moves you. Doubling a correct underdog plus a rarity bonus is a huge swing.
          </li>
          <li>
            <strong>Use your favourites for variance.</strong> An outsider champion pick is a big
            end-of-tournament swing if it lands.
          </li>
          <li>
            <strong>Tight knockouts.</strong> If you expect a cagey game to reach penalties, a draw
            prediction is safe value since shootouts score as draws.
          </li>
        </ul>
      </Section>

      <p className="text-xs text-slate-500">
        Source:{' '}
        <a
          href="https://ligue1.com/fr/articles/l1_article_5224-mpp-mondial-tout-savoir-sur-les-regles-26"
          target="_blank"
          rel="noreferrer"
          className="text-emerald-400 hover:underline"
        >
          official MPP World Cup rules (Ligue 1)
        </a>
        .
      </p>
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
      className={`grid grid-cols-[1fr_auto] gap-4 px-4 py-2 ${
        head
          ? 'border-b border-slate-800 bg-slate-900/40 text-xs uppercase tracking-wide text-slate-500'
          : 'border-b border-slate-800/60 last:border-0'
      }`}
      style={{ gridTemplateColumns: cells.length === 3 ? '1fr 1fr auto' : '1fr auto' }}
    >
      {cells.map((c, i) => (
        <span
          key={i}
          className={i === cells.length - 1 && !head ? 'text-right font-semibold text-slate-100' : ''}
        >
          {c}
        </span>
      ))}
    </div>
  );
}
