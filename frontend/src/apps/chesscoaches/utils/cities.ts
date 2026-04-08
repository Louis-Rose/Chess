// City → [IANA timezone, country flag]
export const CITY_TIMEZONES: [string, string, string][] = [
  // North America
  ['New York', 'America/New_York', '\u{1F1FA}\u{1F1F8}'], ['Los Angeles', 'America/Los_Angeles', '\u{1F1FA}\u{1F1F8}'],
  ['Chicago', 'America/Chicago', '\u{1F1FA}\u{1F1F8}'], ['Houston', 'America/Chicago', '\u{1F1FA}\u{1F1F8}'],
  ['Phoenix', 'America/Phoenix', '\u{1F1FA}\u{1F1F8}'], ['San Francisco', 'America/Los_Angeles', '\u{1F1FA}\u{1F1F8}'],
  ['Seattle', 'America/Los_Angeles', '\u{1F1FA}\u{1F1F8}'], ['Denver', 'America/Denver', '\u{1F1FA}\u{1F1F8}'],
  ['Boston', 'America/New_York', '\u{1F1FA}\u{1F1F8}'], ['Miami', 'America/New_York', '\u{1F1FA}\u{1F1F8}'],
  ['Washington DC', 'America/New_York', '\u{1F1FA}\u{1F1F8}'], ['Toronto', 'America/Toronto', '\u{1F1E8}\u{1F1E6}'],
  ['Montreal', 'America/Toronto', '\u{1F1E8}\u{1F1E6}'], ['Vancouver', 'America/Vancouver', '\u{1F1E8}\u{1F1E6}'],
  ['Mexico City', 'America/Mexico_City', '\u{1F1F2}\u{1F1FD}'],
  // South America
  ['Sao Paulo', 'America/Sao_Paulo', '\u{1F1E7}\u{1F1F7}'], ['Buenos Aires', 'America/Argentina/Buenos_Aires', '\u{1F1E6}\u{1F1F7}'],
  ['Lima', 'America/Lima', '\u{1F1F5}\u{1F1EA}'], ['Bogota', 'America/Bogota', '\u{1F1E8}\u{1F1F4}'], ['Santiago', 'America/Santiago', '\u{1F1E8}\u{1F1F1}'],
  // Europe
  ['London', 'Europe/London', '\u{1F1EC}\u{1F1E7}'], ['Paris', 'Europe/Paris', '\u{1F1EB}\u{1F1F7}'], ['Lyon', 'Europe/Paris', '\u{1F1EB}\u{1F1F7}'],
  ['Marseille', 'Europe/Paris', '\u{1F1EB}\u{1F1F7}'], ['Toulouse', 'Europe/Paris', '\u{1F1EB}\u{1F1F7}'], ['Bordeaux', 'Europe/Paris', '\u{1F1EB}\u{1F1F7}'],
  ['Lille', 'Europe/Paris', '\u{1F1EB}\u{1F1F7}'], ['Nice', 'Europe/Paris', '\u{1F1EB}\u{1F1F7}'], ['Strasbourg', 'Europe/Paris', '\u{1F1EB}\u{1F1F7}'],
  ['Berlin', 'Europe/Berlin', '\u{1F1E9}\u{1F1EA}'], ['Munich', 'Europe/Berlin', '\u{1F1E9}\u{1F1EA}'],
  ['Madrid', 'Europe/Madrid', '\u{1F1EA}\u{1F1F8}'], ['Barcelona', 'Europe/Madrid', '\u{1F1EA}\u{1F1F8}'],
  ['Rome', 'Europe/Rome', '\u{1F1EE}\u{1F1F9}'], ['Milan', 'Europe/Rome', '\u{1F1EE}\u{1F1F9}'],
  ['Amsterdam', 'Europe/Amsterdam', '\u{1F1F3}\u{1F1F1}'], ['Brussels', 'Europe/Brussels', '\u{1F1E7}\u{1F1EA}'],
  ['Zurich', 'Europe/Zurich', '\u{1F1E8}\u{1F1ED}'], ['Geneva', 'Europe/Zurich', '\u{1F1E8}\u{1F1ED}'],
  ['Vienna', 'Europe/Vienna', '\u{1F1E6}\u{1F1F9}'], ['Prague', 'Europe/Prague', '\u{1F1E8}\u{1F1FF}'],
  ['Warsaw', 'Europe/Warsaw', '\u{1F1F5}\u{1F1F1}'], ['Budapest', 'Europe/Budapest', '\u{1F1ED}\u{1F1FA}'],
  ['Lisbon', 'Europe/Lisbon', '\u{1F1F5}\u{1F1F9}'], ['Dublin', 'Europe/Dublin', '\u{1F1EE}\u{1F1EA}'],
  ['Copenhagen', 'Europe/Copenhagen', '\u{1F1E9}\u{1F1F0}'], ['Stockholm', 'Europe/Stockholm', '\u{1F1F8}\u{1F1EA}'],
  ['Oslo', 'Europe/Oslo', '\u{1F1F3}\u{1F1F4}'], ['Helsinki', 'Europe/Helsinki', '\u{1F1EB}\u{1F1EE}'],
  ['Athens', 'Europe/Athens', '\u{1F1EC}\u{1F1F7}'], ['Moscow', 'Europe/Moscow', '\u{1F1F7}\u{1F1FA}'],
  ['Istanbul', 'Europe/Istanbul', '\u{1F1F9}\u{1F1F7}'], ['Kyiv', 'Europe/Kyiv', '\u{1F1FA}\u{1F1E6}'],
  // Middle East
  ['Dubai', 'Asia/Dubai', '\u{1F1E6}\u{1F1EA}'], ['Riyadh', 'Asia/Riyadh', '\u{1F1F8}\u{1F1E6}'], ['Tel Aviv', 'Asia/Jerusalem', '\u{1F1EE}\u{1F1F1}'],
  // Africa
  ['Cairo', 'Africa/Cairo', '\u{1F1EA}\u{1F1EC}'], ['Lagos', 'Africa/Lagos', '\u{1F1F3}\u{1F1EC}'], ['Nairobi', 'Africa/Nairobi', '\u{1F1F0}\u{1F1EA}'],
  ['Johannesburg', 'Africa/Johannesburg', '\u{1F1FF}\u{1F1E6}'], ['Casablanca', 'Africa/Casablanca', '\u{1F1F2}\u{1F1E6}'],
  // Asia
  ['Mumbai', 'Asia/Kolkata', '\u{1F1EE}\u{1F1F3}'], ['Delhi', 'Asia/Kolkata', '\u{1F1EE}\u{1F1F3}'], ['Bangalore', 'Asia/Kolkata', '\u{1F1EE}\u{1F1F3}'],
  ['Shanghai', 'Asia/Shanghai', '\u{1F1E8}\u{1F1F3}'], ['Beijing', 'Asia/Shanghai', '\u{1F1E8}\u{1F1F3}'],
  ['Hong Kong', 'Asia/Hong_Kong', '\u{1F1ED}\u{1F1F0}'], ['Tokyo', 'Asia/Tokyo', '\u{1F1EF}\u{1F1F5}'],
  ['Seoul', 'Asia/Seoul', '\u{1F1F0}\u{1F1F7}'], ['Singapore', 'Asia/Singapore', '\u{1F1F8}\u{1F1EC}'],
  ['Bangkok', 'Asia/Bangkok', '\u{1F1F9}\u{1F1ED}'], ['Jakarta', 'Asia/Jakarta', '\u{1F1EE}\u{1F1E9}'],
  // Oceania
  ['Sydney', 'Australia/Sydney', '\u{1F1E6}\u{1F1FA}'], ['Melbourne', 'Australia/Melbourne', '\u{1F1E6}\u{1F1FA}'],
  ['Auckland', 'Pacific/Auckland', '\u{1F1F3}\u{1F1FF}'],
];

