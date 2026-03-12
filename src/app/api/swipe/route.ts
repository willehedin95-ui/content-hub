import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";
import { isValidUUID } from "@/lib/validation";
import { stripForTranslation, compactForSwiper } from "@/lib/html-parser";
import { buildRewritePrompts } from "@/lib/claude";
import type { SwiperAngle } from "@/lib/claude";
import type { ProductFull, CopywritingGuideline, ReferencePage } from "@/types";

/**
 * POST /api/swipe
 * Creates a swipe job in Supabase and pings the Railway worker.
 * Returns { jobId } — client polls GET /api/swipe/[jobId] for progress.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { html, productId, sourceUrl, sourceLanguage, angle, customInstructions } = body;

  if (!html || !productId) {
    return NextResponse.json(
      { error: "html and productId are required" },
      { status: 400 }
    );
  }

  if (!isValidUUID(productId)) {
    return NextResponse.json(
      { error: "Invalid product ID" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  // Load product bank data
  const [productResult, guidelinesResult, referencesResult] = await Promise.all([
    db.from("products").select("*").eq("id", productId).eq("workspace_id", workspaceId).single(),
    db
      .from("copywriting_guidelines")
      .select("*")
      .or(`product_id.eq.${productId},product_id.is.null`)
      .order("sort_order", { ascending: true }),
    db
      .from("reference_pages")
      .select("*")
      .or(`product_id.eq.${productId},product_id.is.null`)
      .order("created_at", { ascending: false }),
  ]);

  if (productResult.error || !productResult.data) {
    return NextResponse.json(
      { error: "Product not found" },
      { status: 404 }
    );
  }

  const product = productResult.data as ProductFull;
  const guidelines = (guidelinesResult.data ?? []) as CopywritingGuideline[];
  const references = (referencesResult.data ?? []) as ReferencePage[];

  const productBrief = guidelines.find((g) => g.name === "Product Brief")?.content;
  const swiperAngle = (angle as SwiperAngle) || undefined;

  // Strip non-translatable elements from HTML
  const { bodyHtml, headHtml, stripped } = stripForTranslation(html);

  // Compact class/style/data attributes to reduce token count
  const { compact, classMap, styleMap } = compactForSwiper(bodyHtml);

  // Build prompts
  const { systemPrompt, userPrompt } = buildRewritePrompts(
    compact,
    product,
    guidelines,
    references,
    sourceLanguage || "en",
    swiperAngle,
    productBrief,
    customInstructions?.trim() || undefined
  );

  // Insert job into swipe_jobs
  const { data: job, error: insertErr } = await db
    .from("swipe_jobs")
    .insert({
      product_id: productId,
      product_name: product.name,
      source_url: sourceUrl || null,
      angle: swiperAngle || null,
      original_html: html,
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      head_html: headHtml,
      stripped,
      class_map: classMap,
      style_map: styleMap,
    })
    .select("id")
    .single();

  if (insertErr || !job) {
    console.error("[Swipe] Failed to create job:", insertErr?.message);
    return NextResponse.json(
      { error: "Failed to create swipe job" },
      { status: 500 }
    );
  }

  // Create page immediately with status='importing'
  const pageName = body.name || sourceUrl || "Untitled Import";
  const pageSlug = body.slug || pageName
    .toLowerCase()
    .replace(/https?:\/\/[^/]+\/?/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "import";

  const selectedProduct = product as ProductFull;
  const { data: page, error: pageErr } = await db
    .from("pages")
    .insert({
      name: pageName,
      product: selectedProduct.slug,
      page_type: body.pageType || "advertorial",
      source_url: sourceUrl || "",
      original_html: "",
      slug: pageSlug,
      source_language: sourceLanguage || "en",
      images_to_translate: [],
      tags: ["swiped"],
      swiped_from_url: sourceUrl || null,
      status: "importing",
      swipe_job_id: job.id,
      workspace_id: workspaceId,
    })
    .select("id")
    .single();

  if (pageErr || !page) {
    console.error("[Swipe] Failed to create page:", pageErr?.message);
    // Continue without page — job still exists
  } else {
    // Link swipe job back to page
    await db.from("swipe_jobs").update({ page_id: page.id }).eq("id", job.id);
  }

  // Ping the worker (fire and forget — job persists in DB even if this fails)
  const workerUrl = process.env.SWIPE_WORKER_URL;
  const workerSecret = process.env.SWIPE_WORKER_SECRET;

  if (workerUrl && workerSecret) {
    fetch(`${workerUrl}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${workerSecret}`,
      },
      body: JSON.stringify({ jobId: job.id }),
    }).catch((err) => {
      console.error("[Swipe] Failed to ping worker:", err.message);
    });
  } else {
    console.warn("[Swipe] SWIPE_WORKER_URL or SWIPE_WORKER_SECRET not configured");
  }

  return NextResponse.json({ jobId: job.id, pageId: page?.id || null });
}
