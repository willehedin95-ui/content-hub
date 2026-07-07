import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { STORAGE_BUCKET } from "@/lib/constants";
import { computeCounts } from "@/lib/image-utils";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { asStringArray } from "@/lib/utils";
import { LANGUAGES } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const url = new URL(_req.url);
  const compact = url.searchParams.get("compact") === "true";

  // Compact mode: skip full version history, only fetch active versions.
  // Left join (no !inner) is deliberate: !inner silently dropped translations
  // without an active version (pending/failed/passthrough rows), so the client
  // computed progress/stall logic on truncated data. The is_active filter below
  // only trims the embedded versions array - parent rows are kept.
  const select = `*, source_images(*, image_translations(*, versions(*)))`;

  let { data: job, error } = compact
    ? await db
        .from("image_jobs")
        .select(select)
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .eq("source_images.image_translations.versions.is_active", true)
        .single()
    : await db
        .from("image_jobs")
        .select(select)
        .eq("id", id)
        .eq("workspace_id", workspaceId)
        .single();

  // Fall back to query without versions if table doesn't exist yet
  if (error && error.message?.includes("versions")) {
    const fallback = await db
      .from("image_jobs")
      .select(`*, source_images(*, image_translations(*))`)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
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
  const { status, target_languages, ad_copy_primary, ad_copy_headline, landing_page_id, landing_page_id_b, concept_number, marked_ready_at, tags, ad_copy_translations, cash_dna, visual_direction, source_language } = body as {
    status?: string;
    target_languages?: string[];
    ad_copy_primary?: string[];
    ad_copy_headline?: string[];
    landing_page_id?: string | null;
    landing_page_id_b?: string | null;
    concept_number?: number | null;
    marked_ready_at?: string | null;
    tags?: string[];
    ad_copy_translations?: Record<string, unknown>;
    cash_dna?: Record<string, unknown> | null;
    visual_direction?: string | null;
    source_language?: string;
  };

  // Valid source languages: the target-language codes plus en/de (English
  // originals from freelancers, German static ads) - both appear as
  // source_language across the pipeline even though they are not targets.
  const VALID_SOURCE_LANGUAGES = new Set<string>([...LANGUAGES.map((l) => l.value), "en", "de"]);
  if (source_language !== undefined && !VALID_SOURCE_LANGUAGES.has(source_language)) {
    return NextResponse.json({ error: "Invalid source_language" }, { status: 400 });
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const updateData: {
    updated_at: string;
    status?: string;
    target_languages?: string[];
    ad_copy_primary?: string[];
    ad_copy_headline?: string[];
    landing_page_id?: string | null;
    landing_page_id_b?: string | null;
    concept_number?: number | null;
    marked_ready_at?: string | null;
    tags?: string[];
    ad_copy_translations?: Record<string, unknown>;
    cash_dna?: Record<string, unknown> | null;
    visual_direction?: string | null;
    source_language?: string;
  } = { updated_at: new Date().toISOString() };
  if (status) updateData.status = status;
  if (source_language !== undefined) updateData.source_language = source_language;
  if (target_languages) updateData.target_languages = target_languages;
  // Coerce to string[] at the write boundary - the jsonb columns will accept
  // a bare string, and one such row throws "some is not a function" across the
  // whole Concepts UI (audit 2026-07-07).
  if (ad_copy_primary !== undefined) updateData.ad_copy_primary = asStringArray(ad_copy_primary);
  if (ad_copy_headline !== undefined) updateData.ad_copy_headline = asStringArray(ad_copy_headline);
  if (landing_page_id !== undefined) updateData.landing_page_id = landing_page_id;
  if (landing_page_id_b !== undefined) updateData.landing_page_id_b = landing_page_id_b;
  if (concept_number !== undefined) updateData.concept_number = concept_number;
  if (marked_ready_at !== undefined) updateData.marked_ready_at = marked_ready_at;
  if (tags !== undefined) updateData.tags = tags;
  if (cash_dna !== undefined) updateData.cash_dna = cash_dna;
  if (visual_direction !== undefined) updateData.visual_direction = visual_direction;

  // 2026-04-16: ad_copy_translations is written via atomic JSONB merge RPC
  // to avoid clobbering concurrent writers (autopilot translate, approve,
  // pipeline-push auto-approve). See resilience-audit-2026-04-16.md.
  if (ad_copy_translations !== undefined) {
    const { error: mergeError } = await db.rpc("merge_ad_copy_translations", {
      p_job_id: id,
      p_patch: ad_copy_translations,
    });
    if (mergeError) {
      return safeError(mergeError, "Failed to update translations");
    }
  }

  const { data, error } = await db
    .from("image_jobs")
    .update(updateData)
    .eq("id", id)
    .eq("workspace_id", workspaceId)
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
  const workspaceId = await getWorkspaceId();

  // Verify workspace ownership BEFORE touching anything - storage must never
  // be wiped for a job the caller's workspace doesn't own (audit P2-9).
  const { data: job } = await db
    .from("image_jobs")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Delete job first (CASCADE handles source_images and image_translations)
  const { error } = await db.from("image_jobs").delete().eq("id", id).eq("workspace_id", workspaceId);

  if (error) {
    return safeError(error, "Failed to delete image job");
  }

  // Clean up storage files AFTER the row delete succeeds, best-effort
  // (nested: image-jobs/{id}/{translationId}/{file}.png)
  try {
    const { data: subfolders } = await db.storage
      .from(STORAGE_BUCKET)
      .list(`image-jobs/${id}`);

    const allPaths: string[] = [];
    for (const item of subfolders ?? []) {
      const prefix = `image-jobs/${id}/${item.name}`;
      if (!item.id) {
        // It's a folder - list its contents
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
  } catch (err) {
    console.error(`[image-jobs] Storage cleanup failed for deleted job ${id}:`, err);
  }

  return NextResponse.json({ success: true });
}
