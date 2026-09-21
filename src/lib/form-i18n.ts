/**
 * Serverns egna svar till formulärkunden, per marknad.
 *
 * Formulärens innehåll ligger i configen och är redan översatt, men det här
 * lagret - valideringsfel, rate limit, filfel - var hårdkodat svenskt. En
 * dansk kund som missade ett obligatoriskt fält fick "Obligatoriska fält
 * saknas: ..." mitt i ett i övrigt danskt formulär. Uppmätt i produktion
 * 2026-09-21 tillsammans med samma problem i embedden.
 *
 * Orden är hämtade ur butikens egna locale-filer (locales/da.json och
 * locales/no.json i Palo Alto-temat) så språket matchar resten av butiken.
 * Motsvarande tabell i klienten heter SPRAK i public/forms-embed/v1.js -
 * håll dem i synk när en ny sträng tillkommer.
 */
export type FormMarket = "se" | "dk" | "no";

interface FormMessages {
  invalidRequest: string;
  incompleteRequest: string;
  unknownForm: string;
  botCheck: string;
  tooManyAttempts: string;
  missingRequired: (fields: string) => string;
  badEmail: string;
  serverError: string;
  noFile: string;
  invalidUpload: string;
  fileTooBig: string;
  badFileType: string;
  uploadFailed: string;
}

const MESSAGES: Record<FormMarket, FormMessages> = {
  se: {
    invalidRequest: "Ogiltig förfrågan",
    incompleteRequest: "Ofullständig förfrågan",
    unknownForm: "Okänt formulär",
    botCheck: "Kunde inte verifiera att du är människa. Ladda om sidan och försök igen.",
    tooManyAttempts: "För många försök. Vänta en stund och försök igen.",
    missingRequired: (f) => `Obligatoriska fält saknas: ${f}`,
    badEmail: "Ange en giltig e-postadress.",
    serverError: "Något gick fel. Försök igen om en stund.",
    noFile: "Ingen fil hittades",
    invalidUpload: "Ogiltig uppladdning",
    fileTooBig: "Filen är för stor (max 25 MB)",
    badFileType: "Filtypen stöds inte. Ladda upp en bild (JPG/PNG/WEBP/HEIC) eller PDF.",
    uploadFailed: "Uppladdningen misslyckades. Försök igen.",
  },
  dk: {
    invalidRequest: "Ugyldig forespørgsel",
    incompleteRequest: "Ufuldstændig forespørgsel",
    unknownForm: "Ukendt formular",
    botCheck: "Kunne ikke bekræfte, at du er et menneske. Genindlæs siden, og prøv igen.",
    tooManyAttempts: "For mange forsøg. Vent lidt, og prøv igen.",
    missingRequired: (f) => `Obligatoriske felter mangler: ${f}`,
    badEmail: "Indtast venligst en gyldig e-mailadresse.",
    serverError: "Noget gik galt. Prøv igen om lidt.",
    noFile: "Ingen fil fundet",
    invalidUpload: "Ugyldig upload",
    fileTooBig: "Filen er for stor (maks. 25 MB)",
    badFileType: "Filtypen understøttes ikke. Upload et billede (JPG/PNG/WEBP/HEIC) eller en PDF.",
    uploadFailed: "Uploadet mislykkedes. Prøv igen.",
  },
  no: {
    invalidRequest: "Ugyldig forespørsel",
    incompleteRequest: "Ufullstendig forespørsel",
    unknownForm: "Ukjent skjema",
    botCheck: "Kunne ikke bekrefte at du er et menneske. Last inn siden på nytt og prøv igjen.",
    tooManyAttempts: "For mange forsøk. Vent litt og prøv igjen.",
    missingRequired: (f) => `Obligatoriske felt mangler: ${f}`,
    badEmail: "Oppgi en gyldig e-postadresse.",
    serverError: "Noe gikk galt. Prøv igjen om litt.",
    noFile: "Fant ingen fil",
    invalidUpload: "Ugyldig opplasting",
    fileTooBig: "Filen er for stor (maks. 25 MB)",
    badFileType: "Filtypen støttes ikke. Last opp et bilde (JPG/PNG/WEBP/HEIC) eller en PDF.",
    uploadFailed: "Opplastingen mislyktes. Prøv igjen.",
  },
};

/** Okänd eller saknad marknad faller på svenska - butikens språk. */
export function formMessages(market?: string | null): FormMessages {
  const key = (market || "").trim().toLowerCase();
  return MESSAGES[key as FormMarket] ?? MESSAGES.se;
}
