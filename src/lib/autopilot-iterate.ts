/**
 * Autopilot Creative Iteration
 *
 * Detects fatiguing concepts (high frequency or CTR drop) and generates fresh
 * images to refresh them. Sends Telegram approve/reject and on approve,
 * re-triggers the translation + push pipeline.
 */

import crypto from "crypto";
import { createServerSupabase } from "@/lib/supabase-admin";
import { generateImageBriefs, resolveReferenceImages } from "@/lib/static-ad-prompt";
import { generateImage } from "@/lib/kie";
import { sendPhoto, sendMessageWithInlineKeyboard } from "@/lib/telegram";
import { STORAGE_BUCKET } from "@/lib/constants";
import type { ImageJob, ProductFull } from "@/types";

// Fatigue thresholds (same as pipeline.ts)
const FATIGUE_FREQUENCY = 2.5;
const CTR_DROP_PCT = 0.20;
const MIN_DAYS_ACTIVE = 14; // Don't iterate concepts that just started
const ITERATION_COOLDOWN_DAYS = 14; // Don't re-iterate within 14 days
const IMAGES_PER_ITERATION = 3;

interface ConceptMetrics {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  frequency: number;
  roas: number | null;
}

interface FatiguingConcept {
  jobId: string;
  jobName: string;
  conceptNumber: number | null;
  product: string;
  workspaceId: string;
  reason: string;
  frequency: number;
  ctrDrop: number | null;
}

/**
 * Main entry point: detect fatiguing concepts and iterate the top one.
 * Returns null if nothing to iterate, or the result of the iteration.
 */
export async function detectAndIterateFatiguingConcepts(
  workspaceId: string,
  db: ReturnType<typeof createServerSupabase>,
  chatId?: string
): Promise<{ iterated: boolean; jobId?: string; reason?: string } | null> {
  // Step 1: Find fatiguing concepts
  const fatiguing = await detectFatiguingConcepts(workspaceId, db);
  if (fatiguing.length === 0) {
    return { iterated: false, reason: "No fatiguing concepts found" };
  }

  // Step 2: Filter out recently iterated
  const recentlyIterated = await getRecentlyIteratedJobIds(workspaceId, db);
  const eligible = fatiguing.filter((c) => !recentlyIterated.has(c.jobId));
  if (eligible.length === 0) {
    return { iterated: false, reason: "All fatiguing concepts were recently iterated" };
  }

  // Step 3: Pick the most urgent one (highest frequency first)
  const target = eligible.sort((a, b) => b.frequency - a.frequency)[0];

  console.log(`[autopilot-iterate] Iterating concept "${target.jobName}" — ${target.reason}`);

  // Step 4: Generate fresh images
  try {
    const result = await generateIterationImages(target.jobId, db);

    // Step 5: Log to autopilot_actions
    await db.from("autopilot_actions").insert({
      workspace_id: workspaceId,
      action_type: "iterate_concept",
      target_id: target.jobId,
      target_name: target.jobName,
      details: {
        concept_number: target.conceptNumber,
        reason: target.reason,
        frequency: target.frequency,
        ctr_drop: target.ctrDrop,
        images_generated: result.imageCount,
      },
      success: true,
    });

    // Step 6: Send Telegram notification
    if (chatId) {
      const hubUrl = process.env.NEXT_PUBLIC_APP_URL || "https://content-hub-nine-theta.vercel.app";
      const caption = [
        `🔄 Creative refresh for #${target.conceptNumber ?? "?"}: "${target.jobName}"`,
        ``,
        `Reason: ${target.reason}`,
        `${result.imageCount} new images generated`,
        `Review: ${hubUrl}/review?highlight=${target.jobId}`,
      ].join("\n");

      const buttons = [[
        { text: "✅ Approve", callback_data: `iterate_approve:${target.jobId}` },
        { text: "❌ Reject", callback_data: `iterate_reject:${target.jobId}` },
      ]];

      if (result.firstImageUrl) {
        await sendPhoto(chatId, result.firstImageUrl, caption, buttons);
      } else {
        await sendMessageWithInlineKeyboard(chatId, caption, buttons);
      }
    }

    return { iterated: true, jobId: target.jobId, reason: target.reason };
  } catch (err) {
    console.error(`[autopilot-iterate] Failed to iterate concept ${target.jobId}:`, err);

    await db.from("autopilot_actions").insert({
      workspace_id: workspaceId,
      action_type: "iterate_concept",
      target_id: target.jobId,
      target_name: target.jobName,
      details: { reason: target.reason },
      success: false,
      error_message: err instanceof Error ? err.message : String(err),
    });

    return { iterated: false, reason: `Generation failed: ${err instanceof Error ? err.message : "unknown"}` };
  }
}

/**
 * Detect which active concepts are showing fatigue signals.
 * Checks frequency > 2.5 and CTR drop >= 20%.
 * Only considers concepts that have been active 14+ days and have positive ROAS.
 */
