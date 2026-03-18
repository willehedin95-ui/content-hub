import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase-admin";
import { sendPhoto, sendMessageWithInlineKeyboard } from "@/lib/telegram";
import {
  buildBrainstormSystemPrompt,
  buildBrainstormUserPrompt,
  buildHookInspiration,
  buildLearningsContext,
  parseConceptProposals,
} from "@/lib/brainstorm";
import { generateImageBriefs, resolveReferenceImages } from "@/lib/static-ad-prompt";
import { generateImage } from "@/lib/kie";
import { CLAUDE_MODEL, STORAGE_BUCKET, KIE_MODEL } from "@/lib/constants";
import { KIE_IMAGE_COST } from "@/lib/pricing";
import { swipeCompetitorAd, findBestLandingPage } from "@/lib/swipe-competitor";
import {
  exploreAds,
  getBoardAds,
  getBrandSpyBrands,
  getBrandSpyAds,
  filterImageAds,
  getImageUrls,
  type GethookdAd,
} from "@/lib/gethookd";
import type {
  BrainstormMode,
  BrainstormRequest,
  ProductFull,
  CopywritingGuideline,
  ProductSegment,
} from "@/types";

export const maxDuration = 300;

const HAPPYSLEEP_WORKSPACE_ID = "c40221e2-96fb-4774-92db-74ec0227b262";
const PRODUCT_SLUG = "happysleep";
const TARGET_LANGUAGES = ["sv", "da", "no"];
const TARGET_RATIOS = ["4:5", "9:16"];

// Autopilot-capable brainstorm modes (no user input required)
const AUTOPILOT_MODES: BrainstormMode[] = [
  "from_scratch",
  "from_internal",
  "unaware",
  "from_template",
];

