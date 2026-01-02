// Company logo utilities - maps stock tickers to company domains for logo fetching

// Map of ticker -> company domain (for Clearbit logo API)
const TICKER_TO_DOMAIN: Record<string, string> = {
  // Tech Giants
  AAPL: 'apple.com',
  MSFT: 'microsoft.com',
  GOOGL: 'google.com',
  GOOG: 'google.com',
  AMZN: 'amazon.com',
  META: 'meta.com',
  NVDA: 'nvidia.com',
  TSLA: 'tesla.com',
  NFLX: 'netflix.com',
  ADBE: 'adobe.com',
  CRM: 'salesforce.com',
  ORCL: 'oracle.com',
  INTC: 'intel.com',
  AMD: 'amd.com',
  CSCO: 'cisco.com',
  IBM: 'ibm.com',
  QCOM: 'qualcomm.com',
  TXN: 'ti.com',
  AVGO: 'broadcom.com',
  NOW: 'servicenow.com',
  INTU: 'intuit.com',
  PYPL: 'paypal.com',
  SQ: 'squareup.com',
  SHOP: 'shopify.com',
  UBER: 'uber.com',
  LYFT: 'lyft.com',
  ABNB: 'airbnb.com',
  SNAP: 'snap.com',
  PINS: 'pinterest.com',
  TWTR: 'twitter.com',
  SPOT: 'spotify.com',
  ZM: 'zoom.us',
  DOCU: 'docusign.com',
  CRWD: 'crowdstrike.com',
  PANW: 'paloaltonetworks.com',
  ZS: 'zscaler.com',
  OKTA: 'okta.com',
  DDOG: 'datadoghq.com',
  SNOW: 'snowflake.com',
  MDB: 'mongodb.com',
  NET: 'cloudflare.com',
  PLTR: 'palantir.com',
  COIN: 'coinbase.com',
  HOOD: 'robinhood.com',

  // Finance
  JPM: 'jpmorganchase.com',
  BAC: 'bankofamerica.com',
  WFC: 'wellsfargo.com',
  C: 'citigroup.com',
  GS: 'goldmansachs.com',
  MS: 'morganstanley.com',
  BLK: 'blackrock.com',
  SCHW: 'schwab.com',
  AXP: 'americanexpress.com',
  V: 'visa.com',
  MA: 'mastercard.com',
  COF: 'capitalone.com',
  USB: 'usbank.com',
  PNC: 'pnc.com',
  TFC: 'truist.com',
  BK: 'bnymellon.com',
  STT: 'statestreet.com',

  // Healthcare & Pharma
  JNJ: 'jnj.com',
  UNH: 'unitedhealthgroup.com',
  PFE: 'pfizer.com',
  MRK: 'merck.com',
  ABBV: 'abbvie.com',
  LLY: 'lilly.com',
  TMO: 'thermofisher.com',
  ABT: 'abbott.com',
  BMY: 'bms.com',
  AMGN: 'amgen.com',
  GILD: 'gilead.com',
  ISRG: 'intuitive.com',
  MDT: 'medtronic.com',
  CVS: 'cvshealth.com',
  CI: 'cigna.com',
  HUM: 'humana.com',
  MRNA: 'modernatx.com',
  REGN: 'regeneron.com',
  VRTX: 'vrtx.com',
  BIIB: 'biogen.com',

  // Consumer
  WMT: 'walmart.com',
  HD: 'homedepot.com',
  PG: 'pg.com',
  KO: 'coca-cola.com',
  PEP: 'pepsico.com',
  COST: 'costco.com',
  MCD: 'mcdonalds.com',
  NKE: 'nike.com',
  SBUX: 'starbucks.com',
  TGT: 'target.com',
  LOW: 'lowes.com',
  DIS: 'disney.com',
  CMCSA: 'comcast.com',
  VZ: 'verizon.com',
  T: 'att.com',
  TMUS: 't-mobile.com',
  CHTR: 'charter.com',

  // Industrial & Energy
  XOM: 'exxonmobil.com',
  CVX: 'chevron.com',
  COP: 'conocophillips.com',
  SLB: 'slb.com',
  EOG: 'eogresources.com',
  BA: 'boeing.com',
  CAT: 'caterpillar.com',
  DE: 'deere.com',
  HON: 'honeywell.com',
  GE: 'ge.com',
  MMM: '3m.com',
  UPS: 'ups.com',
  FDX: 'fedex.com',
  UNP: 'up.com',
  LMT: 'lockheedmartin.com',
  RTX: 'rtx.com',
  NOC: 'northropgrumman.com',
  GD: 'gd.com',

  // Auto
  F: 'ford.com',
  GM: 'gm.com',

  // Other notable
  BRK: 'berkshirehathaway.com',
  'BRK.B': 'berkshirehathaway.com',
  'BRK.A': 'berkshirehathaway.com',
  SPY: 'ssga.com',
  QQQ: 'invesco.com',

  // Retail & E-commerce
  EBAY: 'ebay.com',
  ETSY: 'etsy.com',
  W: 'wayfair.com',
  BBY: 'bestbuy.com',
  TJX: 'tjx.com',
  ROST: 'rossstores.com',
  DG: 'dollargeneral.com',
  DLTR: 'dollartree.com',
  ORLY: 'oreillyauto.com',
  AZO: 'autozone.com',

  // Food & Beverage
  MDLZ: 'mondelezinternational.com',
  KHC: 'kraftheinzcompany.com',
  GIS: 'generalmills.com',
  K: 'kelloggs.com',
  HSY: 'thehersheycompany.com',
  SJM: 'jmsmucker.com',
  CAG: 'conagrabrands.com',
  CPB: 'campbellsoupcompany.com',
  HRL: 'hormelfoods.com',
  TSN: 'tysonfoods.com',

  // Travel & Leisure
  MAR: 'marriott.com',
  HLT: 'hilton.com',
  H: 'hyatt.com',
  WYNN: 'wynnresorts.com',
  LVS: 'sands.com',
  MGM: 'mgmresorts.com',
  CCL: 'carnival.com',
  RCL: 'royalcaribbean.com',
  NCLH: 'ncl.com',
  DAL: 'delta.com',
  UAL: 'united.com',
  LUV: 'southwest.com',
  AAL: 'aa.com',
  BKNG: 'booking.com',
  EXPE: 'expediagroup.com',

  // Media & Entertainment
  PARA: 'paramount.com',
  WBD: 'wbd.com',
  FOX: 'foxcorporation.com',
  FOXA: 'foxcorporation.com',
  EA: 'ea.com',
  TTWO: 'take2games.com',
  ATVI: 'activisionblizzard.com',
  RBLX: 'roblox.com',
  U: 'unity.com',

  // Real Estate
  AMT: 'americantower.com',
  CCI: 'crowncastle.com',
  PLD: 'prologis.com',
  EQIX: 'equinix.com',
  DLR: 'digitalrealty.com',
  SPG: 'simon.com',
  PSA: 'publicstorage.com',
  O: 'realtyincome.com',
  WELL: 'welltower.com',
  AVB: 'avalonbay.com',
  EQR: 'equityapartments.com',
};

/**
 * Get logo URL for a stock ticker
 * Uses multiple sources with fallback
 */
export function getCompanyLogoUrl(ticker: string): string | null {
  const upperTicker = ticker.toUpperCase();

  // Try Financial Modeling Prep (free, no API key needed for logos)
  return `https://financialmodelingprep.com/image-stock/${upperTicker}.png`;
}

/**
 * Check if a logo exists for a ticker
 */
export function hasCompanyLogo(ticker: string): boolean {
  return ticker.toUpperCase() in TICKER_TO_DOMAIN;
}
