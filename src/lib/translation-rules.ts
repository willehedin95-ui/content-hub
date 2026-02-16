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
];

/**
 * Format rules as a numbered list for inclusion in prompts.
 */
export function formatRules(): string {
  return TRANSLATION_RULES.map((rule, i) => `${i + 1}. ${rule}`).join("\n");
}
