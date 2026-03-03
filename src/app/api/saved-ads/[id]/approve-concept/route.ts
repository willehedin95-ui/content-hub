import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

// POST /api/saved-ads/[id]/approve-concept — create image_job from approved proposal
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json();
  const { proposal, product, target_languages, target_ratios } = body;

  if (!proposal || !product) {
    return NextResponse.json(
      { error: "proposal and product are required" },
      { status: 400 }
    );
  }

  if (
    !proposal.concept_name ||
    !proposal.cash_dna ||
    !Array.isArray(proposal.ad_copy_primary)
  ) {
    return NextResponse.json(
      { error: "Invalid proposal structure" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();

  // Verify the saved ad exists
  const { data: ad, error: adErr } = await db
    .from("saved_ads")
    .select("id")
    .eq("id", id)
    .single();

  if (adErr || !ad) {
    return safeError(adErr ?? new Error("Not found"), "Saved ad not found", 404);
  }

  try {
    // Get next concept number
    const { data: lastJob } = await db
      .from("image_jobs")
      .select("concept_number")
      .not("concept_number", "is", null)
      .order("concept_number", { ascending: false })
      .limit(1)
      .single();

    const nextNumber = (lastJob?.concept_number ?? 0) + 1;

    // Build tags
    const tags = [
      ...(proposal.suggested_tags ?? []),
      "saved-ad-generated",
    ];

    // Create the image_job
    const { data: job, error: jobErr } = await db
      .from("image_jobs")
      .insert({
        name: proposal.concept_name,
        product,
        status: "draft",
        target_languages: target_languages ?? ["sv", "da", "no"],
        target_ratios: target_ratios ?? ["1:1"],
        concept_number: nextNumber,
        tags,
        cash_dna: proposal.cash_dna,
        ad_copy_primary: proposal.ad_copy_primary,
        ad_copy_headline: proposal.ad_copy_headline ?? [],
        visual_direction: proposal.visual_direction ?? null,
        source_spy_ad_id: null,
      })
      .select()
      .single();

    if (jobErr || !job) {
      return safeError(
        jobErr ?? new Error("Failed to create job"),
        "Failed to create concept"
      );
    }

    // Auto-populate hook library from approved concept
    const cashDna = proposal.cash_dna as { hooks?: string[]; awareness_level?: string; angle?: string } | null;
    const conceptHooks = cashDna?.hooks || [];
    const conceptHeadlines = proposal.ad_copy_headline || [];
    const hookRows = [
      ...conceptHooks.map((h: string) => ({ hook_text: h.trim(), hook_type: "hook", product, awareness_level: cashDna?.awareness_level || null, angle: cashDna?.angle || null, source: "concept_auto", status: "unreviewed" })),
      ...conceptHeadlines.map((h: string) => ({ hook_text: h.trim(), hook_type: "hook", product, awareness_level: cashDna?.awareness_level || null, angle: cashDna?.angle || null, source: "concept_auto", status: "unreviewed" })),
    ];
    if (hookRows.length > 0) {
      await db.from("hook_library").upsert(hookRows, { ignoreDuplicates: true });
    }

    return NextResponse.json({
      job_id: job.id,
      concept_number: nextNumber,
    });
  } catch (err) {
    return safeError(err, "Failed to create concept");
  }
}
