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
  nails: "Tight close-up on multiple fingernails of one hand, casual phone-photo framing. Frame shows 3-4 fingertips with their nails clearly visible and dominant in the frame, hand in a natural relaxed or slightly curled position (the way someone shows their nails to a friend - palm-side partly visible or knuckles partly visible). Nails fill a significant portion of the image - the viewer's eye goes directly to the nails. Skin tone of the fingers visible to anchor context. The frame does NOT include: the face, body, wrist, arm, or the full hand structure beyond the fingertips. NOT a clinical shot, NOT a salon manicure ad, NOT a styled product photo - a casual handheld phone-camera close-up of bare unpolished natural nails.",
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

const STRAIGHT_HEAD_OPTIONS = [
  "head straight on, neutral tilt",
  "head straight on with chin slightly raised",
  "head straight on with chin slightly lowered",
  "head straight on, very slightly closer to the camera",
  "head straight on, very slightly further from the camera",
];

// Lean-side options use a SINGLE direction (right OR left, picked once per
// generation) so we never pair "right lean" with "left lean" between halves -
// that combination caused mirror-flip output even with the constraint.
function leanOptionsForSide(side: "right" | "left"): string[] {
  return [
    `head leaned slightly toward the ${side} shoulder, a noticeable few degrees (ear-toward-shoulder LEAN, body still squared to camera)`,
    `head leaned very subtly toward the ${side} shoulder, just a small lean (ear-toward-shoulder, body still squared)`,
    "head straight on relative to the body (no lean), with chin slightly raised",
    "head straight on relative to the body (no lean), with chin slightly lowered",
    "head straight on relative to the body (no lean), neutral",
  ];
}

function pickHeadTilts(): [string, string] {
  // Three modes - all keep the BODY squared so no mirror-flip is possible.
  // Mode A: both halves straight-on (chin/distance variations)
  // Mode B: both halves use right-shoulder lean variations
  // Mode C: both halves use left-shoulder lean variations
  const mode = pick(["straight", "right_lean", "left_lean"] as const);
  if (mode === "straight") return pickPair(STRAIGHT_HEAD_OPTIONS);
  return pickPair(leanOptionsForSide(mode === "right_lean" ? "right" : "left"));
}

const BODY_ORIENTATIONS = [
  "facing the camera straight on, both shoulders squared to the camera",
  "body squared to the camera with a very subtle relaxed lean of the shoulders",
  "body squared to the camera, shoulders relaxed, head and torso aligned with the lens",
];