// Timezone → currency mapping
const TZ_CURRENCY: Record<string, string> = {
  'America/New_York': 'USD', 'America/Chicago': 'USD', 'America/Denver': 'USD',
  'America/Los_Angeles': 'USD', 'America/Phoenix': 'USD',
  'America/Toronto': 'CAD', 'America/Vancouver': 'CAD',
  'America/Mexico_City': 'MXN', 'America/Sao_Paulo': 'BRL',
  'America/Argentina/Buenos_Aires': 'ARS', 'America/Lima': 'PEN',
  'America/Bogota': 'COP', 'America/Santiago': 'CLP',
  'Europe/London': 'GBP', 'Europe/Dublin': 'EUR',
  'Europe/Paris': 'EUR', 'Europe/Berlin': 'EUR', 'Europe/Madrid': 'EUR',
  'Europe/Rome': 'EUR', 'Europe/Amsterdam': 'EUR', 'Europe/Brussels': 'EUR',
  'Europe/Vienna': 'EUR', 'Europe/Lisbon': 'EUR', 'Europe/Helsinki': 'EUR',
  'Europe/Athens': 'EUR', 'Europe/Zurich': 'CHF', 'Europe/Prague': 'CZK',
  'Europe/Warsaw': 'PLN', 'Europe/Budapest': 'HUF',
  'Europe/Copenhagen': 'DKK', 'Europe/Stockholm': 'SEK', 'Europe/Oslo': 'NOK',
  'Europe/Moscow': 'RUB', 'Europe/Istanbul': 'TRY', 'Europe/Kyiv': 'UAH',
  'Asia/Dubai': 'AED', 'Asia/Riyadh': 'SAR', 'Asia/Jerusalem': 'ILS',
  'Asia/Kolkata': 'INR', 'Asia/Shanghai': 'CNY', 'Asia/Hong_Kong': 'HKD',
  'Asia/Tokyo': 'JPY', 'Asia/Seoul': 'KRW', 'Asia/Singapore': 'SGD',
  'Asia/Bangkok': 'THB', 'Asia/Jakarta': 'IDR',
  'Africa/Cairo': 'EGP', 'Africa/Lagos': 'NGN', 'Africa/Nairobi': 'KES',
  'Africa/Johannesburg': 'ZAR', 'Africa/Casablanca': 'MAD',
  'Australia/Sydney': 'AUD', 'Australia/Melbourne': 'AUD',
  'Pacific/Auckland': 'NZD',
};

