/**
 * Image quality gate for static ads: a Nano-Banana text-correction pass + a vision QA check.
 * Used by the render pipeline (opt-in) to fix garbled Swedish text and auto-reroll bad renders.
 */

import { generateImage } from "./kie";
import { visionOpenRouter, parseJsonLoose } from "./openrouter";

/**
 * Nano-Banana text-correction pass: re-render the image editing ONLY the text so it is correctly
 * spelled, natural {language} with proper diacritics. Returns the corrected URL (or the original
 * on failure). Costs one extra image render.
 */
export async function correctImageText(imageUrl: string, language: string, aspectRatio: "1:1" | "4:5" | "9:16" | "16:9" = "4:5"): Promise<string> {
  try {
    const prompt = `Correct ALL text in this ad image so it is perfectly spelled, natural ${language} with correct diacritics (å, ä, ö). Fix any garbled, misspelled, cut-off, or English words. Change ONLY the text - keep the exact same layout, product, colours, people and composition. Do not add or remove any elements.`;
    const { urls } = await generateImage(prompt, [imageUrl], aspectRatio);
    return urls?.[0] || imageUrl;
  } catch {
    return imageUrl;
  }
}

export interface ImageQaResult {
  ok: boolean;
  issues: string[];
  /** True when the only real problem is bad text (fixable with a text-correction pass, no reroll). */
  textOnly: boolean;
}

/**
 * Vision QA: check the product is right, the text is readable {language} (proper diacritics, no
 * English), the text is actual AD copy (not PSA/meta/safety boilerplate the image model injects),
 * and there are no obvious defects. Fails OPEN (returns ok) so QA never blocks generation.
 */
export async function qaImage(imageUrl: string, ctx: { language: string; productAppearance?: string }): Promise<ImageQaResult> {
  try {
    const raw = await visionOpenRouter(
      [
        `You are a strict QA reviewer for a static ad image. Check:`,
        `1. TEXT: any text is correctly spelled, natural ${ctx.language} with proper diacritics (å ä ö) - NOT garbled, NOT English.`,
        `2. MESSAGE: the text must read as ad copy. FAIL if it is PSA/safety boilerplate ("this is an ad", "you are not alone", "talk to someone", helpline-style messages), meta commentary, or off-topic content unrelated to the ad.`,
        ctx.productAppearance ? `3. PRODUCT: matches this description: ${ctx.productAppearance}` : "",
        `4. DEFECTS: no garbled faces, broken layout, unreadable text.`,
        `Return ONLY JSON: {"ok": true|false, "textOnly": true|false, "issues": ["short issue", ...]}.`,
        `Set ok=false only for real, obvious problems. Set textOnly=true when the ONLY problems are spelling/diacritics in otherwise-correct ad text (fixable by editing text); PSA/meta text, wrong product, or visual defects are NOT textOnly.`,
      ]
        .filter(Boolean)
        .join("\n"),
      imageUrl,
      { json: true, maxTokens: 400 },
    );
    const p = parseJsonLoose<{ ok?: boolean; textOnly?: boolean; issues?: string[] }>(raw);
    return { ok: p.ok !== false, textOnly: p.textOnly === true, issues: Array.isArray(p.issues) ? p.issues.slice(0, 5) : [] };
  } catch {
    return { ok: true, textOnly: false, issues: [] };
  }
}
