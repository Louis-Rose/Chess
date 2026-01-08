// Swiss Performance Index (SPI) stocks - Swiss Exchange listed companies
// These are Swiss companies not already in STOXX 600

export interface Stock {
  ticker: string;
  name: string;
}

export const swissStocks: Stock[] = [
  // Large caps (some overlap with STOXX 600, but included for completeness)
  { ticker: 'NESN', name: 'Nestle' },
  { ticker: 'NOVN', name: 'Novartis' },
  { ticker: 'ROG', name: 'Roche Holding' },
  { ticker: 'UBSG', name: 'UBS Group' },
  { ticker: 'ABBN', name: 'ABB' },
  { ticker: 'CFR', name: 'Richemont' },
  { ticker: 'ZURN', name: 'Zurich Insurance' },
  { ticker: 'HOLN', name: 'Holcim' },
  { ticker: 'SREN', name: 'Swiss Re' },
  { ticker: 'VAHN', name: 'Vaudoise Assurances' },
  { ticker: 'LONN', name: 'Lonza Group' },
  { ticker: 'ALC', name: 'Alcon' },
  { ticker: 'GIVN', name: 'Givaudan' },
  { ticker: 'SIKA', name: 'Sika' },
  { ticker: 'SLHN', name: 'Swiss Life' },
  { ticker: 'PGHN', name: 'Partners Group' },
  { ticker: 'GEBN', name: 'Geberit' },
  { ticker: 'SGSN', name: 'SGS' },
  { ticker: 'UHR', name: 'Swatch Group' },

  // Mid caps
  { ticker: 'SCMN', name: 'Swisscom' },
  { ticker: 'SCHP', name: 'Schindler Holding' },
  { ticker: 'STMN', name: 'Straumann Holding' },
  { ticker: 'SOON', name: 'Sonova Holding' },
  { ticker: 'LOGN', name: 'Logitech' },
  { ticker: 'TEMN', name: 'Temenos' },
  { ticker: 'BALN', name: 'Baloise Holding' },
  { ticker: 'BARN', name: 'Barry Callebaut' },
  { ticker: 'ADEN', name: 'Adecco Group' },
  { ticker: 'VACN', name: 'VAT Group' },
  { ticker: 'KNIN', name: 'Kuehne + Nagel' },
  { ticker: 'LNDN', name: 'Lindt & Sprungli' },
  { ticker: 'EMSH', name: 'EMS-Chemie' },
  { ticker: 'BAER', name: 'Julius Baer' },
  { ticker: 'CLN', name: 'Clariant' },
  { ticker: 'GALD', name: 'Galderma Group' },
  { ticker: 'SDOZ', name: 'Sandoz Group' },

  // Swiss banks and financials
  { ticker: 'SQN', name: 'Swissquote Group' },
  { ticker: 'EFGN', name: 'EFG International' },
  { ticker: 'VONN', name: 'Vontobel Holding' },
  { ticker: 'CMBN', name: 'Cembra Money Bank' },
  { ticker: 'VALN', name: 'Valiant Holding' },
  { ticker: 'VZH', name: 'VZ Holding' },
  { ticker: 'BCVN', name: 'Banque Cantonale Vaudoise' },
  { ticker: 'SGKN', name: 'St. Galler Kantonalbank' },
  { ticker: 'BKBN', name: 'Berner Kantonalbank' },
  { ticker: 'THKB', name: 'Thurgauer Kantonalbank' },
  { ticker: 'ZUGK', name: 'Zuger Kantonalbank' },
  { ticker: 'GKB', name: 'Graubundner Kantonalbank' },
  { ticker: 'LLBN', name: 'Liechtensteinische Landesbank' },

  // Real estate
  { ticker: 'SPRE', name: 'Swiss Prime Site' },
  { ticker: 'PSPN', name: 'PSP Swiss Property' },
  { ticker: 'MOBN', name: 'Mobimo Holding' },
  { ticker: 'ALLH', name: 'Allreal Holding' },

  // Healthcare & Pharma
  { ticker: 'MEDN', name: 'Medacta Group' },
  { ticker: 'YPSN', name: 'Ypsomed Holding' },
  { ticker: 'GALN', name: 'Galenica' },
  { ticker: 'BACH', name: 'Bachem Holding' },
  { ticker: 'DOTT', name: 'Dottikon ES Holding' },
  { ticker: 'SIE', name: 'Siegfried Holding' },
  { ticker: 'BION', name: 'BB Biotech' },

  // Industrials
  { ticker: 'BUCN', name: 'Bucher Industries' },
  { ticker: 'GF', name: 'Georg Fischer' },
  { ticker: 'SUN', name: 'Sulzer' },
  { ticker: 'BEAN', name: 'Belimo Holding' },
  { ticker: 'SFSG', name: 'SFS Group' },
  { ticker: 'HUBN', name: 'Huber+Suhner' },
  { ticker: 'DMKN', name: 'Dormakaba Holding' },
  { ticker: 'DAWG', name: 'Datwyler Holding' },
  { ticker: 'IFCN', name: 'Inficon Holding' },
  { ticker: 'ACLN', name: 'Accelleron Industries' },
  { ticker: 'SIGG', name: 'SIG Group' },
  { ticker: 'BOBNN', name: 'Bobst Group' },
  { ticker: 'KOMAX', name: 'Komax Holding' },
  { ticker: 'ARYN', name: 'Aryzta' },

  // Consumer & Services
  { ticker: 'DKSH', name: 'DKSH Holding' },
  { ticker: 'AVOL', name: 'Avolta (Dufry)' },
  { ticker: 'EMMI', name: 'Emmi' },
  { ticker: 'BELL', name: 'Bell Food Group' },
  { ticker: 'ORNA', name: 'Orior' },
  { ticker: 'HBLN', name: 'Hochdorf Holding' },

  // Technology
  { ticker: 'ALSN', name: 'Also Holding' },
  { ticker: 'SOFTG', name: 'Softwareone Holding' },
  { ticker: 'UHRN', name: 'U-blox Holding' },
  { ticker: 'SENS', name: 'Sensirion Holding' },
  { ticker: 'COTN', name: 'Comet Holding' },

  // Energy & Utilities
  { ticker: 'BKW', name: 'BKW' },
  { ticker: 'ROMN', name: 'Romande Energie' },

  // Transport & Infrastructure
  { ticker: 'FHZN', name: 'Flughafen Zurich' },
  { ticker: 'BCGE', name: 'Banque Cantonale de Geneve' },

  // Other
  { ticker: 'HELN', name: 'Helvetia Holding' },
  { ticker: 'APGN', name: 'APG SGA' },
  { ticker: 'KARN', name: 'Kardex Holding' },
  { ticker: 'ZEHN', name: 'Zehnder Group' },
  { ticker: 'VETN', name: 'Vetropack Holding' },
  { ticker: 'FORN', name: 'Forbo Holding' },
  { ticker: 'MBTN', name: 'Meyer Burger Technology' },
  { ticker: 'PEHN', name: 'Peach Property Group' },
  { ticker: 'HIAG', name: 'Hiag Immobilien' },
  { ticker: 'LUKN', name: 'Luzerner Kantonalbank' },
  { ticker: 'GURN', name: 'Gurit Holding' },
  { ticker: 'LISP', name: 'Landis+Gyr Group' },
  { ticker: 'INRN', name: 'Interroll Holding' },
  { ticker: 'VBSN', name: 'Valora Holding' },
  { ticker: 'WARN', name: 'Warteck Invest' },
  { ticker: 'APTS', name: 'Apartis' },
];
