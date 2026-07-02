import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { qaImage, correctImageText } from "@/lib/image-quality";
import { getProductAppearance } from "@/lib/product-appearance";
import { STORAGE_BUCKET } from "@/lib/constants";

export const maxDuration = 180;

const LANG_NAMES: Record<string, string> = { sv: "Swedish", da: "Danish", no: "Norwegian", de: "German", en: "English" };

// POST /api/image-jobs/[id]/qa-image { source_image_id } — manually QA one image.
// If the only problem is bad text -> run the text-correction pass and replace the image in place.
// Otherwise return the issues so the user can re-roll/delete.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const sourceImageId: string = body.source_image_id;
  if (!isValidUUID(id) || !isValidUUID(sourceImageId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  try {
    const { data: job } = await db
      .from("image_jobs")
      .select("id, product, source_language, target_languages")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const { data: si } = await db
      .from("source_images")
      .select("id, original_url")
      .eq("id", sourceImageId)
      .eq("job_id", id)
      .single();
    if (!si) return NextResponse.json({ error: "Image not found" }, { status: 404 });

    const { data: product } = await db.from("products").select("slug, name, description, ingredients").eq("slug", job.product).maybeSingle();
    const language = LANG_NAMES[(job.source_language as string) || "sv"] || "Swedish";
    const appearance = product ? getProductAppearance(product) : undefined;

    const qa = await qaImage(si.original_url, { language, productAppearance: appearance });

    if (qa.ok) {
      return NextResponse.json({ status: "ok", message: "Ser bra ut - inga problem hittade." });
    }

    if (!qa.textOnly) {
      return NextResponse.json({
        status: "issues",
        message: `Problem som inte kan text-fixas: ${qa.issues.join("; ")}. Kör om bilden (re-roll) eller radera.`,
        issues: qa.issues,
      });
    }

    // Text-only problems -> correction pass, then persist the fixed image in place.
    const fixedUrl = await correctImageText(si.original_url, language, "4:5");
    if (fixedUrl === si.original_url) {
      return NextResponse.json({ status: "issues", message: `Text-fix misslyckades: ${qa.issues.join("; ")}`, issues: qa.issues });
    }
    const img = await fetch(fixedUrl);
    if (!img.ok) throw new Error("Failed to download corrected image");
    const buffer = Buffer.from(await img.arrayBuffer());
    const filePath = `image-jobs/${id}/${crypto.randomUUID()}.png`;
    const { error: upErr } = await db.storage.from(STORAGE_BUCKET).upload(filePath, buffer, { contentType: "image/png" });
    if (upErr) throw new Error(upErr.message);
    const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

    await db.from("source_images").update({ original_url: urlData.publicUrl }).eq("id", si.id);
    // Keep the same-language passthrough row in sync.
    const srcLang = job.source_language as string | null;
    if (srcLang) {
      await db
        .from("image_translations")
        .update({ translated_url: urlData.publicUrl })
        .eq("source_image_id", si.id)
        .eq("language", srcLang)
        .eq("status", "completed");
    }

    return NextResponse.json({
      status: "fixed",
      message: `Text fixad (${qa.issues.join("; ")}).`,
      new_url: urlData.publicUrl,
    });
  } catch (err) {
    return safeError(err, "QA failed");
  }
}
