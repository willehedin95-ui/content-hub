import { Language } from "@/types";

/**
 * Universal character names that sound natural in ALL target languages
 * (Swedish, Danish, Norwegian, German). Use these in source content
 * so GPT never needs to rename characters during translation.
 */
export const UNIVERSAL_NAMES = {
  female: ["Emma", "Anna", "Ella", "Maria", "Sara", "Ida", "Nora", "Hanna", "Maja", "Liv"],
  male: ["Erik", "Lars", "Emil", "Oscar", "Noah", "Oliver", "Anton", "Axel", "Magnus", "Karl"],
};

const LANGUAGE_LABELS: Record<Language, string> = {
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
  de: "German",
};

const DATE_FORMATS: Record<Language, string> = {
  sv: '"X dagar sedan" / "X days ago" → "X dagar sedan". Dates: YYYY-MM-DD.',
  no: '"X dagar sedan" / "X days ago" → "X dager siden". Dates: DD.MM.YYYY.',
  da: '"X dagar sedan" / "X days ago" → "X dage siden". Dates: DD.MM.YYYY.',
  de: '"X dagar sedan" / "X days ago" → "vor X Tagen". Dates: DD.MM.YYYY.',
};

const UI_ELEMENTS: Record<Language, string> = {
  sv: '"Reply"/"Svar" → "Svar", "Comment"/"Kommentar" → "Kommentar".',
  no: '"Reply"/"Svar" → "Svar", "Comment"/"Kommentar" → "Kommentar".',
  da: '"Reply"/"Svar" → "Svar", "Comment"/"Kommentar" → "Kommentar".',
  de: '"Reply"/"Svar" → "Antworten", "Comment"/"Kommentar" → "Kommentar".',
};

/**
 * Build the full localization instruction block for a given language.
 * Injected into the LOCALISATION section of each SYSTEM_PROMPT.
 */
export function formatLocalization(lang: Language): string {
  if (lang === "sv") return "";

  const label = LANGUAGE_LABELS[lang];

  const nameBlock = `- NAMES: Keep ALL character and person names EXACTLY as they appear in the source text. Do NOT rename, replace, or localise any person names. They have been pre-selected to work naturally across all Nordic languages.`;
  const dateBlock = `- DATES & TIME: ${DATE_FORMATS[lang]}`;
  const uiBlock = `- UI ELEMENTS: ${UI_ELEMENTS[lang]}`;

  return [nameBlock, dateBlock, uiBlock].join("\n");
}

/** Brand names and certificates that must NEVER be translated in images */
export const NEVER_TRANSLATE = [
  "HappySleep",
  "HappySleep Ergo",
  "Hydro13",
  "Hälsobladet",
  "SwedishBalance",
  "Nordic Cradle",
  "OEKO-TEX",
  "CertiPUR-US",
  "Trustpilot",
  "Standard 100",
];

/**
 * Short localization instruction for image/ad-copy pipelines
 * that don't use the full SYSTEM_PROMPTS structure.
 */
export function getShortLocalizationNote(lang: Language): string {
  if (lang === "sv") return "";

  const label = LANGUAGE_LABELS[lang];

  return `\n\nCULTURAL LOCALISATION:\n- Keep ALL person names exactly as they appear — do NOT rename or localise them.\n- Translate ALL UI text (Reply/Svar, Comment/Kommentar, dates like "X dagar sedan") to ${label}.\n- The result should look as if ORIGINALLY CREATED for a ${label} audience.\n- NEVER translate these brand names and certificates — keep them EXACTLY as-is: ${NEVER_TRANSLATE.join(", ")}.\n- PRESERVE: Product images, star ratings, logos, certification badges, overall layout.`;
}
