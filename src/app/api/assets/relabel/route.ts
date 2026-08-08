import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceSettings } from "@/lib/workspace";
import { KIE_PRO_IMAGE_COST } from "@/lib/pricing";
import { createImageTask, pollTaskResult } from "@/lib/kie";

export const maxDuration = 800;

// Nano Banana Pro renders label text far more faithfully than nano-banana-2,
// and 2K resolution is what makes small label text (e.g. "Innehåller
// sötningsmedel") come out legible instead of garbled. Validated 2026-08-08
// against the Envana relabel test set - do not downgrade either without
// re-testing text fidelity.
const RELABEL_MODEL = "nano-banana-pro";
const RESOLUTION = "2K";

const VALID_RATIOS = ["1:1", "4:5", "5:4", "3:2", "2:3", "16:9", "9:16"] as const;

/** Measure source image and return the closest Kie.ai-supported aspect ratio */
async function detectAspectRatio(imageUrl: string): Promise<string> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return "1:1";
    const buffer = Buffer.from(await res.arrayBuffer());
    const { width, height } = await sharp(buffer).metadata();
    if (!width || !height) return "1:1";

    const actual = width / height;
    let best = "1:1";
    let bestDiff = Infinity;
    for (const ratio of VALID_RATIOS) {
      const [w, h] = ratio.split(":").map(Number);
      const diff = Math.abs(actual - w / h);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = ratio;
      }
    }
    return best;
  } catch {
    return "1:1";
  }
}

function buildRelabelPrompt(textSpec: string | null, notes: string | null): string {
  let prompt = `TASK: Product label replacement (photo edit).
Image 1 is the original photo. Image 2 is a studio packshot of the SAME bottle wearing the NEW label design.
Recreate Image 1 EXACTLY: identical background, lighting, shadows, reflections, camera angle, bottle position, scale and pose, any hands, people, glasses or props completely unchanged. The ONLY change: the bottle now wears the NEW label shown in Image 2 instead of its old label.
The new label occupies exactly the same area of the bottle as the old label, follows the same cylindrical curvature and perspective, and receives the same lighting and shadows as the original photo. If fingers or objects cover part of the label in Image 1, they must still cover the same part of the new label.
Copy the new label's design faithfully from Image 2, including every piece of text exactly as written there. Do not invent, translate, restyle or rearrange any text or graphics. Do not change anything else in the image.`;

  if (textSpec?.trim()) {
    prompt += `\n${textSpec.trim()}`;
  }
  if (notes?.trim()) {
    prompt += `\nAdditional instructions: ${notes.trim()}`;
  }
  return prompt;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { image_url, reference_url, text_spec, notes } = body as {
    image_url?: string;
    reference_url?: string;
    text_spec?: string;
    notes?: string;
  };

  if (!image_url) {
    return NextResponse.json({ error: "image_url is required" }, { status: 400 });
  }

  // Fall back to the workspace's saved relabel settings so the UI only has
  // to configure the reference once.
  const settings = await getWorkspaceSettings();
  const relabelSettings = (settings.relabel ?? {}) as {
    reference_url?: string;
    text_spec?: string;
  };
  const refUrl = reference_url || relabelSettings.reference_url;
  const spec = text_spec ?? relabelSettings.text_spec ?? null;

  if (!refUrl) {
    return NextResponse.json(
      { error: "No label reference configured. Upload a reference image first." },
      { status: 400 }
    );
  }

  const db = createServerSupabase();
  const prompt = buildRelabelPrompt(spec, notes ?? null);

  // Stream NDJSON so the UI gets progress + the Vercel function isn't
  // limited by a single response timeout window.
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  async function emit(data: object) {
    await writer.write(encoder.encode(JSON.stringify(data) + "\n"));
  }

  (async () => {
    try {
      await emit({ step: "generating", message: "Generating relabeled image..." });

      const aspectRatio = await detectAspectRatio(image_url);

      const taskId = await createImageTask(
        prompt,
        [image_url, refUrl],
        aspectRatio,
        RESOLUTION,
        RELABEL_MODEL
      );

      const result = await pollTaskResult(taskId);

      if (result.urls.length === 0) {
        await emit({ step: "error", message: "No image generated" });
        return;
      }

      await db.from("usage_logs").insert({
        type: "relabel",
        model: RELABEL_MODEL,
        cost_usd: KIE_PRO_IMAGE_COST,
        metadata: {
          task_id: taskId,
          aspect_ratio: aspectRatio,
          reference_url: refUrl,
        },
      });

      await emit({
        step: "completed",
        message: "Image generated",
        image_url: result.urls[0],
        aspect_ratio: aspectRatio,
        prompt_used: prompt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[relabel] Error:", msg);
      await emit({ step: "error", message: `Generation failed: ${msg}` });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
