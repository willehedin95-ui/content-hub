import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";
import { calculateAvailableBudget, getLaunchpadConcepts } from "@/lib/pipeline";

// GET: Fetch launch pad concepts + budget info
export async function GET() {
  const [concepts, budgets] = await Promise.all([
    getLaunchpadConcepts(),
    calculateAvailableBudget(),
  ]);
  return NextResponse.json({ concepts, budgets });
}

// POST: Add concept to launch pad
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Support both new { conceptId, type } and legacy { imageJobId }
  const conceptId: string | undefined = body.conceptId ?? body.imageJobId;
  const type: "image" | "video" = body.type ?? "image";

  if (!conceptId) return NextResponse.json({ error: "conceptId required" }, { status: 400 });

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  if (type === "video") {
    // --- Video concept validation ---
    const { data: job } = await db
      .from("video_jobs")
      .select("id, concept_name, product, target_languages, landing_page_id, landing_page_url, ab_test_id, ad_copy_primary")
      .eq("id", conceptId)
      .eq("workspace_id", workspaceId)
      .single();

    if (!job) return NextResponse.json({ error: "Video concept not found" }, { status: 404 });

    const errors: string[] = [];
    if (!job.product) errors.push("Product not set");
    if (!job.landing_page_id && !job.landing_page_url && !job.ab_test_id) errors.push("No landing page or A/B test selected");
    if (!job.ad_copy_primary || job.ad_copy_primary.length === 0) errors.push("No ad copy");

    // Check for completed video translations (captioned or raw)
    const { data: translations } = await db
      .from("video_translations")
      .select("id, language, status, captioned_video_url, video_url")
      .eq("video_job_id", conceptId);

    const hasCompletedVideos = (translations ?? []).some(
      (t) => t.status === "completed" && (t.captioned_video_url || t.video_url)
    );
    if (!hasCompletedVideos) errors.push("No completed video translations");

    if (errors.length > 0) {
      return NextResponse.json({ error: "Concept not ready", details: errors }, { status: 422 });
    }

    // Get next priority number (check both tables)
    const [{ data: maxImagePriority }, { data: maxVideoPriority }] = await Promise.all([
      db.from("image_jobs")
        .select("launchpad_priority")
        .not("launchpad_priority", "is", null)
        .order("launchpad_priority", { ascending: false })
        .limit(1)
        .single(),
      db.from("video_jobs")
        .select("launchpad_priority")
        .not("launchpad_priority", "is", null)
        .order("launchpad_priority", { ascending: false })
        .limit(1)
        .single(),
    ]);

    const nextPriority = Math.max(maxImagePriority?.launchpad_priority ?? 0, maxVideoPriority?.launchpad_priority ?? 0) + 1;

    // Build per-market priorities from target_languages
    const LANG_TO_MKT: Record<string, string> = { sv: "SE", da: "DK", no: "NO", de: "DE" };
    const marketPriorities: Record<string, number> = {};
    for (const lang of (job.target_languages as string[]) ?? []) {
      const mkt = LANG_TO_MKT[lang];
      if (mkt) marketPriorities[mkt] = nextPriority;
    }

    // Set launchpad_priority (no concept_lifecycle for videos — stage derived from meta_campaigns)
    await db
      .from("video_jobs")
      .update({ launchpad_priority: nextPriority, launchpad_market_priorities: marketPriorities })
      .eq("id", conceptId);

    return NextResponse.json({ success: true, priority: nextPriority });
  }

  // --- Image concept (original logic) ---
  const { data: job } = await db
    .from("image_jobs")
    .select("id, name, product, source, target_languages, landing_page_id, ab_test_id, ad_copy_primary")
    .eq("id", conceptId)
    .eq("workspace_id", workspaceId)
    .single();

  if (!job) return NextResponse.json({ error: "Concept not found" }, { status: 404 });

  const errors: string[] = [];
  if (!job.product) errors.push("Product not set");
  if (!job.landing_page_id && !job.ab_test_id) errors.push("No landing page or A/B test selected");
  if (!job.ad_copy_primary || job.ad_copy_primary.length === 0) errors.push("No ad copy");

  if (errors.length > 0) {
    return NextResponse.json({ error: "Concept not ready", details: errors }, { status: 422 });
  }

  // Get next priority number (check both tables)
  const [{ data: maxImagePriority }, { data: maxVideoPriority }] = await Promise.all([
    db.from("image_jobs")
      .select("launchpad_priority")
      .not("launchpad_priority", "is", null)
      .order("launchpad_priority", { ascending: false })
      .limit(1)
      .single(),
    db.from("video_jobs")
      .select("launchpad_priority")
      .not("launchpad_priority", "is", null)
      .order("launchpad_priority", { ascending: false })
      .limit(1)
      .single(),
  ]);

  const nextPriority = Math.max(maxImagePriority?.launchpad_priority ?? 0, maxVideoPriority?.launchpad_priority ?? 0) + 1;

  // Set launchpad_priority
  await db
    .from("image_jobs")
    .update({ launchpad_priority: nextPriority })
    .eq("id", conceptId);

  // Create launchpad lifecycle entries per market
  const { data: markets } = await db
    .from("image_job_markets")
    .select("id")
    .eq("image_job_id", conceptId);

  const now = new Date().toISOString();
  for (const market of markets ?? []) {
    const { data: existing } = await db
      .from("concept_lifecycle")
      .select("stage")
      .eq("image_job_market_id", market.id)
      .is("exited_at", null)
      .single();

    if (!existing) {
      await db.from("concept_lifecycle").insert({
        image_job_market_id: market.id,
        stage: "launchpad",
        entered_at: now,
        signal: "user_added_to_launchpad",
      });
    }
  }

  // Set per-market launchpad priorities
  const { data: marketRows } = await db
    .from("image_job_markets")
    .select("id, market")
    .eq("image_job_id", conceptId);

  for (const row of marketRows ?? []) {
    const { data: maxPrio } = await db
      .from("image_job_markets")
      .select("launchpad_priority")
      .eq("market", row.market)
      .not("launchpad_priority", "is", null)
      .order("launchpad_priority", { ascending: false })
      .limit(1)
      .single();

    await db
      .from("image_job_markets")
      .update({ launchpad_priority: (maxPrio?.launchpad_priority ?? 0) + 1 })
      .eq("id", row.id);
  }

  return NextResponse.json({ success: true, priority: nextPriority });
}

