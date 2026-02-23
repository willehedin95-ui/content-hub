import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { STORAGE_BUCKET } from "@/lib/constants";
import { computeCounts } from "@/lib/image-utils";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const db = createServerSupabase();
  const url = new URL(_req.url);
  const compact = url.searchParams.get("compact") === "true";

  // Compact mode: skip full version history, only fetch active versions
  const select = compact
    ? `*, source_images(*, image_translations(*, versions!inner(*)))`
    : `*, source_images(*, image_translations(*, versions(*)))`;

  let { data: job, error } = compact
    ? await db
        .from("image_jobs")
        .select(select)
        .eq("id", id)
        .eq("source_images.image_translations.versions.is_active", true)
        .single()
    : await db
        .from("image_jobs")
        .select(select)
        .eq("id", id)
        .single();

  // Fall back to query without versions if table doesn't exist yet
  if (error && error.message?.includes("versions")) {
    const fallback = await db
      .from("image_jobs")
      .select(`*, source_images(*, image_translations(*))`)
      .eq("id", id)
      .single();
    job = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return safeError(error, "Failed to fetch image job", 404);
  }

  // Compute aggregated counts
  return NextResponse.json(computeCounts(job));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const body = await req.json();
  const { status, target_languages, ad_copy_primary, ad_copy_headline, landing_page_id, ab_test_id, concept_number, ad_copy_doc_id, marked_ready_at, tags, ad_copy_translations } = body as {
    status?: string;
    target_languages?: string[];
    ad_copy_primary?: string[];
    ad_copy_headline?: string[];
    landing_page_id?: string | null;
    ab_test_id?: string | null;
    concept_number?: number | null;
    ad_copy_doc_id?: string | null;
    marked_ready_at?: string | null;
    tags?: string[];
    ad_copy_translations?: Record<string, unknown>;
  };

  const db = createServerSupabase();

  const updateData: {
    updated_at: string;
    status?: string;
    target_languages?: string[];
    ad_copy_primary?: string[];
    ad_copy_headline?: string[];
    landing_page_id?: string | null;
    ab_test_id?: string | null;
    concept_number?: number | null;
    ad_copy_doc_id?: string | null;
    marked_ready_at?: string | null;
    tags?: string[];
    ad_copy_translations?: Record<string, unknown>;
  } = { updated_at: new Date().toISOString() };
  if (status) updateData.status = status;
  if (target_languages) updateData.target_languages = target_languages;
  if (ad_copy_primary !== undefined) updateData.ad_copy_primary = ad_copy_primary;
  if (ad_copy_headline !== undefined) updateData.ad_copy_headline = ad_copy_headline;
  if (landing_page_id !== undefined) updateData.landing_page_id = landing_page_id;
  if (ab_test_id !== undefined) updateData.ab_test_id = ab_test_id;
  if (concept_number !== undefined) updateData.concept_number = concept_number;
  if (ad_copy_doc_id !== undefined) updateData.ad_copy_doc_id = ad_copy_doc_id;
  if (marked_ready_at !== undefined) updateData.marked_ready_at = marked_ready_at;
  if (tags !== undefined) updateData.tags = tags;
  if (ad_copy_translations !== undefined) updateData.ad_copy_translations = ad_copy_translations;

  const { data, error } = await db
    .from("image_jobs")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to update image job");
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const db = createServerSupabase();

  // Clean up storage files (nested: image-jobs/{id}/{translationId}/{file}.png)
  const { data: subfolders } = await db.storage
    .from(STORAGE_BUCKET)
    .list(`image-jobs/${id}`);

  const allPaths: string[] = [];
  for (const item of subfolders ?? []) {
    const prefix = `image-jobs/${id}/${item.name}`;
    if (!item.id) {
      // It's a folder — list its contents
      const { data: nested } = await db.storage
        .from(STORAGE_BUCKET)
        .list(prefix);
      for (const file of nested ?? []) {
        allPaths.push(`${prefix}/${file.name}`);
      }
    } else {
      // It's a file at this level
      allPaths.push(prefix);
    }
  }

  if (allPaths.length) {
    await db.storage.from(STORAGE_BUCKET).remove(allPaths);
  }

  // Delete job (CASCADE handles source_images and image_translations)
  const { error } = await db.from("image_jobs").delete().eq("id", id);

  if (error) {
    return safeError(error, "Failed to delete image job");
  }

  return NextResponse.json({ success: true });
}