// Default explore queries to rotate through (any niche — not just health)
const DEFAULT_EXPLORE_QUERIES = [
  "supplement health",
  "skincare beauty",
  "fitness equipment",
  "wellness product",
  "pillow sleep",
  "mattress bed",
  "pain relief",
  "posture corrector",
  "weight loss",
  "anti-aging",
];

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
  const db = createServerSupabase();

  try {
    // --- Step 1: Check if concepts are needed (skip with ?force=true) ---
    const force = req.nextUrl.searchParams.get("force") === "true";
    if (!force) {
      const needResult = await checkConceptNeed(db);
      if (!needResult.needed) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          reason: needResult.reason,
        });
      }
    }

    // --- Step 2: Check autopilot mode from workspace settings ---
    const { data: workspace } = await db
      .from("workspaces")
      .select("settings")
      .eq("id", HAPPYSLEEP_WORKSPACE_ID)
      .single();

    const settings = (workspace?.settings ?? {}) as Record<string, unknown>;
    const autopilotMode = (settings.autopilot_mode as string) ?? "from_scratch";

    // Route to the right code path
    if (autopilotMode === "competitor_swipe" && process.env.GETHOOKD_API_TOKEN) {
      return await runCompetitorSwipe(db, chatId, settings);
    }

    // Default: from-scratch mode (original flow)
    return await runFromScratch(db, chatId);
  } catch (err) {
    console.error("[Autopilot] Fatal error:", err);
    if (chatId) {
      await sendMessageWithInlineKeyboard(chatId,
        `❌ Autopilot concept creation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        []
      ).catch(() => {});
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// ===========================================================================
// COMPETITOR SWIPE MODE
// ===========================================================================

async function runCompetitorSwipe(
  db: ReturnType<typeof createServerSupabase>,
  chatId: string | undefined,
  settings: Record<string, unknown>
) {
  // --- Discover a winning competitor ad ---
  const discovered = await discoverCompetitorAd(db, settings);

  if (!discovered) {
    if (chatId) {
      await sendMessageWithInlineKeyboard(chatId,
        "🔍 Autopilot swipe: No new ads found to swipe today. Will retry tomorrow.",
        []
      );
    }
    return NextResponse.json({ ok: true, skipped: true, reason: "No new ads discovered" });
  }

  console.log(`[Autopilot] Discovered ad from ${discovered.ad.brand.name}: "${discovered.ad.title?.slice(0, 60)}"`);

  // --- Store in discovered_ads ---
  const imageUrls = getImageUrls(discovered.ad);
  await db.from("discovered_ads").upsert({
    workspace_id: HAPPYSLEEP_WORKSPACE_ID,
    gethookd_ad_id: discovered.ad.id,
    external_id: discovered.ad.external_id,
    brand_name: discovered.ad.brand.name,
    title: discovered.ad.title,
    body: discovered.ad.body,
    landing_page: discovered.ad.landing_page,
    performance_score: discovered.ad.performance_score,
    performance_score_title: discovered.ad.performance_score_title,
    days_active: discovered.ad.days_active,
    display_format: discovered.ad.display_format,
    media_urls: imageUrls,
    source: discovered.source,
    status: "swiping",
    updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id,gethookd_ad_id" });

  // --- Score ad (skip for board ads — user already vetted) ---
  if (discovered.source !== "board") {
    const score = await scoreAd(discovered.ad);
    await db.from("discovered_ads")
      .update({ ai_relevance_score: score.score, ai_reasoning: score.reasoning })
      .eq("gethookd_ad_id", discovered.ad.id)
      .eq("workspace_id", HAPPYSLEEP_WORKSPACE_ID);

    if (score.score < 6) {
      await db.from("discovered_ads")
        .update({ status: "skipped" })
        .eq("gethookd_ad_id", discovered.ad.id)
        .eq("workspace_id", HAPPYSLEEP_WORKSPACE_ID);

      console.log(`[Autopilot] Ad scored ${score.score}/10 — skipping: ${score.reasoning}`);
      if (chatId) {
        await sendMessageWithInlineKeyboard(chatId,
          `🔍 Autopilot skipped ad from ${discovered.ad.brand.name} (score: ${score.score}/10)\nReason: ${score.reasoning}`,
          []
        );
      }
      return NextResponse.json({ ok: true, skipped: true, reason: `Ad scored ${score.score}/10` });
    }
  }

  const competitorImageUrls = imageUrls.slice(0, 3);
  if (competitorImageUrls.length === 0) {
    await db.from("discovered_ads")
      .update({ status: "skipped" })
      .eq("gethookd_ad_id", discovered.ad.id)
      .eq("workspace_id", HAPPYSLEEP_WORKSPACE_ID);
    return NextResponse.json({ ok: true, skipped: true, reason: "No images in ad" });
  }

  // --- Delegate to shared swipe function ---
  try {
    const result = await swipeCompetitorAd({
      workspaceId: HAPPYSLEEP_WORKSPACE_ID,
      productSlug: PRODUCT_SLUG,
      competitorImageUrls,
      competitorAdCopy: discovered.ad.body,
      brandName: discovered.ad.brand.name,
      gethookdAdId: discovered.ad.id,
      notifyTelegram: !!chatId,
    });

    // Update discovered_ads with the job link
    await db.from("discovered_ads")
      .update({ status: "swiped", image_job_id: result.jobId, updated_at: new Date().toISOString() })
      .eq("gethookd_ad_id", discovered.ad.id)
      .eq("workspace_id", HAPPYSLEEP_WORKSPACE_ID);

    return NextResponse.json({
      ok: true,
      mode: "competitor_swipe",
      concept: {
        id: result.jobId,
        name: result.conceptName,
        concept_number: result.conceptNumber,
        swiped_from: discovered.ad.brand.name,
        source: discovered.source,
        images_generated: result.imagesGenerated,
        landing_page_assigned: result.landingPageAssigned,
      },
    });
  } catch (err) {
    console.error("[Autopilot/swipe] Swipe failed:", err);
    if (chatId) {
      await sendMessageWithInlineKeyboard(chatId,
        `⚠️ Autopilot swipe failed for ad from ${discovered.ad.brand.name}: ${err instanceof Error ? err.message : "Unknown error"}`,
        []
      );
    }
    return NextResponse.json({ ok: true, error: err instanceof Error ? err.message : "Unknown error" });
  }
}

// ===========================================================================
// DISCOVER COMPETITOR AD (Board → Brand Spy → Explore)
// ===========================================================================

async function discoverCompetitorAd(
  db: ReturnType<typeof createServerSupabase>,
  settings: Record<string, unknown>
): Promise<{ ad: GethookdAd; source: "board" | "brand_spy" | "explore" } | null> {
  // Get already-seen ad IDs to avoid duplicates
  const { data: seenAds } = await db
    .from("discovered_ads")
    .select("gethookd_ad_id")
    .eq("workspace_id", HAPPYSLEEP_WORKSPACE_ID);

  const seenIds = new Set((seenAds ?? []).map((a) => a.gethookd_ad_id));

  // --- Priority 1: Board (user-curated) ---
  const boardId = settings.gethookd_board_id as string | undefined;
  if (boardId) {
    try {
      const { ads } = await getBoardAds(boardId, 1, 50);
      const imageAds = filterImageAds(ads);
      const unswiped = imageAds.filter((a) => !seenIds.has(a.id));
      if (unswiped.length > 0) {
        console.log(`[Autopilot] Found ${unswiped.length} unswiped board ads`);
        return { ad: unswiped[0], source: "board" };
      }
    } catch (err) {
      console.error("[Autopilot] Board fetch failed:", err);
    }
  }

  // --- Priority 2: Brand Spy ---
  try {
    const brands = await getBrandSpyBrands();
    for (const brand of brands.slice(0, 10)) {
      const ads = await getBrandSpyAds(brand.id, { per_page: 10 });
      const imageAds = filterImageAds(ads);
      const unseen = imageAds.filter(
        (a) => !seenIds.has(a.id) &&
          a.performance_score !== null &&
          a.performance_score >= 40
      );
      if (unseen.length > 0) {
        console.log(`[Autopilot] Found unseen ad from brand spy: ${brand.name}`);
        return { ad: unseen[0], source: "brand_spy" };
      }
    }
  } catch (err) {
    console.error("[Autopilot] Brand spy fetch failed:", err);
  }

  // --- Priority 3: Explore (rotate through search queries) ---
  const queries = (settings.gethookd_explore_queries as string[]) ?? DEFAULT_EXPLORE_QUERIES;
  // Pick a random query to avoid always hitting the same one
  const query = queries[Math.floor(Math.random() * queries.length)];

  try {
    const { ads } = await exploreAds({
      query,
      "ad-format": "image",
      performance_scores: "winning,scaling",
      ads_per_brand_limit: 2,
      per_page: 20,
      sort_column: "days_active",
      sort_direction: "desc",
    });

    const unseen = ads.filter((a) => !seenIds.has(a.id));
    if (unseen.length > 0) {
      console.log(`[Autopilot] Found ${unseen.length} unseen explore ads for query "${query}"`);
      return { ad: unseen[0], source: "explore" };
    }
  } catch (err) {
    console.error("[Autopilot] Explore fetch failed:", err);
  }

  return null;
}

// ===========================================================================
// SCORE AD (Claude Haiku quick relevance check)
// ===========================================================================

async function scoreAd(ad: GethookdAd): Promise<{ score: number; reasoning: string }> {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const imageUrls = getImageUrls(ad);
    const firstImage = imageUrls[0];

    const content: Anthropic.Messages.ContentBlockParam[] = [];
    if (firstImage) {
      content.push({ type: "image", source: { type: "url", url: firstImage } });
    }
    content.push({
      type: "text",
      text: [
        "Score this ad's VISUAL FORMAT and PERSUASION STRUCTURE for swipe potential.",
        "We adapt ads from ANY niche to sell a sleep pillow. We don't copy the product or messaging — we swipe the visual format, layout, and persuasion mechanics.",
        "",
        `Ad title: ${ad.title}`,
        `Brand: ${ad.brand.name}`,
        `Format: ${ad.display_format}`,
        `Days active: ${ad.days_active}`,
        "",
        "Score 1-10 based on:",
        "- Is the visual format distinctive and reproducible? (split images, before/after, X-ray, handwritten text, etc.)",
        "- Is the persuasion structure strong? (clear pain→promise, social proof, curiosity gap)",
        "- Would this format work when adapted to a completely different product?",
        "- Is this a static image ad (not just a product photo or logo)?",
        "",
        "Respond in JSON only: {\"score\": N, \"reasoning\": \"1-2 sentences\"}",
      ].join("\n"),
    });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      temperature: 0,
      messages: [{ role: "user", content }],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    return { score: parsed.score ?? 5, reasoning: parsed.reasoning ?? "" };
  } catch (err) {
    console.error("[Autopilot] Scoring failed:", err);
    return { score: 7, reasoning: "Scoring failed — defaulting to pass" };
  }
}

// ===========================================================================
// FROM-SCRATCH MODE (original flow)
// ===========================================================================

async function runFromScratch(
  db: ReturnType<typeof createServerSupabase>,
  chatId: string | undefined
) {
  // --- Step 2: Pick brainstorm mode ---
  const mode = await pickBrainstormMode(db);

  // --- Step 3: Fetch product context ---
  const { data: product } = await db
    .from("products")
    .select("*")
    .eq("slug", PRODUCT_SLUG)
    .single();

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 500 });
  }

  const { data: guidelines } = await db
    .from("copywriting_guidelines")
    .select("*")
    .eq("product_id", product.id);

  const { data: segments } = await db
    .from("product_segments")
    .select("*")
    .eq("product_id", product.id);

  // --- Step 4: Build prompts and call Claude ---
  const hookInspiration = await buildHookInspiration(PRODUCT_SLUG, HAPPYSLEEP_WORKSPACE_ID);
  const learningsContext = await buildLearningsContext(PRODUCT_SLUG, HAPPYSLEEP_WORKSPACE_ID);

  // For from_internal mode, fetch existing concepts for gap analysis
  let existingConcepts: Array<{ name: string; angle: string; awareness: string }> | undefined;
  if (mode === "from_internal") {
    const { data: existing } = await db
      .from("image_jobs")
      .select("name, cash_dna")
      .eq("workspace_id", HAPPYSLEEP_WORKSPACE_ID)
      .eq("product", PRODUCT_SLUG)
      .not("cash_dna", "is", null)
      .order("created_at", { ascending: false })
      .limit(30);

    existingConcepts = (existing ?? []).map((j) => ({
      name: j.name,
      angle: (j.cash_dna as Record<string, unknown>)?.angle as string ?? "unknown",
      awareness: (j.cash_dna as Record<string, unknown>)?.awareness_level as string ?? "unknown",
    }));
  }

  const systemPrompt = buildBrainstormSystemPrompt(
    product as ProductFull,
    undefined, // productBrief
    (guidelines ?? []) as CopywritingGuideline[],
    (segments ?? []) as ProductSegment[],
    mode,
    hookInspiration,
    learningsContext
  );

  const brainstormRequest: BrainstormRequest = {
    mode,
    product: PRODUCT_SLUG,
    count: 1, // One concept at a time to stay within cron limits
  };

  const userPrompt = buildBrainstormUserPrompt(
    brainstormRequest,
    (segments ?? []) as ProductSegment[],
    existingConcepts
  );

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    temperature: 0.9,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const rawContent = response.content[0]?.type === "text" ? response.content[0].text : "";
  const proposals = parseConceptProposals(rawContent);

  if (proposals.length === 0) {
    if (chatId) {
      await sendMessageWithInlineKeyboard(chatId,
        `⚠️ Autopilot brainstorm returned no valid proposals (mode: ${mode}). Will retry tomorrow.`,
        []
      );
    }
    return NextResponse.json({ ok: true, error: "No proposals parsed" });
  }

  const proposal = proposals[0];

  // --- Step 5: Create image_job ---
  // Get next concept number
  const { data: lastJob } = await db
    .from("image_jobs")
    .select("concept_number")
    .eq("workspace_id", HAPPYSLEEP_WORKSPACE_ID)
    .not("concept_number", "is", null)
    .order("concept_number", { ascending: false })
    .limit(1)
    .single();

  const nextConceptNumber = ((lastJob?.concept_number as number) ?? 0) + 1;

  const { data: job, error: jobErr } = await db
    .from("image_jobs")
    .insert({
      workspace_id: HAPPYSLEEP_WORKSPACE_ID,
      name: proposal.concept_name,
      product: PRODUCT_SLUG,
      status: "draft",
      source: "autopilot",
      concept_number: nextConceptNumber,
      target_languages: TARGET_LANGUAGES,
      target_ratios: TARGET_RATIOS,
      cash_dna: proposal.cash_dna,
      ad_copy_primary: proposal.ad_copy_primary,
      ad_copy_headline: proposal.ad_copy_headline,
      visual_direction: proposal.visual_direction,
      tags: proposal.suggested_tags ?? [],
    })
    .select()
    .single();

  if (jobErr || !job) {
    console.error("[Autopilot] Failed to create image_job:", jobErr);
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }

  // --- Step 6: Auto-assign landing page ---
  const landingPageId = await findBestLandingPage(db, HAPPYSLEEP_WORKSPACE_ID, PRODUCT_SLUG);
  if (landingPageId) {
    await db.from("image_jobs").update({ landing_page_id: landingPageId }).eq("id", job.id);
  }

  // --- Step 7: Generate images ---
  const { data: productImages } = await db
    .from("product_images")
    .select("url, category")
    .eq("product_id", product.id)
    .order("sort_order", { ascending: true });

  let imageResults: Array<{ url: string; sourceImageId: string }> = [];
  try {
    const { briefs } = await generateImageBriefs({
      job: job as Parameters<typeof generateImageBriefs>[0]["job"],
      product: product as ProductFull,
      productImages: (productImages ?? []) as Array<{ url: string; category: string }>,
      count: 3,
    });

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
        const filePath = `image-jobs/${job.id}/${fileId}.png`;
        const { error: uploadError } = await db.storage
          .from(STORAGE_BUCKET)
          .upload(filePath, buffer, { contentType: "image/png", upsert: false });

        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

        // Insert source_images row
        const { data: sourceImage } = await db
          .from("source_images")
          .insert({
            job_id: job.id,
            original_url: urlData.publicUrl,
            filename: `${brief.style}-${fileId.slice(0, 8)}.png`,
            processing_order: index,
            skip_translation: false,
            generation_prompt: brief.prompt,
            generation_style: brief.style,
            batch: 1,
          })
          .select()
          .single();

        return { url: urlData.publicUrl, sourceImageId: sourceImage?.id ?? "" };
      })
    );

    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        imageResults.push(outcome.value);
      } else {
        console.error("[Autopilot] Image generation failed:", outcome.reason);
      }
    }

    // Update job status
    await db.from("image_jobs").update({
      status: "ready",
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
  } catch (err) {
    console.error("[Autopilot] Image generation error:", err);
  }

  // --- Step 8: Send Telegram notification ---
  if (chatId) {
    const angle = proposal.cash_dna?.angle ?? "—";
    const awareness = proposal.cash_dna?.awareness_level ?? "—";
    const hook = proposal.cash_dna?.hooks?.[0] ?? "—";
    const imagesGenerated = imageResults.length;
    const pageAssigned = landingPageId ? "Yes" : "No";
    const hubUrl = process.env.NEXT_PUBLIC_APP_URL || "https://content-hub-nine-theta.vercel.app";

    const caption = [
      `🤖 Autopilot concept #${nextConceptNumber}:`,
      ``,
      `"${proposal.concept_name}"`,
      `Angle: ${angle} | Awareness: ${awareness}`,
      `Hook: "${hook.length > 60 ? hook.slice(0, 60) + "..." : hook}"`,
      `Images: ${imagesGenerated}/3 | Page: ${pageAssigned}`,
      `Mode: ${mode}`,
      ``,
      `${hubUrl}/concepts/${job.id}`,
    ].join("\n");

    const buttons = [[
      { text: "✅ Approve", callback_data: `concept_approve:${job.id}` },
      { text: "❌ Reject", callback_data: `concept_reject:${job.id}` },
    ]];

    if (imageResults.length > 0) {
      await sendPhoto(chatId, imageResults[0].url, caption, buttons);
    } else {
      await sendMessageWithInlineKeyboard(chatId, caption, buttons);
    }
  }

  return NextResponse.json({
    ok: true,
    mode: "from_scratch",
    concept: {
      id: job.id,
      name: proposal.concept_name,
      concept_number: nextConceptNumber,
      mode,
      images_generated: imageResults.length,
      landing_page_assigned: !!landingPageId,
    },
  });
}

