import Anthropic from "@anthropic-ai/sdk";
import { withRetry, isTransientError } from "./retry";
import { CLAUDE_MODEL, STATIC_STYLES, AWARENESS_STYLE_MAP, REPTILE_TRIGGERS } from "./constants";
import type { StaticStyleId, ReptileTriggerId } from "./constants";
import type { ImageJob, CashDna, ProductFull, ProductSegment } from "@/types";

export { STATIC_STYLES };
export type { StaticStyleId };

export interface ImageBrief {
  style: StaticStyleId;
  prompt: string;         // The Nano Banana prompt (2-4 dense sentences)
  hookText: string;
  headlineText?: string;
  referenceStrategy: "product" | "spy-ad" | "both" | "none";
  reptileTriggers?: ReptileTriggerId[];
}

export interface GeneratedBrief extends ImageBrief {
  referenceImageUrls: string[];
  label: string;
}

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  return key;
}

/**
 * Resolve which styles to offer based on awareness level (V3.1).
 * Returns style IDs ordered by relevance, padded to `count` if needed.
 */
function getStylesForAwareness(awarenessLevel: string | null | undefined, count: number): StaticStyleId[] {
  if (awarenessLevel && AWARENESS_STYLE_MAP[awarenessLevel]) {
    const preferred = AWARENESS_STYLE_MAP[awarenessLevel];
    if (preferred.length >= count) return preferred.slice(0, count);
    // Pad with remaining styles not already in the preferred list
    const remaining = STATIC_STYLES.map((s) => s.id).filter((id) => !preferred.includes(id));
    return [...preferred, ...remaining].slice(0, count) as StaticStyleId[];
  }
  // No awareness level — all styles available
  return STATIC_STYLES.slice(0, Math.min(count, STATIC_STYLES.length)).map((s) => s.id);
}

/**
 * Use Claude to generate distinct image briefs — each with a different visual style.
 */
export async function generateImageBriefs(options: {
  job: ImageJob;
  product: ProductFull;
  productImages: Array<{ url: string; category: string }>;
  spyAd?: { media_url?: string; cash_analysis?: unknown } | null;
  segment?: ProductSegment | null;
  iterationContext?: Record<string, unknown> | null;
  count: number;
}): Promise<{ briefs: ImageBrief[]; usage: { input_tokens: number; output_tokens: number } }> {
  const { job, product, spyAd, segment, iterationContext, count } = options;
  const cashDna = job.cash_dna as CashDna | null;
  const hooks = cashDna?.hooks ?? [];
  const headlines = job.ad_copy_headline ?? [];

  if (hooks.length === 0) {
    throw new Error("No hooks available — cannot generate briefs");
  }

  // V3.1: Filter styles based on awareness level
  const styleIds = getStylesForAwareness(cashDna?.awareness_level, count);

  const systemPrompt = buildBriefSystemPrompt();
  const userPrompt = buildBriefUserPrompt({
    productName: product.name,
    usps: product.usps ?? [],
    benefits: product.benefits ?? [],
    targetAudience: product.target_audience ?? null,
    cashDna,
    visualDirection: job.visual_direction ?? "",
    hooks: hooks.slice(0, count),
    headlines,
    styles: styleIds,
    spyAdContext: spyAd?.cash_analysis ? JSON.stringify(spyAd.cash_analysis) : null,
    hasSpyAdImage: !!spyAd?.media_url,
    hasProductImages: options.productImages.length > 0,
    productImageCategories: [...new Set(options.productImages.map((pi) => pi.category))],
    segment: segment ?? null,
    iterationContext: iterationContext ?? null,
  });

  const client = new Anthropic({ apiKey: getApiKey() });

  const response = await withRetry(
    async () =>
      client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        temperature: 0.9,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    { maxAttempts: 2, initialDelayMs: 2000, isRetryable: isTransientError }
  );

  const content =
    response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

  const briefs = parseBriefs(content, count);

  return {
    briefs,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    },
  };
}

/**
 * Resolve reference images for a brief based on its style and available images.
 */
