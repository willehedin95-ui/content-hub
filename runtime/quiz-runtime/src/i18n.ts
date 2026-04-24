// Minimal i18n for the quiz runtime.
// config.market drives the locale (falls back to 'en').

export type Market = 'se' | 'dk' | 'no' | 'en';

export const T = {
  continue:          { se: 'Fortsätt',                   dk: 'Fortsæt',                    no: 'Fortsett',                    en: 'Continue' },
  seeResults:        { se: 'Visa mitt resultat',          dk: 'Vis mit resultat',            no: 'Vis mitt resultat',           en: 'See my results' },
  emailPlaceholder:  { se: 'din@epost.se',                dk: 'din@email.dk',               no: 'din@e-post.no',               en: 'your@email.com' },
  invalidEmail:      { se: 'Ange en giltig e-postadress.', dk: 'Indtast en gyldig e-mailadresse.', no: 'Oppgi en gyldig e-postadresse.', en: 'Please enter a valid email address.' },
  loadingResults:    { se: 'Laddar ditt resultat...',     dk: 'Indlæser dit resultat...',    no: 'Laster resultatet ditt...',   en: 'Loading your results...' },
  searchPlaceholder: { se: 'Sök...',                      dk: 'Søg...',                      no: 'Søk...',                      en: 'Search...' },
  selectPlaceholder: { se: 'Välj ett alternativ',         dk: 'Vælg en mulighed',            no: 'Velg et alternativ',          en: 'Select an option' },
  noMatches:         { se: 'Inga träffar',                dk: 'Ingen resultater',            no: 'Ingen treff',                 en: 'No matches' },
} as const;

export function t(key: keyof typeof T, market: string | undefined): string {
  const m = (market ?? 'en') as Market;
  const row = T[key];
  return (m in row ? row[m as Market] : row['en']) as string;
}
