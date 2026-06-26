// Locale helpers for the MPP app.
//
// MPP's API hands us French data: dates we format ourselves, and team names as
// French country labels (e.g. "Pays-Bas", "Brésil"). The UI language can be
// fr / en / es, so dates must format in the active locale and country names
// must translate. Player usernames are NOT countries and are never translated.

export function localeFor(language: string): string {
  switch (language) {
    case 'fr':
      return 'fr-FR';
    case 'es':
      return 'es-ES';
    default:
      return 'en-GB';
  }
}

// Country names keyed by their accent-stripped lowercase French form (the shape
// the API sends). fr is the source language, so it just passes through; we only
// store en / es. Unknown teams fall back to the original label.
const COUNTRY: Record<string, { en: string; es: string }> = {
  'pays-bas': { en: 'Netherlands', es: 'Países Bajos' },
  maroc: { en: 'Morocco', es: 'Marruecos' },
  'etats-unis': { en: 'United States', es: 'Estados Unidos' },
  bosnie: { en: 'Bosnia', es: 'Bosnia' },
  'bosnie-herzegovine': { en: 'Bosnia and Herzegovina', es: 'Bosnia y Herzegovina' },
  bresil: { en: 'Brazil', es: 'Brasil' },
  japon: { en: 'Japan', es: 'Japón' },
  france: { en: 'France', es: 'Francia' },
  angleterre: { en: 'England', es: 'Inglaterra' },
  allemagne: { en: 'Germany', es: 'Alemania' },
  espagne: { en: 'Spain', es: 'España' },
  italie: { en: 'Italy', es: 'Italia' },
  argentine: { en: 'Argentina', es: 'Argentina' },
  portugal: { en: 'Portugal', es: 'Portugal' },
  belgique: { en: 'Belgium', es: 'Bélgica' },
  croatie: { en: 'Croatia', es: 'Croacia' },
  uruguay: { en: 'Uruguay', es: 'Uruguay' },
  mexique: { en: 'Mexico', es: 'México' },
  canada: { en: 'Canada', es: 'Canadá' },
  suisse: { en: 'Switzerland', es: 'Suiza' },
  senegal: { en: 'Senegal', es: 'Senegal' },
  'coree du sud': { en: 'South Korea', es: 'Corea del Sur' },
  'coree du nord': { en: 'North Korea', es: 'Corea del Norte' },
  australie: { en: 'Australia', es: 'Australia' },
  danemark: { en: 'Denmark', es: 'Dinamarca' },
  pologne: { en: 'Poland', es: 'Polonia' },
  serbie: { en: 'Serbia', es: 'Serbia' },
  suede: { en: 'Sweden', es: 'Suecia' },
  'pays de galles': { en: 'Wales', es: 'Gales' },
  ecosse: { en: 'Scotland', es: 'Escocia' },
  autriche: { en: 'Austria', es: 'Austria' },
  perou: { en: 'Peru', es: 'Perú' },
  colombie: { en: 'Colombia', es: 'Colombia' },
  equateur: { en: 'Ecuador', es: 'Ecuador' },
  chili: { en: 'Chile', es: 'Chile' },
  paraguay: { en: 'Paraguay', es: 'Paraguay' },
  venezuela: { en: 'Venezuela', es: 'Venezuela' },
  bolivie: { en: 'Bolivia', es: 'Bolivia' },
  nigeria: { en: 'Nigeria', es: 'Nigeria' },
  ghana: { en: 'Ghana', es: 'Ghana' },
  cameroun: { en: 'Cameroon', es: 'Camerún' },
  egypte: { en: 'Egypt', es: 'Egipto' },
  algerie: { en: 'Algeria', es: 'Argelia' },
  tunisie: { en: 'Tunisia', es: 'Túnez' },
  "cote d'ivoire": { en: 'Ivory Coast', es: 'Costa de Marfil' },
  'afrique du sud': { en: 'South Africa', es: 'Sudáfrica' },
  mali: { en: 'Mali', es: 'Malí' },
  'burkina faso': { en: 'Burkina Faso', es: 'Burkina Faso' },
  'rd congo': { en: 'DR Congo', es: 'RD Congo' },
  'cap-vert': { en: 'Cape Verde', es: 'Cabo Verde' },
  iran: { en: 'Iran', es: 'Irán' },
  'arabie saoudite': { en: 'Saudi Arabia', es: 'Arabia Saudita' },
  qatar: { en: 'Qatar', es: 'Catar' },
  'emirats arabes unis': { en: 'United Arab Emirates', es: 'Emiratos Árabes Unidos' },
  ouzbekistan: { en: 'Uzbekistan', es: 'Uzbekistán' },
  jordanie: { en: 'Jordan', es: 'Jordania' },
  irak: { en: 'Iraq', es: 'Irak' },
  norvege: { en: 'Norway', es: 'Noruega' },
  turquie: { en: 'Turkey', es: 'Turquía' },
  grece: { en: 'Greece', es: 'Grecia' },
  'republique tcheque': { en: 'Czech Republic', es: 'República Checa' },
  hongrie: { en: 'Hungary', es: 'Hungría' },
  ukraine: { en: 'Ukraine', es: 'Ucrania' },
  russie: { en: 'Russia', es: 'Rusia' },
  roumanie: { en: 'Romania', es: 'Rumanía' },
  slovenie: { en: 'Slovenia', es: 'Eslovenia' },
  slovaquie: { en: 'Slovakia', es: 'Eslovaquia' },
  irlande: { en: 'Ireland', es: 'Irlanda' },
  'irlande du nord': { en: 'Northern Ireland', es: 'Irlanda del Norte' },
  'costa rica': { en: 'Costa Rica', es: 'Costa Rica' },
  panama: { en: 'Panama', es: 'Panamá' },
  jamaique: { en: 'Jamaica', es: 'Jamaica' },
  honduras: { en: 'Honduras', es: 'Honduras' },
  haiti: { en: 'Haiti', es: 'Haití' },
  curacao: { en: 'Curaçao', es: 'Curazao' },
  'nouvelle-zelande': { en: 'New Zealand', es: 'Nueva Zelanda' },
};

function norm(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Localize a French country/team label. fr passes through; unknown labels too.
export function countryName(name: string | null | undefined, language: string): string {
  if (!name) return name ?? '';
  if (language === 'fr') return name;
  const hit = COUNTRY[norm(name)];
  if (!hit) return name;
  return language === 'es' ? hit.es : hit.en;
}
