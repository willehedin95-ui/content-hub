import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { createImageTask, pollTaskResult } from "@/lib/kie";
import { KIE_IMAGE_COST } from "@/lib/pricing";

export const maxDuration = 800;

const ASPECT_RATIO = "16:9";
const RESOLUTION = "1K";
const POLL_TIMEOUT_MS = 720_000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { prompt, image_url, edit_instructions } = body as {
    prompt?: string;
    image_url?: string;
    edit_instructions?: string;
  };

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  let finalPrompt = prompt;
  if (edit_instructions?.trim()) {
    try {
      const parsed = JSON.parse(prompt);
      parsed.edit_instructions = edit_instructions.trim();
      finalPrompt = JSON.stringify(parsed);
    } catch {
      finalPrompt = `${prompt}\n\nEDIT INSTRUCTIONS: ${edit_instructions.trim()}`;
    }
  }

  try {
    const referenceImages = image_url ? [image_url] : [];
    const taskId = await createImageTask(finalPrompt, referenceImages, ASPECT_RATIO, RESOLUTION);

    // Log the Kie cost IMMEDIATELY after task creation - the image is paid
    // for once the task exists, so a poll timeout must not hide the spend.
    const db = createServerSupabase();
    await db.from("usage_logs").insert({
      type: "before_after",
      model: "nano-banana-2",
      cost_usd: KIE_IMAGE_COST,
      metadata: {
        task_id: taskId,
        aspect_ratio: ASPECT_RATIO,
        resolution: RESOLUTION,
        is_retry: true,
        has_source: Boolean(image_url),
        has_edits: Boolean(edit_instructions?.trim()),
      },
    });

    const result = await pollTaskResult(taskId, POLL_TIMEOUT_MS);

    if (result.urls.length === 0) {
      return NextResponse.json({ error: "No image generated" }, { status: 500 });
    }

    return NextResponse.json({ image_url: result.urls[0], prompt_used: finalPrompt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[before-after/regenerate] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
