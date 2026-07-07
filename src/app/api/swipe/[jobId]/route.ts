import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
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
  const workspaceId = await getWorkspaceId();

  const { data: job, error } = await db
    .from("swipe_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Verify workspace access through product
  if (job.product_id) {
    const { data: product } = await db
      .from("products")
      .select("id")
      .eq("id", job.product_id)
      .eq("workspace_id", workspaceId)
      .single();
    if (!product) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
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
      pageId: job.page_id || null,
    });
  }

  // Failed — return error
  if (job.status === "failed") {
    return NextResponse.json({
      status: "failed",
      error: job.error_message || "Unknown error",
      createdAt: job.created_at,
      pageId: job.page_id || null,
    });
  }

  // Completed — check if already restored
  if (job.rewritten_html && job.images) {
    await finalizePageIfStuck(db, job.page_id, job.rewritten_html);
    return NextResponse.json({
      status: "completed",
      rewrittenHtml: job.rewritten_html,
      originalHtml: job.original_html,
      images: job.images,
      usage: {
        inputTokens: job.input_tokens,
        outputTokens: job.output_tokens,
      },
      pageId: job.page_id || null,
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
    {},
    job.html_attrs || undefined,
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

  // Cache the restored result back to the row - CONDITIONAL on it still being
  // unrestored, so a concurrent first poll can't double-log usage
  // (audit 2026-07-07, P3 swipe idempotency on job_id).
  const { data: cacheRows, error: cacheError } = await db
    .from("swipe_jobs")
    .update({ rewritten_html: rewrittenHtml, images })
    .eq("id", jobId)
    .is("rewritten_html", null)
    .select("id");

  if (cacheError) {
    console.error("[Swipe] Failed to cache restored HTML:", cacheError.message);
  }
  const wonRestoreRace = (cacheRows?.length ?? 0) > 0;

  // Log usage exactly once (only by the request that won the restore race)
  if (wonRestoreRace) {
    const { error: logError } = await db.from("usage_logs").insert({
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
    });
    if (logError) {
      console.error("[Swipe] usage_logs insert failed:", logError.message);
    }
  }

  // Server-side finalize (audit 2026-07-07, L3): if the client tab was closed
  // before its PATCH, the page stays 'importing' forever despite a paid
  // Claude run. Write the restored HTML + status=ready here so the next
  // visit (which triggers this GET) heals the page. The client's own PATCH
  // (possibly with generated images) simply overwrites this afterwards.
  await finalizePageIfStuck(db, job.page_id, rewrittenHtml);

  return NextResponse.json({
    status: "completed",
    rewrittenHtml,
    originalHtml: job.original_html,
    images,
    usage: {
      inputTokens: job.input_tokens,
      outputTokens: job.output_tokens,
    },
    pageId: job.page_id || null,
  });
}

/** Promote a page stuck in status='importing' to 'ready' with the restored HTML. */
async function finalizePageIfStuck(
  db: ReturnType<typeof createServerSupabase>,
  pageId: string | null,
  rewrittenHtml: string
): Promise<void> {
  if (!pageId || !rewrittenHtml) return;
  const { error } = await db
    .from("pages")
    .update({ original_html: rewrittenHtml, status: "ready" })
    .eq("id", pageId)
    .eq("status", "importing");
  if (error) {
    console.error("[Swipe] finalizePageIfStuck failed:", error.message);
  }
}
