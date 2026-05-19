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
 * Leading instruction / Section-0 preamble (from @DanjiTosaka via
 * realistic-selfie-prompt-techniques.md). One-line preamble that sets the
 * model's output bucket BEFORE it reads any prose body. Same prose produces
 * dramatically different output depending on this line.
 *
 * This is the bucket-selector for "customer testimonial phone selfie" vs
 * "luxury portrait" vs "Sony A7R editorial". Pull from here.
 */
export const LEADING_INSTRUCTION =
  "No text, no watermarks. iPhone selfie taken mid-routine, raw amateur quality, NOT polished influencer aesthetic.";

/**
 * The canonical iPhone-locked-capture style block. Pulls from:
 * - Section 9 of AI-UGC-PROMPT-EXAMPLES.md (locked-capture template)
 * - @daaaaanc cafe prompt (NO ARTIFICIAL BOKEH override)
 * - @iamdomprompt JSON blocks (subsurface scattering, sensor atmosphere)
 * - @ViralOps_ talking-to-camera prompt (slight edge distortion from close lens)
 * - iPhone 12 front-camera real specs (23mm equivalent, f/2.2)
 *
 * Apply this to any image-gen prompt that should look like a real customer
 * phone selfie.
 */
export const IPHONE_LOCKED_CAPTURE_STYLE = [
  "You are locked into a permanent capture style: Authentic iPhone front-camera photo realism.",
  `Rules: Simulate Apple ${IPHONE_DEVICE} computational photography pipeline (older device aesthetic, NOT the polished look of newer 15 Pro / 16 Pro).`,
  // Lens anatomy (iPhone 12 front camera real specs)
  "23mm equivalent front-facing wide-angle lens, f/2.2 aperture, slight edge distortion from close phone lens.",
  // What it is NOT
  "No cinematic lighting, no flash, no studio lighting.",
  "No beauty filters, no symmetry correction, no pose optimization.",
  // Computational photography signatures
  "Slight wide-angle distortion.",
  "Subtle edge sharpening.",
  "Flattened midtones.",
  "Mild overexposure on highlights.",
  "Natural shadow noise (slight grain in dark areas, typical of phone sensor in indoor light).",
  "Very subtle natural vignetting (faint corner shading, not stylized).",
  // Skin rendering physics (@iamdomprompt subsurface_scattering cue)
  "Real skin texture (pores, creases, uneven tone). Subsurface scattering: soft light penetrating the skin edges creating a natural fleshy translucency, NOT opaque shader / plastic skin.",
  // Composition / DOF (@daaaaanc NO ARTIFICIAL BOKEH override)
  "Casual framing, slightly imperfect crop.",
  "NO ARTIFICIAL BOKEH. Phone small-sensor deep focus overall - the entire frame stays in focus, real phones cannot produce portrait-mode shallow DOF naturally.",
  "Micro motion blur allowed.",
  "NO HDR look.",
  "Flat image colors.",
  "Slight film grain.",
].join(" ");

/**
 * Anti-perfection trailing negative list (verbatim from @ViralOps_). More
 * aggressive than the generic FORBIDDEN_LOOKS list - each forbid maps to a
 * specific failure mode the model defaults to. Appended at the END of a
 * testimonial prompt for max effect.
 */
export const ANTI_PERFECTION_TRAILING_BLOCK =
  "No flawless skin, no professional photography look, no centered composition, no clean minimalist room, no airbrushing, no softbox lighting, no glamour pose.";

/**
 * Freckle / mole gotcha. Per @DanjiTosaka reply chain - Nano Banana renders
 * "freckles" / "moles" / "beauty marks" as visible RED-SPOT / blemish
 * artifacts rather than soft pigmentation. Do NOT name these features in
 * prompts. Generic "natural skin texture" + "visible micro-pores" stay safe.
 *
 * If a real reference image has freckles, attach it and let the model copy
 * them - don't describe them in text.
 */
export const FRECKLE_MOLE_GOTCHA_NOTE =
  "Do NOT name 'freckles', 'moles', 'beauty marks', 'sunspots', 'age marks' or similar named pigmentation features in the prompt - they render as red-spot artifacts in Nano Banana. Use 'natural skin texture variation' or 'natural age-appropriate skin' instead.";

/**
 * Age-markers preservation rule. Counters Nano Banana's tendency to render the
 * AFTER half as a slightly YOUNGER version of the same person rather than a
 * more-rested version. This is a marketing-trope prior the model picked up
 * from training data - "rested skin" gets interpreted as "fewer wrinkles".
 *
 * For genuine-testimonial B/A where the avatar is 45-70 SE/NO/DK women, the
 * wrinkles MUST stay the same - only the specific feature being demonstrated
 * (undereye area for subtle, etc.) changes.
 *
 * Use as a hard_constraint for face zones in any B/A prompt.
 */
export const AGE_MARKERS_PRESERVATION_RULE =
  "AGE-MARKER PRESERVATION (hard rule): the AFTER half must preserve ALL age markers visible in the BEFORE half - same wrinkle count, same wrinkle depth, same forehead lines, same crow's feet, same nasolabial folds, same neck loosening, same hand-vein prominence, same hair density. The AFTER half is the SAME PERSON on a more-rested day, NOT a younger version. Do NOT smooth, retouch, or reduce age signs beyond the specific feature being demonstrated (e.g. for subtle intensity, ONLY undereye shadow changes - wrinkles stay identical).";

