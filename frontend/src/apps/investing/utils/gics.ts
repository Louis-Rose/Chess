// GICS (Global Industry Classification Standard) hierarchy
// Developed by MSCI and S&P

export interface GICSSubIndustry {
  code: string;
  name: string;
}

export interface GICSIndustry {
  code: string;
  name: string;
  subIndustries: GICSSubIndustry[];
}

export interface GICSIndustryGroup {
  code: string;
  name: string;
  industries: GICSIndustry[];
}

export interface GICSSector {
  code: string;
  name: string;
  industryGroups: GICSIndustryGroup[];
}

export const GICS_SECTORS: GICSSector[] = [
  {
    code: '10',
    name: 'Energy',
    industryGroups: [
      {
        code: '1010',
        name: 'Energy',
        industries: [
          {
            code: '101010',
            name: 'Energy Equipment & Services',
            subIndustries: [
              { code: '10101010', name: 'Oil & Gas Drilling' },
              { code: '10101020', name: 'Oil & Gas Equipment & Services' },
            ],
          },
          {
            code: '101020',
            name: 'Oil, Gas & Consumable Fuels',
            subIndustries: [
              { code: '10102010', name: 'Integrated Oil & Gas' },
              { code: '10102020', name: 'Oil & Gas Exploration & Production' },
              { code: '10102030', name: 'Oil & Gas Refining & Marketing' },
              { code: '10102040', name: 'Oil & Gas Storage & Transportation' },
              { code: '10102050', name: 'Coal & Consumable Fuels' },
            ],
          },
        ],
      },
    ],
  },
  {
    code: '15',
    name: 'Materials',
    industryGroups: [
      {
        code: '1510',
        name: 'Materials',
        industries: [
          {
            code: '151010',
            name: 'Chemicals',
            subIndustries: [
              { code: '15101010', name: 'Commodity Chemicals' },
              { code: '15101020', name: 'Diversified Chemicals' },
              { code: '15101030', name: 'Fertilizers & Agricultural Chemicals' },
              { code: '15101040', name: 'Industrial Gases' },
              { code: '15101050', name: 'Specialty Chemicals' },
            ],
          },
          {
            code: '151020',
            name: 'Construction Materials',
            subIndustries: [
              { code: '15102010', name: 'Construction Materials' },
            ],
          },
          {
            code: '151030',
            name: 'Containers & Packaging',
            subIndustries: [
              { code: '15103010', name: 'Metal, Glass & Plastic Containers' },
              { code: '15103020', name: 'Paper & Plastic Packaging Products & Materials' },
            ],
          },
          {
            code: '151040',
            name: 'Metals & Mining',
            subIndustries: [
              { code: '15104010', name: 'Aluminum' },
              { code: '15104020', name: 'Diversified Metals & Mining' },
              { code: '15104025', name: 'Copper' },
              { code: '15104030', name: 'Gold' },
              { code: '15104040', name: 'Precious Metals & Minerals' },
              { code: '15104045', name: 'Silver' },
              { code: '15104050', name: 'Steel' },
            ],
          },
          {
            code: '151050',
            name: 'Paper & Forest Products',
            subIndustries: [
              { code: '15105010', name: 'Forest Products' },
              { code: '15105020', name: 'Paper Products' },
            ],
          },
        ],
      },
    ],
  },
  {
    code: '20',
    name: 'Industrials',
    industryGroups: [
      {
        code: '2010',
        name: 'Capital Goods',
        industries: [
          {
            code: '201010',
            name: 'Aerospace & Defense',
            subIndustries: [
              { code: '20101010', name: 'Aerospace & Defense' },
            ],
          },
          {
            code: '201020',
            name: 'Building Products',
            subIndustries: [
              { code: '20102010', name: 'Building Products' },
            ],
          },
          {
            code: '201030',
            name: 'Construction & Engineering',
            subIndustries: [
              { code: '20103010', name: 'Construction & Engineering' },
            ],
          },
          {
            code: '201040',
            name: 'Electrical Equipment',
            subIndustries: [
              { code: '20104010', name: 'Electrical Components & Equipment' },
              { code: '20104020', name: 'Heavy Electrical Equipment' },
            ],
          },
          {
            code: '201050',
            name: 'Industrial Conglomerates',
            subIndustries: [
              { code: '20105010', name: 'Industrial Conglomerates' },
            ],
          },
          {
            code: '201060',
            name: 'Machinery',
            subIndustries: [
              { code: '20106010', name: 'Construction Machinery & Heavy Transportation Equipment' },
              { code: '20106015', name: 'Agricultural & Farm Machinery' },
              { code: '20106020', name: 'Industrial Machinery & Supplies & Components' },
            ],
          },
          {
            code: '201070',
            name: 'Trading Companies & Distributors',
            subIndustries: [
              { code: '20107010', name: 'Trading Companies & Distributors' },
            ],
          },
        ],
      },
      {
        code: '2020',
        name: 'Commercial & Professional Services',
        industries: [
          {
            code: '202010',
            name: 'Commercial Services & Supplies',
            subIndustries: [
              { code: '20201010', name: 'Commercial Printing' },
              { code: '20201050', name: 'Environmental & Facilities Services' },
              { code: '20201060', name: 'Office Services & Supplies' },
              { code: '20201070', name: 'Diversified Support Services' },
              { code: '20201080', name: 'Security & Alarm Services' },
            ],
          },
          {
            code: '202020',
            name: 'Professional Services',
            subIndustries: [
              { code: '20202010', name: 'Human Resource & Employment Services' },
              { code: '20202020', name: 'Research & Consulting Services' },
              { code: '20202030', name: 'Data Processing & Outsourced Services' },
            ],
          },
        ],
      },
      {
        code: '2030',
        name: 'Transportation',
        industries: [
          {
            code: '203010',
            name: 'Air Freight & Logistics',
            subIndustries: [
              { code: '20301010', name: 'Air Freight & Logistics' },
            ],
          },
          {
            code: '203020',
            name: 'Passenger Airlines',
            subIndustries: [
              { code: '20302010', name: 'Passenger Airlines' },
            ],
          },
          {
            code: '203030',
            name: 'Marine Transportation',
            subIndustries: [
              { code: '20303010', name: 'Marine Transportation' },
            ],
          },
          {
            code: '203040',
            name: 'Ground Transportation',
            subIndustries: [
              { code: '20304010', name: 'Rail Transportation' },
              { code: '20304020', name: 'Cargo Ground Transportation' },
              { code: '20304030', name: 'Passenger Ground Transportation' },
            ],
          },
          {
            code: '203050',
            name: 'Transportation Infrastructure',
            subIndustries: [
              { code: '20305010', name: 'Airport Services' },
              { code: '20305020', name: 'Highways & Railtracks' },
              { code: '20305030', name: 'Marine Ports & Services' },
            ],
          },
        ],
      },
    ],
  },
  {
    code: '25',
    name: 'Consumer Discretionary',
    industryGroups: [
      {
        code: '2510',
        name: 'Automobiles & Components',
        industries: [
          {
            code: '251010',
            name: 'Automobile Components',
            subIndustries: [
              { code: '25101010', name: 'Automotive Parts & Equipment' },
              { code: '25101020', name: 'Tires & Rubber' },
            ],
          },
          {
            code: '251020',
            name: 'Automobiles',
            subIndustries: [
              { code: '25102010', name: 'Automobile Manufacturers' },
              { code: '25102020', name: 'Motorcycle Manufacturers' },
            ],
          },
        ],
      },
      {
        code: '2520',
        name: 'Consumer Durables & Apparel',
        industries: [
          {
            code: '252010',
            name: 'Household Durables',
            subIndustries: [
              { code: '25201010', name: 'Consumer Electronics' },
              { code: '25201020', name: 'Home Furnishings' },
              { code: '25201030', name: 'Homebuilding' },
              { code: '25201040', name: 'Household Appliances' },
              { code: '25201050', name: 'Housewares & Specialties' },
            ],
          },
          {
            code: '252020',
            name: 'Leisure Products',
            subIndustries: [
              { code: '25202010', name: 'Leisure Products' },
            ],
          },
          {
            code: '252030',
            name: 'Textiles, Apparel & Luxury Goods',
            subIndustries: [
              { code: '25203010', name: 'Apparel, Accessories & Luxury Goods' },
              { code: '25203020', name: 'Footwear' },
              { code: '25203030', name: 'Textiles' },
            ],
          },
        ],
      },
      {
        code: '2530',
        name: 'Consumer Services',
        industries: [
          {
            code: '253010',
            name: 'Hotels, Restaurants & Leisure',
            subIndustries: [
              { code: '25301010', name: 'Casinos & Gaming' },
              { code: '25301020', name: 'Hotels, Resorts & Cruise Lines' },
              { code: '25301030', name: 'Leisure Facilities' },
              { code: '25301040', name: 'Restaurants' },
            ],
          },
          {
            code: '253020',
            name: 'Diversified Consumer Services',
            subIndustries: [
              { code: '25302010', name: 'Education Services' },
              { code: '25302020', name: 'Specialized Consumer Services' },
            ],
          },
        ],
      },
      {
        code: '2550',
        name: 'Consumer Discretionary Distribution & Retail',
        industries: [
          {
            code: '255010',
            name: 'Distributors',
            subIndustries: [
              { code: '25501010', name: 'Distributors' },
            ],
          },
          {
            code: '255020',
            name: 'Internet & Direct Marketing Retail',
            subIndustries: [
              { code: '25502020', name: 'Internet & Direct Marketing Retail' },
            ],
          },
          {
            code: '255030',
            name: 'Broadline Retail',
            subIndustries: [
              { code: '25503010', name: 'Broadline Retail' },
            ],
          },
          {
            code: '255040',
            name: 'Specialty Retail',
            subIndustries: [
              { code: '25504010', name: 'Apparel Retail' },
              { code: '25504020', name: 'Computer & Electronics Retail' },
              { code: '25504030', name: 'Home Improvement Retail' },
              { code: '25504040', name: 'Other Specialty Retail' },
              { code: '25504050', name: 'Automotive Retail' },
              { code: '25504060', name: 'Homefurnishing Retail' },
            ],
          },
        ],
      },
    ],
  },
  {
    code: '30',
    name: 'Consumer Staples',
    industryGroups: [
      {
        code: '3010',
        name: 'Consumer Staples Distribution & Retail',
        industries: [
          {
            code: '301010',
            name: 'Consumer Staples Distribution & Retail',
            subIndustries: [
              { code: '30101010', name: 'Drug Retail' },
              { code: '30101020', name: 'Food Distributors' },
              { code: '30101030', name: 'Food Retail' },
              { code: '30101040', name: 'Consumer Staples Merchandise Retail' },
            ],
          },
        ],
      },
      {
        code: '3020',
        name: 'Food, Beverage & Tobacco',
        industries: [
          {
            code: '302010',
            name: 'Beverages',
            subIndustries: [
              { code: '30201010', name: 'Brewers' },
              { code: '30201020', name: 'Distillers & Vintners' },
              { code: '30201030', name: 'Soft Drinks & Non-alcoholic Beverages' },
            ],
          },
          {
            code: '302020',
            name: 'Food Products',
            subIndustries: [
              { code: '30202010', name: 'Agricultural Products & Services' },
              { code: '30202030', name: 'Packaged Foods & Meats' },
            ],
          },
          {
            code: '302030',
            name: 'Tobacco',
            subIndustries: [
              { code: '30203010', name: 'Tobacco' },
            ],
          },
        ],
      },
      {
        code: '3030',
        name: 'Household & Personal Products',
        industries: [
          {
            code: '303010',
            name: 'Household Products',
            subIndustries: [
              { code: '30301010', name: 'Household Products' },
            ],
          },
          {
            code: '303020',
            name: 'Personal Care Products',
            subIndustries: [
              { code: '30302010', name: 'Personal Care Products' },
            ],
          },
        ],
      },
    ],
  },
  {
    code: '35',
    name: 'Health Care',
    industryGroups: [
      {
        code: '3510',
        name: 'Health Care Equipment & Services',
        industries: [
          {
            code: '351010',
            name: 'Health Care Equipment & Supplies',
            subIndustries: [
              { code: '35101010', name: 'Health Care Equipment' },
              { code: '35101020', name: 'Health Care Supplies' },
            ],
          },
          {
            code: '351020',
            name: 'Health Care Providers & Services',
            subIndustries: [
              { code: '35102010', name: 'Health Care Distributors' },
              { code: '35102015', name: 'Health Care Services' },
              { code: '35102020', name: 'Health Care Facilities' },
              { code: '35102030', name: 'Managed Health Care' },
            ],
          },
          {
            code: '351030',
            name: 'Health Care Technology',
            subIndustries: [
              { code: '35103010', name: 'Health Care Technology' },
            ],
          },
        ],
      },
      {
        code: '3520',
        name: 'Pharmaceuticals, Biotechnology & Life Sciences',
        industries: [
          {
            code: '352010',
            name: 'Biotechnology',
            subIndustries: [
              { code: '35201010', name: 'Biotechnology' },
            ],
          },
          {
            code: '352020',
            name: 'Pharmaceuticals',
            subIndustries: [
              { code: '35202010', name: 'Pharmaceuticals' },
            ],
          },
          {
            code: '352030',
            name: 'Life Sciences Tools & Services',
            subIndustries: [
              { code: '35203010', name: 'Life Sciences Tools & Services' },
            ],
          },
        ],
      },
    ],
  },
  {
    code: '40',
    name: 'Financials',
    industryGroups: [
      {
        code: '4010',
        name: 'Banks',
        industries: [
          {
            code: '401010',
            name: 'Banks',
            subIndustries: [
              { code: '40101010', name: 'Diversified Banks' },
              { code: '40101015', name: 'Regional Banks' },
            ],
          },
        ],
      },
      {
        code: '4020',
        name: 'Financial Services',
        industries: [
          {
            code: '402010',
            name: 'Diversified Financial Services',
            subIndustries: [
              { code: '40201020', name: 'Diversified Financial Services' },
              { code: '40201030', name: 'Multi-Sector Holdings' },
              { code: '40201040', name: 'Specialized Finance' },
              { code: '40201050', name: 'Commercial & Residential Mortgage Finance' },
              { code: '40201060', name: 'Transaction & Payment Processing Services' },
            ],
          },
          {
            code: '402020',
            name: 'Consumer Finance',
            subIndustries: [
              { code: '40202010', name: 'Consumer Finance' },
            ],
          },
          {
            code: '402030',
            name: 'Capital Markets',
            subIndustries: [
              { code: '40203010', name: 'Asset Management & Custody Banks' },
              { code: '40203020', name: 'Investment Banking & Brokerage' },
              { code: '40203030', name: 'Diversified Capital Markets' },
              { code: '40203040', name: 'Financial Exchanges & Data' },
            ],
          },
          {
            code: '402040',
            name: 'Mortgage Real Estate Investment Trusts (REITs)',
            subIndustries: [
              { code: '40204010', name: 'Mortgage REITs' },
            ],
          },
        ],
      },
      {
        code: '4030',
        name: 'Insurance',
        industries: [
          {
            code: '403010',
            name: 'Insurance',
            subIndustries: [
              { code: '40301010', name: 'Insurance Brokers' },
              { code: '40301020', name: 'Life & Health Insurance' },
              { code: '40301030', name: 'Multi-line Insurance' },
              { code: '40301040', name: 'Property & Casualty Insurance' },
              { code: '40301050', name: 'Reinsurance' },
            ],
          },
        ],
      },
    ],
  },
  {
    code: '45',
    name: 'Information Technology',
    industryGroups: [
      {
        code: '4510',
        name: 'Software & Services',
        industries: [
          {
            code: '451020',
            name: 'IT Services',
            subIndustries: [
              { code: '45102010', name: 'IT Consulting & Other Services' },
              { code: '45102020', name: 'Internet Services & Infrastructure' },
            ],
          },
          {
            code: '451030',
            name: 'Software',
            subIndustries: [
              { code: '45103010', name: 'Application Software' },
              { code: '45103020', name: 'Systems Software' },
            ],
          },
        ],
      },
      {
        code: '4520',
        name: 'Technology Hardware & Equipment',
        industries: [
          {
            code: '452010',
            name: 'Communications Equipment',
            subIndustries: [
              { code: '45201020', name: 'Communications Equipment' },
            ],
          },
          {
            code: '452020',
            name: 'Technology Hardware, Storage & Peripherals',
            subIndustries: [
              { code: '45202030', name: 'Technology Hardware, Storage & Peripherals' },
            ],
          },
          {
            code: '452030',
            name: 'Electronic Equipment, Instruments & Components',
            subIndustries: [
              { code: '45203010', name: 'Electronic Equipment & Instruments' },
              { code: '45203015', name: 'Electronic Components' },
              { code: '45203020', name: 'Electronic Manufacturing Services' },
              { code: '45203030', name: 'Technology Distributors' },
            ],
          },
        ],
      },
      {
        code: '4530',
        name: 'Semiconductors & Semiconductor Equipment',
        industries: [
          {
            code: '453010',
            name: 'Semiconductors & Semiconductor Equipment',
            subIndustries: [
              { code: '45301010', name: 'Semiconductor Materials & Equipment' },
              { code: '45301020', name: 'Semiconductors' },
            ],
          },
        ],
      },
    ],
  },
  {
    code: '50',
    name: 'Communication Services',
    industryGroups: [
      {
        code: '5010',
        name: 'Telecommunication Services',
        industries: [
          {
            code: '501010',
            name: 'Diversified Telecommunication Services',
            subIndustries: [
              { code: '50101010', name: 'Alternative Carriers' },
              { code: '50101020', name: 'Integrated Telecommunication Services' },
            ],
          },
          {
            code: '501020',
            name: 'Wireless Telecommunication Services',
            subIndustries: [
              { code: '50102010', name: 'Wireless Telecommunication Services' },
            ],
          },
        ],
      },
      {
        code: '5020',
        name: 'Media & Entertainment',
        industries: [
          {
            code: '502010',
            name: 'Media',
            subIndustries: [
              { code: '50201010', name: 'Advertising' },
              { code: '50201020', name: 'Broadcasting' },
              { code: '50201030', name: 'Cable & Satellite' },
              { code: '50201040', name: 'Publishing' },
            ],
          },
          {
            code: '502020',
            name: 'Entertainment',
            subIndustries: [
              { code: '50202010', name: 'Movies & Entertainment' },
              { code: '50202020', name: 'Interactive Home Entertainment' },
            ],
          },
          {
            code: '502030',
            name: 'Interactive Media & Services',
            subIndustries: [
              { code: '50203010', name: 'Interactive Media & Services' },
            ],
          },
        ],
      },
    ],
  },
  {
    code: '55',
    name: 'Utilities',
    industryGroups: [
      {
        code: '5510',
        name: 'Utilities',
        industries: [
          {
            code: '551010',
            name: 'Electric Utilities',
            subIndustries: [
              { code: '55101010', name: 'Electric Utilities' },
            ],
          },
          {
            code: '551020',
            name: 'Gas Utilities',
            subIndustries: [
              { code: '55102010', name: 'Gas Utilities' },
            ],
          },
          {
            code: '551030',
            name: 'Multi-Utilities',
            subIndustries: [
              { code: '55103010', name: 'Multi-Utilities' },
            ],
          },
          {
            code: '551040',
            name: 'Water Utilities',
            subIndustries: [
              { code: '55104010', name: 'Water Utilities' },
            ],
          },
          {
            code: '551050',
            name: 'Independent Power and Renewable Electricity Producers',
            subIndustries: [
              { code: '55105010', name: 'Independent Power Producers & Energy Traders' },
              { code: '55105020', name: 'Renewable Electricity' },
            ],
          },
        ],
      },
    ],
  },
  {
    code: '60',
    name: 'Real Estate',
    industryGroups: [
      {
        code: '6010',
        name: 'Equity Real Estate Investment Trusts (REITs)',
        industries: [
          {
            code: '601010',
            name: 'Diversified REITs',
            subIndustries: [
              { code: '60101010', name: 'Diversified REITs' },
            ],
          },
          {
            code: '601025',
            name: 'Industrial REITs',
            subIndustries: [
              { code: '60102510', name: 'Industrial REITs' },
            ],
          },
          {
            code: '601030',
            name: 'Hotel & Resort REITs',
            subIndustries: [
              { code: '60103010', name: 'Hotel & Resort REITs' },
            ],
          },
          {
            code: '601040',
            name: 'Office REITs',
            subIndustries: [
              { code: '60104010', name: 'Office REITs' },
            ],
          },
          {
            code: '601050',
            name: 'Health Care REITs',
            subIndustries: [
              { code: '60105010', name: 'Health Care REITs' },
            ],
          },
          {
            code: '601060',
            name: 'Residential REITs',
            subIndustries: [
              { code: '60106010', name: 'Multi-Family Residential REITs' },
              { code: '60106020', name: 'Single-Family Residential REITs' },
            ],
          },
          {
            code: '601070',
            name: 'Retail REITs',
            subIndustries: [
              { code: '60107010', name: 'Retail REITs' },
            ],
          },
          {
            code: '601080',
            name: 'Specialized REITs',
            subIndustries: [
              { code: '60108010', name: 'Diversified Real Estate Activities' },
              { code: '60108020', name: 'Data Center REITs' },
              { code: '60108030', name: 'Self-Storage REITs' },
              { code: '60108040', name: 'Telecom Tower REITs' },
              { code: '60108050', name: 'Timber REITs' },
              { code: '60108060', name: 'Other Specialized REITs' },
            ],
          },
        ],
      },
      {
        code: '6020',
        name: 'Real Estate Management & Development',
        industries: [
          {
            code: '602010',
            name: 'Real Estate Management & Development',
            subIndustries: [
              { code: '60201010', name: 'Diversified Real Estate Activities' },
              { code: '60201020', name: 'Real Estate Operating Companies' },
              { code: '60201030', name: 'Real Estate Development' },
              { code: '60201040', name: 'Real Estate Services' },
            ],
          },
        ],
      },
    ],
  },
];