// Currency code → full name
export const CURRENCY_NAMES: Record<string, string> = {
  USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', CAD: 'Canadian Dollar',
  AUD: 'Australian Dollar', CHF: 'Swiss Franc', JPY: 'Japanese Yen', CNY: 'Chinese Yuan',
  INR: 'Indian Rupee', BRL: 'Brazilian Real', MXN: 'Mexican Peso', KRW: 'South Korean Won',
  SGD: 'Singapore Dollar', HKD: 'Hong Kong Dollar', SEK: 'Swedish Krona', NOK: 'Norwegian Krone',
  DKK: 'Danish Krone', NZD: 'New Zealand Dollar', ZAR: 'South African Rand', PLN: 'Polish Zloty',
  CZK: 'Czech Koruna', HUF: 'Hungarian Forint', TRY: 'Turkish Lira', ILS: 'Israeli Shekel',
  AED: 'UAE Dirham', SAR: 'Saudi Riyal', THB: 'Thai Baht', IDR: 'Indonesian Rupiah',
  ARS: 'Argentine Peso', COP: 'Colombian Peso', CLP: 'Chilean Peso', PEN: 'Peruvian Sol',
  EGP: 'Egyptian Pound', NGN: 'Nigerian Naira', KES: 'Kenyan Shilling', MAD: 'Moroccan Dirham',
  RUB: 'Russian Ruble', UAH: 'Ukrainian Hryvnia',
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '\u20AC', GBP: '\u00A3', CAD: 'C$', AUD: 'A$', CHF: 'CHF',
  JPY: '\u00A5', CNY: '\u00A5', INR: '\u20B9', BRL: 'R$', MXN: 'MX$', KRW: '\u20A9',
  SGD: 'S$', HKD: 'HK$', SEK: 'kr', NOK: 'kr', DKK: 'kr', NZD: 'NZ$',
  ZAR: 'R', PLN: 'z\u0142', CZK: 'K\u010D', HUF: 'Ft', TRY: '\u20BA', ILS: '\u20AA',
  AED: 'AED', SAR: 'SAR', THB: '\u0E3F', IDR: 'Rp', ARS: 'AR$', COP: 'COL$',
  CLP: 'CL$', PEN: 'S/', EGP: 'E\u00A3', NGN: '\u20A6', KES: 'KSh', MAD: 'MAD',
  RUB: '\u20BD', UAH: '\u20B4',
};

export function getCurrencyForCity(city: string): string {
  const entry = CITY_TIMEZONES.find(([c]) => c === city);
  return entry ? TZ_CURRENCY[entry[1]] || '' : '';
}

