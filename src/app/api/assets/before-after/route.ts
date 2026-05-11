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
  full_face_front: "Tight portrait crop, full face front view. Frame from just below the chin to just above the hairline, both eyes visible, head fills most of the frame. Shoulders may peek in at the bottom edge.",
  face_profile: "Tight 3-quarter or side profile crop. Frame from chin to forehead, showing one cheek and jawline prominently, partial nose, one ear may peek in. Head fills most of the frame.",
  eye_area: "EXTREME MACRO CROP. Frame is very tight - ONLY one eye area is in frame: the eye itself, upper lid, lower lid with any crow's feet, outer brow tip, and just the edge of the nose bridge at one side. The frame MUST NOT include: the mouth, chin, jaw, ear, hairline, or the forehead beyond the immediate brow area. Roughly 1/8th the size of a full-face shot.",
  forehead: "EXTREME MACRO CROP on the forehead. Frame shows ONLY the area from the upper edge of the brows up to the hairline. The frame MUST NOT include: the full eyes (only the very top of the brows is visible at the bottom edge), mouth, chin, jaw, cheeks, nose. Glasses frame may sometimes be visible at the bottom edge. A thin horizontal slice, roughly 1/6th the size of a full-face shot.",
  neck_decolletage: "TIGHT MACRO CROP on the neck and upper decolletage. Frame shows ONLY the neck (from just below the chin/jawline), the throat, and the upper chest down to the collarbone or hint of a thin top strap. The frame MUST NOT include: the full face, mouth, eyes, nose. The chin may barely peek in at the very top edge but the rest of the face is cropped out.",
  cheek_closeup: "EXTREME MACRO CROP on one cheek. Frame is so tight that ONLY cheek skin fills most of the frame - showing pores, skin texture, fine lines, and natural skin variation. The frame MUST NOT include: the eyes, the full mouth (maybe just the corner of the lips at one edge), chin, forehead, or the other side of the face. Perhaps the edge of the nose or a hint of the ear at one side. Roughly 1/10th the size of a full-face shot.",
  arm_skin: "TIGHT MACRO CROP on the skin of the upper arm or forearm. Frame shows ONLY skin texture filling most of the frame - with just a sliver of clothing edge or out-of-focus background at the frame edge. The frame MUST NOT include: the face, head, body, hand, or the full arm structure. Just a skin section.",
  hands: "TIGHT MACRO CROP on the back of one hand and lower wrist. Frame shows ONLY the hand from the wrist down through the fingers. The frame MUST NOT include: the face, body, or arm above the wrist. Just the hand filling most of the frame.",
} as const;

type ZoneKey = keyof typeof BODY_ZONE_PRESETS;

const AGE_RANGES = ["40-45", "46-50", "51-55", "56-60", "61-65"];
const HAIR_COLORS = [
  "natural blonde",
  "dark blonde",
  "light brown",
  "brunette",
  "salt-and-pepper",
  "silver-grey",
  "ash-blonde",
  "warm honey blonde",
];
const HAIR_STYLES = [
  "shoulder-length hair worn down with a slight wave",
  "long straight hair worn down",
  "loose low ponytail",
  "low messy bun",
  "loose natural waves worn down",
  "hair pulled back simply behind the ears",
  "shoulder-length bob, slightly tousled",
];
const EYE_COLORS = ["blue", "blue-grey", "green", "hazel", "light brown"];
const SKIN_TONES = [
  "fair scandinavian skin",
  "light beige scandinavian skin",
  "light pink-fair scandinavian skin",
  "neutral fair scandinavian skin",
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
  hair_color: string;
  hair_style: string;
  eye_color: string;
  skin_tone: string;
  accent: string | null;
}

function randomDemographic(): Demographic {
  return {
    age: pick(AGE_RANGES),
    hair_color: pick(HAIR_COLORS),
    hair_style: pick(HAIR_STYLES),
    eye_color: pick(EYE_COLORS),
    skin_tone: pick(SKIN_TONES),
    accent: pick(ACCENTS),
  };
}

function demographicToString(d: Demographic): string {
  const accent = d.accent ? `, ${d.accent}` : "";
  return `Scandinavian woman, ${d.age} years old, ${d.hair_color} ${d.hair_style}, ${d.eye_color} eyes, ${d.skin_tone}${accent}`;
}

