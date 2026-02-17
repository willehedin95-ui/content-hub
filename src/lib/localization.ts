import { Language } from "@/types";

/**
 * Per-language name mapping examples for cultural localization.
 * Source names are Swedish (the primary source culture).
 * These are EXAMPLES for the LLM — it should apply the same principle
 * to any Swedish/English names it encounters, not only these specific ones.
 */
export const NAME_EXAMPLES: Record<Language, { from: string; to: string }[]> = {
  sv: [],
  no: [
    { from: "Anna Lindberg", to: "Anne Haugen" },
    { from: "Peter Svensson", to: "Petter Johansen" },
    { from: "Erik Johansson", to: "Erik Hansen" },
    { from: "Maria Karlsson", to: "Maria Olsen" },
    { from: "Lars Andersson", to: "Lars Andersen" },
    { from: "Emma Nilsson", to: "Emma Larsen" },
  ],
  da: [
    { from: "Anna Lindberg", to: "Anne Vestergaard" },
    { from: "Peter Svensson", to: "Peter Nielsen" },
    { from: "Erik Johansson", to: "Erik Jensen" },
    { from: "Maria Karlsson", to: "Maria Pedersen" },
    { from: "Lars Andersson", to: "Lars Andersen" },
    { from: "Emma Nilsson", to: "Emma Christensen" },
  ],
  de: [
    { from: "Anna Lindberg", to: "Anna Weber" },
    { from: "Peter Svensson", to: "Peter Müller" },
    { from: "Erik Johansson", to: "Erik Fischer" },
    { from: "Maria Karlsson", to: "Maria Schneider" },
    { from: "Lars Andersson", to: "Lars Hoffmann" },
    { from: "Emma Nilsson", to: "Emma Becker" },
  ],
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
  const nameExamples = NAME_EXAMPLES[lang];

  const nameBlock = `- NAMES (MANDATORY): Replace ALL Swedish and English person names with culturally appropriate ${label} equivalents. Use common, natural-sounding names for the target culture. Examples:\n${nameExamples.map((n) => `  ${n.from} → ${n.to}`).join("\n")}\n  Apply the same principle to ANY other Swedish/English names encountered.`;
  const dateBlock = `- DATES & TIME: ${DATE_FORMATS[lang]}`;
  const uiBlock = `- UI ELEMENTS: ${UI_ELEMENTS[lang]}`;

  return [nameBlock, dateBlock, uiBlock].join("\n");
}

/**
 * Short localization instruction for image/ad-copy pipelines
 * that don't use the full SYSTEM_PROMPTS structure.
 */
export function getShortLocalizationNote(lang: Language): string {
  if (lang === "sv") return "";

  const label = LANGUAGE_LABELS[lang];
  const nameExamples = NAME_EXAMPLES[lang];
  const examplesStr = nameExamples
    .slice(0, 3)
    .map((n) => `${n.from} → ${n.to}`)
    .join(", ");

  return `\n\nCULTURAL LOCALISATION (MANDATORY):\n- Replace ALL Swedish/English person names with culturally appropriate ${label} names. Examples: ${examplesStr}.\n- Translate ALL UI text (Reply/Svar, Comment/Kommentar, dates like "X dagar sedan") to ${label}.\n- The result should look as if ORIGINALLY CREATED for a ${label} audience.\n- PRESERVE: Product images, star ratings, brand names (HappySleep, Hydro13), overall layout.`;
}
