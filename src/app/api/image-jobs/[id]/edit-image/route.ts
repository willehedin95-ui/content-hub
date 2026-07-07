import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import crypto from "crypto";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { generateImage } from "@/lib/kie";
import { STORAGE_BUCKET, KIE_MODEL } from "@/lib/constants";
import { KIE_IMAGE_COST } from "@/lib/pricing";
import { recordActiveVersion } from "@/lib/translation-versions";

export const maxDuration = 800; // the after() edit polls Kie up to 280s; needs headroom

const LANG_NAMES: Record<string, string> = { sv: "Swedish", da: "Danish", no: "Norwegian", de: "German", en: "English" };

// POST /api/image-jobs/[id]/edit-image { source_image_id | translation_id, instruction } —
// user-directed edit of a generated image. Re-renders the SAME image with the user's change
// applied (e.g. "ändra vår till sommar"), keeping layout/product/composition intact, then
// replaces it in place. With source_image_id the original is edited (+ same-language rows
// synced); with translation_id the translated file is edited in its own ratio and language.
//
// The render (Kie, up to ~5 min) runs in the background via after() so the request returns
// immediately - the old synchronous version held the browser on one blocking spinner for
// minutes with no way to leave the page. The client polls the concept until the image updates.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const sourceImageId: string | undefined = body.source_image_id;
  const translationId: string | undefined = body.translation_id;
  const instruction: string = (body.instruction || "").trim();
  const targetId = translationId || sourceImageId;
  if (!isValidUUID(id) || !targetId || !isValidUUID(targetId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  if (instruction.length < 3) {
    return NextResponse.json({ error: "Skriv vad som ska ändras" }, { status: 400 });
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  try {
    const { data: job } = await db
      .from("image_jobs")
      .select("id, source_language, target_ratios")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const srcLang = (job.source_language as string) || "sv";
    // Primary ratio = first target ratio (DB default is ['1:1'] for old jobs, so never hardcode "4:5")
    const primaryRatio = (job.target_ratios as string[] | null)?.[0] ?? "4:5";

    // Resolve the image to edit: a translated file or the source original. These
    // reads run synchronously so a bad id still returns 404 to the caller.
    let editUrl: string;
    let ratio: string = primaryRatio;
    let language: string = LANG_NAMES[srcLang] || "Swedish";
    let translation: { id: string; language: string; aspect_ratio: string; source_image_id: string } | null = null;
    let sourceImage: { id: string } | null = null;

    if (translationId) {
      const { data: tr } = await db
        .from("image_translations")
        .select("id, translated_url, language, aspect_ratio, source_image_id, source_images!inner(job_id)")
        .eq("id", translationId)
        .single();
      const trJobId = (tr?.source_images as unknown as { job_id: string } | null)?.job_id;
      if (!tr?.translated_url || trJobId !== id) {
        return NextResponse.json({ error: "Image not found" }, { status: 404 });
      }
      translation = tr;
      editUrl = tr.translated_url;
      ratio = tr.aspect_ratio || primaryRatio;
      language = LANG_NAMES[tr.language] || language;
    } else {
      const { data: si } = await db
        .from("source_images")
        .select("id, original_url")
        .eq("id", sourceImageId)
        .eq("job_id", id)
        .single();
      if (!si) return NextResponse.json({ error: "Image not found" }, { status: 404 });
      sourceImage = si;
      editUrl = si.original_url;
    }

    const prompt = [
      `Edit this ad image. Apply EXACTLY this change requested by the user: "${instruction}".`,
      `Keep everything else identical - same layout, same composition, same product, same people, same colours and same text placement.`,
      `Any text that is added or changed MUST be perfectly spelled, natural ${language} with correct diacritics - never English.`,
      `Do not add or remove any other elements.`,
    ].join("\n");

    // Heavy work (Kie render + storage + DB writes) runs after the response.
    const applyEdit = async () => {
      const { urls, costTimeMs } = await generateImage(prompt, [editUrl], ratio);
      const editedUrl = urls?.[0];
      // Every completed render is a paid Kie call - log it even if unusable below.
      if (editedUrl) {
        await db.from("usage_logs").insert({
          type: "image_generation",
          page_id: null,
          translation_id: null,
          model: KIE_MODEL,
          input_tokens: 0,
          output_tokens: 0,
          cost_usd: KIE_IMAGE_COST,
          metadata: {
            purpose: "image_edit",
            image_job_id: id,
            source_image_id: sourceImage?.id ?? translation?.source_image_id ?? null,
            image_translation_id: translationId ?? null,
            aspect_ratio: ratio,
            kie_cost_time_ms: costTimeMs,
            instruction: instruction.slice(0, 200),
          },
        });
      }
      if (!editedUrl || editedUrl === editUrl) {
        console.warn(`[edit-image] no new image for job ${id} (instruction: ${instruction.slice(0, 80)})`);
        return;
      }

      const img = await fetch(editedUrl);
      if (!img.ok) throw new Error("Failed to download edited image");
      const buffer = Buffer.from(await img.arrayBuffer());
      const filePath = `image-jobs/${id}/${crypto.randomUUID()}.png`;
      const { error: upErr } = await db.storage.from(STORAGE_BUCKET).upload(filePath, buffer, { contentType: "image/png" });
      if (upErr) throw new Error(upErr.message);
      const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
      const newUrl = urlData.publicUrl;

      if (translation) {
        // Record a versions row + repoint active_version_id so version history
        // stays truthful (a bare translated_url update made restore lie).
        await recordActiveVersion(db, translation.id, newUrl, { visualInstructions: instruction });
        // Editing the source-language primary-ratio passthrough = editing the original: keep them in sync.
        if (translation.language === srcLang && (translation.aspect_ratio || primaryRatio) === primaryRatio) {
          await db.from("source_images").update({ original_url: newUrl }).eq("id", translation.source_image_id);
        }
      } else if (sourceImage) {
        await db.from("source_images").update({ original_url: newUrl }).eq("id", sourceImage.id);
        // Keep the same-language primary-ratio passthrough rows in sync, each with a versions row.
        const { data: passthroughRows } = await db
          .from("image_translations")
          .select("id")
          .eq("source_image_id", sourceImage.id)
          .eq("language", srcLang)
          .eq("aspect_ratio", primaryRatio)
          .eq("status", "completed");
        for (const row of passthroughRows ?? []) {
          await recordActiveVersion(db, row.id, newUrl, { visualInstructions: instruction });
        }

        // Remaining siblings (other languages, secondary ratios) still show the
        // pre-edit image. Reset them to pending so they get re-rendered from the
        // edited source - a silent mix of old and new creative must never reach
        // Meta. Only existing completed/failed rows are touched.
        const resetPayload = { status: "pending", error_message: null, updated_at: new Date().toISOString() };
        await db
          .from("image_translations")
          .update(resetPayload)
          .eq("source_image_id", sourceImage.id)
          .neq("language", srcLang)
          .in("status", ["completed", "failed"]);
        await db
          .from("image_translations")
          .update(resetPayload)
          .eq("source_image_id", sourceImage.id)
          .eq("language", srcLang)
          .neq("aspect_ratio", primaryRatio)
          .in("status", ["completed", "failed"]);
      }
    };

    after(() =>
      applyEdit().catch((err) => console.error(`[edit-image] background edit failed for job ${id}:`, err)),
    );

    return NextResponse.json({
      status: "processing",
      message: "Redigering startad - klar om ~2-3 min. Sidan uppdateras automatiskt.",
    });
  } catch (err) {
    return safeError(err, "Edit failed");
  }
}