// Stock to GICS sub-industry mapping
// Key: stock ticker, Value: GICS sub-industry code (8 digits)
export const STOCK_GICS_MAP: Record<string, string> = {
  // Energy - Oil & Gas Drilling (10101010)
  // Energy - Oil & Gas Equipment & Services (10101020)
  'SLB': '10101020', 'HAL': '10101020', 'BKR': '10101020',
  // Energy - Integrated Oil & Gas (10102010)
  'XOM': '10102010', 'CVX': '10102010', 'SHEL': '10102010', 'TTE': '10102010', 'BP': '10102010', 'EQNR': '10102010',
  // Energy - Oil & Gas E&P (10102020)
  'COP': '10102020', 'EOG': '10102020', 'PXD': '10102020', 'DVN': '10102020', 'FANG': '10102020', 'MRO': '10102020', 'OXY': '10102020', 'HES': '10102020', 'APA': '10102020',
  // Energy - Oil & Gas Refining & Marketing (10102030)
  'PSX': '10102030', 'VLO': '10102030', 'MPC': '10102030',
  // Energy - Oil & Gas Storage & Transportation (10102040)
  'WMB': '10102040', 'KMI': '10102040', 'OKE': '10102040', 'TRGP': '10102040',

  // Materials - Commodity Chemicals (15101010)
  'LYB': '15101010', 'DOW': '15101010', 'CE': '15101010',
  // Materials - Diversified Chemicals (15101020)
  'DD': '15101020',
  // Materials - Fertilizers & Agricultural Chemicals (15101030)
  'CF': '15101030', 'MOS': '15101030', 'FMC': '15101030', 'CTVA': '15101030',
  // Materials - Industrial Gases (15101040)
  'APD': '15101040', 'LIN': '15101040',
  // Materials - Specialty Chemicals (15101050)
  'ECL': '15101050', 'SHW': '15101050', 'PPG': '15101050', 'IFF': '15101050', 'ALB': '15101050',
  // Materials - Construction Materials (15102010)
  'VMC': '15102010', 'MLM': '15102010',
  // Materials - Containers & Packaging (15103010, 15103020)
  'BLL': '15103010', 'PKG': '15103020', 'IP': '15103020', 'AVY': '15103020', 'SEE': '15103020', 'AMCR': '15103020',
  // Materials - Metals & Mining
  'FCX': '15104025', 'NEM': '15104030', 'NUE': '15104050', 'STLD': '15104050',

  // Industrials - Aerospace & Defense (20101010)
  'BA': '20101010', 'LMT': '20101010', 'RTX': '20101010', 'NOC': '20101010', 'GD': '20101010', 'LHX': '20101010', 'HII': '20101010', 'TDG': '20101010', 'TXT': '20101010', 'HWM': '20101010', 'AIR': '20101010', 'SAF': '20101010',
  // Industrials - Building Products (20102010)
  'JCI': '20102010', 'CARR': '20102010', 'TT': '20102010', 'MAS': '20102010', 'LII': '20102010', 'AOS': '20102010',
  // Industrials - Construction & Engineering (20103010)
  'PWR': '20103010', 'EME': '20103010', 'MTZ': '20103010',
  // Industrials - Electrical Equipment (20104010, 20104020)
  'ETN': '20104010', 'EMR': '20104010', 'AME': '20104010', 'GNRC': '20104010', 'HUBB': '20104010', 'AYI': '20104010',
  // Industrials - Industrial Conglomerates (20105010)
  'GE': '20105010', 'HON': '20105010', 'MMM': '20105010', 'ITW': '20105010',
  // Industrials - Machinery (20106010, 20106015, 20106020)
  'CAT': '20106010', 'DE': '20106015', 'AGCO': '20106015', 'PH': '20106020', 'ROK': '20106020', 'CMI': '20106020', 'IR': '20106020', 'DOV': '20106020', 'GWW': '20106020', 'SWK': '20106020', 'FAST': '20106020', 'XYL': '20106020', 'NDSN': '20106020', 'PNR': '20106020', 'IEX': '20106020', 'OTIS': '20106020',
  // Industrials - Trading Companies & Distributors (20107010)
  'FERG': '20107010', 'WCC': '20107010',
  // Industrials - Environmental & Facilities Services (20201050)
  'WM': '20201050', 'RSG': '20201050', 'WCN': '20201050', 'CLH': '20201050', 'CTAS': '20201050', 'CPRT': '20201050', 'VRSK': '20201050', 'ROL': '20201050',
  // Industrials - Professional Services (20202010, 20202020)
  'ADP': '20202010', 'PAYX': '20202010', 'EFX': '20202020', 'EXPD': '20202020', 'JBHT': '20202020', 'CHRW': '20202020',
  // Industrials - Air Freight & Logistics (20301010)
  'UPS': '20301010', 'FDX': '20301010',
  // Industrials - Passenger Airlines (20302010)
  'DAL': '20302010', 'UAL': '20302010', 'LUV': '20302010', 'AAL': '20302010', 'ALK': '20302010',
  // Industrials - Rail Transportation (20304010)
  'UNP': '20304010', 'CSX': '20304010', 'NSC': '20304010',
  // Industrials - Cargo Ground Transportation (20304020)
  'ODFL': '20304020',

  // Consumer Discretionary - Automotive Parts & Equipment (25101010)
  'APTV': '25101010', 'BWA': '25101010', 'LEA': '25101010',
  // Consumer Discretionary - Automobile Manufacturers (25102010)
  'TSLA': '25102010', 'F': '25102010', 'GM': '25102010', 'RIVN': '25102010', 'LCID': '25102010', 'VOW3': '25102010', 'BMW': '25102010', 'MBG': '25102010', 'STLAM': '25102010', 'RNO': '25102010',
  // Consumer Discretionary - Consumer Electronics (25201010)
  // Consumer Discretionary - Home Furnishings (25201020)
  'WHR': '25201040', 'TPR': '25203010',
  // Consumer Discretionary - Homebuilding (25201030)
  'LEN': '25201030', 'DHI': '25201030', 'PHM': '25201030', 'NVR': '25201030', 'TOL': '25201030',
  // Consumer Discretionary - Leisure Products (25202010)
  'POOL': '25202010', 'HAS': '25202010',
  // Consumer Discretionary - Apparel, Accessories & Luxury Goods (25203010)
  'NKE': '25203010', 'LULU': '25203010', 'VFC': '25203010', 'PVH': '25203010', 'RL': '25203010', 'GRMN': '25203010', 'MC': '25203010', 'RMS': '25203010', 'KER': '25203010', 'CFR': '25203010',
  // Consumer Discretionary - Footwear (25203020)
  // Consumer Discretionary - Casinos & Gaming (25301010)
  'LVS': '25301010', 'WYNN': '25301010', 'CZR': '25301010', 'MGM': '25301010', 'PENN': '25301010',
  // Consumer Discretionary - Hotels, Resorts & Cruise Lines (25301020)
  'MAR': '25301020', 'HLT': '25301020', 'H': '25301020', 'CCL': '25301020', 'RCL': '25301020', 'NCLH': '25301020', 'BKNG': '25301020', 'EXPE': '25301020', 'ABNB': '25301020',
  // Consumer Discretionary - Leisure Facilities (25301030)
  'DRI': '25301040', 'YUM': '25301040', 'MCD': '25301040', 'SBUX': '25301040', 'CMG': '25301040', 'DPZ': '25301040', 'DARDEN': '25301040',
  // Consumer Discretionary - Restaurants (25301040)
  'QSR': '25301040',
  // Consumer Discretionary - Internet & Direct Marketing Retail (25502020)
  'AMZN': '25502020', 'EBAY': '25502020', 'ETSY': '25502020', 'W': '25502020', 'CHWY': '25502020',
  // Consumer Discretionary - Broadline Retail (25503010)
  'WMT': '25503010', 'TGT': '25503010', 'COST': '25503010', 'DG': '25503010', 'DLTR': '25503010',
  // Consumer Discretionary - Apparel Retail (25504010)
  'TJX': '25504010', 'ROST': '25504010', 'GAP': '25504010',
  // Consumer Discretionary - Home Improvement Retail (25504030)
  'HD': '25504030', 'LOW': '25504030',
  // Consumer Discretionary - Other Specialty Retail (25504040)
  'BBY': '25504040', 'ULTA': '25504040', 'TSCO': '25504040', 'ORLY': '25504040', 'AZO': '25504040', 'AAP': '25504040',
  // Consumer Discretionary - Automotive Retail (25504050)
  'KMX': '25504050', 'AN': '25504050',

  // Consumer Staples - Drug Retail (30101010)
  'WBA': '30101010', 'CVS': '30101010',
  // Consumer Staples - Food Distributors (30101020)
  'SYY': '30101020', 'USFD': '30101020',
  // Consumer Staples - Food Retail (30101030)
  'KR': '30101030',
  // Consumer Staples - Consumer Staples Merchandise Retail (30101040)
  // Consumer Staples - Brewers (30201010)
  'TAP': '30201010', 'ABI': '30201010', 'HEIA': '30201010',
  // Consumer Staples - Distillers & Vintners (30201020)
  'BF.B': '30201020', 'STZ': '30201020', 'DEO': '30201020', 'RI': '30201020',
  // Consumer Staples - Soft Drinks (30201030)
  'KO': '30201030', 'PEP': '30201030', 'KDP': '30201030', 'MNST': '30201030',
  // Consumer Staples - Agricultural Products (30202010)
  'ADM': '30202010', 'BG': '30202010',
  // Consumer Staples - Packaged Foods & Meats (30202030)
  'MDLZ': '30202030', 'GIS': '30202030', 'K': '30202030', 'HSY': '30202030', 'SJM': '30202030', 'CAG': '30202030', 'CPB': '30202030', 'MKC': '30202030', 'HRL': '30202030', 'TSN': '30202030', 'NESN': '30202030', 'ULVR': '30202030', 'DGE': '30202030',
  // Consumer Staples - Tobacco (30203010)
  'PM': '30203010', 'MO': '30203010', 'BTI': '30203010', 'IMB': '30203010',
  // Consumer Staples - Household Products (30301010)
  'PG': '30301010', 'CL': '30301010', 'CLX': '30301010', 'CHD': '30301010', 'KMB': '30301010',
  // Consumer Staples - Personal Care Products (30302010)
  'EL': '30302010', 'OR': '30302010',

  // Health Care - Health Care Equipment (35101010)
  'ABT': '35101010', 'MDT': '35101010', 'SYK': '35101010', 'BSX': '35101010', 'EW': '35101010', 'ISRG': '35101010', 'BDX': '35101010', 'ZBH': '35101010', 'DXCM': '35101010', 'BAX': '35101010', 'HOLX': '35101010', 'IDXX': '35101010', 'ALGN': '35101010', 'TFX': '35101010', 'PODD': '35101010', 'PEN': '35101010',
  // Health Care - Health Care Supplies (35101020)
  'COO': '35101020',
  // Health Care - Health Care Distributors (35102010)
  'MCK': '35102010', 'CAH': '35102010', 'ABC': '35102010',
  // Health Care - Health Care Services (35102015)
  'CVS': '35102015', 'HCA': '35102020', 'UHS': '35102020',
  // Health Care - Managed Health Care (35102030)
  'UNH': '35102030', 'ELV': '35102030', 'CI': '35102030', 'HUM': '35102030', 'CNC': '35102030', 'MOH': '35102030',
  // Health Care - Health Care Technology (35103010)
  'VEEV': '35103010',
  // Health Care - Biotechnology (35201010)
  'AMGN': '35201010', 'GILD': '35201010', 'REGN': '35201010', 'VRTX': '35201010', 'BIIB': '35201010', 'MRNA': '35201010', 'ILMN': '35201010', 'SGEN': '35201010', 'ALNY': '35201010', 'INCY': '35201010', 'TECH': '35201010',
  // Health Care - Pharmaceuticals (35202010)
  'JNJ': '35202010', 'LLY': '35202010', 'PFE': '35202010', 'MRK': '35202010', 'ABBV': '35202010', 'BMY': '35202010', 'NVS': '35202010', 'AZN': '35202010', 'SNY': '35202010', 'GSK': '35202010', 'ZTS': '35202010', 'VTRS': '35202010', 'TAK': '35202010', 'NOVO': '35202010', 'ROG': '35202010',
  // Health Care - Life Sciences Tools & Services (35203010)
  'TMO': '35203010', 'DHR': '35203010', 'A': '35203010', 'WATERS': '35203010', 'MTD': '35203010', 'IQV': '35203010', 'PKI': '35203010', 'BIO': '35203010', 'CRL': '35203010', 'RVTY': '35203010',

  // Financials - Diversified Banks (40101010)
  'JPM': '40101010', 'BAC': '40101010', 'WFC': '40101010', 'C': '40101010', 'USB': '40101010', 'PNC': '40101010', 'TFC': '40101010', 'HSBA': '40101010', 'SAN': '40101010', 'INGA': '40101010', 'BNP': '40101010', 'UBSG': '40101010', 'DBK': '40101010', 'BARC': '40101010', 'ISP': '40101010', 'UCG': '40101010',
  // Financials - Regional Banks (40101015)
  'FITB': '40101015', 'MTB': '40101015', 'KEY': '40101015', 'CFG': '40101015', 'RF': '40101015', 'HBAN': '40101015', 'ZION': '40101015', 'CMA': '40101015', 'FHN': '40101015',
  // Financials - Diversified Financial Services (40201020)
  'BRK.B': '40201030', 'BRK.A': '40201030',
  // Financials - Specialized Finance (40201040)
  'ICE': '40201040', 'CME': '40201040', 'NDAQ': '40201040', 'CBOE': '40201040', 'MSCI': '40201040', 'SPGI': '40201040', 'MCO': '40201040',
  // Financials - Transaction & Payment Processing Services (40201060)
  'V': '40201060', 'MA': '40201060', 'PYPL': '40201060', 'AXP': '40201060', 'COF': '40201060', 'SYF': '40201060', 'DFS': '40201060', 'FIS': '40201060', 'FISV': '40201060', 'GPN': '40201060', 'ADP': '40201060', 'ADYEN': '40201060',
  // Financials - Consumer Finance (40202010)
  'AXP': '40202010',
  // Financials - Asset Management & Custody Banks (40203010)
  'BLK': '40203010', 'SCHW': '40203010', 'STT': '40203010', 'BK': '40203010', 'NTRS': '40203010', 'TROW': '40203010', 'BEN': '40203010', 'IVZ': '40203010', 'AMG': '40203010',
  // Financials - Investment Banking & Brokerage (40203020)
  'GS': '40203020', 'MS': '40203020', 'RJF': '40203020', 'LPLA': '40203020',
  // Financials - Financial Exchanges & Data (40203040)
  // Financials - Insurance Brokers (40301010)
  'MMC': '40301010', 'AON': '40301010', 'AJG': '40301010', 'WTW': '40301010', 'BRO': '40301010',
  // Financials - Life & Health Insurance (40301020)
  'MET': '40301020', 'PRU': '40301020', 'AFL': '40301020', 'LNC': '40301020', 'VOYA': '40301020', 'GL': '40301020',
  // Financials - Multi-line Insurance (40301030)
  'AIG': '40301030', 'HIG': '40301030', 'ALL': '40301030',
  // Financials - Property & Casualty Insurance (40301040)
  'TRV': '40301040', 'CB': '40301040', 'PGR': '40301040', 'CINF': '40301040', 'WRB': '40301040', 'L': '40301040',
  // Financials - Reinsurance (40301050)
  'RE': '40301050',

  // Information Technology - IT Consulting & Other Services (45102010)
  'ACN': '45102010', 'IBM': '45102010', 'CTSH': '45102010', 'INFY': '45102010', 'WIT': '45102010', 'EPAM': '45102010', 'CDW': '45102010', 'DXC': '45102010',
  // Information Technology - Internet Services & Infrastructure (45102020)
  'AKAM': '45102020', 'EQIX': '45102020', 'NET': '45102020', 'TWLO': '45102020', 'DOCN': '45102020',
  // Information Technology - Application Software (45103010)
  'MSFT': '45103010', 'CRM': '45103010', 'ADBE': '45103010', 'ORCL': '45103010', 'NOW': '45103010', 'INTU': '45103010', 'SNPS': '45103010', 'CDNS': '45103010', 'WDAY': '45103010', 'PANW': '45103010', 'CRWD': '45103010', 'FTNT': '45103010', 'ZS': '45103010', 'ANSS': '45103010', 'ADSK': '45103010', 'ROP': '45103010', 'TYL': '45103010', 'PTC': '45103010', 'PAYC': '45103010', 'HUBS': '45103010', 'DDOG': '45103010', 'SNOW': '45103010', 'MDB': '45103010', 'TEAM': '45103010', 'ZM': '45103010', 'SPLK': '45103010', 'SAP': '45103010',
  // Information Technology - Systems Software (45103020)
  'ORCL': '45103020', 'VMW': '45103020', 'OKTA': '45103020', 'GEN': '45103020',
  // Information Technology - Communications Equipment (45201020)
  'CSCO': '45201020', 'ANET': '45201020', 'MSI': '45201020', 'JNPR': '45201020', 'FFIV': '45201020', 'NOK': '45201020', 'ERIC': '45201020',
  // Information Technology - Technology Hardware, Storage & Peripherals (45202030)
  'AAPL': '45202030', 'HPQ': '45202030', 'HPE': '45202030', 'DELL': '45202030', 'STX': '45202030', 'WDC': '45202030', 'NTAP': '45202030', 'PSTG': '45202030',
  // Information Technology - Electronic Equipment & Instruments (45203010)
  'KEYS': '45203010', 'TDY': '45203010', 'TRMB': '45203010', 'FTV': '45203010', 'ZBRA': '45203010', 'GRMN': '45203010', 'JBL': '45203010',
  // Information Technology - Electronic Components (45203015)
  'GLW': '45203015', 'TEL': '45203015', 'APH': '45203015', 'CDW': '45203015', 'COHR': '45203015',
  // Information Technology - Technology Distributors (45203030)
  // Information Technology - Semiconductor Materials & Equipment (45301010)
  'AMAT': '45301010', 'LRCX': '45301010', 'KLAC': '45301010', 'ASML': '45301010', 'TER': '45301010', 'ENTG': '45301010', 'MKSI': '45301010',
  // Information Technology - Semiconductors (45301020)
  'NVDA': '45301020', 'AMD': '45301020', 'AVGO': '45301020', 'INTC': '45301020', 'QCOM': '45301020', 'TXN': '45301020', 'MU': '45301020', 'ADI': '45301020', 'MCHP': '45301020', 'ON': '45301020', 'NXPI': '45301020', 'MRVL': '45301020', 'SWKS': '45301020', 'QRVO': '45301020', 'MPWR': '45301020', 'SMCI': '45301020', 'ARM': '45301020', 'STM': '45301020', 'IFNNY': '45301020', 'IFX': '45301020',

  // Communication Services - Integrated Telecommunication Services (50101020)
  'T': '50101020', 'VZ': '50101020', 'TMUS': '50101020', 'LUMN': '50101020', 'DTE': '50101020', 'TEF': '50101020', 'VOD': '50101020', 'ORAN': '50101020',
  // Communication Services - Wireless Telecommunication Services (50102010)
  // Communication Services - Advertising (50201010)
  'OMC': '50201010', 'IPG': '50201010', 'WPP': '50201010', 'PUB': '50201010',
  // Communication Services - Broadcasting (50201020)
  'CMCSA': '50201020', 'FOXA': '50201020', 'FOX': '50201020', 'PARA': '50201020', 'WBD': '50201020',
  // Communication Services - Cable & Satellite (50201030)
  'CHTR': '50201030',
  // Communication Services - Publishing (50201040)
  'NYT': '50201040', 'NWSA': '50201040',
  // Communication Services - Movies & Entertainment (50202010)
  'DIS': '50202010', 'NFLX': '50202010', 'WBD': '50202010', 'LYV': '50202010', 'SPOT': '50202010',
  // Communication Services - Interactive Home Entertainment (50202020)
  'EA': '50202020', 'TTWO': '50202020', 'RBLX': '50202020', 'ATVI': '50202020',
  // Communication Services - Interactive Media & Services (50203010)
  'GOOGL': '50203010', 'GOOG': '50203010', 'META': '50203010', 'SNAP': '50203010', 'PINS': '50203010', 'ZG': '50203010', 'MTCH': '50203010',

  // Utilities - Electric Utilities (55101010)
  'NEE': '55101010', 'DUK': '55101010', 'SO': '55101010', 'D': '55101010', 'AEP': '55101010', 'SRE': '55101010', 'EXC': '55101010', 'XEL': '55101010', 'PEG': '55101010', 'ED': '55101010', 'WEC': '55101010', 'ES': '55101010', 'AWK': '55101010', 'DTE': '55101010', 'PPL': '55101010', 'FE': '55101010', 'ETR': '55101010', 'AEE': '55101010', 'CMS': '55101010', 'CEG': '55101010', 'EVRG': '55101010', 'ATO': '55101010', 'CNP': '55101010', 'NI': '55101010', 'PNW': '55101010', 'NRG': '55101010', 'VST': '55101010',
  // Utilities - Multi-Utilities (55103010)
  'PCG': '55103010', 'EIX': '55103010',
  // Utilities - Water Utilities (55104010)
  'AWK': '55104010',
  // Utilities - Independent Power Producers & Energy Traders (55105010)
  // Utilities - Renewable Electricity (55105020)

  // Real Estate - Industrial REITs (60102510)
  'PLD': '60102510', 'WELL': '60102510',
  // Real Estate - Data Center REITs (60108020)
  'EQIX': '60108020', 'DLR': '60108020',
  // Real Estate - Self-Storage REITs (60108030)
  'PSA': '60108030', 'EXR': '60108030',
  // Real Estate - Telecom Tower REITs (60108040)
  'AMT': '60108040', 'CCI': '60108040', 'SBAC': '60108040',
  // Real Estate - Retail REITs (60107010)
  'SPG': '60107010', 'O': '60107010', 'KIM': '60107010', 'REG': '60107010',
  // Real Estate - Residential REITs (60106010, 60106020)
  'AVB': '60106010', 'EQR': '60106010', 'MAA': '60106010', 'UDR': '60106010', 'INVH': '60106020',
  // Real Estate - Office REITs (60104010)
  'ARE': '60104010', 'BXP': '60104010',
  // Real Estate - Health Care REITs (60105010)
  'VTR': '60105010', 'PEAK': '60105010',
  // Real Estate - Real Estate Services (60201040)
  'CBRE': '60201040', 'CWK': '60201040',
};

