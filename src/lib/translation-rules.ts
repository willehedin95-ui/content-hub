/**
 * Shared translation rules applied to ALL languages.
 * These are injected into every translation prompt.
 *
 * Add new rules as bullet points. Keep them short and actionable.
 */
export const TRANSLATION_RULES = [
  "Use sentence case only — never title case. In Scandinavian languages, only the first word and proper nouns are capitalised in headings, buttons, and titles. Example: 'Så fungerar det' not 'Så Fungerar Det'.",
  "Keep paragraphs and sentences short. Aim for max 2-3 sentences per paragraph.",
  "Never invent testimonials, statistics, or medical claims that are not in the original.",
  "Keep all character and person names exactly as they appear in the source text. Do NOT rename or localise any person names — they are pre-selected to work across all target languages.",
  "CURRENCY — CRITICAL: Always convert prices into the LOCAL market currency. Swedish (sv) → SEK / 'kr', Norwegian (no) → NOK / 'kr', Danish (da) → DKK / 'kr'. Never leave foreign currency symbols (€, $, £, EUR, USD, GBP) in the output — replace them with the local currency. Use a rough conversion: 1 EUR ≈ 11 SEK / 11 NOK / 7.5 DKK, 1 USD ≈ 10 SEK / 10 NOK / 7 DKK. Round to a clean nearby number (e.g. €387 → 4 200 kr, not 4 257 kr). If the source has any price at all, the translated output MUST end up in the local currency — no exceptions.",
];

/**
 * Format rules as a numbered list for inclusion in prompts.
 */
export function formatRules(): string {
  return TRANSLATION_RULES.map((rule, i) => `${i + 1}. ${rule}`).join("\n");
}
