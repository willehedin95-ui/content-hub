/**
 * Video format aesthetics for the competitor video swipe pipeline.
 *
 * Historically the swipe pipeline was hardcoded for UGC / iPhone selfie
 * aesthetics. This file centralizes format-specific rules so we can swipe
 * any video format (podcasts, interviews, lecture shots, tabletop product
 * demos, etc.) and get appropriate keyframes + Claude guidance instead of
 * always forcing iPhone selfie output.
 *
 * A "family" groups similar formats that share the same visual recipe.
 * Most logic branches on the family, not the specific format ID.
 */

/**
 * Canonical format IDs the swipe UI exposes. This is a superset of
 * `VIDEO_FORMATS` in constants.ts (which is used by the brainstorm UI and
 * stored in DB). It adds swipe-only formats that Gemini can detect but
 * that are not part of the regular brainstorm preset list.
 */
export type SwipeVideoFormatId =
  | "auto"
  | "selfie_testimonial"
  | "dorm_confessional"
  | "grwm"
  | "grocery_store"
  | "street_interview"
  | "podcast_clip"
  | "professor_lecture"
  | "product_demo"
  | "before_after"
  | "explainer";

export type VideoFormatFamily =
  | "selfie"
  | "studio"
  | "lecture"
  | "street"
  | "tabletop";

/**
 * UI-facing options for the swipe modal dropdown. "Auto" is the default
 * and lets Gemini's detected format_type flow through.
 */
export const SWIPE_FORMAT_OPTIONS: Array<{
  id: SwipeVideoFormatId;
  label: string;
  description: string;
}> = [
  { id: "auto", label: "Auto (detect from video)", description: "Let Gemini decide based on the source video" },
  { id: "selfie_testimonial", label: "Selfie Testimonial", description: "1 person, iPhone selfie, direct-to-camera" },
  { id: "dorm_confessional", label: "Dorm Confessional", description: "Messy bedroom, late night, phone on desk" },
  { id: "grwm", label: "GRWM / Bathroom", description: "Vanity mirror, beauty/wellness tutorial vibe" },
  { id: "grocery_store", label: "Grocery Store", description: "Supermarket aisle, organic discovery feel" },
  { id: "street_interview", label: "Street Interview", description: "Outdoor vox pop, interviewer off-camera" },
  { id: "podcast_clip", label: "Podcast Clip", description: "Home studio, 1-2 hosts, pro mics, warm lighting" },
  { id: "professor_lecture", label: "Lecture / Authority", description: "Expert at desk/lecture hall, filmed from student seat" },
  { id: "product_demo", label: "Product Demo (tabletop)", description: "Clean tabletop, overhead or 3/4 angle, hands-only" },
  { id: "before_after", label: "Before / After", description: "Split-screen or sequential transformation" },
  { id: "explainer", label: "Explainer / Voiceover", description: "Stock footage or B-roll with voiceover narration" },
];

/**
 * Map any format ID (from the UI OR from Gemini detection) to its family.
 * Unknown / "other" / empty → "selfie" (our original default).
 */
const FAMILY_MAP: Record<string, VideoFormatFamily> = {
  // Selfie / iPhone family
  selfie_testimonial: "selfie",
  dorm_confessional: "selfie",
  grwm: "selfie",
  grocery_store: "selfie",
  grocery_approach: "selfie",
  discovery: "selfie",
  // Studio / professional family
  podcast_clip: "studio",
  explainer: "studio",
  // Lecture / authority family
  professor_lecture: "lecture",
  // Street / outdoor handheld family
  street_interview: "street",
  // Tabletop / product-focused family
  product_demo: "tabletop",
  before_after: "tabletop",
};

export function getFormatFamily(formatId: string | null | undefined): VideoFormatFamily {
  if (!formatId) return "selfie";
  return FAMILY_MAP[formatId] ?? "selfie";
}

/**
 * Style block appended to the Nano Banana image prompt when generating the
 * keyframe still. This REPLACES the hardcoded iPhone photo-realism wrapper
 * that used to always run regardless of the source video format.
 */
