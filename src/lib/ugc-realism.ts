/**
 * UGC realism cues for image / video generation prompts.
 *
 * THIS IS THE CANONICAL SOURCE for "real customer phone selfie, NOT polished
 * marketing creative" image prompt language. When iterating on UGC realism
 * for ANY image-gen consumer, pull from here verbatim - do not paraphrase.
 *
 * Canonical sources (do not reinvent - read these first):
 * - copywriting/AI UGC Videos/AI-UGC-PROMPT-EXAMPLES.md Section 9 (Nano Banana
 *   Pro iPhone Selfie Style locked-capture template)
 * - copywriting/AI UGC Videos/AI-UGC-PROMPT-EXAMPLES.md Section 3 (Dorm
 *   Confessional FINAL TEST framework)
 * - copywriting/AI UGC Videos/ox ROAS AI UGC content/FutrGroup AI Course.pdf
 *   ("shot with an iPhone with imperfect lighting" magic phrase, "slight film
 *   grain", "be descriptive but not too descriptive")
 * - copywriting/AI UGC Videos/ox ROAS AI UGC content/The Anti-slop AI UGC
 *   System/Module 1_ Foundation & Mindset.pdf (7 Things That Scream AI)
 * - copywriting/AI UGC Videos/ox ROAS AI UGC content/tw - Older doctor
 *   prompt.pdf ("illuminating face evenly but unflatteringly" + iPhone 12
 *   reference)
 *
 * Memory pointer: ~/.claude/projects/-Users-williamhedin-Claude-Code/memory/ugc-prompting-docs-index.md
 *
 * Duplicate-cleanup TODO: identical canonical-capture strings still exist
 * inline in src/lib/video-format-aesthetics.ts, src/lib/video-brainstorm.ts,
 * src/app/api/video-jobs/[id]/pipeline/shot-images/route.ts, and
 * src/app/api/video-jobs/[id]/pipeline/regenerate-shot/route.ts. Migrate them
 * to import from this module the next time you touch any of them.
 */

// Device anchor. iPhone 12 (intentional - older device produces grainier,
// less HDR-corrected output than 15 Pro / 16 Pro. Section 9 of the canonical
// doc names "iPhone 12 quality" specifically as the right grit level for
// testimonial selfies.)
export const IPHONE_DEVICE = "iPhone 12";

// Magic phrase from FutrGroup AI Course. Per their guidance this single
// phrase moves Nano Banana toward realism more than any other.
export const IPHONE_MAGIC_PHRASE = "shot with an iPhone with imperfect lighting";

/**
 * The canonical iPhone-locked-capture style block (Section 9 of
 * AI-UGC-PROMPT-EXAMPLES.md, lightly extended with iPhone 12 + slight film
 * grain from FutrGroup). Apply this to any image-gen prompt that should look
 * like a real customer phone selfie.
 */
export const IPHONE_LOCKED_CAPTURE_STYLE = [
  "You are locked into a permanent capture style: Authentic iPhone front-camera photo realism.",
  `Rules: Simulate Apple ${IPHONE_DEVICE} computational photography pipeline (older device aesthetic, NOT the polished look of newer 15 Pro / 16 Pro).`,
  "No cinematic lighting, no flash, no studio lighting.",
  "No beauty filters, no symmetry correction, no pose optimization.",
  "Slight wide-angle distortion.",
  "Subtle edge sharpening.",
  "Flattened midtones.",
  "Mild overexposure on highlights.",
  "Natural shadow noise.",
  "Real skin texture (pores, creases, uneven tone).",
  "Casual framing, slightly imperfect crop.",
  "Micro motion blur allowed.",
  "NO HDR look.",
  "Flat image colors.",
  "Slight film grain.",
].join(" ");

/**
 * The 7 Things That Scream AI (Module 1 of the Anti-slop AI UGC System).
 * Inject as hard-negatives in any UGC prompt.
 */
export const AI_TELLS_TO_AVOID = [
  "Dead eyes, frozen face",
  "Floating products",
  "Perfect lighting",
  "Empty backgrounds",
  "Robot / distorted hands",
  "Announcer voice",
  "Professional camera look",
];

/**
 * Trigger phrasings that pull the model toward polish even when prefixed with
 * "no" or "not". Avoid these words entirely in prompts.
 */
export const FORBIDDEN_TRIGGER_PHRASINGS = [
  "professional",
  "magazine",
  "stock",
  "editorial",
  "flattering",
  "iPhone quality", // too vague per canonical doc - prefer specific model
  "slightly blurry", // looks broken, not authentic
  "motion blur", // same - "micro motion blur" is fine, "motion blur" alone is not
  "compressed JPEG quality", // model doesn't render this concept
];

