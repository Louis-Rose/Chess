// City → IANA timezone mapping (covers major cities worldwide)
export const CITY_TIMEZONES: [string, string][] = [
  // North America
  ['New York', 'America/New_York'], ['Los Angeles', 'America/Los_Angeles'],
  ['Chicago', 'America/Chicago'], ['Houston', 'America/Chicago'],
  ['Phoenix', 'America/Phoenix'], ['San Francisco', 'America/Los_Angeles'],
  ['Seattle', 'America/Los_Angeles'], ['Denver', 'America/Denver'],
  ['Boston', 'America/New_York'], ['Miami', 'America/New_York'],
  ['Washington DC', 'America/New_York'], ['Toronto', 'America/Toronto'],
  ['Montreal', 'America/Toronto'], ['Vancouver', 'America/Vancouver'],
  ['Mexico City', 'America/Mexico_City'],
  // South America
  ['Sao Paulo', 'America/Sao_Paulo'], ['Buenos Aires', 'America/Argentina/Buenos_Aires'],
  ['Lima', 'America/Lima'], ['Bogota', 'America/Bogota'], ['Santiago', 'America/Santiago'],
  // Europe
  ['London', 'Europe/London'], ['Paris', 'Europe/Paris'], ['Lyon', 'Europe/Paris'],
  ['Marseille', 'Europe/Paris'], ['Toulouse', 'Europe/Paris'], ['Bordeaux', 'Europe/Paris'],
  ['Lille', 'Europe/Paris'], ['Nice', 'Europe/Paris'], ['Strasbourg', 'Europe/Paris'],
  ['Berlin', 'Europe/Berlin'], ['Munich', 'Europe/Berlin'],
  ['Madrid', 'Europe/Madrid'], ['Barcelona', 'Europe/Madrid'],
  ['Rome', 'Europe/Rome'], ['Milan', 'Europe/Rome'],
  ['Amsterdam', 'Europe/Amsterdam'], ['Brussels', 'Europe/Brussels'],
  ['Zurich', 'Europe/Zurich'], ['Geneva', 'Europe/Zurich'],
  ['Vienna', 'Europe/Vienna'], ['Prague', 'Europe/Prague'],
  ['Warsaw', 'Europe/Warsaw'], ['Budapest', 'Europe/Budapest'],
  ['Lisbon', 'Europe/Lisbon'], ['Dublin', 'Europe/Dublin'],
  ['Copenhagen', 'Europe/Copenhagen'], ['Stockholm', 'Europe/Stockholm'],
  ['Oslo', 'Europe/Oslo'], ['Helsinki', 'Europe/Helsinki'],
  ['Athens', 'Europe/Athens'], ['Moscow', 'Europe/Moscow'],
  ['Istanbul', 'Europe/Istanbul'], ['Kyiv', 'Europe/Kyiv'],
  // Middle East
  ['Dubai', 'Asia/Dubai'], ['Riyadh', 'Asia/Riyadh'], ['Tel Aviv', 'Asia/Jerusalem'],
  // Africa
  ['Cairo', 'Africa/Cairo'], ['Lagos', 'Africa/Lagos'], ['Nairobi', 'Africa/Nairobi'],
  ['Johannesburg', 'Africa/Johannesburg'], ['Casablanca', 'Africa/Casablanca'],
  // Asia
  ['Mumbai', 'Asia/Kolkata'], ['Delhi', 'Asia/Kolkata'], ['Bangalore', 'Asia/Kolkata'],
  ['Shanghai', 'Asia/Shanghai'], ['Beijing', 'Asia/Shanghai'],
  ['Hong Kong', 'Asia/Hong_Kong'], ['Tokyo', 'Asia/Tokyo'],
  ['Seoul', 'Asia/Seoul'], ['Singapore', 'Asia/Singapore'],
  ['Bangkok', 'Asia/Bangkok'], ['Jakarta', 'Asia/Jakarta'],
  // Oceania
  ['Sydney', 'Australia/Sydney'], ['Melbourne', 'Australia/Melbourne'],
  ['Auckland', 'Pacific/Auckland'],
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

export function getCurrencyForCity(city: string): string {
  const entry = CITY_TIMEZONES.find(([c]) => c === city);
  return entry ? TZ_CURRENCY[entry[1]] || '' : '';
}

export function getTimezoneForCity(city: string): string {
  const entry = CITY_TIMEZONES.find(([c]) => c === city);
  return entry ? entry[1] : '';
}

const TOP_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'CHF', 'JPY', 'CNY', 'INR', 'BRL',
  'MXN', 'KRW', 'SGD', 'SEK', 'NOK', 'PLN', 'TRY', 'ZAR', 'NZD', 'AED',
];

export const CURRENCY_LIST = TOP_CURRENCIES.sort((a, b) => a.localeCompare(b));
