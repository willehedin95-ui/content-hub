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
] as const;

const SYSTEM_PROMPT = `You are a visual analyst. Given an image (typically a before/after pair showing a body zone), identify which body zone is the focus.

Pick the closest match from these keys:
- full_face_front: full face front view
- face_profile: 3-quarter or side profile of the face
- eye_area: macro on one eye including crow's feet area
- forehead: tight crop on forehead between brows and hairline
- neck_decolletage: neck and upper chest
- cheek_closeup: macro on cheek
- arm_skin: arm skin texture
- hands: back of hand or wrist

If none match well, return "other".

Return ONLY a JSON object with this shape - no markdown fences, no commentary:

{"zone": "<one of the keys above or 'other'>"}`;

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
      max_tokens: 100,
      temperature: 0.2,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "url", url: image_url } },
            { type: "text", text: "Which body zone is this? Return JSON only." },
          ],
        },
      ],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    let zone: string | null = null;
    try {
      const parsed = JSON.parse(cleaned);
      const candidate = parsed.zone;
      if (typeof candidate === "string") {
        zone = ZONE_KEYS.includes(candidate as (typeof ZONE_KEYS)[number]) || candidate === "other"
          ? candidate
          : null;
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
      metadata: { stage: "detect_zone", detected_zone: zone },
    });

    return NextResponse.json({ zone });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[detect-zone] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
