import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase-admin";
import { CLAUDE_MODEL } from "@/lib/constants";
import { calcClaudeCost } from "@/lib/pricing";
import { createImageTask, pollTaskResult } from "@/lib/kie";

export const maxDuration = 800;

const ASPECT_RATIO = "16:9";
const RESOLUTION = "1K";
const POLL_TIMEOUT_MS = 720_000;

type Intensity = "subtle" | "moderate" | "dramatic";

const BODY_ZONE_PRESETS = {
  full_face_front: "Tight portrait crop, full face front view. Frame from just below the chin to just above the hairline, both eyes visible, head fills most of the frame. Shoulders may peek in at the bottom edge. Lifestyle selfie framing.",
  face_profile: "Tight 3-quarter or side profile crop, lifestyle selfie style. Frame from chin to forehead, showing one cheek and jawline prominently, partial nose, one ear may peek in. Head fills most of the frame.",
  eye_area: "Tight close-up on one eye area, lifestyle skincare-style framing (NOT a medical scan, NOT a clinical examination). Frame shows the eye, upper and lower lid, outer brow, and the bridge of the nose at one side, plus a hint of the upper cheek at the bottom edge. The frame does not include: the mouth, chin, jaw, ear, hairline, or the forehead beyond the brow area. Lifestyle phone-photo close-up, casual.",
  forehead: "Tight close-up on the forehead, lifestyle selfie framing. Frame shows the area from just above the brows up to the hairline, with the brows visible at the bottom edge. The frame does not include: the eyes, mouth, chin, jaw, cheeks, full nose. Glasses frame may sometimes be visible at the bottom edge. A horizontal slice across the forehead, casual phone-photo framing.",
  neck_decolletage: "Tight close-up on the neck and upper decolletage, lifestyle selfie framing. Frame shows the neck (from just below the chin/jawline), the throat, and the upper chest down to the collarbone or hint of a thin top strap. The frame does not include the full face - the chin may barely peek in at the very top but the rest of the face is cropped out.",
  cheek_closeup: "Tight close-up on one cheek, lifestyle skincare-style framing (NOT a medical scan). Frame is tight enough that cheek skin fills most of the frame, showing natural skin texture and pores. The frame does not include: the eyes, the full mouth (maybe just the corner of the lips at one edge), chin, forehead, or the other side of the face. Perhaps the edge of the nose or a hint of the ear at one side. Casual phone-photo macro.",
  arm_skin: "Tight close-up on the skin of the upper arm or forearm. Frame shows skin texture filling most of the frame, with just a sliver of clothing edge or out-of-focus background at the frame edge. The frame does not include: the face, head, body, hand, or the full arm structure. Casual lifestyle macro.",
  hands: "Tight close-up on the back of one hand and lower wrist. Frame shows the hand from the wrist down through the fingers. The frame does not include: the face, body, or arm above the wrist. Casual lifestyle phone-photo framing.",
  hair_scalp: "Tight close-up on the hair parting line, top-down or 3-quarter angle from above. Frame shows hair density at the central parting where the scalp is faintly visible between hair strands. Casual haircare close-up framing, NOT a medical scan, NOT a clinical hair examination. The frame does not include: the eyes, mouth, ears, full face. Maybe a hint of forehead at the bottom edge.",
  leg_thigh: "Tight close-up on the upper thigh or knee skin, lifestyle skincare close-up framing (NOT a medical scan, NOT a full-body photo). Frame is tight enough that ONLY skin texture fills most of the frame. A sliver of light-colored shorts/leggings or out-of-focus background is visible at one edge of the frame to anchor casual context. The frame does not include: the face, body, or full leg - just a skin section.",
  chest_macro: "Tight close-up on the upper decolletage area, lifestyle skincare close-up framing (NOT a medical scan). Frame shows skin texture from just above the collarbone down to where a thin v-neck or t-shirt edge is visible at the bottom. The frame does not include: the face, mouth, eyes, jaw, or any bare chest below the visible top edge. The top edge of clothing must be visible to anchor context.",
} as const;

type ZoneKey = keyof typeof BODY_ZONE_PRESETS;