export function getTimezoneForCity(city: string): string {
  const entry = CITY_TIMEZONES.find(([c]) => c === city);
  return entry ? entry[1] : '';
}

export function getFlagForCity(city: string): string {
  const entry = CITY_TIMEZONES.find(([c]) => c === city);
  return entry ? entry[2] : '';
}

export function getTimezoneAbbr(tz: string): string {
  try {
    // Get UTC offset like "UTC+2", "UTC-5", "UTC+5:30"
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: tz, timeZoneName: 'shortOffset' });
    const parts = formatter.formatToParts(now);
    const tzPart = parts.find(p => p.type === 'timeZoneName')?.value || '';
    return tzPart || tz;
  } catch { return tz; }
}

const TOP_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY', 'CNY', 'INR', 'BRL',
  'MXN', 'KRW', 'SGD', 'SEK', 'NOK', 'PLN', 'TRY', 'ZAR', 'NZD', 'AED',
];

export const CURRENCY_LIST = TOP_CURRENCIES.sort((a, b) => a.localeCompare(b));

// Flag emoji → phone prefix
const FLAG_PHONE: Record<string, string> = {
  '\u{1F1FA}\u{1F1F8}': '+1', '\u{1F1E8}\u{1F1E6}': '+1', '\u{1F1F2}\u{1F1FD}': '+52',
  '\u{1F1E7}\u{1F1F7}': '+55', '\u{1F1E6}\u{1F1F7}': '+54', '\u{1F1F5}\u{1F1EA}': '+51',
  '\u{1F1E8}\u{1F1F4}': '+57', '\u{1F1E8}\u{1F1F1}': '+56',
  '\u{1F1EC}\u{1F1E7}': '+44', '\u{1F1EB}\u{1F1F7}': '+33', '\u{1F1E9}\u{1F1EA}': '+49',
  '\u{1F1EA}\u{1F1F8}': '+34', '\u{1F1EE}\u{1F1F9}': '+39', '\u{1F1F3}\u{1F1F1}': '+31',
  '\u{1F1E7}\u{1F1EA}': '+32', '\u{1F1E8}\u{1F1ED}': '+41', '\u{1F1E6}\u{1F1F9}': '+43',
  '\u{1F1E8}\u{1F1FF}': '+420', '\u{1F1F5}\u{1F1F1}': '+48', '\u{1F1ED}\u{1F1FA}': '+36',
  '\u{1F1F5}\u{1F1F9}': '+351', '\u{1F1EE}\u{1F1EA}': '+353', '\u{1F1E9}\u{1F1F0}': '+45',
  '\u{1F1F8}\u{1F1EA}': '+46', '\u{1F1F3}\u{1F1F4}': '+47', '\u{1F1EB}\u{1F1EE}': '+358',
  '\u{1F1EC}\u{1F1F7}': '+30', '\u{1F1F7}\u{1F1FA}': '+7', '\u{1F1F9}\u{1F1F7}': '+90',
  '\u{1F1FA}\u{1F1E6}': '+380',
  '\u{1F1E6}\u{1F1EA}': '+971', '\u{1F1F8}\u{1F1E6}': '+966', '\u{1F1EE}\u{1F1F1}': '+972',
  '\u{1F1EA}\u{1F1EC}': '+20', '\u{1F1F3}\u{1F1EC}': '+234', '\u{1F1F0}\u{1F1EA}': '+254',
  '\u{1F1FF}\u{1F1E6}': '+27', '\u{1F1F2}\u{1F1E6}': '+212',
  '\u{1F1EE}\u{1F1F3}': '+91', '\u{1F1E8}\u{1F1F3}': '+86', '\u{1F1ED}\u{1F1F0}': '+852',
  '\u{1F1EF}\u{1F1F5}': '+81', '\u{1F1F0}\u{1F1F7}': '+82', '\u{1F1F8}\u{1F1EC}': '+65',
  '\u{1F1F9}\u{1F1ED}': '+66', '\u{1F1EE}\u{1F1E9}': '+62',
  '\u{1F1E6}\u{1F1FA}': '+61', '\u{1F1F3}\u{1F1FF}': '+64',
};

export function getPhonePrefixForCity(city: string): string {
  const entry = CITY_TIMEZONES.find(([c]) => c === city);
  return entry ? FLAG_PHONE[entry[2]] || '' : '';
}
