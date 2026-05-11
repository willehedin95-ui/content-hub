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

const AGE_RANGES = ["30-35", "36-40", "40-45", "46-50", "51-55", "56-60", "61-65", "66-70", "71-75"];
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

const SYSTEM_PROMPT = `You are a visual analyst. Given an image (typically a before/after pair showing a body zone), identify the body zone AND the demographic of the person shown.

For the body zone, pick the closest match from these keys:
- full_face_front: full face front view
- face_profile: 3-quarter or side profile of the face
- eye_area: macro on one eye including the area around it
- forehead: tight crop on forehead between brows and hairline
- neck_decolletage: neck and upper chest with chin/jaw visible
- cheek_closeup: macro on cheek
- arm_skin: arm skin texture macro
- hands: back of hand or wrist
- hair_scalp: top-down or 3/4 view of the hair parting / scalp
- leg_thigh: macro on the upper thigh or knee skin
- chest_macro: macro on decolletage skin only, no face visible, top edge of clothing visible

If no zone matches well, return "other".

For the demographic of the person in the source:
- age: one of ${AGE_RANGES.join(", ")} (pick the closest range to the person's apparent age)
- ethnicity: one of ${ETHNICITIES.join(", ")} (pick the closest match based on visible features)
- hair_color: short free-text describing hair color (e.g. "natural blonde", "dark brunette", "silver-grey", "salt-and-pepper", "black", "auburn"). If hair is not clearly visible, return null.

If you cannot reliably determine a demographic field (e.g. body-part macro with no face), return null for that field.

Return ONLY a JSON object with this shape - no markdown fences, no commentary:

{
  "zone": "<one of the zone keys above or 'other'>",
  "demographic": {
    "age": "<one of the age ranges, or null>",
    "ethnicity": "<one of the ethnicity keys, or null>",
    "hair_color": "<short hair color phrase, or null>"
  }
}`;

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
      max_tokens: 300,
      temperature: 0.2,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: image_url } },
            { type: "text", text: "Analyze this source image. Return zone + demographic JSON only." },
          ],
        },
      ],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let zone: string | null = null;
    let demographic: {
      age: string | null;
      ethnicity: string | null;
      hair_color: string | null;
    } = { age: null, ethnicity: null, hair_color: null };

    try {
      const parsed = JSON.parse(cleaned);
      const candidate = parsed.zone;
      if (typeof candidate === "string") {
        zone = ZONE_KEYS.includes(candidate as (typeof ZONE_KEYS)[number]) || candidate === "other"
          ? candidate
          : null;
      }
      if (parsed.demographic && typeof parsed.demographic === "object") {
        const d = parsed.demographic;
        demographic = {
          age:
            typeof d.age === "string" && AGE_RANGES.includes(d.age) ? d.age : null,
          ethnicity:
            typeof d.ethnicity === "string" && ETHNICITIES.includes(d.ethnicity)
              ? d.ethnicity
              : null,
          hair_color:
            typeof d.hair_color === "string" && d.hair_color.trim().length > 0
              ? d.hair_color.trim()
              : null,
        };
      }
    } catch {
      zone = null;
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
      metadata: { stage: "detect_zone", detected_zone: zone, detected_demographic: demographic },
    });

    return NextResponse.json({ zone, demographic });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[detect-zone] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