// DELETE: Remove concept from launch pad
export async function DELETE(req: NextRequest) {
  const body = await req.json();

  // Support both new { conceptId, type } and legacy { imageJobId }
  const conceptId: string | undefined = body.conceptId ?? body.imageJobId;
  const type: "image" | "video" = body.type ?? "image";

  if (!conceptId) return NextResponse.json({ error: "conceptId required" }, { status: 400 });

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const now = new Date().toISOString();

  if (type === "video") {
    // Just clear the priority — no concept_lifecycle for videos
    await db
      .from("video_jobs")
      .update({ launchpad_priority: null, launchpad_market_priorities: null })
      .eq("id", conceptId)
      .eq("workspace_id", workspaceId);

    return NextResponse.json({ success: true });
  }

  // Image concept (original logic)
  await db
    .from("image_jobs")
    .update({ launchpad_priority: null })
    .eq("id", conceptId)
    .eq("workspace_id", workspaceId);

  // Clear per-market priorities
  await db
    .from("image_job_markets")
    .update({ launchpad_priority: null })
    .eq("image_job_id", conceptId);

  const { data: markets } = await db
    .from("image_job_markets")
    .select("id")
    .eq("image_job_id", conceptId);

  for (const market of markets ?? []) {
    await db
      .from("concept_lifecycle")
      .update({ exited_at: now })
      .eq("image_job_market_id", market.id)
      .eq("stage", "launchpad")
      .is("exited_at", null);
  }

  return NextResponse.json({ success: true });
}