const INTENSITY_PROMPTS: Record<Intensity, string> = {
  subtle:
    "BEFORE half: naturally tired skin - slightly dull tone, softened contours, faintly more visible fine lines and undereye creasing. AFTER half: healthy glowing skin - marginally smoother texture, slightly more even tone, healthier glow. The difference must be visible on close inspection but extremely believable. Think 30 days of skincare use.",
  moderate:
    "BEFORE half: naturally tired skin - dull tone, softened contours, visibly fine lines, slight undereye darkness, slight skin texture unevenness. AFTER half: healthy glowing skin - smoother texture, noticeably reduced fine lines and crow's feet, more even tone, clear healthy glow. The difference is obvious but still realistic. Think 60 to 90 days of skincare use.",
  dramatic:
    "BEFORE half: noticeably tired and aged skin - dull tone, visible fine lines and wrinkles, slight sagging, undereye darkness, uneven texture. AFTER half: visibly firmer healthy glowing skin - much smoother texture, notably reduced wrinkles and sagging, brighter and more even tone. The difference is striking but stops short of looking unrealistic.",
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
    "The 'after' improvement is real skincare results over weeks - NOT plastic surgery, NOT cosmetic procedures, NOT a filter applied in post.";

  const promptObj: Record<string, unknown> = hasSource
    ? {
        // ---- SOURCE-ANCHORED MODE ----
        // Source provides body zone identification and crop style only.
        // Halves vary in background/lighting/outfit/angle since they are
        // "two selfies 60+ days apart".
        task: "generate_image",
        mode: "source_anchored_pair",
        zone_framing_priority:
          "THE SINGLE MOST IMPORTANT INSTRUCTION. The body zone framing defines exactly what is visible in the image. Read 'zone_framing' carefully and crop tighter than feels natural. If it says 'ONLY cheek skin' or 'MUST NOT show eyes/mouth/forehead', the image MUST obey - do NOT default to a full-face portrait when a macro crop is specified. The two halves of the split image must show the SAME body zone with the SAME tight crop.",
        zone_framing: zone,
        format:
          "Single image, side-by-side split. Two SEPARATE selfies the same person took at least 60 days apart - one before starting a skincare regime, one after. The reference image guides body zone identification and crop tightness only. Both halves show the SAME body zone with the SAME tight crop (per 'zone_framing'). The TWO halves are NOT taken in the same session - they have different lighting, different backgrounds, different outfits, different head angles - but always shot from the same side (no mirroring).",
        subject: {
          demographic: demographicToString(demographic),
          body_zone_framing: zone,
          expression: "neutral, relaxed face - same general expression in both halves with natural micro-variations",
          hair: "same scandinavian hair color and general length, but hair fall and positioning are NATURALLY different between halves (different day = different hair state)",
          identity_lock:
            "Both halves show the SAME new person - same face structure, same eye color, same hair color, same age. Identity unmistakable.",
        },
        source_match: {
          body_zone_focus: zone,
          framing_and_crop: vision?.composition?.framing ?? "match the reference's framing and crop tightness",
          camera_style: vision?.composition?.camera ?? "match the reference's camera angle style (e.g. 3-quarter profile, front-facing, macro closeup)",
          note:
            "The reference image is for BODY ZONE IDENTIFICATION and CROP-STYLE REFERENCE ONLY. Do NOT copy: the reference's background, the reference's lighting, the reference's room/setting, the reference's person. The generated photos are taken at least 60 days apart in the new person's own home environment - the two halves have DIFFERENT backgrounds and DIFFERENT lighting from each other and from the reference.",
        },
        before_half: {
          outfit: beforeTop,
          lighting: beforeLight,
          head_position: beforeTilt,
          skin_state: "more visible aging signs appropriate to the chosen intensity (see 'transformation' field)",
          day_context: "this photo was taken on Day 0, before starting any skincare regime",
        },
        after_half: {
          outfit: afterTop,
          lighting: afterLight,
          head_position: afterTilt,
          skin_state: "improved skin (smoother, more even, healthier glow) per the chosen intensity",
          day_context: "this photo was taken at least 60 days later, after the skincare regime - in a different room or at a different time of day from the 'before'",
        },
        transformation: INTENSITY_PROMPTS[intensity],
        style: sharedStyle,
        hard_constraints: [
          "ZONE FRAMING IS HIGHEST PRIORITY: obey 'zone_framing' exactly. If it says 'EXTREME MACRO CROP' the generated image must show ONLY that body part - no full face when a macro crop is specified. Crop tighter than feels natural. Both halves use the SAME body zone with the SAME tight crop.",
          "NO MIRRORING between halves: both halves are shot from the SAME side and direction. If 'before' shows the right cheek, 'after' also shows the right cheek - NEVER mirror-flip. Head direction must be CONSISTENT between halves.",
          "NEVER render any text, labels, watermarks, captions, or overlays. NO 'Before' or 'After' text anywhere. The image must be completely free of text.",
          "The reference image guides BODY ZONE and CROP ONLY. Do NOT copy the reference's background, lighting, room, or person.",
          "Both halves must show the SAME new person - the randomized scandinavian woman in 'subject.demographic'. Identity is unmistakably the same in both halves.",
          `BEFORE half top: ${beforeTop}. AFTER half top: ${afterTop}. These MUST be visibly different.`,
          `BEFORE half lighting: ${beforeLight}. AFTER half lighting: ${afterLight}. These MUST be different - the photos are 60+ days apart.`,
          `BEFORE half head position: ${beforeTilt}. AFTER half head position: ${afterTilt}. Subtle differences only - NEVER opposite directions, NEVER mirrored.`,
          "FORBIDDEN: copying the reference person's face. FORBIDDEN: matching the reference's background/lighting/room in the generated image.",
          "FORBIDDEN: identical head angle, identical hair fall, identical outfit, identical lighting between halves. FORBIDDEN: mirrored / opposite-facing halves. FORBIDDEN: defaulting to a full-face portrait when zone_framing calls for a tighter crop.",
          "FORBIDDEN: ring light glow, studio lighting setup, beauty filter, cosmetic smoothing, retouching, AI-rendering polish, perfect symmetry.",
          "Both halves must have realistic un-retouched skin texture - the 'before' has more visible aging signs, the 'after' has fewer. Both look like real phone-camera skin with all its natural imperfections preserved.",
        ],
        instruction:
          "Generate a single before/after split image. FIRST, lock the body zone framing from 'zone_framing' - crop tightly to the specified zone, do not default to a full-face portrait. Both halves show the SAME body zone with the SAME tight crop and from the SAME side (no mirroring). Then vary outfit, lighting, and slight head angle between halves to look like two selfies the same person took 60+ days apart. ABSOLUTELY NO TEXT IN THE IMAGE.",
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
          expression: "neutral, relaxed face - same general expression in both halves (no need to vary the expression on purpose)",
          hair: "same hair color, same general hair style in both halves",
          identity_lock:
            "Both halves show the SAME person - same face structure, same eye color, same hair color, same age, same overall appearance. Identity must be unmistakable.",
        },
        before_half: {
          outfit: beforeTop,
          lighting: beforeLight,
          head_position: beforeTilt,
          skin_state: "more visible aging signs appropriate to the chosen intensity level (see 'transformation' field)",
          day_context: "this photo was taken on Day 1, before any skincare regime",
        },
        after_half: {
          outfit: afterTop,
          lighting: afterLight,
          head_position: afterTilt,
          skin_state: "improved skin (smoother, more even, healthier glow) per the chosen intensity level",
          day_context: "this photo was taken weeks later, after the skincare regime",
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
          "Both halves must have realistic un-retouched skin texture - the 'before' has more visible aging signs, the 'after' has fewer. Both look like real phone-camera skin with all its natural imperfections preserved.",
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
  } = body as {
    image_url?: string;
    body_zone?: string;
    custom_zone?: string;
    intensity?: Intensity;
    notes?: string;
  };

  if (!body_zone) {
    return NextResponse.json({ error: "body_zone is required" }, { status: 400 });
  }
  if (!["subtle", "moderate", "dramatic"].includes(intensity)) {
    return NextResponse.json({ error: "intensity must be subtle | moderate | dramatic" }, { status: 400 });
  }

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

      const demographic = randomDemographic();
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
