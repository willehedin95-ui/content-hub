import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
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
  const { imageJobId } = await req.json();
  if (!imageJobId) return NextResponse.json({ error: "imageJobId required" }, { status: 400 });

  const db = createServerSupabase();

  // Validate concept exists and is ready
  const { data: job } = await db
    .from("image_jobs")
    .select("id, name, product, source, target_languages, landing_page_id, ab_test_id, ad_copy_primary")
    .eq("id", imageJobId)
    .single();

  if (!job) return NextResponse.json({ error: "Concept not found" }, { status: 404 });

  const errors: string[] = [];
  if (!job.product) errors.push("Product not set");
  if (!job.landing_page_id && !job.ab_test_id) errors.push("No landing page or A/B test selected");
  if (!job.ad_copy_primary || job.ad_copy_primary.length === 0) errors.push("No ad copy");

  if (errors.length > 0) {
    return NextResponse.json({ error: "Concept not ready", details: errors }, { status: 422 });
  }

  // Get next priority number
  const { data: maxPriority } = await db
    .from("image_jobs")
    .select("launchpad_priority")
    .not("launchpad_priority", "is", null)
    .order("launchpad_priority", { ascending: false })
    .limit(1)
    .single();

  const nextPriority = (maxPriority?.launchpad_priority ?? 0) + 1;

  // Set launchpad_priority
  await db
    .from("image_jobs")
    .update({ launchpad_priority: nextPriority })
    .eq("id", imageJobId);

  // Create launchpad lifecycle entries per market
  const { data: markets } = await db
    .from("image_job_markets")
    .select("id")
    .eq("image_job_id", imageJobId);

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

  return NextResponse.json({ success: true, priority: nextPriority });
}

// DELETE: Remove concept from launch pad
export async function DELETE(req: NextRequest) {
  const { imageJobId } = await req.json();
  if (!imageJobId) return NextResponse.json({ error: "imageJobId required" }, { status: 400 });

  const db = createServerSupabase();

  await db
    .from("image_jobs")
    .update({ launchpad_priority: null })
    .eq("id", imageJobId);

  const { data: markets } = await db
    .from("image_job_markets")
    .select("id")
    .eq("image_job_id", imageJobId);

  const now = new Date().toISOString();
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
