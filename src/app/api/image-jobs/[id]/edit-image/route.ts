import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { generateImage } from "@/lib/kie";
import { STORAGE_BUCKET } from "@/lib/constants";

export const maxDuration = 180;

const LANG_NAMES: Record<string, string> = { sv: "Swedish", da: "Danish", no: "Norwegian", de: "German", en: "English" };

// POST /api/image-jobs/[id]/edit-image { source_image_id, instruction } — user-directed edit of a
// generated image. Re-renders the SAME image with the user's change applied (e.g. "ändra vår till
// sommar"), keeping layout/product/composition intact, then replaces it in place (same flow as the
// QA text-fix, including the same-language passthrough sync).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const sourceImageId: string = body.source_image_id;
  const instruction: string = (body.instruction || "").trim();
  if (!isValidUUID(id) || !isValidUUID(sourceImageId)) {
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
      .select("id, source_language")
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

    const language = LANG_NAMES[(job.source_language as string) || "sv"] || "Swedish";
    const prompt = [
      `Edit this ad image. Apply EXACTLY this change requested by the user: "${instruction}".`,
      `Keep everything else identical - same layout, same composition, same product, same people, same colours and same text placement.`,
      `Any text that is added or changed MUST be perfectly spelled, natural ${language} with correct diacritics (å, ä, ö) - never English.`,
      `Do not add or remove any other elements.`,
    ].join("\n");

    const { urls } = await generateImage(prompt, [si.original_url], "4:5");
    const editedUrl = urls?.[0];
    if (!editedUrl || editedUrl === si.original_url) {
      return NextResponse.json({ status: "failed", message: "Redigeringen gav ingen ny bild - försök igen eller omformulera." });
    }

    const img = await fetch(editedUrl);
    if (!img.ok) throw new Error("Failed to download edited image");
    const buffer = Buffer.from(await img.arrayBuffer());
    const filePath = `image-jobs/${id}/${crypto.randomUUID()}.png`;
    const { error: upErr } = await db.storage.from(STORAGE_BUCKET).upload(filePath, buffer, { contentType: "image/png" });
    if (upErr) throw new Error(upErr.message);
    const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

    await db.from("source_images").update({ original_url: urlData.publicUrl }).eq("id", si.id);
    // Keep the same-language passthrough row in sync (same as qa-image).
    const srcLang = job.source_language as string | null;
    if (srcLang) {
      await db
        .from("image_translations")
        .update({ translated_url: urlData.publicUrl })
        .eq("source_image_id", si.id)
        .eq("language", srcLang)
        .eq("status", "completed");
    }

    return NextResponse.json({ status: "edited", message: "Bilden uppdaterad.", new_url: urlData.publicUrl });
  } catch (err) {
    return safeError(err, "Edit failed");
  }
}
