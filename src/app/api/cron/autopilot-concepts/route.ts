import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase-admin";
import { sendPhoto, sendMessageWithInlineKeyboard, sendMediaGroup, isTelegramDisabled } from "@/lib/telegram";
import {
  buildBrainstormSystemPrompt,
  buildBrainstormUserPrompt,
  buildHookInspiration,
  buildLearningsContext,
  parseConceptProposals,
} from "@/lib/brainstorm";
import { generateImageBriefs, resolveReferenceImages } from "@/lib/static-ad-prompt";
import { getProductAppearance } from "@/lib/product-appearance";
import { generateImage } from "@/lib/kie";
import { CLAUDE_MODEL, STORAGE_BUCKET, KIE_MODEL } from "@/lib/constants";
import { KIE_IMAGE_COST } from "@/lib/pricing";
import { swipeCompetitorAd, findBestLandingPage } from "@/lib/swipe-competitor";
import { insertJobWithConceptNumber } from "@/lib/concept-number";
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

// 300s = Vercel hobby plan hard cap. swipeCompetitorAd bottleneck per concept:
// discovery (~30-60s) + Claude Vision (~10-20s) + 3 parallel image gens (~60-90s)
// = ~100-170s. 3 concepts per run is tight but feasible with parallelized image
// gen. If a run gets killed mid-loop, pipeline-push reconcile catches the
// partial state on the next pass and re-promotes draft -> ready.
export const maxDuration = 800;

const TARGET_RATIOS = ["4:5", "9:16"];

// Autopilot-capable brainstorm modes (no user input required)
const AUTOPILOT_MODES: BrainstormMode[] = [
  "from_scratch",
  "from_internal",
  "unaware",
  "from_template",
];

// Fallback explore queries — large pool so we never run out of competitor ads.
// GetHookd returns different results over time as new ads appear, and we shuffle
// the list each run so we don't always hit the same queries first.
const DEFAULT_EXPLORE_QUERIES = [
  // Health & supplements
  "supplement health", "vitamin supplement", "collagen supplement", "protein powder",
  "gut health", "immune supplement", "probiotic", "omega 3 supplement",
  // Sleep
  "sleep aid", "pillow sleep", "mattress", "insomnia solution", "snoring remedy",
  "sleep supplement", "weighted blanket", "sleep tracker",
  // Skincare & beauty
  "skincare beauty", "anti-aging cream", "face serum", "retinol skincare",
  "moisturizer", "sunscreen", "beauty routine", "skin supplement",
  // Wellness & fitness
  "wellness product", "fitness equipment", "home gym", "yoga mat",
  "massage gun", "recovery tool", "posture corrector",
  // Weight & nutrition
  "weight loss", "meal replacement", "appetite suppressant", "keto diet",
  "intermittent fasting", "metabolism booster",
  // Pain & comfort
  "back pain relief", "neck pain", "joint supplement", "pain relief device",
  "ergonomic office", "standing desk",
  // General DTC winners
  "direct to consumer", "subscription box", "health gadget", "biohacking",
  "natural remedy", "organic product", "anti-aging",
];

/** Workspace context resolved from DB — replaces all hardcoded constants */
interface WorkspaceCtx {
  id: string;
  slug: string;
  productSlug: string;
  productName: string;
  targetLanguages: string[];
  settings: Record<string, unknown>;
  metaConfig: Record<string, unknown> | null;
}