// ---------------------------------------------------------------------------
// Helper: Check if new concepts are needed
// ---------------------------------------------------------------------------

async function checkConceptNeed(
  db: ReturnType<typeof createServerSupabase>
): Promise<{ needed: boolean; reason: string }> {
  // Check how many concepts were created by autopilot recently (cooldown: 2 days)
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { count: recentAutopilot } = await db
    .from("image_jobs")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", HAPPYSLEEP_WORKSPACE_ID)
    .eq("source", "autopilot")
    .gte("created_at", twoDaysAgo);

  if ((recentAutopilot ?? 0) >= 2) {
    return { needed: false, reason: `Already created ${recentAutopilot} autopilot concepts in last 2 days` };
  }

  // Check if there are pending autopilot concepts awaiting review
  const { count: pendingReview } = await db
    .from("image_jobs")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", HAPPYSLEEP_WORKSPACE_ID)
    .eq("source", "autopilot")
    .is("launchpad_priority", null)
    .is("archived_at", null)
    .gte("created_at", twoDaysAgo);

  if ((pendingReview ?? 0) >= 1) {
    return { needed: false, reason: `${pendingReview} autopilot concept(s) still awaiting Telegram approval` };
  }

  // Check active ads across all markets
  const { data: activeCampaigns } = await db
    .from("meta_campaigns")
    .select("id, meta_ads(meta_ad_id, status)")
    .eq("workspace_id", HAPPYSLEEP_WORKSPACE_ID)
    .eq("status", "pushed");

  let totalActiveAds = 0;
  for (const c of activeCampaigns ?? []) {
    const ads = (c.meta_ads ?? []) as Array<{ meta_ad_id: string; status: string }>;
    totalActiveAds += ads.filter((a) => a.status !== "PAUSED").length;
  }

  // If fewer than 10 active ads total, definitely need more concepts
  if (totalActiveAds < 10) {
    return { needed: true, reason: `Only ${totalActiveAds} active ads — need fresh concepts` };
  }

  // Check concepts on launchpad waiting to be pushed
  const { count: launchpadCount } = await db
    .from("image_jobs")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", HAPPYSLEEP_WORKSPACE_ID)
    .not("launchpad_priority", "is", null)
    .is("archived_at", null);

  // If fewer than 2 on launchpad, create more to maintain pipeline
  if ((launchpadCount ?? 0) < 2) {
    return { needed: true, reason: `Only ${launchpadCount} concepts on launchpad — need pipeline replenishment` };
  }

  // If 15+ active ads and 2+ on launchpad, we're well-stocked
  if (totalActiveAds >= 15) {
    return { needed: false, reason: `${totalActiveAds} active ads and ${launchpadCount} on launchpad — well-stocked` };
  }

  // Default: create if fewer than 12 active ads
  return { needed: totalActiveAds < 12, reason: `${totalActiveAds} active ads` };
}

// ---------------------------------------------------------------------------
// Helper: Pick brainstorm mode (rotate to ensure diversity)
// ---------------------------------------------------------------------------

async function pickBrainstormMode(
  db: ReturnType<typeof createServerSupabase>
): Promise<BrainstormMode> {
  // Check which modes were used recently
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentJobs } = await db
    .from("image_jobs")
    .select("cash_dna")
    .eq("workspace_id", HAPPYSLEEP_WORKSPACE_ID)
    .eq("source", "autopilot")
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(10);

  const recentModes = new Set(
    (recentJobs ?? []).map((j) => (j.cash_dna as Record<string, unknown>)?.ad_source as string).filter(Boolean)
  );

  // Pick the first mode not used recently, or fall back to from_scratch
  for (const mode of AUTOPILOT_MODES) {
    if (!recentModes.has(mode)) return mode;
  }

  // All modes used recently — pick randomly
  return AUTOPILOT_MODES[Math.floor(Math.random() * AUTOPILOT_MODES.length)];
}

// findBestLandingPage is imported from @/lib/swipe-competitor