const AGE_RANGES = [
  "30-35",
  "36-40",
  "40-45",
  "46-50",
  "51-55",
  "56-60",
  "61-65",
  "66-70",
  "71-75",
];

type Ethnicity =
  | "scandinavian"
  | "north_european"
  | "mediterranean"
  | "east_asian"
  | "south_asian"
  | "latin"
  | "middle_eastern"
  | "african";

const ETHNICITY_PROFILES: Record<
  Ethnicity,
  {
    label: string;
    hair_colors: string[];
    eye_colors: string[];
    skin_tones: string[];
  }
> = {
  scandinavian: {
    label: "Scandinavian",
    hair_colors: [
      "natural blonde",
      "dark blonde",
      "light brown",
      "brunette",
      "salt-and-pepper",
      "silver-grey",
      "ash-blonde",
      "warm honey blonde",
    ],
    eye_colors: ["blue", "blue-grey", "green", "hazel", "light brown"],
    skin_tones: [
      "fair scandinavian skin",
      "light beige scandinavian skin",
      "light pink-fair scandinavian skin",
      "neutral fair scandinavian skin",
    ],
  },
  north_european: {
    label: "Northern European",
    hair_colors: ["dark blonde", "light brown", "brunette", "auburn", "salt-and-pepper", "silver-grey"],
    eye_colors: ["blue", "green", "hazel", "light brown", "grey-blue"],
    skin_tones: ["fair European skin", "neutral fair skin", "light beige skin", "light cool-toned skin"],
  },
  mediterranean: {
    label: "Mediterranean",
    hair_colors: ["dark brown", "brunette", "black", "auburn", "salt-and-pepper"],
    eye_colors: ["brown", "dark brown", "hazel", "green"],
    skin_tones: ["warm olive skin", "light olive skin", "warm beige Mediterranean skin", "tan Mediterranean skin"],
  },
  east_asian: {
    label: "East Asian",
    hair_colors: ["black", "dark brown", "near-black brunette", "salt-and-pepper", "grey"],
    eye_colors: ["dark brown", "brown", "near-black"],
    skin_tones: ["warm beige East Asian skin", "light East Asian skin", "neutral fair East Asian skin", "warm porcelain skin"],
  },
  south_asian: {
    label: "South Asian",
    hair_colors: ["black", "dark brown", "near-black", "salt-and-pepper"],
    eye_colors: ["dark brown", "brown", "near-black"],
    skin_tones: ["warm golden South Asian skin", "medium tan South Asian skin", "warm beige South Asian skin"],
  },
  latin: {
    label: "Latin / Hispanic",
    hair_colors: ["dark brown", "brunette", "black", "warm brown", "salt-and-pepper"],
    eye_colors: ["brown", "dark brown", "hazel"],
    skin_tones: ["warm beige Latin skin", "tan Latin skin", "medium warm skin"],
  },
  middle_eastern: {
    label: "Middle Eastern",
    hair_colors: ["dark brown", "black", "near-black brunette", "salt-and-pepper"],
    eye_colors: ["dark brown", "brown", "hazel"],
    skin_tones: ["warm olive Middle Eastern skin", "medium golden skin", "warm beige skin"],
  },
  african: {
    label: "African / African American",
    hair_colors: ["black", "dark brown", "salt-and-pepper", "grey afro"],
    eye_colors: ["dark brown", "brown", "near-black"],
    skin_tones: ["warm deep brown skin", "medium-brown skin", "rich umber skin", "warm cocoa skin"],
  },
};
const HAIR_STYLES = [
  "shoulder-length hair worn down with a slight wave",
  "long straight hair worn down",
  "loose low ponytail",
  "low messy bun",
  "loose natural waves worn down",
  "hair pulled back simply behind the ears",
  "shoulder-length bob, slightly tousled",
];
const ACCENTS: (string | null)[] = [
  null,
  null,
  null,
  null,
  "subtle freckles across the nose and cheeks",
  "no makeup, completely natural face",
  "very light natural makeup",
  "slight warm undertone in the skin",
];