export function buildKeyframeStyleBlock(formatId: string | null | undefined): string {
  const family = getFormatFamily(formatId);

  switch (family) {
    case "studio":
      return [
        "\n\nCapture style: Professional home studio video shoot.",
        "Rules: Mid-range mirrorless or cinema camera (Sony FX3, Canon R5C, BMPCC). Controlled warm key light from a softbox, gentle fill, subtle hair light. Shallow depth of field with creamy background blur. Professional podcast microphone prominently in frame (Shure SM7B, Rode NT1, or similar broadcast mic on a boom arm). Neutral color grade, natural skin tones, slight film-like contrast. Stable tripod or gimbal framing — NOT handheld. Composition is deliberate and balanced.",
        "Environment: Intentional podcast/studio backdrop — bookshelf, acoustic panels, warm wood, soft backlights, or clean branded set. Lived-in and warm but clearly curated. NOT a messy bedroom or car.",
        "Subject behavior: STATIC RESTING POSE — subject is in a calm, neutral resting position just before speaking. Relaxed shoulders, hands on desk or in lap, mouth naturally closed or slightly parted. This is the FIRST FRAME of the video clip — motion starts AFTER this frame.",
      ].join(" ");

    case "lecture":
      return [
        "\n\nCapture style: Student-POV phone capture of an authority figure.",
        "Rules: iPhone or mid-range phone camera held at chest level from a seat in a lecture hall, classroom, or office — filmed covertly as if by a student. The subject is an expert (doctor, professor, scientist, coach) who does NOT know they are being filmed. Slightly elevated or straight-on angle from the audience's perspective. Natural room lighting (fluorescent office light, lecture hall spots, daylight through windows). Slightly soft focus, subtle phone-camera grain. Framing is off-center or has obstructions in foreground (another student's head, a laptop lid, notebook edge) for realism.",
        "Environment: Lecture hall, clinic, classroom, conference room, or desk with books and professional props. Subject wears professional attire (doctor's coat, blazer, collared shirt). Authoritative setting.",
        "Subject behavior: STATIC RESTING POSE — expert mid-explanation but in a calm neutral beat: looking toward audience or down at notes, hands on desk/podium or in lap. Mouth naturally closed or slightly parted. First frame of the clip.",
      ].join(" ");

    case "street":
      return [
        "\n\nCapture style: Outdoor run-and-gun vox pop interview.",
        "Rules: Mid-range DSLR or mirrorless handheld by an interviewer (Sony A7, Canon R6, Panasonic GH6). Natural daylight (overcast soft light or golden hour). Shallow depth of field isolating the subject from a blurred urban background. Handheld micro-sway and grip wobble — alive but stable. Slightly wide lens (~24-35mm) capturing the subject from chest up with natural environmental context. Sharp focus on the eyes, cinematic color grade, soft ambient urban noise feel.",
        "Environment: Busy sidewalk, park, outdoor market, city square, or store entrance. Visible pedestrians, traffic, or urban textures blurred in the background. Subject is a regular-looking passerby, caught mid-thought, slightly surprised to be asked.",
        "Subject behavior: STATIC RESTING POSE — subject is between answers, natural neutral expression, arms at sides or loose, mouth naturally closed. Caught mid-pause, looking slightly toward the off-camera interviewer. First frame of the clip.",
      ].join(" ");

    case "tabletop":
      return [
        "\n\nCapture style: Clean tabletop product demo with overhead or 3/4 angle.",
        "Rules: Mirrorless camera on a tripod or overhead rig, soft diffused lighting (softbox or large window light) from above or side. Clean neutral-toned surface (wood, marble, linen). Shallow depth of field highlighting the product. Color-accurate, slightly warm color grade. NO talking head — the visual focus is on the product and hands interacting with it (pouring, holding, unscrewing, applying). No human face in frame, or only partially visible hands and forearms.",
        "Environment: Minimal styled tabletop with supporting props (a plant, a linen napkin, a glass, a notebook) in soft focus. Everything feels intentional and curated, like a premium product photography set or a brand tabletop ad.",
        "Subject behavior: STATIC RESTING POSE — hands at rest near the product, product upright and stable, no motion blur. This is the FIRST FRAME of a video clip, mid-preparation. Motion starts AFTER this frame.",
      ].join(" ");

    case "selfie":
    default:
      return [
        "\n\nYou are locked into a permanent capture style: Authentic iPhone front-camera photo realism.",
        "Rules: Simulate Apple iPhone computational photography pipeline. No cinematic lighting, no flash, no studio lighting. No beauty filters, no symmetry correction, no pose optimization. Slight wide-angle distortion. Subtle edge sharpening. Flattened midtones. Mild overexposure on highlights. Natural shadow noise. Real skin texture (pores, creases, uneven tone). Casual framing, slightly imperfect crop. No motion blur. No HDR look. Flat image colors.",
        "Subject behavior: STATIC RESTING POSE — the character must be in a calm, neutral resting position. Both arms relaxed at sides or one hand resting on lap/surface. No mid-gesture, no raised arms, no pointing, no active movement. Mouth naturally closed or very slightly parted. This is the FIRST FRAME of a video — motion starts AFTER this frame, not during it. The image must look like the moment just before someone starts talking.",
      ].join(" ");
  }
}

