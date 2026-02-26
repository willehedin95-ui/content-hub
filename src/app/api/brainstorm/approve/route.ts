import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

// POST /api/brainstorm/approve — create image_job from approved brainstorm proposal
export async function POST(req: NextRequest) {
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
      "brainstorm-generated",
    ];

    // Merge native headlines into ad_copy_headline for unaware/native concepts
    const regularHeadlines: string[] = proposal.ad_copy_headline ?? [];
    const nativeHeadlines: string[] = proposal.native_headlines ?? [];
    const allHeadlines = [...regularHeadlines, ...nativeHeadlines.filter(
      (h: string) => !regularHeadlines.includes(h)
    )];

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
        ad_copy_headline: allHeadlines,
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

    return NextResponse.json({
      job_id: job.id,
      concept_number: nextNumber,
    });
  } catch (err) {
    return safeError(err, "Failed to create concept");
  }
}