const TOPS = [
  "heather grey crew-neck t-shirt",
  "soft white cotton tee",
  "navy blue v-neck sweater",
  "muted dusty-pink crew sweater",
  "black thin-knit top",
  "cream-colored linen blouse",
  "olive green casual tee",
  "light beige loose top",
  "deep burgundy lounge top",
  "soft sage-green crew neck",
];

const LIGHTING_VARIANTS = [
  "bright morning window light from the side, slight warm tone",
  "soft midday overhead light, neutral white balance",
  "warm late-afternoon golden light streaming from a window",
  "neutral indoor overhead bulb light, slightly dimmer",
  "cool diffuse window light on a cloudy day",
  "warm bathroom vanity light, slightly yellow",
  "soft morning kitchen light, cool and bright",
];

const HEAD_TILTS = [
  "head straight on, neutral tilt",
  "head straight on with chin slightly raised",
  "head straight on with chin slightly lowered",
  "head straight on, very slightly closer to the camera",
  "head straight on, very slightly further from the camera",
  "head turned very subtly in a 3-quarter angle (NEVER mirrored vs the other half - same direction)",
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickPair<T>(arr: readonly T[]): [T, T] {
  if (arr.length < 2) return [arr[0], arr[0]];
  const a = pick(arr);
  let b = pick(arr);
  while (b === a) b = pick(arr);
  return [a, b];
}

interface Demographic {
  age: string;
  ethnicity: Ethnicity;
  hair_color: string;
  hair_style: string;
  eye_color: string;
  skin_tone: string;
  accent: string | null;
}

interface DemographicOverrides {
  age?: string;
  ethnicity?: Ethnicity;
  hair_color?: string;
}

function randomDemographic(overrides?: DemographicOverrides): Demographic {
  const ethnicity = overrides?.ethnicity ?? "scandinavian";
  const profile = ETHNICITY_PROFILES[ethnicity];
  return {
    age: overrides?.age ?? pick(AGE_RANGES),
    ethnicity,
    hair_color: overrides?.hair_color ?? pick(profile.hair_colors),
    hair_style: pick(HAIR_STYLES),
    eye_color: pick(profile.eye_colors),
    skin_tone: pick(profile.skin_tones),
    accent: pick(ACCENTS),
  };
}

function demographicToString(d: Demographic): string {
  const accent = d.accent ? `, ${d.accent}` : "";
  const ethnicityLabel = ETHNICITY_PROFILES[d.ethnicity].label;
  return `${ethnicityLabel} woman, ${d.age} years old, ${d.hair_color} ${d.hair_style}, ${d.eye_color} eyes, ${d.skin_tone}${accent}`;
}

const INTENSITY_PROMPTS: Record<Intensity, string> = {
  subtle:
    "BEFORE half: skin looks slightly tired - softer contours, visible natural skin texture, slightly neutral tone. AFTER half: skin looks slightly more rested - marginally smoother texture, slightly more even tone, gentle natural glow. The visual difference is subtle but visible on close inspection.",
  moderate:
    "BEFORE half: skin looks tired - softer contours, visible natural skin texture, slightly neutral tone, gently tired look around the eyes. AFTER half: skin looks visibly rested - smoother texture, more even tone, natural glow, brighter look around the eyes. The visual difference is clear but realistic.",
  dramatic:
    "BEFORE half: skin looks quite tired - softer contours, prominent natural skin texture, slightly uneven tone, tired look around the eyes. AFTER half: skin looks visibly rested and bright - much smoother texture, more even tone, clear natural glow, bright look around the eyes. The visual difference is striking but realistic and natural.",
};

interface BodyZoneVision {
  detected_zone: ZoneKey | "other" | null;
  composition: {
    camera: string;
    framing: string;
    lighting: string;
    background: string;
  } | null;
}

async function analyzeSource(
  imageUrl: string,
  client: Anthropic
): Promise<{ vision: BodyZoneVision; usage: Anthropic.Messages.Usage }> {
  const systemPrompt = `You are a visual analyst for a before/after image generator. Given a source image, extract two things as JSON:

1. The body zone shown. Pick the closest from: ${Object.keys(BODY_ZONE_PRESETS).join(", ")}, or "other" if none fit.
2. The composition: camera angle, framing/crop, lighting, background.

Return ONLY JSON in this exact shape (no markdown fences, no commentary):

{
  "detected_zone": "<one of the keys above, or 'other'>",
  "composition": {
    "camera": "<short description of camera angle and distance>",
    "framing": "<short description of the crop and what is in frame>",
    "lighting": "<short description of lighting direction, quality, and color temperature>",
    "background": "<short description of the background>"
  }
}`;

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 800,
    temperature: 0.2,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: imageUrl } },
          {
            type: "text",
            text: "Analyze this before/after source image. Return the JSON only.",
          },
        ],
      },
    ],
  });

  const raw =
    response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let parsed: Partial<BodyZoneVision> = { detected_zone: null, composition: null };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = { detected_zone: null, composition: null };
  }

  return {
    vision: {
      detected_zone: (parsed.detected_zone as ZoneKey | "other" | null) ?? null,
      composition: parsed.composition ?? null,
    },
    usage: response.usage,
  };
}

