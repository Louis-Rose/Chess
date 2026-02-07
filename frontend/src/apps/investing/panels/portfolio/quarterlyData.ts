export interface TableRow {
  metric: string;
  value?: string;
  growth?: string;
  indent?: boolean;
  highlight?: boolean;
}

export interface TableSection {
  title: string;
  rows: TableRow[];
}

export interface FCFRow {
  label: string;
  values: string[];
  bold?: boolean;
  highlight?: boolean;
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
  fcfTable?: {
    title: string;
    headers: string[];
    rows: FCFRow[];
    footnote?: string;
  };
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
          { metric: 'Total cash, cash equivalents & marketable securities', value: '$126.8B' },
          { metric: 'Long-term debt + Operating lease liabilities', value: '$59.3B' },
          { metric: 'Net cash position', value: '+$67.5B', highlight: true },
        ]
      },
      {
        title: 'Revenue',
        rows: [
          { metric: 'Total Revenue', value: '$113.8B', growth: '+18%' },
          { metric: 'Google Services', value: '$95.9B', growth: '+14%', indent: true },
          { metric: 'Google Search & Other', growth: '+17%', indent: true },
          { metric: 'Google Cloud', value: '$17.7B', growth: '+48%', indent: true },
        ]
      },
      {
        title: 'Income',
        rows: [
          { metric: 'Operating Income', value: '$35.9B', growth: '+16%' },
          { metric: 'Google Services', value: '$40.1B', growth: '+22%', indent: true },
          { metric: 'Google Cloud', value: '$5.3B', growth: '+153%', indent: true },
          { metric: 'Other Income', value: '$3.1B', growth: '+150%' },
          { metric: 'Net Income', value: '$34.5B', growth: '+30%', highlight: true },
        ]
      },
      {
        title: 'Cash-Flow',
        rows: [
          { metric: 'Operating cash-flow', value: '$52.4B', growth: '+34%' },
        ]
      },
    ],
    fcfTable: {
      title: 'Quarter Ended',
      headers: ['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025'],
      rows: [
        {
          label: 'Net cash provided by operating activities',
          values: ['$ 36,150', '$ 27,747', '$ 48,414', '$ 52,402'],
          highlight: true
        },
        {
          label: 'Less: purchases of property and equipment',
          values: ['(17,197)', '(22,446)', '(23,953)', '(27,851)']
        },
        {
          label: 'Free cash flow',
          values: ['$ 18,953', '$ 5,301', '$ 24,461', '$ 24,551'],
          bold: true
        }
      ],
      footnote: 'Free cash flow: We define free cash flow as net cash provided by operating activities less capital expenditures.'
    },
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
  }
};
