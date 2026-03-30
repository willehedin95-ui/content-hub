import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";

export interface ReviewItem {
  id: string;
  type: "concept" | "iteration" | "video" | "translation_review";
  name: string;
  concept_number: number | null;
  product: string | null;
  workspace: { name: string; slug: string };
  workspace_id: string;
  created_at: string;
  images: Array<{ url: string }>;
  ad_copy?: { primary: string; headline: string };
  source?: string;
  cash_dna?: { angle?: string; awareness_level?: string; hooks?: string[] } | null;
}

// GET /api/review/pending — cross-workspace pending items
export async function GET() {
  const db = createServerSupabase();

  // Fetch all workspaces for lookup
  const { data: workspaces } = await db.from("workspaces").select("id, name, slug");
  const wsMap = new Map((workspaces ?? []).map((w) => [w.id, { name: w.name, slug: w.slug }]));

  // Get IDs of concepts already pushed to Meta (have meta_campaigns records)
  // These should NOT appear in the review feed even though launchpad_priority is null
  const { data: pushedConcepts } = await db
    .from("meta_campaigns")
    .select("image_job_id")
    .not("image_job_id", "is", null);
  const pushedIds = new Set((pushedConcepts ?? []).map((c) => c.image_job_id as string));

  // Also get IDs of concepts that have been on launchpad before (have concept_lifecycle records)
  // This catches concepts that were approved, pushed, and had launchpad_priority cleared
  const { data: lifecycleJobs } = await db
    .from("concept_lifecycle")
    .select("image_job_market_id, image_job_markets!inner(image_job_id)")
    .eq("stage", "launchpad");
  const hadLifecycle = new Set(
    (lifecycleJobs ?? []).map((l) => {
      const m = l.image_job_markets as unknown as { image_job_id: string };
      return m?.image_job_id;
    }).filter(Boolean)
  );

  // 1. Pending autopilot/competitor-swipe concepts
  const { data: pendingConcepts } = await db
    .from("image_jobs")
    .select(`
      id, name, concept_number, product, status, source,
      ad_copy_primary, ad_copy_headline, cash_dna,
      landing_page_id, target_languages, workspace_id, created_at,
      source_images(id, original_url)
    `)
    .in("source", ["autopilot", "competitor_swipe"])
    .is("launchpad_priority", null)
    .is("archived_at", null)
    .neq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(50);

  // 2. Pending creative iterations
  const { data: pendingIterations } = await db
    .from("image_jobs")
    .select(`
      id, name, concept_number, product, source,
      ad_copy_primary, ad_copy_headline, cash_dna,
      workspace_id, created_at,
      source_images(id, original_url)
    `)
    .not("iteration_of", "is", null)
    .is("launchpad_priority", null)
    .is("archived_at", null)
    .neq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(20);

  // 3. Pending video concepts
  const { data: pendingVideos } = await db
    .from("video_jobs")
    .select(`
      id, concept_name, concept_number, product, status,
      ad_copy_primary, ad_copy_headline,
      target_languages, workspace_id, created_at,
      video_shots(id, shot_number, image_url)
    `)
    .is("launchpad_priority", null)
    .neq("status", "killed")
    .in("status", ["generated", "draft"])
    .order("created_at", { ascending: false })
    .limit(20);

  // 4. Translation quality reviews
  const { data: translationReviews } = await db
    .from("image_jobs")
    .select(`
      id, name, concept_number, product, ad_copy_translations,
      workspace_id, created_at,
      source_images(id, original_url)
    `)
    .not("ad_copy_translations", "is", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  // Filter for items that actually have status="review" in any language
  const filteredReviews = (translationReviews ?? []).filter((job) => {
    const translations = job.ad_copy_translations as Record<string, { status?: string }> | null;
    if (!translations) return false;
    return Object.values(translations).some((t) => t.status === "review");
  });

  // Deduplicate: remove items from concepts/iterations that also appear in translation reviews
  const reviewJobIds = new Set(filteredReviews.map((r) => r.id));

  // Build unified items array
  const items: ReviewItem[] = [];

  for (const c of pendingConcepts ?? []) {
    if (reviewJobIds.has(c.id)) continue; // will show as translation_review instead
    if (pushedIds.has(c.id)) continue; // already live on Meta
    if (hadLifecycle.has(c.id)) continue; // was on launchpad before (approved + pushed)
    const imgs = (c.source_images as Array<{ id: string; original_url: string }>) ?? [];
    const ws = wsMap.get(c.workspace_id) ?? { name: "Unknown", slug: "unknown" };
    items.push({
      id: c.id,
      type: "concept",
      name: c.name,
      concept_number: c.concept_number,
      product: c.product,
      workspace: ws,
      workspace_id: c.workspace_id,
      created_at: c.created_at,
      images: imgs.slice(0, 4).map((i) => ({ url: i.original_url })),
      ad_copy: c.ad_copy_headline || c.ad_copy_primary
        ? { primary: arrayToString(c.ad_copy_primary), headline: arrayToString(c.ad_copy_headline) }
        : undefined,
      source: c.source,
      cash_dna: c.cash_dna as ReviewItem["cash_dna"],
    });
  }

  for (const c of pendingIterations ?? []) {
    if (reviewJobIds.has(c.id)) continue;
    if (pushedIds.has(c.id)) continue;
    if (hadLifecycle.has(c.id)) continue;
    const imgs = (c.source_images as Array<{ id: string; original_url: string }>) ?? [];
    const ws = wsMap.get(c.workspace_id) ?? { name: "Unknown", slug: "unknown" };
    items.push({
      id: c.id,
      type: "iteration",
      name: c.name,
      concept_number: c.concept_number,
      product: c.product,
      workspace: ws,
      workspace_id: c.workspace_id,
      created_at: c.created_at,
      images: imgs.slice(0, 4).map((i) => ({ url: i.original_url })),
      source: c.source,
      cash_dna: c.cash_dna as ReviewItem["cash_dna"],
    });
  }

  for (const v of pendingVideos ?? []) {
    const shots = (v.video_shots as Array<{ id: string; shot_number: number; image_url: string | null }>) ?? [];
    const shotsWithImages = shots.filter((s) => s.image_url);
    if (shotsWithImages.length === 0) continue; // Skip videos with no keyframe images
    const ws = wsMap.get(v.workspace_id) ?? { name: "Unknown", slug: "unknown" };
    items.push({
      id: v.id,
      type: "video",
      name: v.concept_name,
      concept_number: v.concept_number,
      product: v.product,
      workspace: ws,
      workspace_id: v.workspace_id,
      created_at: v.created_at,
      images: shots
        .filter((s) => s.image_url)
        .sort((a, b) => a.shot_number - b.shot_number)
        .slice(0, 4)
        .map((s) => ({ url: s.image_url! })),
      ad_copy: v.ad_copy_headline || v.ad_copy_primary
        ? { primary: arrayToString(v.ad_copy_primary), headline: arrayToString(v.ad_copy_headline) }
        : undefined,
    });
  }

  for (const r of filteredReviews) {
    const imgs = (r.source_images as Array<{ id: string; original_url: string }>) ?? [];
    const ws = wsMap.get(r.workspace_id) ?? { name: "Unknown", slug: "unknown" };
    // Count languages with review status
    const translations = r.ad_copy_translations as Record<string, { status?: string }>;
    const reviewLangs = Object.entries(translations)
      .filter(([, t]) => t.status === "review")
      .map(([lang]) => lang);

    items.push({
      id: r.id,
      type: "translation_review",
      name: `${r.name} (${reviewLangs.join(", ")})`,
      concept_number: r.concept_number,
      product: r.product,
      workspace: ws,
      workspace_id: r.workspace_id,
      created_at: r.created_at,
      images: imgs.slice(0, 4).map((i) => ({ url: i.original_url })),
    });
  }

  // Sort by created_at descending
  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const counts = {
    concepts: items.filter((i) => i.type === "concept").length,
    iterations: items.filter((i) => i.type === "iteration").length,
    videos: items.filter((i) => i.type === "video").length,
    translations: items.filter((i) => i.type === "translation_review").length,
    total: items.length,
  };

  return NextResponse.json({ items, counts });
}

function arrayToString(val: unknown): string {
  if (Array.isArray(val)) return val[0] ?? "";
  if (typeof val === "string") return val;
  return "";
}