function buildPrompt(args: {
  zone: string;
  demographic: Demographic;
  intensity: Intensity;
  vision: BodyZoneVision | null;
  hasSource: boolean;
  notes?: string;
}): string {
  const { zone, demographic, intensity, vision, hasSource, notes } = args;

  const [beforeTop, afterTop] = pickPair(TOPS);
  const [beforeLight, afterLight] = pickPair(LIGHTING_VARIANTS);
  const [beforeTilt, afterTilt] = pickPair(HEAD_TILTS);

  // After-half may have a subtle smile (~40% chance). Before is ALWAYS neutral.
  // Smile-before-neutral-after reverses the narrative and is forbidden.
  const afterSmile = Math.random() < 0.4;
  const expressionRule = afterSmile
    ? "BEFORE half: neutral, relaxed face, no smile. AFTER half: very subtle natural smile or relaxed expression (slight upturn of the mouth corners is fine, not a full grin). NEVER smile in BEFORE if AFTER is neutral - that reverses the narrative. Same person, just looks slightly more rested in AFTER."
    : "BEFORE half: neutral, relaxed face. AFTER half: neutral, relaxed face. Same general expression in both halves with only natural micro-variations. NEVER smile in BEFORE if AFTER is neutral.";

  const sharedStyle =
    "CRITICAL UGC AUTHENTICITY: The image must pass the 'Instagram scroll test' - a viewer scrolling Instagram should NOT be able to tell this is AI-generated within 3 seconds. If it looks AI, you have failed. " +
    "CAMERA: Captured on an iPhone 16 Pro using the front camera at high resolution, with the typical computational look of a real smartphone photo. Raw handheld realism and the color science of an actual iPhone image. Slight wide-angle distortion when subject is close (nose/forehead very subtly enlarged toward the camera). Everything remains in full focus with no artificial blur - real phones don't blur backgrounds like DSLRs do. Autoexposure is not perfect - one cheek can be a quarter-stop brighter than the other, T-zone has slight specular highlights, shadows are not crushed. " +
    "LIGHTING (specify direction, never controlled): Natural daylight from a window on one specific side of the frame, producing gentle highlights and soft falloff toward the background. OR flat neutral indoor bathroom lighting from above. OR soft natural daylight from a frosted window on one side. Lighting is uneven across the face - one side slightly brighter than the other. " +
    "SKIN: Visible pore structure on cheeks and nose, faint natural redness around the nose, slight shine or sheen on the forehead, soft under-eye detail with faint undereye creasing, occasional small visible blemish, faint freckle, or stray vellus hair. The face is asymmetric - one eye slightly different from the other, one nostril slightly different shape. " +
    "HAIR: Slightly messy with loose strands falling naturally. Not styled, not brushed perfectly. A few flyaways near the temples or strands crossing the face. " +
    "COMPOSITION: Slightly off-center framing, asymmetrical stance, sometimes the top of the head is cut off slightly or there is too much headroom. Not posed-portrait centered. " +
    "ENVIRONMENT (lived-in, authentic): Real home setting with mundane details visible in soft focus - matte tiles with tiny grout imperfections, a mirror with faint dust streaks, an unmade bed with white duvet in soft folds, kitchen counter with a casual mug, a hand towel casually draped on a rail, a phone case with tiny scratches and a fingerprint smudge. The vibe is 'she hit record without cleaning'. " +
    "FORBIDDEN PHRASING (these words trigger polished AI look even when negated): do NOT default to 'professional', 'magazine', 'stock', 'editorial'. " +
    "FORBIDDEN LOOK: ring light glow, studio lighting setup, controlled three-point lighting, beauty filter, cosmetic smoothing, retouching, AI-rendering polish, perfect facial symmetry, dead/frozen eyes, floating product, empty backdrop. " +
    "The 'after' visual is a naturally rested look over weeks - NOT plastic surgery, NOT cosmetic procedures, NOT a filter applied in post.";

  const promptObj: Record<string, unknown> = hasSource
    ? {
        // ---- SOURCE-ANCHORED MODE ----
        // Generate a NEAR-CLONE of the reference image: match everything
        // (lighting, framing, expression, composition, background, outfit
        // style, the before/after pair structure). Only difference: a subtly
        // different person identity (in the same demographic ballpark by
        // default, or user-specified if overrides provided) and small
        // micro-variations so it is not an exact pixel copy.
        task: "generate_image",
        mode: "near_clone_swipe",
        zone_framing_priority:
          "Match the reference image's framing/crop exactly. The body zone framing in 'zone_framing' is a fallback - the REFERENCE IMAGE itself is the primary visual template.",
        zone_framing: zone,
        format:
          "Single image, side-by-side split that is a NEAR-CLONE of the reference image. Reproduce the reference's overall composition, framing, lighting, expression, background, and the structure of its before/after pair. The new person is technically different from the reference person but should look very similar (subtly different facial features, slightly different exact angle, slightly different outfit color). The viewer should feel 'this looks just like that other before/after I saw'.",
        subject: {
          demographic: demographicToString(demographic),
          body_zone_framing: zone,
          expression: vision?.composition
            ? `Match the expression(s) in the reference image very closely (same emotional tone, same mouth/eye relaxation). ${expressionRule}`
            : expressionRule,
          hair: "Hair color and length closely match the reference person's hair (unless the user has overridden hair_color in 'demographic'). Hair fall and positioning approximately match the reference, with only tiny natural differences.",
          identity_lock:
            "Both halves show the SAME new person - same face structure, same eye color, same hair color, same age. The new person looks similar to the reference person but has subtly different facial features (different exact nose shape, different exact jaw, different exact eye spacing) so it's recognizably a different individual.",
        },
        clone_match: {
          framing_and_crop: vision?.composition?.framing ?? "match the reference's framing and crop tightness exactly",
          camera_style: vision?.composition?.camera ?? "match the reference's camera angle, distance, and perspective exactly",
          lighting_style: vision?.composition?.lighting ?? "match the reference's lighting direction, quality, and color temperature exactly - same lighting in both halves of the generated image",
          background: vision?.composition?.background ?? "match the reference's background closely - same type of environment, same color palette, same wall/surface style. Both halves use a similar background to each other (matching the reference).",
          outfit_style: "Match the general outfit style visible in the reference (e.g. if reference shows a white robe/towel, use a similar white robe/towel). Allow subtle color or fabric variation between halves and from reference but stay in the same garment category.",
          pair_structure: "If the reference image has TWO halves (a before/after pair), reproduce that exact structure: left half = before state, right half = after state, same orientation, same general composition for each half.",
          critical_note:
            "The reference image IS the template. The generated image should make a viewer go 'this looks just like that other B/A I saw'. Match everything visually. Only differences: a subtly different person identity (similar demographic, different exact face), tiny natural micro-variations (a few degrees angle, slight outfit color shift) so it's not an exact pixel-copy.",
        },
        outfit_pair: {
          before_half: beforeTop,
          after_half: afterTop,
          note: "Tops should be in the same general style as the reference's outfit. Use these specific descriptors only if the reference is ambiguous about outfit; otherwise prefer matching the reference's actual outfit with subtle color variation.",
        },
        transformation: INTENSITY_PROMPTS[intensity],
        style: sharedStyle,
        hard_constraints: [
          "NEAR-CLONE GOAL: the generated image should look almost identical to the reference image - same composition, same lighting, same framing, same expression, same background, same outfit style, same pair structure. Only the person's identity differs (subtly) and tiny natural variations exist (different exact angle, slight outfit color shift).",
          "NEVER render any text, labels, watermarks, captions, or overlays. NO 'Before' or 'After' text anywhere. The image must be completely free of text.",
          "DIFFERENT PERSON: do NOT generate an exact copy of the reference person's face. The new person is in the same demographic ballpark (same age range, same hair color and ethnicity from 'subject.demographic') but has subtly different facial features so a viewer can tell it's a different individual.",
          "If 'subject.demographic' specifies a DIFFERENT age/ethnicity/hair_color from the reference person, follow 'subject.demographic'. The user's overrides take priority over the reference's demographic.",
          "Both halves must show the SAME new person - the woman in 'subject.demographic'. Identity is unmistakably the same in both halves.",
          "BACKGROUND: match the reference's background closely. SAME environment in both halves of the generated image.",
          "LIGHTING: match the reference's lighting closely. SAME lighting style in both halves of the generated image.",
          "FRAMING: match the reference's crop and framing exactly. SAME crop in both halves.",
          `BEFORE half top: ${beforeTop}. AFTER half top: ${afterTop}. Subtle color shift only; both stay in the same general outfit style as the reference.`,
          `BEFORE half head position: ${beforeTilt}. AFTER half head position: ${afterTilt}. Subtle differences only - NEVER opposite directions, NEVER mirrored. Pose closely matches the reference's pose in each corresponding half.`,
          "NO MIRRORING between halves: if reference shows the right cheek, both halves show the right cheek - NEVER mirror-flip.",
          "FORBIDDEN: generating an exact copy of the reference person's face. FORBIDDEN: deviating from the reference's composition/lighting/framing/background. FORBIDDEN: any sign that this is a completely fresh generation - it should feel like a near-clone of the reference.",
          "FORBIDDEN: ring light glow, studio lighting setup, beauty filter, cosmetic smoothing, retouching, AI-rendering polish, perfect symmetry. The image inherits the reference's realism level.",
          "Both halves must have realistic un-retouched skin texture matching the reference's realism level. Skin condition differs only per the transformation intensity.",
        ],
        instruction:
          "Generate a single before/after split image that is a NEAR-CLONE of the reference image. Match the reference exactly in: composition, framing, crop, lighting, expression, background, outfit style, before/after pair structure. The PERSON is technically different (subtly different facial features) but in the same demographic ballpark as the reference (unless 'subject.demographic' specifies overrides, then follow those). Skin condition differs between halves per the transformation. Subtle micro-variations only so the result is not a pixel-exact copy. ABSOLUTELY NO TEXT IN THE IMAGE.",
      }
    : {
        // ---- FREE MODE ----
        // No source. Generate from scratch as two selfies on different days.
        task: "generate_image",
        mode: "different_days",
        zone_framing_priority:
          "THE SINGLE MOST IMPORTANT INSTRUCTION. The body zone framing defines exactly what is visible in the image. Read 'zone_framing' carefully and crop tighter than feels natural. If it says 'ONLY cheek skin' or 'MUST NOT show eyes/mouth/forehead', the image MUST obey - do NOT default to a full-face portrait when a macro crop is specified. The two halves of the split image must show the SAME body zone with the SAME tight crop.",
        zone_framing: zone,
        format:
          "Single image, side-by-side split. Left half shows the 'before' state, right half shows the 'after' state. Both halves show the SAME body zone with the SAME tight crop (per 'zone_framing'). The two halves should be cleanly divided (subtle vertical seam) but read as one cohesive photo. These are TWO SEPARATE photos of the same person taken on different days - NOT two halves of one studio session.",
        subject: {
          demographic: demographicToString(demographic),
          body_zone_framing: zone,
          expression: expressionRule,
          hair: "same hair color, same general hair style in both halves",
          identity_lock:
            "Both halves show the SAME person - same face structure, same eye color, same hair color, same age, same overall appearance. Identity must be unmistakable.",
        },
        before_half: {
          outfit: beforeTop,
          lighting: beforeLight,
          head_position: beforeTilt,
          skin_state: "tired-looking skin per the chosen intensity (see 'transformation' field) - softer contours, natural skin texture, slightly neutral tone",
          day_context: "this photo was taken on a tired day",
        },
        after_half: {
          outfit: afterTop,
          lighting: afterLight,
          head_position: afterTilt,
          skin_state: "rested-looking skin per the chosen intensity - smoother texture, more even tone, natural glow",
          day_context: "this photo was taken weeks later on a rested day",
        },
        composition: {
          camera: "natural smartphone angle, eye-level or very slightly above, casual unstaged handheld framing",
          framing: "tight zone-appropriate crop",
          background: "neutral home environment, plain wall or soft out-of-focus interior - can be a slightly different spot in the home for each half",
          realism_note:
            "The two halves must look like two SEPARATE phone selfies the same person took on DIFFERENT DAYS. Body zone and hair stay similar. Outfit, lighting, and head angle ARE DIFFERENT per the before_half/after_half specs above - this is not optional, it is required.",
        },
        transformation: INTENSITY_PROMPTS[intensity],
        style: sharedStyle,
        hard_constraints: [
          "ZONE FRAMING IS HIGHEST PRIORITY: obey 'zone_framing' exactly. If it says 'EXTREME MACRO CROP on one cheek, MUST NOT show eyes/mouth/forehead', the generated image must show ONLY cheek skin - no full face. Crop tighter than feels natural. Both halves use the SAME body zone with the SAME tight crop.",
          "NO MIRRORING between halves: both halves are shot from the SAME side and direction. If 'before' shows the right cheek, 'after' also shows the right cheek - NEVER mirror-flip. If 'before' faces slightly right, 'after' also faces slightly right. Head direction must be CONSISTENT between halves.",
          "NEVER render any text, labels, watermarks, captions, or overlays. NO 'Before' or 'After' text anywhere. The image must be completely free of text.",
          `BEFORE half outfit: ${beforeTop}. AFTER half outfit: ${afterTop}. These MUST be visibly different - this is mandatory, not a suggestion.`,
          `BEFORE half lighting: ${beforeLight}. AFTER half lighting: ${afterLight}. These MUST be different - not the same lighting.`,
          `BEFORE half head position: ${beforeTilt}. AFTER half head position: ${afterTilt}. Subtle differences only - NEVER opposite directions, NEVER mirrored.`,
          "Both halves must show the same person - same face structure, same hair color, same age. Only the skin condition (per intensity) and the natural between-days variations (clothing, lighting, micro-angle) differ.",
          "FORBIDDEN: identical clothing in both halves. FORBIDDEN: identical lighting. FORBIDDEN: mirrored / opposite-facing halves. FORBIDDEN: defaulting to a full-face portrait when zone_framing calls for a tighter crop.",
          "FORBIDDEN: ring light glow, studio lighting setup, beauty filter, cosmetic smoothing, retouching, AI-rendering polish, perfect symmetry. The image must look like two casual selfies from a real person's camera roll - mundane, real, slightly imperfect.",
          "Both halves must have realistic un-retouched skin texture with natural variations preserved. Both look like real phone-camera skin.",
        ],
        instruction:
          "Generate a single before/after split image. FIRST, lock the body zone framing from 'zone_framing' - crop tightly to the specified zone, do not default to a full-face portrait. Both halves show the SAME body zone with the SAME tight crop and from the SAME side (no mirroring). Then vary outfit, lighting, and slight head angle between halves to look like two selfies the same person took weeks apart. ABSOLUTELY NO TEXT IN THE IMAGE.",
      };

  if (notes) {
    promptObj.additional_notes = notes;
  }

  return JSON.stringify(promptObj);
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    image_url,
    body_zone,
    custom_zone,
    intensity = "moderate",
    notes,
    ethnicity,
    age,
    hair_color,
    source_demographic,
  } = body as {
    image_url?: string;
    body_zone?: string;
    custom_zone?: string;
    intensity?: Intensity;
    notes?: string;
    ethnicity?: string;
    age?: string;
    hair_color?: string;
    source_demographic?: {
      age?: string | null;
      ethnicity?: string | null;
      hair_color?: string | null;
    } | null;
  };

  if (!body_zone) {
    return NextResponse.json({ error: "body_zone is required" }, { status: 400 });
  }
  if (!["subtle", "moderate", "dramatic"].includes(intensity)) {
    return NextResponse.json({ error: "intensity must be subtle | moderate | dramatic" }, { status: 400 });
  }

  // Resolve demographics: user override > source-detected > random (later)
  const ageOverride = age && AGE_RANGES.includes(age) ? age : undefined;
  const ageFromSource =
    source_demographic?.age && AGE_RANGES.includes(source_demographic.age)
      ? source_demographic.age
      : undefined;

  const ethnicityOverride =
    ethnicity && ethnicity in ETHNICITY_PROFILES ? (ethnicity as Ethnicity) : undefined;
  const ethnicityFromSource =
    source_demographic?.ethnicity && source_demographic.ethnicity in ETHNICITY_PROFILES
      ? (source_demographic.ethnicity as Ethnicity)
      : undefined;

  const hairColorOverride = hair_color?.trim() || undefined;
  const hairColorFromSource = source_demographic?.hair_color?.trim() || undefined;

  const overrides: DemographicOverrides = {
    age: ageOverride ?? ageFromSource,
    ethnicity: ethnicityOverride ?? ethnicityFromSource,
    hair_color: hairColorOverride ?? hairColorFromSource,
  };

  const resolveZone = (zoneKey: string, custom?: string): string => {
    if (zoneKey === "other") {
      return custom?.trim() || "general skin closeup";
    }
    return BODY_ZONE_PRESETS[zoneKey as ZoneKey] ?? "general skin closeup";
  };

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  async function emit(data: object) {
    await writer.write(encoder.encode(JSON.stringify(data) + "\n"));
  }

  (async () => {
    const db = createServerSupabase();
    let vision: BodyZoneVision | null = null;

    try {
      if (image_url) {
        await emit({ step: "analyzing", message: "Analyzing source image..." });

        const client = new Anthropic({ apiKey });
        const { vision: v, usage } = await analyzeSource(image_url, client);
        vision = v;

        const cacheCreation =
          (usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0;
        const cacheRead =
          (usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0;
        const claudeCost = calcClaudeCost(
          usage.input_tokens,
          usage.output_tokens,
          cacheCreation,
          cacheRead
        );

        await db.from("usage_logs").insert({
          type: "before_after",
          model: CLAUDE_MODEL,
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          cost_usd: claudeCost,
          metadata: { stage: "vision", detected_zone: vision.detected_zone },
        });

        await emit({
          step: "analyzed",
          message: "Source analyzed",
          detected_zone: vision.detected_zone,
        });
      }

      const demographic = randomDemographic(overrides);
      const resolvedZone = resolveZone(body_zone, custom_zone);

      const prompt = buildPrompt({
        zone: resolvedZone,
        demographic,
        intensity,
        vision,
        hasSource: Boolean(image_url),
        notes,
      });

      await emit({
        step: "generating",
        message: "Generating before/after image...",
        demographic,
      });

      const referenceImages = image_url ? [image_url] : [];
      const taskId = await createImageTask(prompt, referenceImages, ASPECT_RATIO, RESOLUTION);
      const result = await pollTaskResult(taskId, POLL_TIMEOUT_MS);

      if (result.urls.length === 0) {
        await emit({ step: "error", message: "No image generated" });
        await writer.close();
        return;
      }

      await db.from("usage_logs").insert({
        type: "before_after",
        model: "nano-banana-2",
        cost_usd: 0,
        metadata: {
          task_id: taskId,
          aspect_ratio: ASPECT_RATIO,
          resolution: RESOLUTION,
          body_zone,
          intensity,
          has_source: Boolean(image_url),
        },
      });

      await emit({
        step: "completed",
        message: "Image generated",
        image_url: result.urls[0],
        prompt_used: prompt,
        demographic,
        detected_zone: vision?.detected_zone ?? null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[before-after] Error:", msg);
      await emit({ step: "error", message: `Generation failed: ${msg}` });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
