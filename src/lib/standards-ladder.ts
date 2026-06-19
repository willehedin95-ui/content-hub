/**
 * Standing rules -> generation prompt (the wired half of the Standards Ladder).
 *
 * Banked rules live in workspaces.settings.generation_rules (string[]). The route reads them and
 * the pipeline prepends them to every generation via rulesToPromptBlock, so corrections compound.
 * (The reject->bank-rule write loop is intentionally not wired yet - add it when there's a UI to
 * review banked rules.)
 */

/** Render banked rules as a prompt block to prepend to every generation. */
export function rulesToPromptBlock(rules: string[]): string {
  const clean = rules.map((r) => r.trim()).filter(Boolean);
  if (!clean.length) return "";
  return `STANDING RULES (banked from past corrections - follow ALL):\n` + clean.map((r) => `- ${r}`).join("\n");
}