export function resolveReferenceImages(
  brief: ImageBrief,
  productImages: Array<{ url: string; category: string }>,
  spyAdMediaUrl?: string | null
): string[] {
  const refs: string[] = [];

  if (brief.referenceStrategy === "none") return refs;

  if ((brief.referenceStrategy === "spy-ad" || brief.referenceStrategy === "both") && spyAdMediaUrl) {
    refs.push(spyAdMediaUrl);
  }

  if (brief.referenceStrategy === "product" || brief.referenceStrategy === "both") {
    // Pick images based on style
    const preferred = getPreferredCategories(brief.style);
    for (const cat of preferred) {
      const matches = productImages.filter((pi) => pi.category === cat);
      if (matches.length > 0) {
        refs.push(matches[0].url);
        break;
      }
    }
    // Fallback to hero if nothing found
    if (refs.length === 0 || (brief.referenceStrategy === "both" && refs.length === 1)) {
      const hero = productImages.find((pi) => pi.category === "hero");
      if (hero && !refs.includes(hero.url)) {
        refs.push(hero.url);
      }
    }
  }

  return refs.slice(0, 3);
}

function getPreferredCategories(style: StaticStyleId): string[] {
  switch (style) {
    case "product-hero":
      return ["hero", "detail"];
    case "bold-statement":
      return ["hero"];
    case "before-after":
      return ["before-after", "hero"];
    case "social-proof":
      return ["lifestyle", "hero"];
    case "native-medical":
    case "native-closeup":
    case "native-messy":
      return []; // Native styles should NOT reference product images
    case "comparison":
      return ["hero", "detail"];
    default:
      return ["hero"];
  }
}

// --- Prompt builders ---

