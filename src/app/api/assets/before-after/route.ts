import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase-admin";
import { CLAUDE_MODEL } from "@/lib/constants";
import { calcClaudeCost } from "@/lib/pricing";
import { createImageTask, pollTaskResult } from "@/lib/kie";

export const maxDuration = 300;

const ASPECT_RATIO = "16:9";

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

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
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

  const promptObj: Record<string, unknown> = {
    task: "generate_image",
    format:
      "Single image, side-by-side split. Left half shows the 'before' state, right half shows the 'after' state. The two halves should be cleanly divided (subtle vertical seam) but read as one cohesive photo.",
    subject: {
      demographic: demographicToString(demographic),
      body_zone: zone,
      expression: "neutral, relaxed face",
      identity_lock:
        "BOTH halves must show the EXACT SAME person - identical face shape, hair color, hair style, eye color, age. ONLY the skin condition differs between halves.",
    },
    composition: {
      camera: vision?.composition?.camera ?? "natural smartphone angle, eye-level or very slightly above, casual unstaged framing",
      framing: vision?.composition?.framing ?? "tight zone-appropriate crop",
      lighting: vision?.composition?.lighting ?? "natural soft ambient light from a window or open room, no studio setup, no harsh shadows",
      background: vision?.composition?.background ?? "neutral home environment, plain wall or soft out-of-focus interior",
      composition_lock:
        "Camera angle, framing, lighting, and background must be IDENTICAL between the two halves.",
    },
    transformation: INTENSITY_PROMPTS[intensity],
    style:
      "Realistic smartphone-quality photo (iPhone-style), authentic UGC feel. Visible pores, natural skin texture, real imperfections in BOTH halves. NO airbrushing, NO unrealistic smoothing, NO filters, NO beauty mode. The 'after' improvement must look like collagen or skincare results over time - NOT plastic surgery, NOT cosmetic procedures, NOT digital retouching.",
    hard_constraints: [
      "NEVER render any text, labels, watermarks, captions, or overlays. NO 'Before' or 'After' text anywhere. The image must be completely free of text.",
      "Both halves must show the same person - same face, same hair, same age. Only skin condition differs.",
      hasSource
        ? "A reference image is provided. Use it ONLY for composition, crop, lighting, and background. The PERSON in the generated image must be the randomized scandinavian woman described in 'subject.demographic', NOT the person in the reference image. Do NOT copy the reference person's face."
        : "No reference image is provided. Build the scene from the subject and composition specs.",
      "Both halves must have the same realistic skin texture - the 'before' has more visible aging signs appropriate to the intensity level, the 'after' has fewer. Both look like real un-retouched skin.",
    ],
    instruction:
      "Generate a clean before/after split image with the randomized scandinavian woman in the specified body zone, showing the specified intensity of skin improvement. ABSOLUTELY NO TEXT IN THE IMAGE.",
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
      const taskId = await createImageTask(prompt, referenceImages, ASPECT_RATIO, "2K");
      const result = await pollTaskResult(taskId);

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
