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
  full_face_front: "Full face, front view, tight portrait crop showing the face from chin to forehead, both eyes visible",
  face_profile: "Face in 3-quarter or side profile view, showing one cheek, jawline, and partial nose, tight crop",
  eye_area: "Tight macro crop on one eye and the surrounding area including crow's feet, under-eye, and outer brow",
  forehead: "Tight crop on forehead between the brows and the hairline, showing forehead lines",
  neck_decolletage: "Tight crop on the neck and upper decolletage from jaw to collarbone, showing neck skin texture",
  cheek_closeup: "Macro-style closeup on one cheek showing pores, skin texture, and fine lines",
  arm_skin: "Closeup of upper arm or forearm skin showing texture, slight cellulite, or skin tone variation",
  hands: "Closeup of the back of one hand and lower wrist, showing hand skin texture and veins",
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
  "head very slightly tilted to the left, by a few degrees",
  "head very slightly tilted to the right, by a few degrees",
  "head straight on with chin slightly raised",
  "head straight on with chin slightly lowered",
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
    "The after-half shows marginally smoother texture, very subtle reduction in fine lines, slightly more even skin tone. The difference must be visible on close inspection but extremely believable - barely noticeable at first glance. Think 30 days of skincare use.",
  moderate:
    "The after-half shows clearly smoother texture, noticeably reduced fine lines and crow's feet, more even skin tone, healthier glow. The difference is obvious but still realistic. Think 60 to 90 days of skincare use.",
  dramatic:
    "The after-half shows significant improvement: visibly firmer skin, much smoother texture, notably reduced wrinkles and sagging, brighter and more even skin tone, healthy glow. The difference is striking but stops short of looking unrealistic or photoshopped.",
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
    "CRITICAL UGC AUTHENTICITY RULES: Both halves MUST look like real photos captured on an iPhone 16 Pro with the typical computational look of an actual smartphone photo. Preserve raw handheld realism and iPhone color science (slight HDR processing, natural color reproduction, occasional minor over-sharpening on edges). Skin in BOTH halves must show fully realistic texture: visible pores on cheeks/nose/forehead, faint natural redness, slight T-zone or forehead shine, soft under-eye detail, micro-imperfections like a small blemish, an uneven freckle, or a stray hair. Hair has natural flyaways and slight imperfect fall - not styled. Composition feels casual and unstaged: subtly off-center framing, slightly imperfect autofocus where it would naturally occur. Absolutely NO cosmetic smoothing, NO beauty filter, NO retouching, NO artificial bokeh, NO professional studio lighting, NO magazine-portrait polish. The 'after' improvement is real skincare results over time - NOT plastic surgery, NOT cosmetic procedures, NOT a filter, NOT digital retouching.";

  const promptObj: Record<string, unknown> = hasSource
    ? {
        // ---- SOURCE-ANCHORED MODE ----
        // User uploaded a competitor B/A. Match its composition tightly.
        // The two halves match each other closely, mirroring the source pair.
        task: "generate_image",
        mode: "source_anchored_pair",
        format:
          "Single image, side-by-side split. Reproduce the visual structure of the provided reference image (a before/after pair) using a DIFFERENT person. Both halves match the reference's composition, background, lighting, framing, and body zone. Only the skin condition differs between halves (per the transformation spec).",
        subject: {
          demographic: demographicToString(demographic),
          body_zone: zone,
          expression: "neutral, relaxed - matching the expression in the reference image",
          hair: "scandinavian hair as per demographic, falling naturally - match the general hair length and style of the reference person but in the new demographic's color",
          identity_lock:
            "Both halves show the SAME new person - same face structure, same eye color, same hair color, same age. Identity must be unmistakable.",
        },
        source_match: {
          camera: vision?.composition?.camera ?? "match the reference's camera angle exactly",
          framing: vision?.composition?.framing ?? "match the reference's framing and crop exactly",
          lighting: vision?.composition?.lighting ?? "match the reference's lighting exactly",
          background: vision?.composition?.background ?? "match the reference's background exactly",
          critical_note:
            "BOTH halves use the SAME camera angle, SAME background, SAME lighting, SAME crop - matching the reference image. The two halves are NOT 'photos taken on different days' - they are a CONTROLLED PAIR that mirrors the reference structure. Variation between halves: only skin condition (per intensity) and a subtle outfit/top change. Do NOT introduce big lighting changes, do NOT change the background between halves, do NOT shift to a different room.",
        },
        outfit_pair: {
          before_half: beforeTop,
          after_half: afterTop,
          note: "Both tops are casual at-home wear in the same style - just different color/material. Both halves use lighting that matches the reference.",
        },
        transformation: INTENSITY_PROMPTS[intensity],
        style: sharedStyle,
        hard_constraints: [
          "NEVER render any text, labels, watermarks, captions, or overlays. NO 'Before' or 'After' text anywhere. The image must be completely free of text.",
          "STRONG ANCHOR: The reference image's background, lighting, crop, camera angle, and body zone framing MUST be matched closely. Do NOT switch backgrounds between halves. Do NOT shift lighting style between halves. The reference defines the visual template.",
          "Both halves must show the SAME new person - the randomized scandinavian woman in 'subject.demographic'. NOT the person in the reference. Identity is unmistakably the same in both halves.",
          `BEFORE half top: ${beforeTop}. AFTER half top: ${afterTop}. These are different colors but both casual at-home style.`,
          "FORBIDDEN: copying the reference person's face. FORBIDDEN: switching backgrounds between halves. FORBIDDEN: changing lighting style between halves. FORBIDDEN: introducing kitchen vs bathroom contrast or any environment shift.",
          "FORBIDDEN: professional photoshoot look. FORBIDDEN: studio lighting. FORBIDDEN: magazine portrait quality. FORBIDDEN: glossy retouched stock photo look.",
          "Both halves must have realistic un-retouched skin texture - the 'before' has more visible aging signs, the 'after' has fewer. Both look like real phone-camera skin with all its natural imperfections preserved.",
        ],
        instruction:
          "Generate a single before/after split image that mirrors the structure of the reference image. Use the randomized scandinavian woman from 'subject.demographic' - NOT the reference person. Match the reference's background, lighting, framing, and crop. Both halves are a controlled pair, not 'photos from different days'. ABSOLUTELY NO TEXT IN THE IMAGE.",
      }
    : {
        // ---- FREE MODE ----
        // No source. Generate from scratch as two selfies on different days.
        task: "generate_image",
        mode: "different_days",
        format:
          "Single image, side-by-side split. Left half shows the 'before' state, right half shows the 'after' state. The two halves should be cleanly divided (subtle vertical seam) but read as one cohesive photo. These are TWO SEPARATE photos of the same person taken on different days - NOT two halves of one studio session.",
        subject: {
          demographic: demographicToString(demographic),
          body_zone: zone,
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
          "NEVER render any text, labels, watermarks, captions, or overlays. NO 'Before' or 'After' text anywhere. The image must be completely free of text.",
          `BEFORE half outfit: ${beforeTop}. AFTER half outfit: ${afterTop}. These MUST be visibly different - this is mandatory, not a suggestion.`,
          `BEFORE half lighting: ${beforeLight}. AFTER half lighting: ${afterLight}. These MUST be different - not the same lighting.`,
          `BEFORE half head position: ${beforeTilt}. AFTER half head position: ${afterTilt}. These MUST be slightly different angles.`,
          "Both halves must show the same person - same face structure, same hair color, same age. Only the skin condition (per intensity) and the natural between-days variations (clothing, lighting, angle) differ.",
          "FORBIDDEN: identical clothing in both halves. FORBIDDEN: identical lighting. FORBIDDEN: identical head angle. FORBIDDEN: anything that makes this look like a clinical or studio shoot.",
          "FORBIDDEN: professional photoshoot look. FORBIDDEN: studio lighting. FORBIDDEN: magazine portrait quality. FORBIDDEN: AI-rendered marketing image feel. FORBIDDEN: glossy retouched stock photo look. The image must look like two casual selfies from a real person's camera roll - mundane, real, slightly imperfect.",
          "Both halves must have realistic un-retouched skin texture - the 'before' has more visible aging signs, the 'after' has fewer. Both look like real phone-camera skin with all its natural imperfections preserved.",
        ],
        instruction:
          "Generate a single before/after split image. The before-half and after-half are TWO SEPARATE photos of the same scandinavian woman taken weeks apart. Use the explicit per-half outfit, lighting, and head-angle specs - they MUST be visibly different between the halves. Same person, different days, different shirts, different light. ABSOLUTELY NO TEXT IN THE IMAGE.",
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