function buildBriefSystemPrompt(): string {
  return `You are an expert direct response ad creative director specializing in static image ads for Meta (Facebook/Instagram).

Your job is to create distinct IMAGE BRIEFS that will be fed into an AI image generator (Nano Banana Pro). Each brief must use a DIFFERENT visual style to produce genuinely diverse ad creatives — not just text swaps on the same layout.

## Static Ad Styles:
- product-hero: Product front and center in clean studio or lifestyle setting. Emphasis on the product itself with subtle benefit callouts. Clean, aspirational.
- bold-statement: Large bold typography dominates the frame. One powerful claim. Minimal background visual — the text IS the ad. Dark or contrasting backgrounds.
- before-after: Split composition showing transformation contrast. Left side: pain state (dark, frustrating). Right side: dream state (bright, aspirational). Clear visual divider.
- social-proof: Product or lifestyle background with overlaid testimonial boxes that look like real reviews or social media comments. Names, ages, specific results.
- native-medical: Medical/anatomical illustration style. Cross-section diagrams, cellular close-ups, anatomical overlays, microscope-style imagery. Must look EDITORIAL — like an image from a health article on WebMD or Mayo Clinic, not an ad. Text overlay should use clean serif or sans-serif font, styled as an article headline. NO product, NO branding. The image should feel educational and slightly clinical.
- native-closeup: Uncomfortable, raw close-up photography. Skin textures (dry, cracked, inflamed), joint details, body parts showing wear. Shot like documentary or medical photography with harsh clinical lighting, no flattering angles. The image should trigger involuntary attention — mild disgust is a powerful scroll-stopper. NO product, NO branding. Think "this makes me look twice even though I don't want to."
- native-messy: Real-life messy environment photography. Cluttered medicine cabinet, bedside table covered in supplement bottles, kitchen counter with health products mixed with daily life. Shot candid — like someone snapped a photo of their own mess. Warm, natural lighting, slightly cluttered composition. Must feel relatable and authentic, not staged. NO product, NO branding.
- comparison: Side-by-side split showing "their product" (generic, dull) vs "our product" (premium, effective). Clear visual hierarchy favoring our product.

## Awareness Level → Style Rules:
If an awareness level is specified in the CASH DNA, you MUST prioritize styles from the preferred list for that level:
- Unaware: native-medical, native-closeup, native-messy, bold-statement (pattern interrupt — must NOT look like an ad, must look like editorial/native content)
- Problem Aware: before-after, bold-statement, native-messy (show the pain → dream transformation)
- Solution Aware: comparison, before-after, social-proof (differentiate the product)
- Product Aware: social-proof, product-hero (build trust, close the deal)
- Most Aware: product-hero, social-proof (they just need a reason to buy now)
Use ONLY the styles listed in "STYLES TO USE" — they are already filtered for the awareness level.

## NATIVE STYLE RULES (for native-medical, native-closeup, native-messy):
- referenceStrategy MUST be "none" — native ads are generated purely from the prompt, never from product images
- Hook text should read like an editorial headline, NOT an ad headline. Use formulas like:
  "The [unexpected] reason [symptom] gets worse after [age]"
  "The forgotten [noun] that [surprising benefit]"
  "[Authority] finally admits what [outsider group] knew all along"
  "If you [common behavior], your [body part] is already [alarming state]"
- The image should pass the "Is this an ad?" test — if it looks like an ad, it's wrong
- Composition should feel like it was pulled from a news article, medical journal, or someone's camera roll

## Reptile Triggers (scroll-stopping visual psychology):
For EACH brief, assign 1-2 reptile triggers that hijack the primitive brain and stop the scroll. Weave the trigger INTO the prompt as concrete visual detail — don't just label it.

Available triggers:
- ultra-real: Hyper-realistic detail, almost uncomfortably sharp — every texture visible
- bizarre: Something unexpected or surreal that makes people think "wait, what?"
- voyeur: Feels like spying on a private moment — intimate, candid, unposed
- suffering: Visible pain, discomfort — furrowed brow, tense muscles, exhaustion
- gorey: Visceral, shocking close-up detail (use carefully for health products)
- sexual: Attraction, beauty, intimacy — suggestion of closeness, not explicit
- primal-fear: Darkness, isolation, loss, aging — shadows, empty spaces, vulnerability
- odd-contrast: Two things that don't belong together — visual tension and curiosity
- inside-joke: Relatable reference the target audience immediately gets — "that's so me"
- time-warp: Before/after time contrast, nostalgia, or future-shock
- victory-lap: Celebration, achievement, relief — the person who finally found the solution
- selfie: POV first-person perspective, front-facing camera, eye contact
- uncanny-objects: Products that look almost alive or unnervingly perfect

Natural pairings (suggestions, not rules):
- product-hero pairs well with: ultra-real, uncanny-objects
- bold-statement pairs well with: primal-fear, odd-contrast
- before-after pairs well with: suffering, time-warp, victory-lap
- social-proof pairs well with: selfie, inside-joke, victory-lap
- native-medical pairs well with: ultra-real, gorey, bizarre
- native-closeup pairs well with: suffering, gorey, voyeur
- native-messy pairs well with: voyeur, inside-joke
- comparison pairs well with: odd-contrast, ultra-real

## Prompt Engineering Rules (CRITICAL — follow exactly):
1. SUBJECT FIRST — lead with the focal point subject in the first clause
2. WEAVE, DON'T LIST — merge environment, lighting, and details naturally like a photographer's caption. Never use bullet points or sections.
3. BE SPECIFIC — replace vague adjectives with concrete visual details ("harsh overhead fluorescent light casting downward shadows" not "dramatic lighting")
4. MOOD LAST — append emotional tone and style descriptors at the end as modifiers
5. LENGTH — 2-4 dense sentences per prompt. No more.
6. FORMAT — all images are square 1:1 for Meta feed

## Reference Image Strategy:
For each brief, specify a referenceStrategy:
- "product" — use product images as reference (for product-hero, comparison styles)
- "spy-ad" — use the competitor's ad image as style reference (to adapt their visual approach)
- "both" — combine product and competitor references
- "none" — generate purely from text description (REQUIRED for native-medical, native-closeup, native-messy; also for bold-statement)

## Output Format:
Return ONLY a JSON array of briefs. No markdown, no explanation, no preamble:
[{"style":"product-hero","prompt":"...","hook":"...","headline":"...","referenceStrategy":"product","reptileTriggers":["ultra-real","uncanny-objects"]}]

Each brief must have:
- style: one of the style IDs above (each brief MUST use a DIFFERENT style)
- prompt: the complete Nano Banana prompt (2-4 dense sentences following the rules above, with reptile trigger visuals WOVEN IN)
- hook: the scroll-stopping text to feature prominently on the image
- headline: secondary text (shorter, benefit-focused)
- referenceStrategy: which reference images to use
- reptileTriggers: array of 1-2 trigger IDs that are embodied in the prompt`;
}

