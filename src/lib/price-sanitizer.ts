/**
 * Post-generation price sanitizer.
 *
 * Safety net for the NO PRICES rule. Even with explicit prompt instructions,
 * Claude sometimes slips currency amounts into cash_dna.hooks, visual_direction,
 * or image_prompts. These fields flow downstream into:
 *   - image brief generation (hooks become overlay text on the generated image)
 *   - the Nano Banana prompt (visual_direction + image_prompts become the scene)
 * A price baked into a generated image survives translation and lands in ads
 * as untranslatable hallucinated copy (e.g. the "€80 serum" bug on #018 on
 * 2026-04-07).
 *
 * Strategy: hunt currency patterns in these fields and strip the amount
 * entirely. We don't try to convert - if the model produced a price, the
 * context around it is probably already broken. Cleaner to remove the number
 * than leave a dangling "€" or render an awkward "880 kr-serum" into an image.
 *
 * These regexes cover:
 *   - explicit symbols: € $ £ ¥
 *   - ISO codes: EUR USD GBP SEK NOK DKK (optionally before/after number)
 *   - unit labels: kr, kr., SEK, euro(s)
 * But deliberately do NOT match:
 *   - bare numbers followed by unrelated units ("12,500 mg", "500 ml", "30 ml")
 *   - phone numbers, years, ages
 */

const PRICE_PATTERNS: RegExp[] = [
  // "$100", "€80", "£50", "¥1000" (with optional decimal)
  /[€$£¥]\s*\d[\d,.\s]*/g,
  // "100$", "80€", "50£"
  /\d[\d,.\s]*\s*[€$£¥]/g,
  // "EUR 80", "USD 100", "GBP 50", "SEK 880", "NOK 900", "DKK 600"
  /\b(?:EUR|USD|GBP|SEK|NOK|DKK)\s*\d[\d,.\s]*/gi,
  // "80 EUR", "100 USD", "50 GBP", "880 SEK", "900 NOK", "600 DKK"
  /\d[\d,.\s]*\s*(?:EUR|USD|GBP|SEK|NOK|DKK)\b/gi,
  // "880 kr", "880kr", "880 kr.", "900-kronors"
  /\d[\d,.\s]*\s*(?:kr|kronor|kronors?|krona)\b\.?/gi,
  // "880-kr", "880-kronors"
  /\d[\d,.\s]*-(?:kr|kronor|kronors?|krona)\b/gi,
  // "80 euros", "80 euro"
  /\d[\d,.\s]*\s*euros?\b/gi,
];

/**
 * Detect whether a string contains a price amount.
 */
export function containsPrice(str: string): boolean {
  if (!str) return false;
  return PRICE_PATTERNS.some((rx) => {
    rx.lastIndex = 0;
    return rx.test(str);
  });
}

/**
 * Strip currency amounts from a string. Drops the number AND the currency
 * marker, then cleans up resulting double spaces / dangling punctuation.
 */
export function stripPricesFromString(str: string): string {
  if (!str) return str;
  let out = str;
  for (const rx of PRICE_PATTERNS) {
    rx.lastIndex = 0;
    out = out.replace(rx, " ");
  }
  // Clean up double horizontal spaces + spaces before punctuation, while
  // PRESERVING paragraph breaks (\n\n) in fields like ad_copy_primary.
  // Previously used /\s+/g which matched \n as well, collapsing every
  // \n\n into a single space — wall-of-text ad copy. The price-strip
  // regex above replaces matches with " " (horizontal space), so we
  // only need to collapse horizontal runs, not any whitespace.
  out = out
    .replace(/[ \t]+/g, " ")           // collapse runs of spaces/tabs to one
    .replace(/ ([,.!?;:])/g, "$1")     // no space before punctuation
    .replace(/[ \t]+\n/g, "\n")        // no trailing horizontal space at line end
    .replace(/\n[ \t]+/g, "\n")        // no leading horizontal space at line start
    .replace(/\n{3,}/g, "\n\n")        // limit blank lines to one
    .trim();
  return out;
}

/**
 * Sanitize a concept proposal / cash_dna / visual fields object IN PLACE.
 * Called after JSON.parse on any brainstorm / swipe output before the data is
 * persisted to image_jobs or passed to image brief generation.
 *
 * Mutates the input object. Returns the same object for chaining.
 *
 * Covers the dangerous downstream fields:
 *   - cash_dna.hooks[]  (overlay text)
 *   - cash_dna.concept_description
 *   - visual_direction
 *   - image_prompts[] (swipe only - each entry's prompt/overlay_text)
 *   - ad_copy_primary[] / ad_copy_headline[] (belt-and-suspenders - brainstorm
 *     prompts already handle this but if the model slips we still strip here)
 *   - proposals[] (wrapped brainstorm output - recurses into each proposal)
 *
 * Input is typed as `any` deliberately - it's called on raw JSON.parse output
 * whose shape varies between brainstorm/swipe/iterate pipelines. Each field
 * access is individually type-checked at runtime with typeof / Array.isArray.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sanitizePrices<T = any>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = obj as any;

  const stripArr = (arr: unknown[] | undefined): string[] | undefined => {
    if (!Array.isArray(arr)) return arr as undefined;
    return arr
      .map((item) => (typeof item === "string" ? stripPricesFromString(item) : item))
      .filter((item) => typeof item !== "string" || item.length > 0) as string[];
  };

  // Top-level string fields
  if (typeof o.visual_direction === "string") {
    o.visual_direction = stripPricesFromString(o.visual_direction);
  }
  if (typeof o.concept_description === "string") {
    o.concept_description = stripPricesFromString(o.concept_description);
  }
  if (typeof o.differentiation_note === "string") {
    o.differentiation_note = stripPricesFromString(o.differentiation_note);
  }

  // Top-level array fields
  if (Array.isArray(o.ad_copy_primary)) o.ad_copy_primary = stripArr(o.ad_copy_primary);
  if (Array.isArray(o.ad_copy_headline)) o.ad_copy_headline = stripArr(o.ad_copy_headline);

  // Nested cash_dna
  if (o.cash_dna && typeof o.cash_dna === "object") {
    const dna = o.cash_dna;
    if (Array.isArray(dna.hooks)) dna.hooks = stripArr(dna.hooks);
    if (typeof dna.concept_description === "string") {
      dna.concept_description = stripPricesFromString(dna.concept_description);
    }
    if (typeof dna.pain_point === "string") {
      dna.pain_point = stripPricesFromString(dna.pain_point);
    }
  }

  // Swipe-specific: image_prompts is an array of { prompt, overlay_text, ... }
  if (Array.isArray(o.image_prompts)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    o.image_prompts = o.image_prompts.map((ip: any) => {
      if (!ip || typeof ip !== "object") return ip;
      const out = { ...ip };
      if (typeof out.prompt === "string") out.prompt = stripPricesFromString(out.prompt);
      if (typeof out.overlay_text === "string") out.overlay_text = stripPricesFromString(out.overlay_text);
      if (typeof out.hook_text === "string") out.hook_text = stripPricesFromString(out.hook_text);
      if (typeof out.description === "string") out.description = stripPricesFromString(out.description);
      return out;
    });
  }

  // Brainstorm-specific: proposals[] wrapper (main brainstorm JSON shape)
  if (Array.isArray(o.proposals)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    o.proposals = o.proposals.map((p: any) => sanitizePrices(p));
  }

  return obj;
}
