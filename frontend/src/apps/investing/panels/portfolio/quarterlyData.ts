export interface TableRow {
  metric: string;
  value?: string;
  growth?: string;
  indent?: number;  // 0 = top-level, 1 = sub, 2 = sub-sub
  highlight?: boolean;
  subtracted?: boolean;  // value shown in parentheses, no numbering prefix
}

export interface TableSection {
  title: string;
  rows: TableRow[];
}

export interface InsightTopic {
  title: string;
  bullets: string[];
}

export interface QuarterlyReport {
  ticker: string;
  companyName: string;
  quarter: string;
  tableSections: TableSection[];
  insights?: InsightTopic[];
}

export const QUARTERLY_DATA: Record<string, QuarterlyReport> = {
  GOOGL: {
    ticker: 'GOOGL',
    companyName: 'Alphabet',
    quarter: 'Q4 2025',
    tableSections: [
      {
        title: 'Cash & Debt',
        rows: [
          { metric: 'Cash (Total cash, cash equivalents & marketable securities)', value: '$126.8B' },
          { metric: 'Debt (Long-term debt + Operating lease liabilities)', value: '($59.3B)', subtracted: true },
          { metric: 'Net cash position', value: '+$67.5B', highlight: true },
        ]
      },
      {
        title: 'Revenue',
        rows: [
          { metric: 'Total Revenue', value: '$113.8B', growth: '+18%' },
          { metric: 'Google Services', value: '$95.9B', growth: '+14%', indent: 1 },
          { metric: 'Google Search & Other', growth: '+17%', indent: 2 },
          { metric: 'Google Cloud', value: '$17.7B', growth: '+48%', indent: 1 },
        ]
      },
      {
        title: 'Income',
        rows: [
          { metric: 'Operating Income', value: '$35.9B', growth: '+16%' },
          { metric: 'Google Services', value: '$40.1B', growth: '+22%', indent: 1 },
          { metric: 'Google Cloud', value: '$5.3B', growth: '+153%', indent: 1 },
          { metric: 'Other Income', value: '$3.1B', growth: '+150%' },
          { metric: 'Net Income', value: '$34.5B', growth: '+30%', highlight: true },
        ]
      },
      {
        title: 'Cash-Flow',
        rows: [
          { metric: 'Operating cash-flow', value: '$52.4B', growth: '+34%' },
          { metric: 'Purchases of property & equipment (CapEx)', value: '($27.9B)', indent: 1, subtracted: true },
          { metric: 'Free cash flow', value: '$24.6B', highlight: true },
        ]
      },
    ],
    insights: [
      {
        title: 'Apple & Gemini Collaboration',
        bullets: [
          'Google Gemini will serve as the foundation for next-gen Apple Foundation Models, replacing Siri\'s 150B-parameter model with a custom Gemini 1.2T-parameter architecture. Expected to boost Siri\'s complex instruction success rate from 58% to 92%.',
          'Multi-year deal reportedly involves Apple paying Google ~$1B annually. Public rollout scheduled with iOS 26.4 in Spring 2026, targeting 500M AI-capable smartphones by year-end.',
        ]
      },
      {
        title: 'Waymo Growth & Valuation',
        bullets: [
          'Closed a $16B investment round in Feb 2026 (led by Alphabet ~$13B), valuing Waymo at $126B post-money — nearly tripling its $45B valuation from Oct 2024.',
          'Now provides 400K+ rides/week (up from 150K in late 2024). Fleet surpassed 20M fully autonomous trips by Dec 2025.',
          'Scaling from 10 to 20+ cities by end of 2026, including London and Tokyo, with fleet expansion to 5,000+ active vehicles.',
        ]
      },
    ]
  },
  META: {
    ticker: 'META',
    companyName: 'Meta Platforms',
    quarter: 'Q4 2025',
    tableSections: [
      {
        title: 'Cash & Debt',
        rows: [
          { metric: 'Cash (Total cash, cash equivalents & marketable securities)', value: '$81.6B' },
          { metric: 'Debt (Long-term debt)', value: '($58.7B)', subtracted: true },
          { metric: 'Net cash position', value: '+$22.9B', highlight: true },
        ]
      },
      {
        title: 'Revenue',
        rows: [
          { metric: 'Total Revenue', value: '$59.9B', growth: '+24%' },
        ]
      },
      {
        title: 'Income',
        rows: [
          { metric: 'Cost & expenses', value: '($35.1B)', growth: '+40%', indent: 1, subtracted: true },
          { metric: 'R&D', value: '($17.1B)', growth: '+40%', indent: 2, subtracted: true },
          { metric: 'Operating Income', value: '$24.7B', growth: '+6%' },
          { metric: 'Net Income', value: '$22.8B', growth: '+9%', highlight: true },
        ]
      },
      {
        title: 'Cash-Flow',
        rows: [
          { metric: 'Operating cash-flow', value: '$36.2B', growth: '+29%' },
          { metric: 'Purchases of property & equipment (CapEx)', value: '($21.4B)', growth: '+17%', indent: 1, subtracted: true },
          { metric: 'Free cash flow', value: '$14.1B', highlight: true },
        ]
      },
    ],
    insights: [
      {
        title: 'Usage Metrics',
        bullets: [
          'Family Daily Active People: 3.58B (+7% YoY).',
          'Ad impressions up 18% YoY, average ad price up 6% YoY.',
        ]
      },
      {
        title: 'Platform Scale & AI Glasses',
        bullets: [
          'More than 2 billion daily actives each on Facebook and WhatsApp, and just shy of that on Instagram.',
          'Sales of Ray-Ban Meta glasses more than tripled last year — among the fastest growing consumer electronics in history. Most Reality Labs investment now directed toward glasses and wearables.',
        ]
      },
      {
        title: 'AI-Driven Ad Performance & Monetization',
        bullets: [
          'Doubled GPUs used to train the GEM model for ads ranking. New sequence learning architecture drove a 3.5% lift in ad clicks on Facebook and 1%+ conversion gains on Instagram in Q4.',
          'WhatsApp paid messaging crossed a $2B annual run-rate in Q4. Family of Apps other revenue up 54% ($801M), driven by WhatsApp and Meta Verified subscriptions.',
        ]
      },
      {
        title: '2026 CapEx & Regulatory Outlook',
        bullets: [
          '2026 CapEx guidance: $115–135B (including principal payments on finance leases).',
          'Aligned with EU Commission on Less Personalized Ads changes, rolling out this quarter. Monitoring legal headwinds in EU and US — youth-related scrutiny with multiple trials scheduled for 2025.',
        ]
      },
    ]
  }
};
