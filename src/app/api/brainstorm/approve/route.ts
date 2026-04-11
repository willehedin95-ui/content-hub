import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId, getWorkspaceLanguages } from "@/lib/workspace";
import { findBestLandingPage } from "@/lib/landing-page-recommender";
import { generateStaticImages } from "@/lib/generate-static-images";

export const maxDuration = 800;

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
  const workspaceId = await getWorkspaceId();

  try {
    // Get next concept number
    const { data: lastJob } = await db
      .from("image_jobs")
      .select("concept_number")
      .eq("workspace_id", workspaceId)
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

    // Auto-assign landing page
    const landingPageId = await findBestLandingPage(db, workspaceId, product, {
      adCopyPrimary: proposal.ad_copy_primary,
      adCopyHeadline: proposal.ad_copy_headline,
      conceptName: proposal.concept_name,
    });

    // Create the image_job
    const { data: job, error: jobErr } = await db
      .from("image_jobs")
      .insert({
        name: proposal.concept_name,
        product,
        status: "draft",
        target_languages: target_languages ?? await getWorkspaceLanguages(),
        target_ratios: target_ratios ?? ["4:5", "9:16"],
        concept_number: nextNumber,
        tags,
        cash_dna: proposal.cash_dna,
        ad_copy_primary: proposal.ad_copy_primary,
        ad_copy_headline: allHeadlines,
        visual_direction: proposal.visual_direction ?? null,
        workspace_id: workspaceId,
        ...(landingPageId ? { landing_page_id: landingPageId } : {}),
      })
      .select()
      .single();

    if (jobErr || !job) {
      return safeError(
        jobErr ?? new Error("Failed to create job"),
        "Failed to create concept"
      );
    }

    // Auto-generate images in background (after response is sent)
    after(async () => {
      try {
        console.log(`[brainstorm-approve] Starting image generation for job ${job.id}`);
        const result = await generateStaticImages({
          jobId: job.id,
          workspaceId,
          styles: body.styles,
          segmentId: body.segment_id,
        });
        console.log(`[brainstorm-approve] Image generation done: ${result.generated} generated, ${result.failed} failed`);
      } catch (err) {
        console.error(`[brainstorm-approve] Image generation failed for ${job.id}:`, err);
        // Mark job as failed so UI can show error state
        const errDb = createServerSupabase();
        await errDb
          .from("image_jobs")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", job.id);
      }
    });

    return NextResponse.json({
      job_id: job.id,
      concept_number: nextNumber,
      landing_page_id: landingPageId,
      images_generating: true,
    });
  } catch (err) {
    return safeError(err, "Failed to create concept");
  }
}
