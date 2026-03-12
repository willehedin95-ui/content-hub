import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";
import { runComplianceCheck } from "@/lib/meta-compliance";
import { isValidUUID } from "@/lib/validation";
import { CLAUDE_MODEL, OPENAI_MODEL } from "@/lib/constants";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;
  if (!isValidUUID(jobId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  try {
    // Load job with ad copy and images
    const { data: job, error: jobError } = await db
      .from("image_jobs")
      .select(
        "id, ad_copy_primary, ad_copy_headline, source_images(id, original_url, skip_translation, image_translations(translated_url, aspect_ratio, status))"
      )
      .eq("id", jobId)
      .eq("workspace_id", workspaceId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const primaryTexts: string[] = job.ad_copy_primary || [];
    const headlines: string[] = job.ad_copy_headline || [];

    // Collect completed 4:5 image URLs (deduplicated)
    const imageUrls: string[] = [];
    for (const src of job.source_images || []) {
      if (src.skip_translation) {
        if (src.original_url) imageUrls.push(src.original_url);
      } else {
        for (const trans of src.image_translations || []) {
          if (trans.aspect_ratio !== "4:5") continue;
          if (trans.status === "completed" && trans.translated_url) {
            imageUrls.push(trans.translated_url);
          }
        }
      }
    }
    const uniqueImageUrls = [...new Set(imageUrls)];

    // Run compliance check
    const { result, cost, tokens } = await runComplianceCheck({
      primaryTexts,
      headlines,
      imageUrls: uniqueImageUrls,
    });

    // Store result on job
    await db
      .from("image_jobs")
      .update({ compliance_result: result })
      .eq("id", jobId);

    // Log usage
    if (tokens.claudeInput > 0) {
      await db.from("usage_logs").insert({
        type: "compliance_check",
        model: CLAUDE_MODEL,
        input_tokens: tokens.claudeInput,
        output_tokens: tokens.claudeOutput,
        cost_usd: cost.claudeCost,
        metadata: { purpose: "compliance_text_check", job_id: jobId },
      });
    }

    if (tokens.openaiInput > 0) {
      await db.from("usage_logs").insert({
        type: "compliance_check",
        model: OPENAI_MODEL,
        input_tokens: tokens.openaiInput,
        output_tokens: tokens.openaiOutput,
        cost_usd: cost.openaiCost,
        metadata: {
          purpose: "compliance_image_check",
          job_id: jobId,
          images_checked: uniqueImageUrls.length,
        },
      });
    }

    return NextResponse.json({ result, cost });
  } catch (err) {
    console.error("Compliance check failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Compliance check failed" },
      { status: 500 }
    );
  }
}