/**
 * Aesthetic rules block injected into the Claude user prompt when generating
 * the UGC swipe concept. This REPLACES the hardcoded "iPhone aesthetics"
 * rules that used to always be there regardless of source video format.
 *
 * The system prompt (buildVideoUgcSystemPrompt) still contains baseline UGC
 * knowledge — this block overrides it with format-specific instructions that
 * Claude will follow when writing shot_description and veo_prompt fields.
 */
export function buildClaudeAestheticRules(formatId: string | null | undefined): string {
  const family = getFormatFamily(formatId);

  switch (family) {
    case "studio":
      return `## FORMAT OVERRIDE: PODCAST / HOME STUDIO (not selfie UGC)

This video is a **home-studio / podcast-style** ad, NOT a handheld iPhone selfie. Your shot descriptions and VEO prompts MUST follow these rules INSTEAD of the default iPhone selfie rules in the system prompt:

1. **Professional camera on tripod/gimbal** — mirrorless or cinema camera (Sony FX3, Canon R5C). Stable, deliberate framing. NOT handheld selfie.
2. **Studio lighting is REQUIRED** — warm key light from softbox, subtle fill, hair light. Cinematic and controlled. This is the OPPOSITE of the "natural lighting only" rule in the system prompt.
3. **Professional podcast mic visible in frame** — Shure SM7B, Rode NT1, or similar broadcast mic on a boom arm or desktop stand, prominently positioned near the subject's face. The mic is a key visual signal.
4. **Intentional studio backdrop** — bookshelves, acoustic panels, warm wood, branded set, soft backlights. NOT a messy bedroom, car, or bathroom.
5. **1 or 2 subjects** — single host OR two hosts sitting at a desk. If two hosts, describe BOTH in character_description and have them interact naturally.
6. **Formal but warm delivery** — authoritative, educated, conversational-but-composed. NOT the rushed filler-word-heavy selfie vibe. Still include natural pauses, but cadence is measured.
7. **Medium shot framing** — chest up, eye level, deliberate composition. Subject looks at the other host or slightly off-camera (NOT directly into lens like selfie).
8. **Hands stay below collarbone on the desk or in lap** (still applies).

Write shot_description fields that describe this EXACT aesthetic (pro camera, softbox lighting, mic, studio backdrop, measured pose) — NEVER mention iPhone, selfie angle, handheld sway, or messy environments.`;

    case "lecture":
      return `## FORMAT OVERRIDE: LECTURE / AUTHORITY CAPTURE (not selfie UGC)

This video is a **covert student-POV capture of an expert speaking**, NOT a handheld iPhone selfie monologue. Your shot descriptions and VEO prompts MUST follow these rules INSTEAD of the default iPhone selfie rules in the system prompt:

1. **iPhone held by student from audience seat** — chest-level or slightly below, filmed covertly as if the expert doesn't know they're being recorded. Slight obstruction in foreground (another student's head, laptop lid, notebook edge) for realism.
2. **Subject is an authority figure** — doctor, professor, scientist, nutritionist, coach — in professional attire (white coat, blazer, collared shirt, glasses). They are NOT a young creator.
3. **Room lighting only** — fluorescent office light, lecture hall ceiling spots, daylight through large windows. No softbox, no ring light, no dramatic shadows.
4. **Lecture hall / clinic / conference room setting** — visible podium, whiteboard, projector screen, books, or medical equipment in background. NOT a bedroom or bathroom.
5. **Subject is NOT looking at the camera** — they look toward their audience, down at notes, or across the room. This is the KEY visual cue that makes it feel like a secret recording.
6. **Measured, educated delivery** — calm authority voice. Scientific terminology is welcome. Minimal filler words. Pauses come from thoughtful delivery, not nervousness.
7. **Subject posture is professional** — standing at a podium, sitting at a desk, or leaning against it. Hands on desk or gesturing calmly at chest level (never near lens).

Write shot_description fields that describe this EXACT aesthetic (student-POV phone capture, authority figure mid-explanation, classroom setting, foreground obstruction) — NEVER mention selfie angle, messy bedroom, or direct-to-camera eye contact.`;

    case "street":
      return `## FORMAT OVERRIDE: STREET INTERVIEW / VOX POP (not selfie UGC)

This video is an **outdoor run-and-gun vox pop interview** where an off-camera interviewer asks passersby a question, NOT a handheld selfie monologue. Your shot descriptions and VEO prompts MUST follow these rules INSTEAD of the default iPhone selfie rules in the system prompt:

1. **Mid-range DSLR or mirrorless handheld by an interviewer** — NOT iPhone selfie. Subject is filmed by someone else standing 1-2 meters away.
2. **Subject looks slightly OFF-CAMERA** toward the interviewer — never directly into the lens. This is the key visual cue.
3. **Outdoor urban environment** — busy sidewalk, park, outdoor market, city square, store entrance, cafe terrace. NOT a bedroom, bathroom, or car.
4. **Natural daylight only** — overcast soft light or golden hour. No studio lighting.
5. **Subject is a regular passerby** — caught mid-thought, slightly surprised, flattered to be asked. They look like anyone from the street, NOT a creator.
6. **Chest-up framing with shallow DOF** — blurred pedestrians/traffic in the background. Subject sharp.
7. **Interviewer stays OFF-CAMERA entirely** — only the subject is in frame. You can have them react to a question with a natural "um, well..." opening.
8. **Handheld micro-sway** — alive but not erratic.

Write shot_description fields that describe this EXACT aesthetic (outdoor handheld DSLR, off-camera interviewer, passerby subject, urban background) — NEVER mention iPhone, selfie angle, direct lens eye contact, or indoor environments.`;

    case "tabletop":
      return `## FORMAT OVERRIDE: TABLETOP / PRODUCT DEMO (not selfie UGC)

This video is a **clean tabletop product demo**, NOT a handheld iPhone selfie with a talking head. Your shot descriptions and VEO prompts MUST follow these rules INSTEAD of the default iPhone selfie rules in the system prompt:

1. **Camera on tripod or overhead rig** — mirrorless camera, deliberate composition, stable framing.
2. **NO talking head in frame** — the visual focus is the PRODUCT and HANDS interacting with it (pouring, holding, applying, unscrewing, measuring). Only partial hands/forearms visible, or no human at all.
3. **Clean styled tabletop** — neutral surface (wood, marble, linen). Supporting props in soft focus (plant, linen napkin, glass, notebook). Curated and intentional — NOT a messy bedroom.
4. **Soft diffused lighting** — softbox or large window light from above or side. Warm, color-accurate grade.
5. **Product is the hero** — prominently placed, label visible, shallow DOF highlighting it.
6. **Voiceover delivery** — the dialogue is a VOICEOVER, not spoken on camera by a visible talking head. Write the dialogue as voiceover narration.
7. **Overhead (top-down) or 3/4 angle** — never a selfie angle, never eye-level with a person.
8. **No motion blur** — keyframes are static mid-preparation moments.

Write shot_description fields that describe this EXACT aesthetic (overhead or 3/4 tabletop shot, product hero, hands-only or no human, softbox lighting, styled surface) — NEVER mention selfie angle, iPhone front camera, talking head, or direct eye contact.`;

    case "selfie":
    default:
      return `## UGC AUTHENTICITY RULES FOR SHOT DESCRIPTIONS

Your shot descriptions and VEO prompts MUST follow these rules for authentic UGC:
1. **iPhone aesthetics**: Specify iPhone front-camera, ~24mm equivalent, HDR auto-tone
2. **Imperfect framing**: Off-center composition, slightly cropped forehead, handheld sway
3. **Natural lighting only**: Window light, bathroom vanity, car daylight - NEVER studio lighting
4. **Authentic environments**: Messy bedrooms, parked cars, bathrooms - lived-in details
5. **Hand safety**: Keep hands below collarbone, no gestures near lens or face, no pointing
6. **Real skin**: Visible pores, no smoothing, no beauty filters, natural shadows
7. **Conversational delivery**: Filler words, natural pauses, direct eye contact, real person cadence`;
  }
}

/**
 * Human-readable label for a format ID, used in Claude prompts and logs.
 */
export function formatLabel(formatId: string | null | undefined): string {
  if (!formatId || formatId === "auto") return "auto-detected";
  const opt = SWIPE_FORMAT_OPTIONS.find((o) => o.id === formatId);
  if (opt) return opt.label;
  // Fallback for Gemini-detected formats that aren't in the UI dropdown
  return formatId
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