/**
 * Anti-trope lighting rule. Lighting MAY vary between halves (two real
 * customer selfies taken on different days often have different light), but
 * the specific trope "warm-yellow tired BEFORE / cool-neutral rested AFTER"
 * is a marketing-creative pattern that signals "staged not real". Forbid that
 * specific direction while allowing other variation.
 */
export const ANTI_TROPE_LIGHTING_RULE =
  "ANTI-TROPE LIGHTING (hard rule): natural lighting variation between halves is OK (real customer selfies on different days have different light). BUT do NOT follow the marketing trope of warm-yellow / dim / tired-looking light on the BEFORE half paired with cool-neutral / bright / fresh-looking light on the AFTER half. That bias signals staged not real. If anything, randomly reverse it (cool BEFORE, warm AFTER) or use similar-temperature lighting in both halves. Both halves must remain in the UNFLATTERING-home-light bucket either way - never studio softbox, never ring light.";

/**
 * Camera-angle / phone-position variations for face zones.
 *
 * In the default "random" mode the route picks ONE entry per half (via
 * pickPair) so BEFORE and AFTER show the subject from genuinely different
 * angles - mimicking what real customer testimonials show (two casual
 * selfies on different days, different framings). Same-person identity stays
 * locked by other constraints.
 *
 * If the user picks a specific angle in the UI, both halves use that one.
 *
 * The named-key map is the canonical source for the UI dropdown options;
 * the array form is for random pickPair() calls.
 */
export const FACE_CAMERA_ANGLE_DEFINITIONS = {
  head_on:
    "Phone held at eye-level, head-on direct angle. Face centered, both eyes visible at the same height.",
  above:
    "Phone held slightly above eye-level (the typical casual selfie angle), looking very slightly downward at the subject. Slight foreshortening - forehead a touch larger, chin a touch smaller.",
  below:
    "Phone held slightly below eye-level (subject looking down at the phone in their hand resting on a counter). Slight chin-prominence, brow ridge softened, eyes glance downward at the camera.",
  three_quarter_right:
    "3/4 angle from camera-right (subject's body rotated ~15 degrees toward the camera-left, head turned slightly toward the camera). Both eyes still visible, one cheek slightly more prominent.",
  three_quarter_left:
    "3/4 angle from camera-left (subject's body rotated ~15 degrees toward the camera-right, head turned slightly toward the camera). Both eyes still visible, the other cheek slightly more prominent.",
  tight_crop:
    "Tight crop, head fills most of the frame, slight crop of the forehead and chin (the casual close phone selfie distance).",
  dutch_tilt:
    "Slight Dutch-tilt - phone not held perfectly straight, frame rotated ~5 degrees (rushed-snap energy, not staged).",
} as const;

export type FaceCameraAngleKey = keyof typeof FACE_CAMERA_ANGLE_DEFINITIONS;

export const FACE_CAMERA_ANGLES: string[] = Object.values(
  FACE_CAMERA_ANGLE_DEFINITIONS,
);

/**
 * Camera-distance / zoom variations for face zones. Pick PER HALF (different
 * for BEFORE vs AFTER) so the two halves look like two genuinely separate
 * selfies. Real customer testimonials show varying distances - the customer
 * didn't measure arm extension between June and December.
 */
export const FACE_CAMERA_DISTANCES = [
  "Phone held at standard selfie distance (arm fully extended), head and shoulders visible.",
  "Phone held closer to the face (slight wide-angle exaggeration), face fills most of the frame.",
  "Phone held farther away (arm extended + slight lean back), more headroom above and shoulders visible.",
  "Phone at chest level, propped or held low, face slightly larger due to top-down look.",
  "Phone at face level, mid-arm extension, head fills the upper 2/3 of the frame.",
];

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
  /** Prepend the leading instruction (Section-0 preamble). Default true. */
  includeLeadingInstruction?: boolean;
  /** Prepend the FutrGroup magic phrase (recommended default true). */
  includeMagicPhrase?: boolean;
  /** Append the FINAL TEST locking statement (recommended default true). */
  includeFinalTest?: boolean;
  /** Append the 7 AI tells as explicit negatives (recommended default true). */
  includeAiTells?: boolean;
  /** Append the @ViralOps_ anti-perfection trailing block. Default true. */
  includeAntiPerfection?: boolean;
}): string {
  const includeLeading = opts?.includeLeadingInstruction ?? true;
  const includeMagic = opts?.includeMagicPhrase ?? true;
  const includeFinal = opts?.includeFinalTest ?? true;
  const includeTells = opts?.includeAiTells ?? true;
  const includeAnti = opts?.includeAntiPerfection ?? true;

  const parts: string[] = [];
  // Section-0: leading instruction sets the model bucket BEFORE anything else.
  if (includeLeading) {
    parts.push(LEADING_INSTRUCTION);
  }
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
  // Anti-perfection block goes LAST per @ViralOps_ - aggressive trailing
  // negative list is more effective than mid-prompt.
  if (includeAnti) {
    parts.push(ANTI_PERFECTION_TRAILING_BLOCK);
  }
  if (includeFinal) {
    parts.push(TESTIMONIAL_FINAL_TEST);
  }
  return parts.join(" ");
}
