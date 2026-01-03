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
