import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { VIDEO_STORAGE_BUCKET } from "@/lib/constants";
import { getWorkspaceId } from "@/lib/workspace";

export const maxDuration = 120;

/**
 * GET: Return a signed upload URL so the client can upload directly to
 * Supabase Storage (bypasses Vercel's 4.5MB serverless body limit).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const language = req.nextUrl.searchParams.get("language") || null;
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("product")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (jobError || !job) return safeError(jobError, "Video job not found", 404);

  const storagePath = language
    ? `${job.product}/${id}/stitched-${language}.mp4`
    : `${job.product}/${id}/stitched.mp4`;

  const { data: signedUrl, error: signError } = await db.storage
    .from(VIDEO_STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: true });

  if (signError || !signedUrl) {
    return safeError(signError, "Failed to create signed upload URL");
  }

  return NextResponse.json({
    signed_url: signedUrl.signedUrl,
    token: signedUrl.token,
    path: signedUrl.path,
    storage_path: storagePath,
  });
}

/**
 * POST: Finalize the upload — update DB records after the client uploaded
 * directly to Supabase Storage via the signed URL.
 *
 * Expects JSON body: { language?: string, storage_path: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data: job, error: jobError } = await db
    .from("video_jobs")
    .select("product, target_languages")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (jobError || !job) return safeError(jobError, "Video job not found", 404);

  const body = await req.json().catch(() => ({}));
  const language: string | null = body.language || null;
  const storagePath: string | null = body.storage_path || null;

  if (!storagePath) {
    return NextResponse.json({ error: "storage_path is required" }, { status: 400 });
  }

  const { data: publicUrl } = db.storage
    .from(VIDEO_STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  const videoUrl = publicUrl.publicUrl;

  // Update job status
  await db
    .from("video_jobs")
    .update({ status: "generated" })
    .eq("id", id);

  // If a specific language is provided, only update that language's translation.
  // Otherwise update all target languages (backward compat for VideoStitcher).
  const languages: string[] = language ? [language] : (job.target_languages ?? []);
  for (const lang of languages) {
    const { data: existing } = await db
      .from("video_translations")
      .select("id")
      .eq("video_job_id", id)
      .eq("language", lang)
      .single();

    if (existing) {
      await db
        .from("video_translations")
        .update({ video_url: videoUrl, status: "completed" })
        .eq("id", existing.id);
    } else {
      await db.from("video_translations").insert({
        video_job_id: id,
        language: lang,
        video_url: videoUrl,
        status: "completed",
      });
    }
  }

  return NextResponse.json({ video_url: videoUrl });
}