// Get stocks by GICS sub-industry code
export function getStocksBySubIndustry(subIndustryCode: string): string[] {
  return Object.entries(STOCK_GICS_MAP)
    .filter(([, code]) => code === subIndustryCode)
    .map(([ticker]) => ticker);
}

// Get stocks by GICS industry code (6 digits - matches all sub-industries)
export function getStocksByIndustry(industryCode: string): string[] {
  return Object.entries(STOCK_GICS_MAP)
    .filter(([, code]) => code.startsWith(industryCode))
    .map(([ticker]) => ticker);
}

// Get stocks by GICS industry group code (4 digits)
export function getStocksByIndustryGroup(groupCode: string): string[] {
  return Object.entries(STOCK_GICS_MAP)
    .filter(([, code]) => code.startsWith(groupCode))
    .map(([ticker]) => ticker);
}

// Get stocks by GICS sector code (2 digits)
export function getStocksBySector(sectorCode: string): string[] {
  return Object.entries(STOCK_GICS_MAP)
    .filter(([, code]) => code.startsWith(sectorCode))
    .map(([ticker]) => ticker);
}

// Helper functions
export function getSectorByCode(code: string): GICSSector | undefined {
  return GICS_SECTORS.find(s => s.code === code);
}

export function getIndustryGroupByCode(code: string): GICSIndustryGroup | undefined {
  for (const sector of GICS_SECTORS) {
    const group = sector.industryGroups.find(g => g.code === code);
    if (group) return group;
  }
  return undefined;
}

export function getIndustryByCode(code: string): GICSIndustry | undefined {
  for (const sector of GICS_SECTORS) {
    for (const group of sector.industryGroups) {
      const industry = group.industries.find(i => i.code === code);
      if (industry) return industry;
    }
  }
  return undefined;
}

export function getSubIndustryByCode(code: string): GICSSubIndustry | undefined {
  for (const sector of GICS_SECTORS) {
    for (const group of sector.industryGroups) {
      for (const industry of group.industries) {
        const subIndustry = industry.subIndustries.find(s => s.code === code);
        if (subIndustry) return subIndustry;
      }
    }
  }
  return undefined;
}