async function detectFatiguingConcepts(
  workspaceId: string,
  db: ReturnType<typeof createServerSupabase>
): Promise<FatiguingConcept[]> {
  // Get active concepts with their market data
  const { data: markets } = await db
    .from("image_job_markets")
    .select(`
      id,
      image_job_id,
      market,
      created_at,
      image_jobs!inner(id, name, concept_number, product, workspace_id)
    `)
    .eq("image_jobs.workspace_id", workspaceId)
    .not("launchpad_priority", "is", null); // Only pushed concepts

  if (!markets || markets.length === 0) return [];

  // Check concept_lifecycle — only consider "active" stage (not testing/killed)
  const marketIds = markets.map((m) => m.id);
  const { data: lifecycles } = await db
    .from("concept_lifecycle")
    .select("image_job_market_id, stage")
    .in("image_job_market_id", marketIds)
    .is("exited_at", null);

  const activeMarketIds = new Set(
    (lifecycles ?? [])
      .filter((lc) => lc.stage === "active" || lc.stage === "scaling")
      .map((lc) => lc.image_job_market_id)
  );

  // Get metrics for active markets (last 14 days)
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const { data: metrics } = await db
    .from("concept_metrics")
    .select("*")
    .in("image_job_market_id", [...activeMarketIds])
    .gte("date", since)
    .order("date", { ascending: true });

  if (!metrics || metrics.length === 0) return [];

  // Group metrics by image_job_id (aggregate across markets)
  const metricsByJob = new Map<string, ConceptMetrics[]>();
  for (const m of metrics) {
    const market = markets.find((mk) => mk.id === m.image_job_market_id);
    if (!market) continue;
    const jobId = market.image_job_id;
    if (!metricsByJob.has(jobId)) metricsByJob.set(jobId, []);
    metricsByJob.get(jobId)!.push({
      date: m.date,
      spend: m.spend,
      impressions: m.impressions,
      clicks: m.clicks,
      conversions: m.conversions,
      ctr: m.ctr,
      frequency: m.frequency,
      roas: m.roas,
    });
  }

  // Check each concept for fatigue
  const fatiguing: FatiguingConcept[] = [];

  for (const [jobId, dailyMetrics] of metricsByJob.entries()) {
    const market = markets.find((m) => m.image_job_id === jobId);
    if (!market) continue;

    const job = market.image_jobs as unknown as {
      id: string;
      name: string;
      concept_number: number | null;
      product: string;
      workspace_id: string;
    };

    // Check minimum days active
    const daysSincePush = Math.floor(
      (Date.now() - new Date(market.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSincePush < MIN_DAYS_ACTIVE) continue;

    // Check ROAS is positive (only iterate winners)
    const totalSpend = dailyMetrics.reduce((s, m) => s + m.spend, 0);
    const totalRevenue = dailyMetrics.reduce((s, m) => s + (m.roas ? m.spend * m.roas : 0), 0);
    if (totalSpend > 0 && totalRevenue / totalSpend < 1.0) continue; // Below breakeven

    // Check frequency
    const avgFrequency =
      dailyMetrics.length > 0
        ? dailyMetrics.reduce((s, m) => s + m.frequency, 0) / dailyMetrics.length
        : 0;

    // Check CTR drop
    let ctrDrop: number | null = null;
    if (dailyMetrics.length >= 4) {
      const sorted = [...dailyMetrics].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      const peakCtr = Math.max(...sorted.map((d) => d.ctr));
      if (peakCtr > 0) {
        const last3 = sorted.slice(-3);
        const avgRecentCtr = last3.reduce((sum, d) => sum + d.ctr, 0) / last3.length;
        ctrDrop = (peakCtr - avgRecentCtr) / peakCtr;
      }
    }

    const reasons: string[] = [];
    if (avgFrequency > FATIGUE_FREQUENCY) {
      reasons.push(`Frequency ${avgFrequency.toFixed(2)} (threshold ${FATIGUE_FREQUENCY})`);
    }
    if (ctrDrop !== null && ctrDrop >= CTR_DROP_PCT) {
      reasons.push(`CTR dropped ${(ctrDrop * 100).toFixed(0)}% from peak`);
    }

    if (reasons.length > 0) {
      fatiguing.push({
        jobId,
        jobName: job.name,
        conceptNumber: job.concept_number,
        product: job.product,
        workspaceId: job.workspace_id,
        reason: reasons.join(" + "),
        frequency: avgFrequency,
        ctrDrop,
      });
    }
  }

  return fatiguing;
}

/**
 * Get job IDs that were iterated within the cooldown period.
 */
async function getRecentlyIteratedJobIds(
  workspaceId: string,
  db: ReturnType<typeof createServerSupabase>
): Promise<Set<string>> {
  const since = new Date(Date.now() - ITERATION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await db
    .from("autopilot_actions")
    .select("target_id")
    .eq("workspace_id", workspaceId)
    .eq("action_type", "iterate_concept")
    .eq("success", true)
    .gte("created_at", since);

  return new Set((data ?? []).map((a) => a.target_id));
}

/**
 * Generate fresh images for an existing concept.
 * Creates new source_images rows on the job using the same CASH DNA/style but fresh prompts.
 */
async function generateIterationImages(
  jobId: string,
  db: ReturnType<typeof createServerSupabase>
): Promise<{ imageCount: number; firstImageUrl: string | null }> {
  // Load the job
  const { data: job } = await db
    .from("image_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (!job) throw new Error("Job not found");

  // Load product
  const { data: product } = await db
    .from("products")
    .select("*")
    .eq("slug", job.product)
    .eq("workspace_id", job.workspace_id)
    .single();

  if (!product) throw new Error("Product not found");

  // Load product images
  const { data: productImages } = await db
    .from("product_images")
    .select("url, category")
    .eq("product_id", product.id)
    .order("sort_order", { ascending: true });

  // Load existing source images (for previousPrompts diversity)
  const { data: existingImages } = await db
    .from("source_images")
    .select("generation_prompt, generation_style")
    .eq("job_id", jobId);

  const previousPrompts = (existingImages ?? [])
    .map((si) => si.generation_prompt)
    .filter(Boolean) as string[];

  // Get styles from existing images (use same styles)
  const existingStyles = [...new Set(
    (existingImages ?? [])
      .map((si) => si.generation_style)
      .filter(Boolean)
  )] as string[];

  // Get current max processing_order
  const { data: lastOrder } = await db
    .from("source_images")
    .select("processing_order")
    .eq("job_id", jobId)
    .order("processing_order", { ascending: false })
    .limit(1)
    .single();

  const startOrder = ((lastOrder?.processing_order as number) ?? 0) + 1;

  // Generate briefs
  const { briefs } = await generateImageBriefs({
    job: job as ImageJob,
    product: product as ProductFull,
    productImages: (productImages ?? []) as Array<{ url: string; category: string }>,
    count: IMAGES_PER_ITERATION,
    styles: existingStyles.length > 0 ? existingStyles as Parameters<typeof generateImageBriefs>[0]["styles"] : undefined,
    previousPrompts,
  });

  // Generate images in parallel
  const results: Array<{ url: string; sourceImageId: string }> = [];

  const settled = await Promise.allSettled(
    briefs.map(async (brief, index) => {
      const referenceUrls = resolveReferenceImages(
        brief,
        (productImages ?? []) as Array<{ url: string; category: string }>
      );

      const { urls: resultUrls } = await generateImage(brief.prompt, referenceUrls, "4:5");
      if (!resultUrls?.length) throw new Error("No image generated");

      // Download and upload to Supabase
      const resultRes = await fetch(resultUrls[0]);
      if (!resultRes.ok) throw new Error("Failed to download image");
      const buffer = Buffer.from(await resultRes.arrayBuffer());

      const fileId = crypto.randomUUID();
      const filePath = `image-jobs/${jobId}/${fileId}.png`;
      const { error: uploadError } = await db.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, buffer, { contentType: "image/png", upsert: false });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

      // Insert source_images row
      const { data: sourceImage } = await db
        .from("source_images")
        .insert({
          job_id: jobId,
          original_url: urlData.publicUrl,
          filename: `iterate-${brief.style}-${fileId.slice(0, 8)}.png`,
          processing_order: startOrder + index,
          skip_translation: false,
          generation_prompt: brief.prompt,
          generation_style: brief.style,
          batch: 2, // Distinguish iteration images from originals
        })
        .select()
        .single();

      return { url: urlData.publicUrl, sourceImageId: sourceImage?.id ?? "" };
    })
  );

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      results.push(outcome.value);
    } else {
      console.error("[autopilot-iterate] Image generation failed:", outcome.reason);
    }
  }

  if (results.length === 0) {
    throw new Error("All image generations failed");
  }

  return {
    imageCount: results.length,
    firstImageUrl: results[0]?.url ?? null,
  };
}

/**
 * Clean up iteration images when rejected via Telegram.
 * Deletes the new source_images (batch=2) that were added.
 */
export async function cleanupIterationImages(
  jobId: string,
  db: ReturnType<typeof createServerSupabase>
): Promise<number> {
  // Find iteration source images (batch=2)
  const { data: iterationImages } = await db
    .from("source_images")
    .select("id, original_url")
    .eq("job_id", jobId)
    .eq("batch", 2);

  if (!iterationImages || iterationImages.length === 0) return 0;

  // Delete storage files
  for (const img of iterationImages) {
    const url = img.original_url as string;
    const match = url.match(/image-jobs\/.+/);
    if (match) {
      await db.storage.from(STORAGE_BUCKET).remove([match[0]]).catch(() => {});
    }
  }

  // Delete source_images rows
  const ids = iterationImages.map((i) => i.id);
  await db.from("source_images").delete().in("id", ids);

  return ids.length;
}
