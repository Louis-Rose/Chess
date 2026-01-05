// Company Investor Relations links - maps stock tickers to IR page URLs

const TICKER_TO_IR: Record<string, string> = {
  // Tech Giants
  AAPL: 'https://investor.apple.com',
  MSFT: 'https://www.microsoft.com/en-us/investor',
  GOOGL: 'https://abc.xyz/investor',
  GOOG: 'https://abc.xyz/investor',
  AMZN: 'https://ir.aboutamazon.com',
  META: 'https://investor.fb.com',
  NVDA: 'https://investor.nvidia.com',
  TSLA: 'https://ir.tesla.com',
  NFLX: 'https://ir.netflix.net',
  ADBE: 'https://www.adobe.com/investor-relations.html',
  CRM: 'https://investor.salesforce.com',
  ORCL: 'https://investor.oracle.com',
  INTC: 'https://www.intc.com',
  AMD: 'https://ir.amd.com',
  CSCO: 'https://investor.cisco.com',
  IBM: 'https://www.ibm.com/investor',
  QCOM: 'https://investor.qualcomm.com',
  TXN: 'https://investor.ti.com',
  AVGO: 'https://investors.broadcom.com',
  NOW: 'https://investors.servicenow.com',
  INTU: 'https://investors.intuit.com',
  PYPL: 'https://investor.pypl.com/home/',
  SQ: 'https://investors.block.xyz',
  SHOP: 'https://investors.shopify.com',
  UBER: 'https://investor.uber.com',
  LYFT: 'https://investor.lyft.com',
  ABNB: 'https://investors.airbnb.com',
  SNAP: 'https://investor.snap.com',
  PINS: 'https://investor.pinterestinc.com',
  SPOT: 'https://investors.spotify.com',
  ZM: 'https://investors.zoom.us',
  DOCU: 'https://investor.docusign.com',
  CRWD: 'https://ir.crowdstrike.com',
  PANW: 'https://investors.paloaltonetworks.com',
  ZS: 'https://ir.zscaler.com',
  OKTA: 'https://investor.okta.com',
  DDOG: 'https://investors.datadoghq.com',
  SNOW: 'https://investors.snowflake.com',
  MDB: 'https://investors.mongodb.com',
  NET: 'https://cloudflare.net/home/default.aspx',
  PLTR: 'https://investors.palantir.com',
  COIN: 'https://investor.coinbase.com',
  HOOD: 'https://investors.robinhood.com',

  // Finance
  JPM: 'https://www.jpmorganchase.com/ir',
  BAC: 'https://investor.bankofamerica.com',
  WFC: 'https://www.wellsfargo.com/about/investor-relations',
  C: 'https://www.citigroup.com/global/investors',
  GS: 'https://www.goldmansachs.com/investor-relations',
  MS: 'https://www.morganstanley.com/about-us-ir',
  BLK: 'https://ir.blackrock.com',
  SCHW: 'https://www.aboutschwab.com/investor-relations',
  AXP: 'https://ir.americanexpress.com',
  V: 'https://investor.visa.com',
  MA: 'https://investor.mastercard.com',
  COF: 'https://ir.capitalone.com',

  // Healthcare & Pharma
  JNJ: 'https://investor.jnj.com',
  UNH: 'https://www.unitedhealthgroup.com/investors.html',
  PFE: 'https://investors.pfizer.com',
  MRK: 'https://www.merck.com/investor-relations',
  ABBV: 'https://investors.abbvie.com',
  LLY: 'https://investor.lilly.com',
  TMO: 'https://ir.thermofisher.com',
  ABT: 'https://www.abbott.com/investors.html',
  BMY: 'https://www.bms.com/investors.html',
  AMGN: 'https://investors.amgen.com',
  GILD: 'https://investors.gilead.com',
  ISRG: 'https://isrg.intuitive.com',
  MDT: 'https://investorrelations.medtronic.com',
  CVS: 'https://investors.cvshealth.com',
  MRNA: 'https://investors.modernatx.com',
  REGN: 'https://investor.regeneron.com',
  VRTX: 'https://investors.vrtx.com',

  // Consumer
  WMT: 'https://stock.walmart.com',
  HD: 'https://ir.homedepot.com',
  PG: 'https://pginvestor.com',
  KO: 'https://investors.coca-colacompany.com',
  PEP: 'https://investor.pepsico.com',
  COST: 'https://investor.costco.com',
  MCD: 'https://investor.mcdonalds.com',
  NKE: 'https://investors.nike.com',
  SBUX: 'https://investor.starbucks.com',
  TGT: 'https://investors.target.com',
  LOW: 'https://ir.lowes.com',
  DIS: 'https://thewaltdisneycompany.com/investor-relations',
  CMCSA: 'https://www.cmcsa.com',
  VZ: 'https://www.verizon.com/about/investors',
  T: 'https://investors.att.com',
  TMUS: 'https://investor.t-mobile.com',

  // Industrial & Energy
  XOM: 'https://investor.exxonmobil.com',
  CVX: 'https://www.chevron.com/investors',
  COP: 'https://investor.conocophillips.com',
  SLB: 'https://investorcenter.slb.com',
  BA: 'https://investors.boeing.com',
  CAT: 'https://investors.caterpillar.com',
  DE: 'https://investor.deere.com',
  HON: 'https://investor.honeywell.com',
  GE: 'https://www.ge.com/investor-relations',
  MMM: 'https://investors.3m.com',
  UPS: 'https://investors.ups.com',
  FDX: 'https://investors.fedex.com',
  LMT: 'https://investors.lockheedmartin.com',
  RTX: 'https://rtx.com/investors',
  NOC: 'https://investor.northropgrumman.com',

  // Auto
  F: 'https://shareholder.ford.com',
  GM: 'https://investor.gm.com',

  // Other notable
  'BRK.B': 'https://www.berkshirehathaway.com',
  'BRK.A': 'https://www.berkshirehathaway.com',
  BRK: 'https://www.berkshirehathaway.com',

  // Retail & E-commerce
  EBAY: 'https://investors.ebayinc.com',
  ETSY: 'https://investors.etsy.com',
  BBY: 'https://investors.bestbuy.com',

  // Food & Beverage
  MDLZ: 'https://ir.mondelezinternational.com',
  KHC: 'https://ir.kraftheinzcompany.com',
  GIS: 'https://investors.generalmills.com',
  HSY: 'https://investors.thehersheycompany.com',

  // Travel & Leisure
  MAR: 'https://marriott.gcs-web.com',
  HLT: 'https://ir.hilton.com',
  DAL: 'https://ir.delta.com',
  UAL: 'https://ir.united.com',
  LUV: 'https://www.southwestairlinesinvestorrelations.com',
  BKNG: 'https://ir.bookingholdings.com',

  // Media & Entertainment
  EA: 'https://ir.ea.com',
  TTWO: 'https://ir.take2games.com',
  RBLX: 'https://ir.roblox.com',
  U: 'https://investors.unity.com',

  // Real Estate
  AMT: 'https://www.americantower.com/investor-relations',
  PLD: 'https://ir.prologis.com',
  EQIX: 'https://investor.equinix.com',
};

/**
 * Get investor relations URL for a stock ticker
 * Returns null if no IR link is known for this ticker
 */
export function getCompanyIRUrl(ticker: string): string | null {
  const upperTicker = ticker.toUpperCase();
  return TICKER_TO_IR[upperTicker] || null;
}