function buildBriefUserPrompt(opts: {
  productName: string;
  usps: string[];
  benefits: string[];
  targetAudience: string | null;
  cashDna: CashDna | null;
  visualDirection: string;
  hooks: string[];
  headlines: string[];
  styles: StaticStyleId[];
  spyAdContext: string | null;
  hasSpyAdImage: boolean;
  hasProductImages: boolean;
  productImageCategories: string[];
  segment: ProductSegment | null;
  iterationContext: Record<string, unknown> | null;
}): string {
  const lines: string[] = [];

  lines.push(`Create ${opts.hooks.length} image briefs for this product:\n`);

  lines.push(`PRODUCT: ${opts.productName}`);
  if (opts.usps.length > 0) lines.push(`USPs: ${opts.usps.slice(0, 4).join("; ")}`);
  if (opts.benefits.length > 0) lines.push(`Benefits: ${opts.benefits.slice(0, 4).join("; ")}`);
  if (opts.targetAudience) lines.push(`Target audience: ${opts.targetAudience}`);

  if (opts.cashDna) {
    lines.push(`\nCASH DNA:`);
    if (opts.cashDna.concept_type) lines.push(`Concept type: ${opts.cashDna.concept_type}`);
    if (opts.cashDna.angle) lines.push(`Angle: ${opts.cashDna.angle}`);
    if (opts.cashDna.style) lines.push(`Ad style: ${opts.cashDna.style}`);
    if (opts.cashDna.awareness_level) lines.push(`Awareness level: ${opts.cashDna.awareness_level}`);
    if (opts.cashDna.concept_description) lines.push(`Concept: ${opts.cashDna.concept_description}`);
    if (opts.cashDna.copy_blocks?.length) lines.push(`Copy blocks: ${opts.cashDna.copy_blocks.join(", ")}`);
  }

  if (opts.visualDirection) {
    lines.push(`\nVisual direction from concept generator:\n${opts.visualDirection}`);
  }

  if (opts.spyAdContext) {
    lines.push(`\nCompetitor ad analysis:\n${opts.spyAdContext}`);
  }

  // V3.3: Segment context
  if (opts.segment) {
    lines.push(`\nTARGET SEGMENT:`);
    lines.push(`Name: ${opts.segment.name}`);
    if (opts.segment.description) lines.push(`Description: ${opts.segment.description}`);
    if (opts.segment.core_desire) lines.push(`Core desire: ${opts.segment.core_desire}`);
    if (opts.segment.core_constraints) lines.push(`Core constraints: ${opts.segment.core_constraints}`);
    if (opts.segment.demographics) lines.push(`Demographics: ${opts.segment.demographics}`);
    lines.push(`\nTailor ALL hooks, headlines, and visual prompts to THIS specific person. The imagery should feel like it was made for someone who matches this description.`);
  }

  // V3.4: Iteration context — tells Claude what changed from the parent concept
  if (opts.iterationContext) {
    const ic = opts.iterationContext;
    const iterationType = String(ic.iteration_type ?? "");
    lines.push(`\nITERATION CONTEXT:`);
    lines.push(`This is an ITERATION of a winning ad concept. The original concept performed well and we're testing a specific variation.`);

    if (iterationType === "segment_swap") {
      lines.push(`Type: SEGMENT SWAP — same concept, different target audience.`);
      if (ic.segment_name) lines.push(`New segment: ${ic.segment_name}`);
      if (ic.segment_description) lines.push(`Description: ${ic.segment_description}`);
      if (ic.segment_core_desire) lines.push(`Their core desire: ${ic.segment_core_desire}`);
      if (ic.segment_core_constraints) lines.push(`Their constraints: ${ic.segment_core_constraints}`);
      lines.push(`Keep the same angle and hooks, but adapt ALL visuals, mood, imagery, and emotional tone to deeply resonate with this new audience. The ad should feel like it was made specifically for them.`);
    } else if (iterationType === "mechanism_swap") {
      lines.push(`Type: MECHANISM SWAP — same emotional trigger, different "how it works".`);
      if (ic.original_angle) lines.push(`Original angle/mechanism: ${ic.original_angle}`);
      if (ic.new_mechanism) lines.push(`New mechanism: ${ic.new_mechanism}`);
      lines.push(`Keep the same emotional triggers and visual energy, but shift the angle to feature this new mechanism. The "what it does for you" stays the same — the "how" changes.`);
    } else if (iterationType === "cash_swap") {
      const element = String(ic.swap_element ?? "");
      lines.push(`Type: C.A.S.H. SWAP — one element changed.`);
      lines.push(`Element changed: ${element.toUpperCase()}`);
      if (ic.original_value) lines.push(`Original ${element}: ${ic.original_value}`);
      if (ic.new_value) lines.push(`New ${element}: ${ic.new_value}`);
      if (element === "hook") {
        lines.push(`Create visuals that set up and pay off this new hook. The hook drives the creative direction.`);
      } else if (element === "style") {
        lines.push(`Shift the overall visual style to match this new ad style. Same angle and hooks, different visual presentation.`);
      } else if (element === "angle") {
        lines.push(`Shift the angle of attack. Same product benefits, but framed through this new lens. The visual metaphors and imagery should reflect the new angle.`);
      }
    }
    lines.push("");
  }

  lines.push(`\nAVAILABLE HOOKS (use one per brief, in order):`);
  opts.hooks.forEach((h, i) => lines.push(`${i + 1}. ${h}`));

  if (opts.headlines.length > 0) {
    lines.push(`\nAVAILABLE HEADLINES (rotate across briefs):`);
    opts.headlines.forEach((h, i) => lines.push(`${i + 1}. ${h}`));
  }

  // V3.1: styles are already awareness-filtered
  const awarenessNote = opts.cashDna?.awareness_level
    ? ` (prioritized for "${opts.cashDna.awareness_level}" awareness)`
    : "";
  lines.push(`\nSTYLES TO USE${awarenessNote} — one per brief, assign the best style for each hook:`);
  lines.push(opts.styles.join(", "));

  lines.push(`\nREFERENCE IMAGES AVAILABLE:`);
  if (opts.hasSpyAdImage) lines.push(`- Competitor ad image (for style reference)`);
  if (opts.hasProductImages) lines.push(`- Product images (categories: ${opts.productImageCategories.join(", ")})`);
  if (!opts.hasSpyAdImage && !opts.hasProductImages) lines.push(`- None available`);

  // Native ad special instructions for Unaware concepts
  const isNativeConcept = opts.cashDna?.awareness_level === "Unaware" ||
    opts.styles.some((s) => s.startsWith("native-"));
  if (isNativeConcept) {
    lines.push(`\nNATIVE AD INSTRUCTIONS (this is an Unaware/native concept):`);
    lines.push(`- For native-* styles, the hook text MUST read like an editorial headline, NOT an ad headline`);
    lines.push(`- Use headline formulas: "The [unexpected] reason [symptom] gets worse after [age]", "The forgotten [noun] that [benefit]", "[Authority] finally admits what [group] knew all along"`);
    lines.push(`- Images must pass the "Is this an ad?" test — if it looks like an ad, it fails`);
    lines.push(`- referenceStrategy MUST be "none" for all native-* styles`);
    lines.push(`- Think WebMD articles, medical textbooks, someone's messy bathroom photo — NOT polished advertising`);
  }

  lines.push(`\nRemember: each brief must produce a GENUINELY DIFFERENT looking ad. Vary the composition, color palette, text placement, and visual approach. Follow the prompt engineering rules strictly. Each brief MUST include 1-2 reptile triggers woven into the visual prompt.`);

  return lines.join("\n");
}