/** Resolve workspace from ?workspace= slug or fall back to all autopilot-enabled workspaces */
async function getAutopilotWorkspaces(
  db: ReturnType<typeof createServerSupabase>,
  slugFilter?: string | null
): Promise<WorkspaceCtx[]> {
  let query = db.from("workspaces").select("id, slug, settings, meta_config, languages");
  if (slugFilter) {
    query = query.eq("slug", slugFilter);
  }
  const { data: workspaces } = await query;

  const results: WorkspaceCtx[] = [];
  for (const ws of workspaces ?? []) {
    const s = (ws.settings ?? {}) as Record<string, unknown>;
    if (isTelegramDisabled(ws)) continue;
    const autopilotMode = s.autopilot_mode as string | undefined;
    if (!autopilotMode || autopilotMode === "disabled") continue;

    const productSlug = s.default_product as string;
    if (!productSlug) {
      console.warn(`[autopilot-concepts] Workspace ${ws.slug} has no default_product, skipping`);
      continue;
    }
    const targetLanguages = (s.target_languages as string[]) ?? (ws.languages?.length ? ws.languages : ["sv", "da", "no"]);

    // Fetch product name for scoring prompt
    const { data: prod } = await db
      .from("products")
      .select("name")
      .eq("slug", productSlug)
      .eq("workspace_id", ws.id)
      .single();

    results.push({
      id: ws.id,
      slug: ws.slug,
      productSlug,
      productName: prod?.name ?? productSlug,
      targetLanguages,
      settings: s,
      metaConfig: ws.meta_config as Record<string, unknown> | null,
    });
  }
  return results;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
  const db = createServerSupabase();
  const force = req.nextUrl.searchParams.get("force") === "true";
  const wsSlug = req.nextUrl.searchParams.get("workspace");

  try {
    const workspaces = await getAutopilotWorkspaces(db, wsSlug);
    if (workspaces.length === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: "No autopilot-enabled workspaces" });
    }

    const allResults: Array<{ workspace: string; result: unknown }> = [];

    for (const ws of workspaces) {
      const label = `[${ws.productName ?? ws.slug}] `;
      try {
        const autopilotMode = (ws.settings.autopilot_mode as string) ?? "from_scratch";

        // Dynamic loop: create multiple concepts if launchpad is thin
        const MAX_PER_CRON_RUN = 3;
        for (let i = 0; i < MAX_PER_CRON_RUN; i++) {
          // Check if more concepts are needed (skip with ?force=true on first iteration only)
          if (!force || i > 0) {
            const needResult = await checkConceptNeed(db, ws.id);
            if (!needResult.needed) {
              if (i === 0) {
                allResults.push({ workspace: ws.slug, result: { skipped: true, reason: needResult.reason } });
              }
              break;
            }
          }

          // Route to the right code path
          if (autopilotMode === "competitor_swipe" && process.env.GETHOOKD_API_TOKEN) {
            const result = await runCompetitorSwipe(db, chatId, ws, label);
            allResults.push({ workspace: ws.slug, result });
            // If no ads found at all, stop retrying — Explore is exhausted for this run
            if ((result as Record<string, unknown>).exhausted || (result as Record<string, unknown>).skipped) break;
          } else {
            const result = await runFromScratch(db, chatId, ws, label);
            allResults.push({ workspace: ws.slug, result });
          }
        }
      } catch (err) {
        console.error(`[Autopilot] ${label}Fatal error:`, err);
        if (chatId) {
          await sendMessageWithInlineKeyboard(chatId,
            `❌ ${label}Autopilot concept creation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
            []
          ).catch(() => {});
        }
        allResults.push({ workspace: ws.slug, result: { error: err instanceof Error ? err.message : "Unknown error" } });
      }
    }

    return NextResponse.json({ ok: true, results: allResults });
  } catch (err) {
    console.error("[Autopilot] Fatal error:", err);
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
  ws: WorkspaceCtx,
  label: string
) {
  // Retry loop: if an ad scores too low or has no images, try the next one.
  // Max 5 attempts to avoid burning too many credits on scoring.
  const MAX_DISCOVER_ATTEMPTS = 5;

  for (let attempt = 0; attempt < MAX_DISCOVER_ATTEMPTS; attempt++) {
    // --- Discover a winning competitor ad ---
    const discovered = await discoverCompetitorAd(db, ws);

    if (!discovered) {
      if (chatId) {
        await sendMessageWithInlineKeyboard(chatId,
          `🔍 ${label}Autopilot swipe: No new ads found to swipe today (tried ${attempt + 1} ads). Add more ads to your GetHookd boards!`,
          []
        );
      }
      return { skipped: true, exhausted: true, reason: "No new ads discovered" };
    }

    console.log(`[Autopilot] ${label}Discovered ad from ${discovered.ad.brand.name}: "${discovered.ad.title?.slice(0, 60)}" (attempt ${attempt + 1})`);

    // --- Store in discovered_ads ---
    const imageUrls = getImageUrls(discovered.ad);
    await db.from("discovered_ads").upsert({
      workspace_id: ws.id,
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
      source_board_name: discovered.boardName || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,gethookd_ad_id" });

    // --- Score ad (skip for board ads — user already vetted) ---
    if (discovered.source !== "board") {
      const score = await scoreAd(discovered.ad, ws.productName);
      await db.from("discovered_ads")
        .update({ ai_relevance_score: score.score, ai_reasoning: score.reasoning })
        .eq("gethookd_ad_id", discovered.ad.id)
        .eq("workspace_id", ws.id);

      if (score.score < 6) {
        await db.from("discovered_ads")
          .update({ status: "skipped" })
          .eq("gethookd_ad_id", discovered.ad.id)
          .eq("workspace_id", ws.id);

        console.log(`[Autopilot] ${label}Ad scored ${score.score}/10 — skipping, trying next: ${score.reasoning}`);
        continue; // Try the next ad instead of giving up
      }
    }

    // Only take the FIRST unique image. GetHookd often stores the same creative
    // in multiple resolutions (media-1.jpg 270x270 + media-xxx_resized.jpg 600x600
    // + media-yyy.jpg 1200x1200 — all byte-identical or near-identical). Using
    // slice(0, 3) meant Claude analyzed 3 copies of the same image and generated
    // 9 variations of the same visual = wasted compute + ugly UI. One image is
    // enough for Claude Vision to extract the format — we still generate 3
    // visually distinct variations per concept (variationsPerImage=3 in
    // swipeCompetitorAd).
    const competitorImageUrls = imageUrls.slice(0, 1);
    if (competitorImageUrls.length === 0) {
      await db.from("discovered_ads")
        .update({ status: "skipped" })
        .eq("gethookd_ad_id", discovered.ad.id)
        .eq("workspace_id", ws.id);
      continue; // Try the next ad instead of giving up
    }

    // Found a good ad — proceed to swipe it
    return await executeSwipe(db, chatId, ws, label, discovered, competitorImageUrls);
  }

  // All attempts exhausted (all ads scored too low)
  if (chatId) {
    await sendMessageWithInlineKeyboard(chatId,
      `🔍 ${label}Autopilot swipe: Tried ${MAX_DISCOVER_ATTEMPTS} ads but none scored high enough. Will retry tomorrow.`,
      []
    );
  }
  return { skipped: true, exhausted: false, reason: `All ${MAX_DISCOVER_ATTEMPTS} discovered ads scored too low` };
}

/** Execute the actual swipe after a good ad has been found and scored */
async function executeSwipe(
  db: ReturnType<typeof createServerSupabase>,
  chatId: string | undefined,
  ws: WorkspaceCtx,
  label: string,
  discovered: { ad: GethookdAd; source: "board" | "brand_spy" | "explore"; boardName?: string },
  competitorImageUrls: string[]
) {
  // If the board name contains "native", don't inject our product into images
  const isNativeBoard = discovered.boardName
    ? /native/i.test(discovered.boardName)
    : false;

  // --- Delegate to shared swipe function ---
  try {
    const result = await swipeCompetitorAd({
      workspaceId: ws.id,
      productSlug: ws.productSlug,
      competitorImageUrls,
      competitorAdCopy: discovered.ad.body,
      brandName: discovered.ad.brand.name,
      gethookdAdId: discovered.ad.id,
      notifyTelegram: !!chatId,
      forceNoProduct: isNativeBoard,
      swipeMode: isNativeBoard ? "faithful" : "adapt",
    });

    // Update discovered_ads with the job link
    await db.from("discovered_ads")
      .update({ status: "swiped", image_job_id: result.jobId, updated_at: new Date().toISOString() })
      .eq("gethookd_ad_id", discovered.ad.id)
      .eq("workspace_id", ws.id);

    return {
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
    };
  } catch (err) {
    console.error(`[Autopilot/swipe] ${label}Swipe failed:`, err);

    // Mark discovered_ad as skipped so it doesn't stay stuck in "swiping"
    await db.from("discovered_ads")
      .update({ status: "skipped", updated_at: new Date().toISOString() })
      .eq("gethookd_ad_id", discovered.ad.id)
      .eq("workspace_id", ws.id);

    if (chatId) {
      await sendMessageWithInlineKeyboard(chatId,
        `⚠️ ${label}Autopilot swipe failed for ad from ${discovered.ad.brand.name}: ${err instanceof Error ? err.message : "Unknown error"}`,
        []
      );
    }
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ===========================================================================
// DISCOVER COMPETITOR AD (Board → Brand Spy → Explore)
// ===========================================================================

async function discoverCompetitorAd(
  db: ReturnType<typeof createServerSupabase>,
  ws: WorkspaceCtx
): Promise<{ ad: GethookdAd; source: "board" | "brand_spy" | "explore"; boardName?: string } | null> {
  // Get already-seen ad IDs to avoid duplicates
  const { data: seenAds } = await db
    .from("discovered_ads")
    .select("gethookd_ad_id")
    .eq("workspace_id", ws.id);

  const seenIds = new Set((seenAds ?? []).map((a) => a.gethookd_ad_id));

  // --- Priority 1: Boards (user-curated) ---
  // Support both old single gethookd_board_id and new gethookd_board_ids array
  const boardIds: string[] = (() => {
    const ids = ws.settings.gethookd_board_ids as string[] | undefined;
    if (ids && ids.length > 0) return ids;
    const single = ws.settings.gethookd_board_id as string | undefined;
    return single ? [single] : [];
  })();

  const MAX_BOARD_PAGES = 10;
  for (const boardId of boardIds) {
    for (let page = 1; page <= MAX_BOARD_PAGES; page++) {
      try {
        const { ads, total, boardName } = await getBoardAds(boardId, page, 50);
        const imageAds = filterImageAds(ads);
        const unswiped = imageAds.filter((a) => !seenIds.has(a.id));
        if (unswiped.length > 0) {
          console.log(`[Autopilot] Found ${unswiped.length} unswiped board ads (board ${boardId}, page ${page}, "${boardName}")`);
          return { ad: unswiped[0], source: "board", boardName };
        }
        // No more pages to check
        if (ads.length < 50 || page * 50 >= total) break;
      } catch (err) {
        console.error(`[Autopilot] Board ${boardId} page ${page} fetch failed:`, err);
        break;
      }
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

  // --- Priority 3: Explore (try queries with multiple sort strategies) ---
  const queries = (ws.settings.gethookd_explore_queries as string[]) ?? DEFAULT_EXPLORE_QUERIES;
  // Shuffle so we don't always burn credits on the same queries first
  const shuffled = [...queries].sort(() => Math.random() - 0.5);
  const MAX_PAGES = 5;

  // Two sort strategies: newest winners first (freshest creative), then proven runners.
  // Filter: min 30 days (proven, not just launched), max 365 days (not ancient garbage).
  const MIN_DAYS_ACTIVE = 30;
  const MAX_DAYS_ACTIVE = 365;
  const sortStrategies: Array<{ sort_column: string; sort_direction: string }> = [
    { sort_column: "first_seen", sort_direction: "desc" },   // Newest first — fresh creative
    { sort_column: "days_active", sort_direction: "desc" },   // Proven runners (capped at 1 year)
  ];

  for (const sort of sortStrategies) {
    // Only try a subset of queries per strategy to stay within credit budget
    const queryBatch = shuffled.slice(0, 15);
    for (const query of queryBatch) {
      for (let page = 1; page <= MAX_PAGES; page++) {
        try {
          const { ads, total } = await exploreAds({
            query,
            "ad-format": "image",
            performance_scores: "winning,scaling",
            ads_per_brand_limit: 2,
            per_page: 20,
            page,
            sort_column: sort.sort_column,
            sort_direction: sort.sort_direction,
          });

          const unseen = ads
            .filter((a) => !seenIds.has(a.id))
            .filter((a) => (a.days_active ?? 0) >= MIN_DAYS_ACTIVE && (a.days_active ?? 0) <= MAX_DAYS_ACTIVE);
          if (unseen.length > 0) {
            console.log(`[Autopilot] Found ${unseen.length} unseen explore ads for query "${query}" (page ${page}, sort: ${sort.sort_column})`);
            return { ad: unseen[0], source: "explore" };
          }

          // No more pages to check for this query
          if (page * 20 >= total || ads.length === 0) break;
        } catch (err) {
          console.error(`[Autopilot] Explore fetch failed for "${query}" page ${page}:`, err);
          break; // Skip to next query on error
        }
      }
    }
  }

  console.log("[Autopilot] All explore queries exhausted — no unseen ads found");
  return null;
}

// ===========================================================================
// SCORE AD (Claude Haiku quick relevance check)
// ===========================================================================

async function scoreAd(ad: GethookdAd, productName: string = "sleep pillow"): Promise<{ score: number; reasoning: string }> {
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
        `We adapt ads from ANY niche to sell ${productName}. We don't copy the product — we swipe the visual format, layout, and persuasion mechanics and adapt them to our product.`,
        "",
        `Ad title: ${ad.title}`,
        `Brand: ${ad.brand.name}`,
        `Format: ${ad.display_format}`,
        `Days active: ${ad.days_active}`,
        "",
        "Score 1-10 based on:",
        "- Is the visual format distinctive and reproducible? (split images, before/after, X-ray, handwritten text, native editorial, flat-lay, medical imagery, etc.)",
        "- Is the persuasion structure strong? (clear pain→promise, social proof, curiosity gap, authority positioning)",
        "- Would this format work when adapted to a completely different product?",
        "- Is this a static image ad (not just a product photo or logo)?",
        `- How easily can this ad's FORMAT be adapted specifically for ${productName}? Consider whether the visual layout, text structure, and persuasion pattern translate well.`,
        "",
        "REJECT (score 1-3):",
        "- Sexual, suggestive, or provocative imagery (lingerie, cleavage-focused, sexualized poses)",
        "- Just a product photo or lifestyle shot with no persuasion structure",
        "- Personalized products (custom names, engravings)",
        "- Purely promotional (just a discount, no hook or angle)",
        "- Format is too product-specific to adapt (e.g. physical shape comparison only works for physical products)",
        "",
        "Also note in your reasoning whether this is a NATIVE ad (organic-looking, no product visible, creates curiosity/intrigue) or a PRODUCT ad (product prominently featured).",
        "",
        "Respond in JSON only: {\"score\": N, \"reasoning\": \"1-2 sentences. Start with [NATIVE] or [PRODUCT].\"}",
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
  chatId: string | undefined,
  ws: WorkspaceCtx,
  label: string
) {
  // --- Step 2: Pick brainstorm mode ---
  const mode = await pickBrainstormMode(db, ws.id);

  // --- Step 3: Fetch product context ---
  const { data: product } = await db
    .from("products")
    .select("*")
    .eq("slug", ws.productSlug)
    .eq("workspace_id", ws.id)
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
  const hookInspiration = await buildHookInspiration(ws.productSlug, ws.id);
  const learningsContext = await buildLearningsContext(ws.productSlug, ws.id);
  const { buildResearchContext } = await import("@/lib/research-context");
  const researchContext = await buildResearchContext(ws.productSlug, ws.id);

  // Fetch recent concepts for diversity enforcement (all modes, not just from_internal)
  const { data: recentConceptData } = await db
    .from("image_jobs")
    .select("name, cash_dna, visual_direction, created_at, id")
    .eq("workspace_id", ws.id)
    .eq("product", ws.productSlug)
    .not("cash_dna", "is", null)
    .order("created_at", { ascending: false })
    .limit(30);

  const existingConcepts = (recentConceptData ?? []).map((j) => ({
    name: j.name,
    angle: (j.cash_dna as Record<string, unknown>)?.angle as string ?? "unknown",
    awareness: (j.cash_dna as Record<string, unknown>)?.awareness_level as string ?? "unknown",
  }));

  // Extract angles from last 7 days for diversity enforcement across ALL modes
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentAngles = (recentConceptData ?? [])
    .filter((j) => new Date(j.created_at) >= sevenDaysAgo)
    .map((j) => (j.cash_dna as Record<string, unknown>)?.angle as string)
    .filter(Boolean);

  // Extract visual scenes from last 7 days for cross-concept scene diversity
  const recentVisualScenes = (recentConceptData ?? [])
    .filter((j) => new Date(j.created_at) >= sevenDaysAgo && j.visual_direction)
    .map((j) => j.visual_direction as string)
    .filter(Boolean)
    .slice(0, 10); // Keep it manageable

  // Fetch recent image generation prompts for image-level diversity
  const recentJobIds = (recentConceptData ?? [])
    .filter((j) => new Date(j.created_at) >= sevenDaysAgo)
    .map((j) => j.id)
    .slice(0, 10);
  let recentImagePrompts: string[] = [];
  if (recentJobIds.length > 0) {
    const { data: recentImages } = await db
      .from("source_images")
      .select("generation_prompt")
      .in("job_id", recentJobIds)
      .not("generation_prompt", "is", null)
      .limit(30);
    recentImagePrompts = (recentImages ?? [])
      .map((i) => i.generation_prompt as string)
      .filter(Boolean);
  }

  const systemPrompt = buildBrainstormSystemPrompt(
    product as ProductFull,
    undefined, // productBrief
    (guidelines ?? []) as CopywritingGuideline[],
    (segments ?? []) as ProductSegment[],
    mode,
    hookInspiration,
    learningsContext,
    undefined, undefined, undefined, // competitor params
    researchContext
  );

  const brainstormRequest: BrainstormRequest = {
    mode,
    product: ws.productSlug,
    count: 1, // One concept at a time to stay within cron limits
  };

  const userPrompt = buildBrainstormUserPrompt(
    brainstormRequest,
    (segments ?? []) as ProductSegment[],
    mode === "from_internal" ? existingConcepts : undefined,
    undefined, // rejectedConcepts
    recentAngles,
    recentVisualScenes
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
        `⚠️ ${label}Autopilot brainstorm returned no valid proposals (mode: ${mode}). Will retry tomorrow.`,
        []
      );
    }
    return { error: "No proposals parsed" };
  }

  const proposal = proposals[0];

  // --- Step 5: Create image_job (retries concept_number on unique violation) ---
  const { job: insertedJob, conceptNumber: nextConceptNumber, error: jobErr } = await insertJobWithConceptNumber(db, ws.id, {
    name: proposal.concept_name,
    product: ws.productSlug,
    status: "draft",
    source: "autopilot",
    target_languages: ws.targetLanguages,
    target_ratios: TARGET_RATIOS,
    cash_dna: proposal.cash_dna,
    ad_copy_primary: proposal.ad_copy_primary,
    ad_copy_headline: proposal.ad_copy_headline,
    visual_direction: proposal.visual_direction,
    tags: proposal.suggested_tags ?? [],
  });

  if (jobErr || !insertedJob) {
    console.error("[Autopilot] Failed to create image_job:", jobErr);
    return { error: "Failed to create job" };
  }
  const job = insertedJob;

  // --- Step 6: Auto-assign landing page ---
  const landingPageId = await findBestLandingPage(db, ws.id, ws.productSlug, {
    adCopyPrimary: proposal.ad_copy_primary,
    adCopyHeadline: proposal.ad_copy_headline,
    conceptName: proposal.concept_name,
  });
  if (landingPageId) {
    await db.from("image_jobs").update({ landing_page_id: landingPageId }).eq("id", job.id);
  } else if (chatId) {
    await sendMessageWithInlineKeyboard(chatId,
      `⚠️ ${label}Concept #${nextConceptNumber} has no landing page — no published pages found for ${ws.productSlug}. Approval will be blocked until a page is assigned.`,
      []
    );
  }

  // --- Step 7: Generate images ---
  const { data: productImages } = await db
    .from("product_images")
    .select("url, category")
    .eq("product_id", product.id)
    .order("sort_order", { ascending: true });

  let imageResults: Array<{ url: string; sourceImageId: string }> = [];
  let softRetryAttempted = false;
  try {
    const productAppearance = getProductAppearance(product as ProductFull);
    const { briefs } = await generateImageBriefs({
      job: job as unknown as Parameters<typeof generateImageBriefs>[0]["job"],
      product: product as ProductFull,
      productImages: (productImages ?? []) as Array<{ url: string; category: string }>,
      count: 3,
      previousPrompts: recentImagePrompts,
      productAppearance,
    });

    // Helper: do one image attempt — Kie API call + download + storage upload + DB insert.
    // Used for both the main pass and the soft-retry pass.
    async function runOneBrief(
      brief: typeof briefs[number],
      index: number,
      promptOverride: string | null,
      refsOverride: string[] | null,
      softMode: boolean,
    ): Promise<{ url: string; sourceImageId: string }> {
      const prompt = promptOverride ?? brief.prompt;
      const referenceUrls = refsOverride ?? resolveReferenceImages(
        brief,
        (productImages ?? []) as Array<{ url: string; category: string }>,
      );

      const { urls: resultUrls } = await generateImage(prompt, referenceUrls, "4:5");
      if (!resultUrls?.length) throw new Error("No image generated");

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

      const { data: sourceImage } = await db
        .from("source_images")
        .insert({
          job_id: job.id,
          original_url: urlData.publicUrl,
          filename: `${brief.style}-${fileId.slice(0, 8)}.png`,
          processing_order: index,
          skip_translation: softMode,
          generation_prompt: prompt,
          generation_style: softMode ? `${brief.style}-softretry` : brief.style,
          batch: 1,
        })
        .select()
        .single();

      return { url: urlData.publicUrl, sourceImageId: sourceImage?.id ?? "" };
    }

    // ----- First pass: full briefs -----
    const settled = await Promise.allSettled(
      briefs.map((brief, index) => runOneBrief(brief, index, null, null, false)),
    );

    const failedImages: string[] = [];
    for (const outcome of settled) {
      if (outcome.status === "fulfilled") {
        imageResults.push(outcome.value);
      } else {
        const errMsg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        failedImages.push(errMsg);
        console.error("[Autopilot] Image generation failed:", outcome.reason);
      }
    }

    // ----- Soft retry: only when ALL images failed -----
    // Strips claim-heavy product appearance, drops product reference images,
    // and uses a generic "natural lifestyle photograph" framing. This usually
    // gets past Kie AI's content safety filter when the original brief tripped it.
    if (imageResults.length === 0 && briefs.length > 0) {
      softRetryAttempted = true;
      console.warn(`[Autopilot] ${label}All ${briefs.length} images failed — attempting soft retry with simplified prompts`);

      const softSettled = await Promise.allSettled(
        briefs.map((brief, index) => {
          const softPrompt = `Natural, candid lifestyle photograph. ${brief.prompt}`;
          // Only use product hero as reference (no per-style refs that may include
          // specific style anchors that triggered the filter)
          const heroRefs = (productImages ?? [])
            .filter((i) => i.category === "product" || i.category === "hero")
            .slice(0, 1)
            .map((i) => i.url);
          return runOneBrief(brief, index, softPrompt, heroRefs, true);
        }),
      );

      for (const outcome of softSettled) {
        if (outcome.status === "fulfilled") {
          imageResults.push(outcome.value);
        } else {
          const errMsg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
          console.error("[Autopilot] Soft retry image generation failed:", outcome.reason);
          failedImages.push(`[soft] ${errMsg}`);
        }
      }

      if (imageResults.length > 0) {
        console.log(`[Autopilot] ${label}Soft retry recovered ${imageResults.length}/${briefs.length} images`);
      }
    }

    // Alert on significant image generation failures (only if no chat configured, skip)
    if (failedImages.length > 0 && failedImages.length >= imageResults.length && chatId) {
      const lines = [
        `⚠️ ${label}Concept #${nextConceptNumber} image generation: ${imageResults.length}/3 succeeded, ${failedImages.length} failed`,
      ];
      if (softRetryAttempted) {
        lines.push(`Soft retry attempted: ${imageResults.length > 0 ? "recovered partial" : "still failed"}`);
      }
      lines.push(failedImages.slice(0, 2).join("; "));
      await sendMessageWithInlineKeyboard(chatId, lines.join("\n"), []);
    }

    // Update job status — failed if zero images, ready otherwise
    await db.from("image_jobs").update({
      status: imageResults.length > 0 ? "ready" : "failed",
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
  } catch (err) {
    console.error("[Autopilot] Image generation error:", err);
    // Make sure the job doesn't stay stuck in "draft"
    await db.from("image_jobs").update({
      status: "failed",
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
  }

  // Explicit alert when ALL images failed even after soft retry — used to be silent
  if (imageResults.length === 0 && chatId) {
    await sendMessageWithInlineKeyboard(chatId,
      `🚫 ${label}Concept #${nextConceptNumber} "${proposal.concept_name}" failed: 0/3 images generated.\nSoft retry attempted: ${softRetryAttempted ? "yes" : "no"}.\nLikely cause: Kie AI content safety filter.`,
      [],
    ).catch(() => {});
  }

  // --- Step 8: Send Telegram notification ---
  if (chatId) {
    const angle = proposal.cash_dna?.angle ?? "—";
    const awareness = proposal.cash_dna?.awareness_level ?? "—";
    const hook = proposal.cash_dna?.hooks?.[0] ?? "—";
    const primaryText = proposal.ad_copy_primary?.[0] ?? "";
    const headline = proposal.ad_copy_headline?.[0] ?? "";
    const imagesGenerated = imageResults.length;
    const pageAssigned = landingPageId ? "Yes" : "No";
    const hubUrl = process.env.NEXT_PUBLIC_APP_URL || "https://content-hub-nine-theta.vercel.app";

    const captionLines = [
      `🤖 ${label}Concept #${nextConceptNumber}: "${proposal.concept_name}"`,
      `${angle} | ${awareness} | ${mode}`,
      ``,
    ];
    if (primaryText) {
      const truncated = primaryText.length > 300 ? primaryText.slice(0, 300) + "..." : primaryText;
      captionLines.push(truncated);
      captionLines.push(``);
    }
    if (headline) {
      captionLines.push(`Headline: ${headline}`);
      captionLines.push(``);
    }
    captionLines.push(`Images: ${imagesGenerated}/3 | Page: ${pageAssigned}`);
    captionLines.push(`${hubUrl}/concepts/${job.id}`);
    captionLines.push(`Review: ${hubUrl}/review?highlight=${job.id}`);

    const caption = captionLines.join("\n");

    const buttons = [[
      { text: "✅ Approve", callback_data: `concept_approve:${job.id}` },
      { text: "❌ Reject", callback_data: `concept_reject:${job.id}` },
    ]];

    if (imageResults.length > 1) {
      // Send all images as album, then buttons as follow-up
      const imageUrls = imageResults.map((r) => r.url);
      await sendMediaGroup(chatId, imageUrls, caption);
      await sendMessageWithInlineKeyboard(
        chatId,
        `Approve concept #${nextConceptNumber}?`,
        buttons
      );
    } else if (imageResults.length === 1) {
      await sendPhoto(chatId, imageResults[0].url, caption, buttons);
    } else {
      await sendMessageWithInlineKeyboard(chatId, caption, buttons);
    }
  }

  return {
    mode: "from_scratch",
    concept: {
      id: job.id,
      name: proposal.concept_name,
      concept_number: nextConceptNumber,
      mode,
      images_generated: imageResults.length,
      landing_page_assigned: !!landingPageId,
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: Check if new concepts are needed
// ---------------------------------------------------------------------------

async function checkConceptNeed(
  db: ReturnType<typeof createServerSupabase>,
  workspaceId: string
): Promise<{ needed: boolean; reason: string; maxToday?: number }> {
  // Always generate concepts — the launchpad should always be stocked.
  // The only limit is a daily cap to avoid wasting AI credits.
  // Pushing is gated separately by pipeline-push budget logic.
  const MAX_PER_DAY = 3;

  // Count how many autopilot concepts were created today
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { count: todayCount } = await db
    .from("image_jobs")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("source", "autopilot")
    .gte("created_at", todayStart.toISOString());

  const created = todayCount ?? 0;
  if (created >= MAX_PER_DAY) {
    return { needed: false, reason: `Already created ${created}/${MAX_PER_DAY} autopilot concepts today` };
  }

  return { needed: true, reason: `Creating up to ${MAX_PER_DAY} today (${created} done so far)`, maxToday: MAX_PER_DAY };
}

// ---------------------------------------------------------------------------
// Helper: Pick brainstorm mode (rotate to ensure diversity)
// ---------------------------------------------------------------------------

async function pickBrainstormMode(
  db: ReturnType<typeof createServerSupabase>,
  workspaceId: string
): Promise<BrainstormMode> {
  // Check which modes were used recently
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentJobs } = await db
    .from("image_jobs")
    .select("cash_dna")
    .eq("workspace_id", workspaceId)
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
