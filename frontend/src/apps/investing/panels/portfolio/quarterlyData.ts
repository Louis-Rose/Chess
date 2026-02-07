export interface LineItem {
  label: string;
  value?: string;
  change?: string;
  highlight?: boolean;
  children?: LineItem[];
}

export interface FCFRow {
  label: string;
  values: string[];
  bold?: boolean;
  highlight?: boolean;
}

export interface QuarterlyReport {
  ticker: string;
  companyName: string;
  quarter: string;
  sections: LineItem[][];
  fcfTable?: {
    title: string;
    headers: string[];
    rows: FCFRow[];
    footnote?: string;
  };
}

export const QUARTERLY_DATA: Record<string, QuarterlyReport> = {
  GOOGL: {
    ticker: 'GOOGL',
    companyName: 'Alphabet',
    quarter: 'Q4 2025',
    sections: [
      [
        {
          label: 'Revenue',
          value: '$113.8 billions',
          change: '+18%',
          children: [
            {
              label: 'Google Services',
              value: '$95.9 billions',
              change: '+14%',
              children: [
                { label: 'Google Search & Other', change: '+17%' }
              ]
            },
            { label: 'Google Cloud', value: '$17.7 billions', change: '+48%' }
          ]
        },
        {
          label: 'Operating Income',
          value: '$35.9 billions',
          change: '+16%',
          children: [
            { label: 'Google Services', value: '$40.1 billions', change: '+22%' },
            { label: 'Google Cloud', value: '$5.3 billions', change: '+153%' }
          ]
        },
        { label: 'Other Income', value: '$3.1 billions', change: '+150%' },
        { label: 'Net Income', value: '$34.5 billions', change: '+30%' }
      ],
      [
        { label: 'Total cash, cash equivalents, and marketable securities', value: '$126.8 billions' },
        { label: 'Long-term debt + Operating lease liabilities', value: '$59.3 billions' },
        { label: 'Net cash position', value: '+$67.5 billions', highlight: true }
      ],
      [
        { label: 'Operating cash-flow', value: '$52.4 billions', change: '+34%' }
      ]
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
    }
  }
};
