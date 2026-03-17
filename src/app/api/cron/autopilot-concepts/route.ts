import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase";
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
import { CLAUDE_MODEL, STORAGE_BUCKET } from "@/lib/constants";
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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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
    const landingPageId = await findBestLandingPage(db);
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
      concept: {
        id: job.id,
        name: proposal.concept_name,
        concept_number: nextConceptNumber,
        mode,
        images_generated: imageResults.length,
        landing_page_assigned: !!landingPageId,
      },
    });
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

// ---------------------------------------------------------------------------
// Helper: Find best performing landing page for auto-assignment
// ---------------------------------------------------------------------------

async function findBestLandingPage(
  db: ReturnType<typeof createServerSupabase>
): Promise<string | null> {
  // Find pages that have been used in pushed concepts with good ROAS
  const { data: pushedJobs } = await db
    .from("image_jobs")
    .select("landing_page_id")
    .eq("workspace_id", HAPPYSLEEP_WORKSPACE_ID)
    .eq("product", PRODUCT_SLUG)
    .not("landing_page_id", "is", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!pushedJobs?.length) {
    // No prior usage — pick the most recently published page for this product
    const { data: pages } = await db
      .from("pages")
      .select("id")
      .eq("workspace_id", HAPPYSLEEP_WORKSPACE_ID)
      .eq("product", PRODUCT_SLUG)
      .not("published_at", "is", null)
      .order("published_at", { ascending: false })
      .limit(1);

    return pages?.[0]?.id ?? null;
  }

  // Count usage frequency — most-used page is likely the best performer
  const pageCounts = new Map<string, number>();
  for (const j of pushedJobs) {
    const pid = j.landing_page_id as string;
    pageCounts.set(pid, (pageCounts.get(pid) ?? 0) + 1);
  }

  // Return the most frequently used page
  let bestPage: string | null = null;
  let bestCount = 0;
  for (const [pid, count] of pageCounts) {
    if (count > bestCount) {
      bestPage = pid;
      bestCount = count;
    }
  }

  return bestPage;
}
