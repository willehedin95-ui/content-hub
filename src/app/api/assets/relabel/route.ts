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

export type RelabelMode = "relabel" | "swap";

/**
 * Relabel mode: our own bottle already in the photo, only the label surface
 * changes. The reference is a packshot of the bottle wearing the new label.
 */
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

/**
 * Swap mode: a DIFFERENT product (competitor, stock photo) is in the photo and
 * gets replaced by our bottle. Unlike relabel, the replacement has different
 * proportions than what it replaces, so hands and contact shadows must adapt
 * rather than stay pixel-identical.
 */
function buildSwapPrompt(textSpec: string | null, notes: string | null): string {
  let prompt = `TASK: Product replacement (photo composite).
Image 1 is the original photo, which features some other brand's product. Image 2 is a studio packshot of OUR product - the exact bottle that must replace it.
Remove the original product completely and put OUR bottle from Image 2 in its place. Everything else in Image 1 stays exactly as it is: the same person, face, skin, hair, clothing, body pose, background, props, camera angle, framing, colour grading and lighting direction.
Placement rules:
- Our bottle occupies the same position in the frame and is held or placed the same way, at a realistic size relative to the hands and body. Our bottle is a tall slim 500 ml cylinder - if the product it replaces had different proportions, adjust the grip and the bottle's footprint so the result looks physically natural, never stretched or squashed to fit the old silhouette.
- Hands must wrap around our bottle correctly: fingers in front where they were in front, thumb where it was, with realistic skin compression at the contact points. Do not leave fingers floating, detached or amputated.
Integration - this is what decides whether the result looks real or pasted:
- Image 2 is a studio packshot. It is a REFERENCE for what the product looks like, never a cut-out to drop into the scene. Re-photograph the bottle inside Image 1's world instead of compositing it.
- Relight it completely with the scene's own light: same direction, same softness, same colour temperature. Highlights on the glossy plastic must fall where the room's light actually is, and the label picks up the same ambient colour cast as everything else.
- The bottle must sit in the same focal plane as whatever it touches. If the photo is soft, slightly grainy or slightly out of focus, the bottle is equally soft and grainy. Never let it be the sharpest, cleanest object in a soft frame - that single mismatch is what reads as fake.
- Ground it with contact: a soft occlusion shadow where fingers wrap the bottle, a cast shadow falling onto the clothing, hand or surface behind it, and darkening in the gaps between fingers and plastic.
- Fingers overlap the bottle's silhouette in front, so the outline is broken by skin rather than being a clean cut-out edge. A faint reflection of the hand and the room appears on the glossy surface.
- Match the photographic character of Image 1 - if it is a casual phone photo keep it casual and grainy, do not upgrade the bottle to a crisp studio render.
Product fidelity:
- Reproduce our bottle exactly as in Image 2: opaque off-white plastic body, white ribbed screw cap, the wraparound label in the same band of the body, same proportions.
- NO dosing cup or measuring cup on top of the cap. Do not add a glass, liquid, box or any prop that is not already in Image 1.
- Copy the label design and every piece of text exactly from Image 2. Do not invent, translate or rearrange any text. No text from the original product may survive anywhere in the image.`;

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
  const { image_url, reference_url, text_spec, notes, mode = "relabel" } = body as {
    image_url?: string;
    reference_url?: string;
    text_spec?: string;
    notes?: string;
    mode?: RelabelMode;
  };

  if (!image_url) {
    return NextResponse.json({ error: "image_url is required" }, { status: 400 });
  }
  if (mode !== "relabel" && mode !== "swap") {
    return NextResponse.json({ error: `Unknown mode "${mode}"` }, { status: 400 });
  }

  // Fall back to the workspace's saved relabel settings so the UI only has
  // to configure the references once. Each mode has its own reference:
  // relabel needs the label packshot, swap needs the full product packshot.
  const settings = await getWorkspaceSettings();
  const relabelSettings = (settings.relabel ?? {}) as {
    reference_url?: string;
    product_url?: string;
    text_spec?: string;
  };
  const savedRef = mode === "swap" ? relabelSettings.product_url : relabelSettings.reference_url;
  const refUrl = reference_url || savedRef;
  const spec = text_spec ?? relabelSettings.text_spec ?? null;

  if (!refUrl) {
    return NextResponse.json(
      {
        error:
          mode === "swap"
            ? "No product packshot configured. Upload one under Product packshot first."
            : "No label reference configured. Upload a reference image first.",
      },
      { status: 400 }
    );
  }

  const db = createServerSupabase();
  const prompt =
    mode === "swap"
      ? buildSwapPrompt(spec, notes ?? null)
      : buildRelabelPrompt(spec, notes ?? null);

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
      await emit({
        step: "generating",
        message: mode === "swap" ? "Swapping in our product..." : "Generating relabeled image...",
      });

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
          mode,
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
