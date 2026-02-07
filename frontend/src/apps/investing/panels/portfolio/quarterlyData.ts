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
  MSFT: {
    ticker: 'MSFT',
    companyName: 'Microsoft',
    quarter: 'Q2 FY2026',
    tableSections: [
      {
        title: 'Revenue',
        rows: [
          { metric: 'Total Revenue', value: '$81.3B', growth: '+17%' },
          { metric: 'Intelligent Cloud', value: '$32.9B', growth: '+29%', indent: 1 },
          { metric: 'Azure', growth: '+39%', indent: 2 },
          { metric: 'Commercial RPOs (excl. OpenAI)', growth: '+28%' },
        ]
      },
      {
        title: 'Income',
        rows: [
          { metric: 'Operating Income', value: '$38.3B', growth: '+21%' },
          { metric: 'Other Income (OpenAI recapitalization)', value: '$10B' },
          { metric: 'Net Income (non-GAAP)', value: '$30.9B', growth: '+23%', highlight: true },
        ]
      },
      {
        title: 'Cash-Flow',
        rows: [
          { metric: 'Operating cash-flow', value: '$35.8B', growth: '+60%' },
          { metric: 'Purchases of property & equipment (CapEx)', value: '($37.5B)', growth: '+66%', indent: 1, subtracted: true },
          { metric: 'Free cash flow', value: '$5.9B', growth: '-9%', highlight: true },
        ]
      },
    ],
    insights: [
      {
        title: 'OpenAI Stake & Valuation',
        bullets: [
          'OpenAI\'s recapitalization reset its valuation to $500B. Microsoft\'s stake dropped from 32.5% to 27%, but is now valued at ~$135B on the books. The OpenAI Foundation (non-profit) holds 26%; employees and private investors hold the remaining 47%.',
        ]
      },
      {
        title: 'Financial Impact',
        bullets: [
          'Microsoft recorded a one-time GAAP gain of $10.1B ($7.6B after-tax) from revaluing its stake at the new $500B mark. This "paper gain" drove quarterly GAAP net income to $38.5B, though analysts largely ignored this spike to focus on operations.',
          'Under the equity method, Microsoft no longer subtracts OpenAI\'s operating losses from its own earnings. It now only records gains or losses based on changes in OpenAI\'s net asset value (balance sheet) rather than its share of operating results (income statement).',
        ]
      },
      {
        title: 'Concentration Risk',
        bullets: [
          '45% of Microsoft\'s $625B commercial backlog is tied directly to OpenAI\'s commitment to use Azure. OpenAI committed to buying $250B in Azure services over the next several years.',
          'Microsoft lost its "right of first refusal," meaning OpenAI can now use other clouds (like Oracle) for non-API projects.',
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
        title: 'User Growth',
        bullets: [
          'Meta\'s daily active users reached 3.58 billion (+7% YoY), with Facebook and WhatsApp each exceeding 2 billion daily actives.',
        ]
      },
      {
        title: 'Ad Performance',
        bullets: [
          'Ad impressions rose 18% and average ad prices increased 6%. AI infrastructure upgrades (doubling GPUs for the GEM model) led to a 3.5% lift in Facebook ad clicks.',
        ]
      },
      {
        title: 'Hardware Momentum',
        bullets: [
          'Ray-Ban Meta glasses sales tripled last year; consequently, most Reality Labs investment is now focused on wearables and glasses.',
        ]
      },
      {
        title: 'Revenue Streams',
        bullets: [
          'WhatsApp paid messaging reached a $2B annual run-rate. Other revenue jumped 54% to $801M, driven by WhatsApp and Meta Verified.',
        ]
      },
      {
        title: '2026 Outlook',
        bullets: [
          'Capital expenditures are projected between $115–$135B. The company is navigating EU regulatory changes regarding ad personalization and upcoming legal trials concerning youth safety.',
        ]
      },
    ]
  }
};