/**
 * Look-level negatives. Concrete visual styles to forbid. Different from
 * FORBIDDEN_TRIGGER_PHRASINGS (which are word-level).
 */
export const FORBIDDEN_LOOKS = [
  "ring light glow",
  "studio lighting setup",
  "controlled three-point lighting",
  "golden hour",
  "soft beauty light",
  "symmetric face lighting",
  "beauty filter",
  "cosmetic smoothing",
  "retouching",
  "AI-rendering polish",
  "perfect facial symmetry",
  "dead / frozen eyes",
  "floating product",
  "empty backdrop",
  "plain neutral studio backdrop",
  "posed model expression",
  "styled hair",
  "applied makeup",
  "skincare-ad aesthetic",
  "shallow depth of field bokeh background",
];

/**
 * Unflattering lighting options. Verbatim phrasings from "tw - Older doctor
 * prompt.pdf" + "tw - 22 east asian woman skin hydrating prompt.pdf" + similar
 * canonical sources. Use these as the lighting pool for any UGC prompt that
 * wants "whatever was on in the room" testimonial vibe (NOT chosen for
 * flattery).
 *
 * Lighting must always be motivated by a visible source (window / vanity /
 * overhead / lamp) - never generic "soft natural light".
 */
export const UNFLATTERING_LIGHTING_OPTIONS = [
  "Standard overhead bathroom fluorescent light, illuminating the face evenly but unflatteringly",
  "Yellow kitchen ceiling bulb, mild overexposure on the forehead and nose-bridge T-zone",
  "Direct bathroom vanity light from above, creating slightly harsh highlights on forehead and cheeks and soft shadows under the chin and jawline",
  "Mixed lighting (cool window light + warm tungsten lamp) producing a slight color cast across the face",
  "Dim morning indoor light, slightly underexposed, dark shadows around the eyes",
  "Cool blueish midday window light, slightly washing out skin tones",
  "Phone front camera in dim indoor light, slight noise / grain in the shadows, faint orange color cast from a nearby lamp",
  "Harsh side light from a window, one side of the face noticeably brighter than the other, slight overexposure on the lit side",
  "Yellowish bathroom vanity bulb from above, casting shadows under the cheekbones and nose",
];

/**
 * FINAL TEST pattern from Section 3 (Dorm Confessional). Use as the closing
 * locking-statement in any testimonial-style image prompt. Forces the model
 * to evaluate its output against an explicit testimonial / not-brand-ad
 * criterion.
 */
export const TESTIMONIAL_FINAL_TEST = [
  "FINAL TEST:",
  "- Skincare ad → NO",
  "- Brand creative → NO",
  "- Polished UGC / GRWM → NO",
  "- Customer mid-routine phone selfie texted to a friend → YES",
].join("\n");

/**
 * Compose a complete testimonial-style realism block for image generation.
 *
 * Returns a single string suitable for embedding as the `style` field of an
 * image-gen JSON prompt, or as a sharedStyle for a sentence-style prompt.
 *
 * Use this for the Before/After generator, customer-testimonial mock-ups,
 * UGC-style ad imagery, and any other case where the desired output is a
 * "real customer iPhone selfie" not a polished brand creative.
 */
export function buildTestimonialStyleBlock(opts?: {
  /** Prepend the FutrGroup magic phrase (recommended default true). */
  includeMagicPhrase?: boolean;
  /** Append the FINAL TEST locking statement (recommended default true). */
  includeFinalTest?: boolean;
  /** Append the 7 AI tells as explicit negatives (recommended default true). */
  includeAiTells?: boolean;
}): string {
  const includeMagic = opts?.includeMagicPhrase ?? true;
  const includeFinal = opts?.includeFinalTest ?? true;
  const includeTells = opts?.includeAiTells ?? true;

  const parts: string[] = [];
  if (includeMagic) {
    parts.push(`${IPHONE_MAGIC_PHRASE}.`);
  }
  parts.push(IPHONE_LOCKED_CAPTURE_STYLE);
  if (includeTells) {
    parts.push(
      `AVOID THESE 7 AI TELLS: ${AI_TELLS_TO_AVOID.join(", ")}.`,
    );
  }
  parts.push(
    `FORBIDDEN PHRASING (trigger polish even when negated): ${FORBIDDEN_TRIGGER_PHRASINGS.join(", ")}.`,
  );
  parts.push(`FORBIDDEN LOOK: ${FORBIDDEN_LOOKS.join(", ")}.`);
  if (includeFinal) {
    parts.push(TESTIMONIAL_FINAL_TEST);
  }
  return parts.join(" ");
}
