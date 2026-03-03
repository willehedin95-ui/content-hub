import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import type { AutoPipelineConcept } from "@/types";

export const maxDuration = 180;

// POST /api/pipeline/concepts/[id]/approve
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = createServerSupabase();

    // Fetch concept
    const { data: concept, error: fetchError } = await supabase
      .from("pipeline_concepts")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !concept) {
      return NextResponse.json({ error: "Concept not found" }, { status: 404 });
    }

    const typedConcept = concept as AutoPipelineConcept;

    if (typedConcept.status !== "pending_review") {
      return NextResponse.json({ error: "Concept not in pending_review state" }, { status: 400 });
    }

    // Create image_job
    const { data: imageJob, error: jobError } = await supabase
      .from("image_jobs")
      .insert({
        name: typedConcept.name,
        product: typedConcept.product,
        concept_number: typedConcept.concept_number,
        pipeline_concept_id: typedConcept.id,
        status: "ready",
        target_languages: typedConcept.target_languages,
        target_ratios: ["1:1"], // Meta only uses 1:1
        ad_copy_primary: typedConcept.primary_copy,
        ad_copy_headline: typedConcept.ad_copy_headline,
        cash_dna: typedConcept.cash_dna,
        auto_export: false,
      })
      .select()
      .single();

    if (jobError || !imageJob) {
      console.error("[approve] Image job creation error:", jobError);
      return NextResponse.json({ error: "Failed to create image job" }, { status: 500 });
    }

    // Update concept
    const { error: updateError } = await supabase
      .from("pipeline_concepts")
      .update({
        status: "generating_images",
        image_job_id: imageJob.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("[approve] Concept update error:", updateError);
      return NextResponse.json({ error: "Failed to update concept" }, { status: 500 });
    }

    // Auto-populate hook library from approved concept
    const cashDna = typedConcept.cash_dna as { hooks?: string[]; awareness_level?: string; angle?: string } | null;
    const conceptHooks = cashDna?.hooks || [];
    const conceptHeadlines = typedConcept.ad_copy_headline || [];
    const hookRows = [
      ...conceptHooks.map((h: string) => ({
        hook_text: h.trim(),
        hook_type: "hook",
        product: typedConcept.product,
        awareness_level: cashDna?.awareness_level || null,
        angle: cashDna?.angle || null,
        source: "concept_auto",
        source_concept_id: typedConcept.id,
        status: "unreviewed",
      })),
      ...conceptHeadlines.map((h: string) => ({
        hook_text: h.trim(),
        hook_type: "headline",
        product: typedConcept.product,
        awareness_level: cashDna?.awareness_level || null,
        angle: cashDna?.angle || null,
        source: "concept_auto",
        source_concept_id: typedConcept.id,
        status: "unreviewed",
      })),
    ];
    if (hookRows.length > 0) {
      await supabase.from("hook_library").upsert(hookRows, { ignoreDuplicates: true });
    }

    // Trigger image generation
    const generateUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/image-jobs/${imageJob.id}/generate-all`;
    await fetch(generateUrl, { method: "POST" });

    return NextResponse.json({
      success: true,
      image_job_id: imageJob.id,
      concept_id: id,
    });
  } catch (error) {
    console.error("[approve] Error:", error);
    return NextResponse.json({ error: "Approval failed" }, { status: 500 });
  }
}
