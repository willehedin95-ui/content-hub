import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase-admin";
import { CLAUDE_MODEL } from "@/lib/constants";
import { calcClaudeCost } from "@/lib/pricing";

export const maxDuration = 60;

const ZONE_KEYS = [
  "full_face_front",
  "face_profile",
  "eye_area",
  "forehead",
  "neck_decolletage",
  "cheek_closeup",
  "arm_skin",
  "hands",
  "hair_scalp",
  "leg_thigh",
  "chest_macro",
] as const;

const ETHNICITIES = [
  "scandinavian",
  "north_european",
  "mediterranean",
  "east_asian",
  "south_asian",
  "latin",
  "middle_eastern",
  "african",
];

const META_PROMPT = `You are a visual analyst. Analyze the uploaded image (typically a before/after pair) and generate a structured JSON spec describing it in EXTREME detail. This spec will be used to recreate the image as a near-clone with a different person.

Be SPECIFIC. Don't say "some" or "various" or "casual" without details - describe exactly what you see. Use concrete adjectives, hex-codes-like specificity where possible, exact framing language.

Return ONLY a single JSON object matching this exact schema. No markdown fences, no commentary, no extra fields, no missing fields.

{
  "zone": "<one of: ${ZONE_KEYS.join(", ")}, or 'other'>",
  "demographic": {
    "age_range": "<one of: 30-35, 36-40, 40-45, 46-50, 51-55, 56-60, 61-65, 66-70, 71-75, or null if not visible>",
    "ethnicity": "<one of: ${ETHNICITIES.join(", ")}, or null>",
    "hair_color": "<short phrase like 'natural blonde', 'dark brunette', 'silver-grey', or null>"
  },
  "subject": {
    "description": "<one detailed sentence describing the person: age, ethnicity, general look, demeanor, distinguishing features>",
    "expression": "<exact facial expression: e.g. 'neutral relaxed, slight tension in brows, mouth closed' or 'subtle warm smile, eyes slightly crinkled'>",
    "hair": {
      "color": "<exact color description, e.g. 'medium dark blonde with sun-bleached lighter ends'>",
      "style": "<exact style: e.g. 'shoulder-length, parted slightly off-center, falling naturally on both sides of the face, no styling product'>"
    },
    "clothing": {
      "visible": "<true/false>",
      "top": "<exact description if visible: e.g. 'white fluffy bathrobe, soft texture, slightly visible at lower edge of frame', or 'not visible due to tight crop'>"
    },
    "skin": "<exact skin description: tone, texture, visible imperfections, blemishes, freckles, redness, shine, pores. Note any asymmetries.>"
  },
  "accessories": {
    "jewelry": "<exact description if visible: e.g. 'small gold stud earrings visible on both ears' or 'none'>",
    "glasses": "<exact description if visible: e.g. 'black thin-rimmed rectangular glasses' or 'none'>",
    "other": "<any other visible accessories or 'none'>"
  },
  "photography": {
    "camera_style": "<exact style: e.g. 'casual iPhone front-camera selfie, slight wide-angle perspective, raw unfiltered'>",
    "angle": "<exact angle: e.g. 'eye-level, head-on, slight downward tilt'>",
    "shot_type": "<exact shot type: e.g. 'extreme tight close-up filling 95% of frame with face from forehead to chin, NO shoulders visible' or 'medium close-up showing face plus upper chest'>",
    "framing": "<exact framing: where is the subject in the frame, what is cropped out, how much headroom>",
    "aspect_ratio": "<e.g. '16:9 horizontal split for before/after pair', '1:1 square', '9:16 vertical'>",
    "texture": "<photo quality: e.g. 'sharp focus, slight phone-camera noise, no professional smoothing, natural skin pores visible, slight HDR processing'>"
  },
  "background": {
    "setting": "<exact setting: e.g. 'plain neutral interior, slight warm undertone' or 'cream-colored wall' or 'tile wall' - if not visible, say 'not visible due to tight crop on face'>",
    "color": "<dominant color/tone of the background>",
    "elements": ["<list specific visible background elements, or empty array>"],
    "lighting": "<exact lighting: direction, quality, temperature, asymmetry. e.g. 'warm natural daylight from upper-left, soft falloff to right, slight golden cast'>"
  },
  "pair_structure": {
    "is_pair": "<true if image is a before/after pair, false if single image>",
    "layout": "<e.g. 'side-by-side split, before on left half, after on right half, subtle seam between' or 'single image'>",
    "before_state": "<exact skin condition description of the BEFORE half, if pair. e.g. 'visibly tired, slightly dull tone, mild redness around the nose, soft contours, visible fine lines around eyes, slight under-eye darkness'>",
    "after_state": "<exact skin condition description of the AFTER half, if pair. e.g. 'visibly more rested, slight healthy glow, more even tone, smoother texture, less redness, brighter eye area'>",
    "transition_intensity": "<one of: 'subtle' (barely visible difference), 'moderate' (clear but realistic), 'dramatic' (striking but still plausible). Describe what intensity the SOURCE shows so we can match it.>"
  }
}

If a field truly cannot be determined (e.g. body parts macro with no face), return null for that field, but try to fill in everything you can see. Do NOT invent details that aren't visible.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const { image_url } = body as { image_url?: string };

  if (!image_url) {
    return NextResponse.json({ error: "image_url is required" }, { status: 400 });
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      temperature: 0.1,
      system: [{ type: "text", text: META_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: image_url } },
            { type: "text", text: "Analyze this image and return the full JSON spec." },
          ],
        },
      ],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let spec: Record<string, unknown> | null = null;
    try {
      spec = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("[detect-zone] JSON parse failed:", parseErr instanceof Error ? parseErr.message : parseErr);
      console.error("[detect-zone] Raw response:", raw.slice(0, 500));
      return NextResponse.json({ error: "Failed to parse vision response" }, { status: 500 });
    }

    // Log cost
    const db = createServerSupabase();
    const cacheCreation =
      (response.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0;
    const cacheRead =
      (response.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0;
    const cost = calcClaudeCost(
      response.usage.input_tokens,
      response.usage.output_tokens,
      cacheCreation,
      cacheRead
    );
    await db.from("usage_logs").insert({
      type: "before_after",
      model: CLAUDE_MODEL,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cost_usd: cost,
      metadata: {
        stage: "analyze_source",
        detected_zone: spec?.zone,
      },
    });

    // Backward-compatible response: include zone + demographic at top level
    // (for the frontend's existing auto-fill logic), plus the full spec.
    const demographic = (spec?.demographic ?? {}) as Record<string, string | null>;
    return NextResponse.json({
      zone: spec?.zone ?? null,
      demographic: {
        age: demographic.age_range ?? null,
        ethnicity: demographic.ethnicity ?? null,
        hair_color: demographic.hair_color ?? null,
      },
      spec,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[detect-zone] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