// --- Parser ---

function parseBriefs(raw: string, expectedCount: number): ImageBrief[] {
  // Extract JSON array from response
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("Claude returned no valid JSON array for image briefs");
  }

  let parsed: unknown[];
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error("Failed to parse image briefs JSON");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Claude returned empty briefs array");
  }

  const validStyles = new Set(STATIC_STYLES.map((s) => s.id));
  const validTriggers = new Set(REPTILE_TRIGGERS.map((t) => t.id));

  const briefs: ImageBrief[] = [];
  for (const item of parsed.slice(0, expectedCount)) {
    const obj = item as Record<string, unknown>;
    const style = String(obj.style ?? "product-hero");
    const prompt = String(obj.prompt ?? "");
    const hookText = String(obj.hook ?? "");

    if (!prompt || !hookText) continue;

    // Parse reptile triggers
    let reptileTriggers: ReptileTriggerId[] | undefined;
    if (Array.isArray(obj.reptileTriggers)) {
      const valid = obj.reptileTriggers
        .map((t) => String(t))
        .filter((t) => validTriggers.has(t as ReptileTriggerId));
      if (valid.length > 0) reptileTriggers = valid as ReptileTriggerId[];
    }

    briefs.push({
      style: validStyles.has(style as StaticStyleId) ? (style as StaticStyleId) : "product-hero",
      prompt,
      hookText,
      headlineText: obj.headline ? String(obj.headline) : undefined,
      referenceStrategy: (["product", "spy-ad", "both", "none"].includes(String(obj.referenceStrategy))
        ? String(obj.referenceStrategy)
        : "product") as ImageBrief["referenceStrategy"],
      reptileTriggers,
    });
  }

  return briefs;
}