const HAIR_ARRANGEMENTS = [
  "a few loose strands falling across the forehead",
  "hair tucked behind one ear, the other side falling free",
  "stray flyaways near one temple catching the light",
  "hair falling naturally on both sides, slightly tousled",
  "one loose strand crossing the cheek",
  "hair pushed back away from the face",
  "a loose strand falling near the jawline",
  "hair slightly more tucked in than usual",
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

const NAIL_INTENSITY_PROMPTS: Record<Intensity, string> = {
  subtle:
    "BEFORE half: nails look slightly less than ideal - mildly ridged surface, slightly dull, slightly short with a thin or uneven free edge. AFTER half: nails look marginally healthier - slightly smoother surface, slightly more even pink tone, slightly more length on the free edge. Subtle but visible on close inspection.",
  moderate:
    "BEFORE half: nails look weak and short - visibly ridged surface, dull or slightly yellowish color, uneven or thin free edge, slight peeling or chipping at the tips, generally short and brittle-looking. AFTER half: nails look noticeably healthier and longer - smoother surface (ridges much less visible), more even pink-toned color, clean white free edge with visible length past the fingertip. Clear improvement but still realistic - bare unpolished nails on a real hand.",
  dramatic:
    "BEFORE half: nails look quite damaged - clearly ridged, peeling at the tips, dull or yellowish surface, very short and uneven shape, visibly weak and brittle. AFTER half: nails look strikingly healthier - smooth glossy natural surface, even healthy pink color, well-shaped with a clean white free edge, visibly longer. Striking but still natural-looking - NO polish, NO gel, NO fake tips, NO manicure styling.",
};

const NAIL_HAND_POSES = [
  "hand in a relaxed loose curl, fingers gently bent, nails clearly visible from above",
  "hand held up with fingers slightly fanned out, knuckles partly visible, nails facing the camera",
  "hand resting palm-up with fingers naturally curled toward the camera, nail tips dominant in frame",
  "hand held vertically with fingers angled toward the camera, casual 'showing my nails' pose",
  "hand slightly cupped with fingers loosely together, nails visible from the side-top angle",
  "hand held flat with fingers slightly spread, nails facing the camera straight on",
];

const NAIL_BACKGROUNDS = [
  "soft out-of-focus light wall in a home (cream, off-white, or pale grey)",
  "soft out-of-focus wooden table or surface in the background",
  "soft out-of-focus kitchen counter in the background",
  "plain neutral grey backdrop, casual",
  "soft out-of-focus window light in the background, blurred indoor scene",
  "soft out-of-focus pale neutral fabric (a sleeve, blanket, or t-shirt corner)",
  "soft out-of-focus desk or bedside table in the background",
];

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

function buildSwipePromptFromSpec(args: {
  spec: Record<string, unknown>;
  overrides: DemographicOverrides;
  notes?: string;
}): string {
  // Deep-clone the spec so we don't mutate caller's object.
  const spec = JSON.parse(JSON.stringify(args.spec)) as Record<string, unknown>;
  const subject = (spec.subject as Record<string, unknown>) ?? {};

  // Per NANO BANANA PRO PROMPT.pdf technique: keep preserve_original: true to
  // stay in EDIT mode (otherwise Nano Banana goes into free-regen and ignores
  // the reference). Vary the face via a modification_note instead.
  subject.face = {
    preserve_original: true,
    modification_note:
      "Edit the face: subtly different exact features (different nose shape, different jaw, different eye spacing, slightly different mouth) so it is recognizably a different individual. Keep everything else from the reference: skin tone, skin texture, age, expression, head position, framing, lighting. This is a minor identity edit, NOT a full regeneration.",
  };

  // Apply user demographic overrides as modification notes (preserve_original
  // stays true so the model treats them as edits, not free-regen prompts).
  if (args.overrides.age) {
    subject.age_modification = `Adjust apparent age to ${args.overrides.age} (subtle edit on face only).`;
  }
  if (args.overrides.ethnicity) {
    subject.ethnicity_modification = `Adjust ethnicity to ${ETHNICITY_PROFILES[args.overrides.ethnicity].label} (subtle edit on facial features only).`;
  }
  if (args.overrides.hair_color) {
    const hair = (subject.hair as Record<string, unknown>) ?? {};
    hair.color_modification = `Adjust hair color to ${args.overrides.hair_color} (keep style and length identical to reference).`;
    subject.hair = hair;
  }
  spec.subject = subject;

  if (args.notes) {
    spec.user_notes = args.notes;
  }

  // Send the spec AS-IS. Per the doc, the spec itself IS the prompt - no
  // wrapping with task/mode/hard_constraints/instruction fields, as those
  // contradict the spec and trigger Nano Banana to free-regen.
  return JSON.stringify(spec);
}

function buildPrompt(args: {
  zone: string;
  zoneKey: string;
  demographic: Demographic;
  intensity: Intensity;
  vision: BodyZoneVision | null;
  hasSource: boolean;
  notes?: string;
}): string {
  const { zone, zoneKey, demographic, intensity, vision, hasSource, notes } = args;
  const isNails = zoneKey === "nails";

  const [beforeTop, afterTop] = pickPair(TOPS);
  const [beforeLight, afterLight] = pickPair(LIGHTING_VARIANTS);
  const [beforeTilt, afterTilt] = pickHeadTilts();
  const [beforeHair, afterHair] = pickPair(HAIR_ARRANGEMENTS);
  const bodyOrientation = pick(BODY_ORIENTATIONS);
  const [beforeHandPose, afterHandPose] = pickPair(NAIL_HAND_POSES);
  const [beforeNailBg, afterNailBg] = pickPair(NAIL_BACKGROUNDS);

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
    "SKIN: Visible pore structure on cheeks and nose, faint natural redness around the nose, slight shine or sheen on the forehead, soft under-eye detail with faint undereye creasing, occasional stray vellus hair. The face is asymmetric - one eye slightly different from the other, one nostril slightly different shape. " +
    "HAIR: Slightly messy with loose strands falling naturally. Not styled, not brushed perfectly. A few flyaways near the temples or strands crossing the face. " +
    "COMPOSITION: Slightly off-center framing, asymmetrical stance, sometimes the top of the head is cut off slightly or there is too much headroom. Not posed-portrait centered. " +
    "ENVIRONMENT (lived-in, authentic): Real home setting with mundane details visible in soft focus - matte tiles with tiny grout imperfections, a mirror with faint dust streaks, an unmade bed with white duvet in soft folds, kitchen counter with a casual mug, a hand towel casually draped on a rail, a phone case with tiny scratches and a fingerprint smudge. The vibe is 'she hit record without cleaning'. " +
    "FORBIDDEN PHRASING (these words trigger polished AI look even when negated): do NOT default to 'professional', 'magazine', 'stock', 'editorial'. " +
    "FORBIDDEN LOOK: ring light glow, studio lighting setup, controlled three-point lighting, beauty filter, cosmetic smoothing, retouching, AI-rendering polish, perfect facial symmetry, dead/frozen eyes, floating product, empty backdrop. " +
    "The 'after' visual is a naturally rested look over weeks - NOT plastic surgery, NOT cosmetic procedures, NOT a filter applied in post.";

  const promptObj: Record<string, unknown> = hasSource
    ? {
        // ---- PURE-CLONE SWIPE MODE ----
        // MINIMAL prompt. The reference image IS the visual spec. Any
        // additional styling text causes Nano Banana to override the
        // reference's actual look with its own "AI portrait" aesthetic.
        task: "generate_image",
        instruction:
          "Match the reference image as closely as possible. Generate a different person from 'subject.demographic' in the exact same visual style as the reference - same crop, same composition, same lighting, same background, same expression, same outfit, same before/after pair structure. The only difference: subtly different facial features so it's recognizably a different individual.",
        subject: {
          demographic: demographicToString(demographic),
          note: "Both halves show the same new person. If demographic differs from the reference person, follow demographic (not reference). Otherwise, similar age/hair/ethnicity ballpark to reference.",
        },
        hard_constraints: [
          "NO text, labels, watermarks, captions, or overlays anywhere in the image.",
          "Different person from the reference, but in the same demographic ballpark (unless subject.demographic specifies otherwise).",
          "Both halves of the split image show the SAME new person.",
          "NO mirroring between halves.",
        ],
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
          hair: "same hair color, same general hair style and length in both halves, but with natural between-photos variation in how loose strands fall (see before_half/after_half hair_arrangement)",
          body_orientation: bodyOrientation,
          identity_lock:
            "Both halves show the SAME person on two different days - recognizably the same individual (same face structure, eye color, hair color, age). Treat the face as a fixed identity: whatever distinctive details appear in one half must appear identically in the other half (same placement, same size, same shape). What CAN vary between halves: how loose hair strands fall, head lean angle, micro-expression, transient skin appearance (slight redness, undereye puffiness, sheen). What CANNOT vary: any permanent identifying detail of the face or skin. Do NOT clone the pose - these are two separate phone selfies weeks apart, not two frames from one session.",
        },
        before_half: {
          outfit: beforeTop,
          lighting: beforeLight,
          head_position: beforeTilt,
          hair_arrangement: beforeHair,
          ...(isNails
            ? {
                nail_state: "weak-looking nails per the chosen intensity (see 'transformation' field) - short, ridged, possibly dull or yellowish, uneven free edge",
                hand_pose: beforeHandPose,
                background: beforeNailBg,
                day_context: "this photo was taken on day 0, before starting collagen / nail-strengthening supplement",
              }
            : {
                skin_state: "tired-looking skin per the chosen intensity (see 'transformation' field) - softer contours, natural skin texture, slightly neutral tone",
                day_context: "this photo was taken on a tired day",
              }),
        },
        after_half: {
          outfit: afterTop,
          lighting: afterLight,
          head_position: afterTilt,
          hair_arrangement: afterHair,
          ...(isNails
            ? {
                nail_state: "healthier-looking nails per the chosen intensity - smoother surface, more even pink color, well-shaped, visibly longer free edge with a clean white tip",
                hand_pose: afterHandPose,
                background: afterNailBg,
                day_context: "this photo was taken weeks later, after the nail-strengthening regime",
              }
            : {
                skin_state: "rested-looking skin per the chosen intensity - smoother texture, more even tone, natural glow",
                day_context: "this photo was taken weeks later on a rested day",
              }),
        },
        composition: {
          camera: "natural smartphone angle, eye-level or very slightly above, casual unstaged handheld framing",
          framing: "tight zone-appropriate crop",
          background: isNails
            ? "neutral plain background - a wall, table surface, or out-of-focus interior. The hand is the only subject."
            : "neutral home environment, plain wall or soft out-of-focus interior - can be a slightly different spot in the home for each half",
          realism_note: isNails
            ? "The two halves must look like two SEPARATE phone close-ups the same person took on DIFFERENT DAYS - one before, one weeks later. Hand pose, lighting, and background DIFFER between halves per the before_half/after_half specs - because two separate phone photos on different days never have identical pose or surroundings. What stays constant: the hand itself (same skin tone, same hand size, same finger proportions, same individual) and which side of the hand is shown (no mirror flip)."
            : "The two halves must look like two SEPARATE phone selfies the same person took on DIFFERENT DAYS. Body zone and hair stay similar. Outfit, lighting, and head angle ARE DIFFERENT per the before_half/after_half specs above - this is not optional, it is required.",
        },
        transformation: isNails ? NAIL_INTENSITY_PROMPTS[intensity] : INTENSITY_PROMPTS[intensity],
        style: sharedStyle,
        hard_constraints: isNails
          ? [
              "ZONE FRAMING IS HIGHEST PRIORITY: obey 'zone_framing' exactly. The image MUST show ONLY a tight close-up of fingernails on one hand. The frame does NOT include the face, body, wrist, or arm. Both halves use the SAME tight nail crop.",
              "NO MIRROR-FLIP between halves: which side of the hand is shown stays consistent. If 'before' shows the back/top of the hand, 'after' also shows the back/top. If 'before' shows the palm side, so does 'after'. NEVER horizontally flip the whole composition.",
              "NEVER render any text, labels, watermarks, captions, or overlays. NO 'Before' or 'After' text. NO 'Day 0' / 'Day 60' text. The image must be completely free of text.",
              `BEFORE half hand pose: ${beforeHandPose}. AFTER half hand pose: ${afterHandPose}. These MUST visibly differ - the hand is in two genuinely different casual poses, because the two photos were taken on different days. FORBIDDEN: identical finger curl or hand angle in both halves.`,
              `BEFORE half background: ${beforeNailBg}. AFTER half background: ${afterNailBg}. These MUST visibly differ - two separate photos taken in slightly different spots / on different surfaces. FORBIDDEN: identical background in both halves.`,
              `BEFORE half lighting: ${beforeLight}. AFTER half lighting: ${afterLight}. These should differ - two separate photos on different days.`,
              "SAME PERSON / SAME HAND: both halves show the same individual's hand - same skin tone, same finger length proportions, same hand size, same knuckle / joint structure, same individual. The 'after' hand is NOT a different person's hand - just the same hand weeks later in a different pose.",
              "PERMANENT IDENTITY DETAILS MUST MATCH EXACTLY: whatever distinctive detail of the skin or fingers appears in one half must appear identically in the other half (same placement, same size). The model must NOT invent a new detail that exists in only one half.",
              "NAILS ARE BARE AND NATURAL in both halves: NO polish, NO gel, NO french manicure (the white tip in AFTER is the natural free edge of the nail, not painted), NO fake nails, NO acrylic tips. This is a casual photo of natural unpainted nails.",
              "FORBIDDEN: salon manicure look, studio product photography, ring light glow, beauty filter, AI-rendering polish, perfect symmetry. The image must look like two casual phone close-ups from a real person's camera roll - mundane, real, slightly imperfect.",
              "Both halves must have realistic un-retouched skin texture (natural pores, faint creases on the finger joints) and natural nail surface texture. Both look like real phone-camera quality.",
            ]
          : [
              "ZONE FRAMING IS HIGHEST PRIORITY: obey 'zone_framing' exactly. If it says 'EXTREME MACRO CROP on one cheek, MUST NOT show eyes/mouth/forehead', the generated image must show ONLY cheek skin - no full face. Crop tighter than feels natural. Both halves use the SAME body zone with the SAME tight crop.",
              `NO MIRROR-FLIP between halves: BOTH halves use the EXACT SAME body orientation - "${bodyOrientation}". The torso, shoulders, and which-side-of-the-face-is-toward-the-camera are IDENTICAL between halves. If 'before' shows the right side of the face more prominent, 'after' also shows the right side more prominent (NEVER horizontally flipped). The HEAD itself, however, IS allowed to lean slightly differently (per head_position - this is a small ear-toward-shoulder lean, not a body turn). The whole composition must NOT be a mirror of the other half.`,
              "NEVER render any text, labels, watermarks, captions, or overlays. NO 'Before' or 'After' text anywhere. The image must be completely free of text.",
              `BEFORE half outfit: ${beforeTop}. AFTER half outfit: ${afterTop}. These MUST be visibly different - this is mandatory, not a suggestion.`,
              `BEFORE half lighting: ${beforeLight}. AFTER half lighting: ${afterLight}. These MUST be different - not the same lighting.`,
              `BEFORE half head position: ${beforeTilt}. AFTER half head position: ${afterTilt}. The head genuinely looks different between halves - this is correct and desired. What MUST stay consistent between halves is the BODY/shoulder orientation (no whole-composition mirror flip).`,
              `BEFORE half hair arrangement: ${beforeHair}. AFTER half hair arrangement: ${afterHair}. Hair color and overall style/length stay the same, but loose strands fall differently between halves - because these are two separate photos on different days, not the same session.`,
              "PERMANENT IDENTITY DETAILS MUST MATCH EXACTLY: whatever distinctive detail is visible on the face in one half must appear identically (same placement, same size, same shape) in the other half. The face is a fixed identity - the model must NOT invent a new distinctive detail that exists in only one half. This applies in both directions: do not ADD a new detail in only one half, and do not REMOVE a detail that should be in both.",
              "Both halves must show the same person - recognizably the same face, hair color, age. The skin condition differs per intensity, and natural between-days variations (clothing, lighting, micro-angle, hair fall, head lean) ALL differ - this is expected, not a bug.",
              "FORBIDDEN: identical clothing in both halves. FORBIDDEN: identical lighting. FORBIDDEN: identical pose / cloned-looking halves. FORBIDDEN: whole-composition mirror flip (body shoulders facing opposite ways). FORBIDDEN: defaulting to a full-face portrait when zone_framing calls for a tighter crop.",
              "FORBIDDEN: ring light glow, studio lighting setup, beauty filter, cosmetic smoothing, retouching, AI-rendering polish, perfect symmetry. The image must look like two casual selfies from a real person's camera roll - mundane, real, slightly imperfect.",
              "Both halves must have realistic un-retouched skin texture with natural variations preserved. Both look like real phone-camera skin.",
            ],
        instruction: isNails
          ? "Generate a single before/after split image of fingernails on the SAME hand, taken weeks apart. FIRST, lock the zone framing: the image MUST be a tight close-up of fingernails ONLY - no face, no body, no wrist. The hand pose is similar between halves so the nails are comparable. BEFORE half = weak/short/ridged nails per intensity. AFTER half = healthier/longer/smoother nails per intensity. Both halves show natural bare nails (NO polish, NO gel, NO salon manicure). ABSOLUTELY NO TEXT IN THE IMAGE."
          : "Generate a single before/after split image. FIRST, lock the body zone framing from 'zone_framing' - crop tightly to the specified zone, do not default to a full-face portrait. Both halves show the SAME body zone with the SAME tight crop and from the SAME side (no mirroring). Then vary outfit, lighting, and slight head angle between halves to look like two selfies the same person took weeks apart. ABSOLUTELY NO TEXT IN THE IMAGE.",
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
    source_spec,
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
    source_spec?: Record<string, unknown> | null;
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

      // If source_spec is provided (swipe mode), use it directly as the
      // Nano Banana prompt with face.preserve_original = false + user
      // overrides applied. Otherwise fall back to the templated builder.
      const prompt = source_spec
        ? buildSwipePromptFromSpec({
            spec: source_spec,
            overrides,
            notes,
          })
        : buildPrompt({
            zone: resolvedZone,
            zoneKey: body_zone,
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
