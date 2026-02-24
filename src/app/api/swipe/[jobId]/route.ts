import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { decompactAfterSwiper, restoreAfterTranslation } from "@/lib/html-parser";
import { CLAUDE_MODEL } from "@/lib/constants";

/**
 * GET /api/swipe/[jobId]
 * Poll for swipe job status. When completed, lazily restores the HTML
 * (decompact + restore) on first poll, then returns cached result.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  if (!isValidUUID(jobId)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  const db = createServerSupabase();

  const { data: job, error } = await db
    .from("swipe_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Pending or processing — return progress
  if (job.status === "pending" || job.status === "processing") {
    return NextResponse.json({
      status: job.status,
      progress: {
        chars: job.progress_chars || 0,
        message: job.progress_message || (job.status === "pending" ? "Waiting for worker..." : "Processing..."),
      },
      createdAt: job.created_at,
    });
  }

  // Failed — return error
  if (job.status === "failed") {
    return NextResponse.json({
      status: "failed",
      error: job.error_message || "Unknown error",
      createdAt: job.created_at,
    });
  }

  // Completed — check if already restored
  if (job.rewritten_html && job.images) {
    return NextResponse.json({
      status: "completed",
      rewrittenHtml: job.rewritten_html,
      originalHtml: job.original_html,
      images: job.images,
      usage: {
        inputTokens: job.input_tokens,
        outputTokens: job.output_tokens,
      },
    });
  }

  // First poll after completion — restore HTML lazily
  if (!job.raw_output) {
    return NextResponse.json({
      status: "failed",
      error: "Job completed but no output was generated",
    });
  }

  // Decompact + restore
  const classMap = (job.class_map || []) as string[];
  const styleMap = (job.style_map || []) as string[];
  const stripped = (job.stripped || []) as Array<{ placeholder: string; original: string }>;

  const rewrittenBody = decompactAfterSwiper(job.raw_output, classMap, styleMap);
  const rewrittenHtml = restoreAfterTranslation(
    rewrittenBody,
    job.head_html || "",
    stripped,
    {}
  );

  // Extract images
  const imageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
  const images: { src: string; alt: string }[] = [];
  let match;
  while ((match = imageRegex.exec(rewrittenHtml)) !== null) {
    const src = match[1];
    if (src && !src.startsWith("data:")) {
      images.push({ src, alt: match[2] || "" });
    }
  }

  // Cache the restored result back to the row
  await db
    .from("swipe_jobs")
    .update({ rewritten_html: rewrittenHtml, images })
    .eq("id", jobId);

  // Log usage
  db.from("usage_logs")
    .insert({
      type: "claude_rewrite",
      model: CLAUDE_MODEL,
      input_tokens: job.input_tokens,
      output_tokens: job.output_tokens,
      cost_usd:
        ((job.input_tokens || 0) * 3 + (job.output_tokens || 0) * 15) /
        1_000_000,
      metadata: {
        product_id: job.product_id,
        product_name: job.product_name,
        source_url: job.source_url,
        angle: job.angle || "none",
        job_id: jobId,
      },
    })
    .then(() => {});

  return NextResponse.json({
    status: "completed",
    rewrittenHtml,
    originalHtml: job.original_html,
    images,
    usage: {
      inputTokens: job.input_tokens,
      outputTokens: job.output_tokens,
    },
  });
}
