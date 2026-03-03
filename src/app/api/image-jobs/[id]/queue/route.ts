import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { COUNTRY_MAP } from "@/types";

/**
 * GET — Queue status for an image job (per-market positions)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = createServerSupabase();

  // Get target languages for this job
  const { data: job } = await db
    .from("image_jobs")
    .select("target_languages")
    .eq("id", id)
    .single();

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Get all image_job_markets for this job
  const { data: markets } = await db
    .from("image_job_markets")
    .select("id, market")
    .eq("image_job_id", id);

  const marketIds = (markets ?? []).map((m) => m.id);

  // Get active lifecycle records for these markets
  const { data: lifecycles } = marketIds.length > 0
    ? await db
        .from("concept_lifecycle")
        .select("image_job_market_id, stage, entered_at")
        .in("image_job_market_id", marketIds)
        .is("exited_at", null)
    : { data: [] };

  const lifecycleMap = new Map(
    (lifecycles ?? []).map((lc) => [lc.image_job_market_id, lc])
  );

  // Get all queued lifecycle records to calculate positions
  const { data: allQueued } = await db
    .from("concept_lifecycle")
    .select("image_job_market_id, entered_at")
    .eq("stage", "queued")
    .is("exited_at", null)
    .order("entered_at", { ascending: true });

  const queueOrder = (allQueued ?? []).map((q) => q.image_job_market_id);

  // Build per-market status
  const targetMarkets = (job.target_languages as string[]).map(
    (lang: string) => COUNTRY_MAP[lang as keyof typeof COUNTRY_MAP] ?? lang.toUpperCase()
  );

  const result = targetMarkets.map((market: string) => {
    const marketRecord = (markets ?? []).find((m) => m.market === market);
    if (!marketRecord) {
      return { market, status: null as string | null, position: undefined as number | undefined };
    }
    const lifecycle = lifecycleMap.get(marketRecord.id);
    if (!lifecycle) {
      return { market, status: null, position: undefined };
    }
    const position = lifecycle.stage === "queued"
      ? queueOrder.indexOf(marketRecord.id) + 1
      : undefined;
    return { market, status: lifecycle.stage, position };
  });

  return NextResponse.json({ markets: result });
}

/**
 * POST — Add markets to queue
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { markets } = await req.json();

  if (!markets || !Array.isArray(markets) || markets.length === 0) {
    return NextResponse.json({ error: "markets array is required" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Validate job exists and is ready
  const { data: job } = await db
    .from("image_jobs")
    .select("id, status, target_languages")
    .eq("id", id)
    .single();

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const queued: Array<{ market: string; position: number }> = [];

  for (const market of markets) {
    // Upsert image_job_markets record (with meta_campaign_id = NULL)
    const { data: existing } = await db
      .from("image_job_markets")
      .select("id")
      .eq("image_job_id", id)
      .eq("market", market)
      .single();

    let marketId: string;

    if (existing) {
      marketId = existing.id;
    } else {
      const { data: inserted, error } = await db
        .from("image_job_markets")
        .insert({ image_job_id: id, market })
        .select("id")
        .single();

      if (error || !inserted) {
        console.error(`Failed to create market record for ${market}:`, error);
        continue;
      }
      marketId = inserted.id;
    }

    // Check if already in pipeline
    const { data: activeLifecycle } = await db
      .from("concept_lifecycle")
      .select("stage")
      .eq("image_job_market_id", marketId)
      .is("exited_at", null)
      .single();

    if (activeLifecycle) {
      // Already in pipeline, skip
      continue;
    }

    // Create lifecycle record
    await db.from("concept_lifecycle").insert({
      image_job_market_id: marketId,
      stage: "queued",
      entered_at: now,
      signal: "user_queued",
    });

    // Calculate queue position
    const { count } = await db
      .from("concept_lifecycle")
      .select("*", { count: "exact", head: true })
      .eq("stage", "queued")
      .is("exited_at", null);

    queued.push({ market, position: count ?? 1 });
  }

  return NextResponse.json({ queued });
}

/**
 * DELETE — Remove markets from queue
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { markets } = await req.json();

  if (!markets || !Array.isArray(markets) || markets.length === 0) {
    return NextResponse.json({ error: "markets array is required" }, { status: 400 });
  }

  const db = createServerSupabase();

  for (const market of markets) {
    // Find the image_job_markets record
    const { data: marketRecord } = await db
      .from("image_job_markets")
      .select("id, meta_campaign_id")
      .eq("image_job_id", id)
      .eq("market", market)
      .single();

    if (!marketRecord) continue;

    // Delete queued lifecycle record
    await db
      .from("concept_lifecycle")
      .delete()
      .eq("image_job_market_id", marketRecord.id)
      .eq("stage", "queued")
      .is("exited_at", null);

    // If market record has no meta_campaign_id (never pushed), clean it up
    if (!marketRecord.meta_campaign_id) {
      await db
        .from("image_job_markets")
        .delete()
        .eq("id", marketRecord.id);
    }
  }

  return NextResponse.json({ ok: true });
}
