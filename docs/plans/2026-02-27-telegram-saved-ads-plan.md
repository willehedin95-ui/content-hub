# Telegram Bot + Saved Ads Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the user capture ads from their phone via Telegram (URL or screenshot), auto-scrape and CASH-analyze them, and view/generate concepts from them in a new "Saved Ads" section.

**Architecture:** Telegram webhook → Next.js API route → Apify scrape (URL) or direct upload (screenshot) → Supabase Storage + `saved_ads` table → GPT-5.2 CASH analysis → reply summary. Frontend reuses existing ConceptGeneratorModal pattern from Ad Spy.

**Tech Stack:** Next.js API routes, Telegram Bot API (raw fetch), Apify REST API, OpenAI GPT-5.2 vision, Supabase (Postgres + Storage), React (existing component patterns)

---

## Task 1: Create `saved_ads` database table

**Files:**
- No files — DDL via Supabase Management API

**Step 1: Run the migration**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "CREATE TABLE saved_ads ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_url text, source_platform text NOT NULL DEFAULT '\''unknown'\'', media_url text, media_type text, thumbnail_url text, headline text, body text, destination_url text, brand_name text, cash_analysis jsonb, analyzed_at timestamptz, user_notes text, is_bookmarked boolean NOT NULL DEFAULT false, telegram_message_id text, raw_scrape_data jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now() ); CREATE INDEX idx_saved_ads_created ON saved_ads (created_at DESC); CREATE INDEX idx_saved_ads_platform ON saved_ads (source_platform); CREATE INDEX idx_saved_ads_bookmarked ON saved_ads (is_bookmarked) WHERE is_bookmarked = true;"}'
```

Expected: `200 OK` with empty result.

**Step 2: Verify table exists**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer sbp_c05da7e870b172e14c07457d6d0cee99feb65eb4" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '\''saved_ads'\'' ORDER BY ordinal_position;"}'
```

Expected: List of all columns defined above.

**Step 3: Commit** — N/A (no file changes)

---

## Task 2: Add `SavedAd` TypeScript type

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Add the SavedAd interface**

Add after the `SpyAdCashAnalysis` interface (around line 622):

```typescript
// --- Saved Ads Types (Telegram capture) ---

export interface SavedAd {
  id: string;
  source_url: string | null;
  source_platform: "instagram" | "facebook" | "unknown";
  media_url: string | null;
  media_type: string | null;
  thumbnail_url: string | null;
  headline: string | null;
  body: string | null;
  destination_url: string | null;
  brand_name: string | null;
  cash_analysis: SpyAdCashAnalysis | null;
  analyzed_at: string | null;
  user_notes: string | null;
  is_bookmarked: boolean;
  telegram_message_id: string | null;
  raw_scrape_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}
```

**Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add SavedAd type for Telegram-captured ads"
```

---

## Task 3: Create Telegram bot library

**Files:**
- Create: `src/lib/telegram.ts`

**Step 1: Write the Telegram bot utility**

```typescript
// Telegram Bot API utilities — raw fetch, no SDK

const TELEGRAM_API = "https://api.telegram.org";

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return token;
}

/** Send a text message to a chat */
export async function sendMessage(
  chatId: number | string,
  text: string,
  options?: { parse_mode?: "HTML" | "MarkdownV2"; disable_web_page_preview?: boolean }
): Promise<void> {
  const token = getBotToken();
  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...options,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error(`[Telegram] sendMessage failed: ${res.status} ${err}`);
  }
}

/** Download a file from Telegram by file_id. Returns the raw Buffer. */
export async function downloadFile(fileId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const token = getBotToken();

  // Step 1: get file path
  const fileRes = await fetch(`${TELEGRAM_API}/bot${token}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  if (!fileRes.ok) throw new Error(`getFile failed: ${fileRes.status}`);
  const fileData = await fileRes.json();
  const filePath = fileData.result?.file_path;
  if (!filePath) throw new Error("No file_path in getFile response");

  // Step 2: download the file
  const downloadRes = await fetch(`${TELEGRAM_API}/file/bot${token}/${filePath}`);
  if (!downloadRes.ok) throw new Error(`File download failed: ${downloadRes.status}`);
  const buffer = Buffer.from(await downloadRes.arrayBuffer());
  const mimeType = downloadRes.headers.get("content-type") || "image/jpeg";

  return { buffer, mimeType };
}

/** Validate the X-Telegram-Bot-Api-Secret-Token header */
export function validateWebhookSecret(headerValue: string | null): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return true; // Skip validation if not configured
  return headerValue === secret;
}

/** Extract URLs from a message text */
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  return text.match(urlRegex) ?? [];
}

/** Detect platform from URL */
export function detectPlatform(url: string): "instagram" | "facebook" | "unknown" {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes("instagram.com") || hostname.includes("instagr.am")) return "instagram";
    if (hostname.includes("facebook.com") || hostname.includes("fb.com") || hostname.includes("fb.watch")) return "facebook";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** Format a CASH analysis summary for Telegram */
export function formatCashSummary(
  analysis: Record<string, unknown>,
  hubUrl: string
): string {
  const parts: string[] = ["Saved & analyzed!"];

  if (analysis.angle) parts.push(`Angle: ${analysis.angle}`);
  if (analysis.awareness_level) parts.push(`Awareness: ${analysis.awareness_level}`);
  if (analysis.style) parts.push(`Style: ${analysis.style}`);
  if (analysis.concept_type) parts.push(`Concept: ${analysis.concept_type}`);

  const hooks = analysis.hooks as string[] | undefined;
  if (hooks?.length) parts.push(`Hook: "${hooks[0]}"`);

  if (analysis.concept_description) parts.push(`\n${analysis.concept_description}`);

  parts.push(`\nView in Hub: ${hubUrl}`);

  return parts.join("\n");
}
```

**Step 2: Commit**

```bash
git add src/lib/telegram.ts
git commit -m "feat: add Telegram bot API utilities"
```

---

## Task 4: Create Telegram webhook API route

**Files:**
- Create: `src/app/api/telegram/webhook/route.ts`

**Step 1: Write the webhook handler**

This is the main entry point. It receives Telegram updates, detects URL vs photo, and orchestrates the scrape → save → analyze pipeline.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import {
  sendMessage,
  downloadFile,
  validateWebhookSecret,
  extractUrls,
  detectPlatform,
  formatCashSummary,
} from "@/lib/telegram";
import { runCashAnalysis } from "./cash-analysis";
import { scrapePost } from "./scrape";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // Validate webhook secret
  const secretHeader = req.headers.get("x-telegram-bot-api-secret-token");
  if (!validateWebhookSecret(secretHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  if (!update?.message) {
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  const chatId = message.chat.id;
  const messageId = message.message_id?.toString();

  const db = createServerSupabase();
  const hubBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://content-hub.vercel.app";

  try {
    // Check for photo (screenshot path)
    if (message.photo && message.photo.length > 0) {
      await sendMessage(chatId, "Got it! Analyzing screenshot...");

      // Get largest photo (last in array)
      const photo = message.photo[message.photo.length - 1];
      const { buffer, mimeType } = await downloadFile(photo.file_id);

      // Upload to Supabase Storage
      const filename = `saved-ads/${Date.now()}-${photo.file_id}.jpg`;
      const { error: uploadErr } = await db.storage
        .from("translated-images")
        .upload(filename, buffer, { contentType: mimeType, upsert: true });

      if (uploadErr) {
        console.error("[Telegram] Storage upload failed:", uploadErr);
        await sendMessage(chatId, "Failed to save image. Please try again.");
        return NextResponse.json({ ok: true });
      }

      const { data: publicUrl } = db.storage
        .from("translated-images")
        .getPublicUrl(filename);

      const mediaUrl = publicUrl.publicUrl;
      const userNotes = message.caption || null;

      // Insert saved ad
      const { data: savedAd, error: insertErr } = await db
        .from("saved_ads")
        .insert({
          source_platform: "unknown",
          media_url: mediaUrl,
          media_type: "image",
          thumbnail_url: mediaUrl,
          user_notes: userNotes,
          telegram_message_id: messageId,
        })
        .select()
        .single();

      if (insertErr || !savedAd) {
        console.error("[Telegram] Insert failed:", insertErr);
        await sendMessage(chatId, "Failed to save ad. Please try again.");
        return NextResponse.json({ ok: true });
      }

      // Run CASH analysis
      const analysis = await runCashAnalysis(db, savedAd.id, mediaUrl, null, userNotes);

      if (analysis) {
        const hubUrl = `${hubBaseUrl}/saved-ads?id=${savedAd.id}`;
        await sendMessage(chatId, formatCashSummary(analysis, hubUrl));
      } else {
        await sendMessage(chatId, `Saved! Analysis failed — you can re-analyze from the Hub.\n\n${hubBaseUrl}/saved-ads?id=${savedAd.id}`);
      }

      return NextResponse.json({ ok: true });
    }

    // Check for URL in text
    const text = message.text || message.caption || "";
    const urls = extractUrls(text);

    if (urls.length > 0) {
      const url = urls[0]; // Take the first URL
      const platform = detectPlatform(url);

      await sendMessage(chatId, `Got it! Scraping ${platform !== "unknown" ? platform : "post"}...`);

      // Scrape the post
      const scraped = await scrapePost(url, platform);

      // Upload media to Supabase Storage if we got a media URL
      let storedMediaUrl = scraped.media_url;
      if (scraped.media_url && scraped.media_type === "image") {
        try {
          const imgRes = await fetch(scraped.media_url);
          if (imgRes.ok) {
            const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
            const ext = scraped.media_url.includes(".png") ? "png" : "jpg";
            const filename = `saved-ads/${Date.now()}-scraped.${ext}`;
            await db.storage
              .from("translated-images")
              .upload(filename, imgBuffer, { contentType: `image/${ext}`, upsert: true });
            const { data: pub } = db.storage.from("translated-images").getPublicUrl(filename);
            storedMediaUrl = pub.publicUrl;
          }
        } catch (e) {
          console.error("[Telegram] Image re-upload failed:", e);
          // Keep original URL as fallback
        }
      }

      // Extract user notes (text minus the URL)
      const userNotes = text.replace(url, "").trim() || null;

      // Insert saved ad
      const { data: savedAd, error: insertErr } = await db
        .from("saved_ads")
        .insert({
          source_url: url,
          source_platform: platform,
          media_url: storedMediaUrl,
          media_type: scraped.media_type,
          thumbnail_url: scraped.thumbnail_url || storedMediaUrl,
          headline: scraped.headline,
          body: scraped.body,
          destination_url: scraped.destination_url,
          brand_name: scraped.brand_name,
          user_notes: userNotes,
          telegram_message_id: messageId,
          raw_scrape_data: scraped.raw_data,
        })
        .select()
        .single();

      if (insertErr || !savedAd) {
        console.error("[Telegram] Insert failed:", insertErr);
        await sendMessage(chatId, "Failed to save ad. Please try again.");
        return NextResponse.json({ ok: true });
      }

      // Run CASH analysis (only for images)
      if (scraped.media_type === "image" && storedMediaUrl) {
        const analysis = await runCashAnalysis(
          db,
          savedAd.id,
          storedMediaUrl,
          { headline: scraped.headline, body: scraped.body, brand: scraped.brand_name },
          userNotes
        );

        if (analysis) {
          const hubUrl = `${hubBaseUrl}/saved-ads?id=${savedAd.id}`;
          await sendMessage(chatId, formatCashSummary(analysis, hubUrl));
        } else {
          await sendMessage(chatId, `Saved! Analysis failed — you can re-analyze from the Hub.\n\n${hubBaseUrl}/saved-ads?id=${savedAd.id}`);
        }
      } else {
        const hubUrl = `${hubBaseUrl}/saved-ads?id=${savedAd.id}`;
        await sendMessage(chatId, `Saved! ${scraped.media_type === "video" ? "Video ads can't be auto-analyzed yet." : ""}\n\nView in Hub: ${hubUrl}`);
      }

      return NextResponse.json({ ok: true });
    }

    // No URL and no photo — just text
    await sendMessage(chatId, "Send me an ad URL (Instagram or Facebook) or a screenshot to save it.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[Telegram] Webhook error:", err);
    await sendMessage(chatId, "Something went wrong. Please try again.").catch(() => {});
    return NextResponse.json({ ok: true });
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/telegram/webhook/route.ts
git commit -m "feat: add Telegram webhook handler for ad capture"
```

---

## Task 5: Create scrape helper for the webhook

**Files:**
- Create: `src/app/api/telegram/webhook/scrape.ts`

**Step 1: Write the scraping utility**

This handles calling Apify actors for Instagram/Facebook posts. Uses the existing `apifyFetch` pattern.

```typescript
// Post scraping via Apify — extracts media, text, and metadata from a single post URL

const APIFY_API_BASE = "https://api.apify.com/v2";

// Apify actor IDs for single-post scraping
const INSTAGRAM_POST_ACTOR = "apify/instagram-post-scraper";
const FACEBOOK_POST_ACTOR = "apify/facebook-posts-scraper";

interface ScrapedPost {
  media_url: string | null;
  media_type: "image" | "video" | null;
  thumbnail_url: string | null;
  headline: string | null;
  body: string | null;
  destination_url: string | null;
  brand_name: string | null;
  raw_data: Record<string, unknown> | null;
}

function getApifyToken(): string {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is not set");
  return token;
}

/** Scrape a single post URL via Apify */
export async function scrapePost(
  url: string,
  platform: "instagram" | "facebook" | "unknown"
): Promise<ScrapedPost> {
  const empty: ScrapedPost = {
    media_url: null,
    media_type: null,
    thumbnail_url: null,
    headline: null,
    body: null,
    destination_url: null,
    brand_name: null,
    raw_data: null,
  };

  try {
    if (platform === "instagram") {
      return await scrapeInstagramPost(url);
    } else if (platform === "facebook") {
      return await scrapeFacebookPost(url);
    } else {
      // Try both, Instagram first
      try {
        return await scrapeInstagramPost(url);
      } catch {
        try {
          return await scrapeFacebookPost(url);
        } catch {
          return empty;
        }
      }
    }
  } catch (err) {
    console.error(`[Scrape] Failed to scrape ${url}:`, err);
    return empty;
  }
}

async function scrapeInstagramPost(url: string): Promise<ScrapedPost> {
  const token = getApifyToken();
  const res = await fetch(
    `${APIFY_API_BASE}/acts/${INSTAGRAM_POST_ACTOR}/runs?waitForFinish=120`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        directUrls: [url],
        resultsLimit: 1,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify IG scrape failed: ${res.status} ${text}`);
  }

  const runData = await res.json();
  const datasetId = runData.data?.defaultDatasetId;
  if (!datasetId) throw new Error("No dataset from IG scrape");

  const itemsRes = await fetch(`${APIFY_API_BASE}/datasets/${datasetId}/items`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!itemsRes.ok) throw new Error("Failed to fetch IG dataset");
  const items = await itemsRes.json();
  const post = Array.isArray(items) ? items[0] : null;
  if (!post) throw new Error("No items in IG dataset");

  // Normalize Instagram post data
  const isVideo = post.type === "Video" || post.videoUrl != null;

  return {
    media_url: isVideo ? (post.videoUrl || null) : (post.displayUrl || post.imageUrl || null),
    media_type: isVideo ? "video" : "image",
    thumbnail_url: post.displayUrl || post.imageUrl || null,
    headline: null, // Instagram posts don't have headlines
    body: post.caption || post.text || null,
    destination_url: post.url || url,
    brand_name: post.ownerUsername || post.ownerFullName || null,
    raw_data: post,
  };
}

async function scrapeFacebookPost(url: string): Promise<ScrapedPost> {
  const token = getApifyToken();
  const res = await fetch(
    `${APIFY_API_BASE}/acts/${FACEBOOK_POST_ACTOR}/runs?waitForFinish=120`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        startUrls: [{ url }],
        resultsLimit: 1,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify FB scrape failed: ${res.status} ${text}`);
  }

  const runData = await res.json();
  const datasetId = runData.data?.defaultDatasetId;
  if (!datasetId) throw new Error("No dataset from FB scrape");

  const itemsRes = await fetch(`${APIFY_API_BASE}/datasets/${datasetId}/items`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!itemsRes.ok) throw new Error("Failed to fetch FB dataset");
  const items = await itemsRes.json();
  const post = Array.isArray(items) ? items[0] : null;
  if (!post) throw new Error("No items in FB dataset");

  // Normalize Facebook post data
  const hasVideo = post.videoUrl || post.video;
  const imageUrl = post.imageUrl || post.image || post.full_picture ||
    (Array.isArray(post.images) ? post.images[0] : null) || null;

  return {
    media_url: hasVideo ? (post.videoUrl || post.video || null) : imageUrl,
    media_type: hasVideo ? "video" : (imageUrl ? "image" : null),
    thumbnail_url: imageUrl,
    headline: post.title || null,
    body: post.text || post.message || post.postText || null,
    destination_url: post.link || post.url || url,
    brand_name: post.pageName || post.userName || post.name || null,
    raw_data: post,
  };
}
```

**Step 2: Commit**

```bash
git add src/app/api/telegram/webhook/scrape.ts
git commit -m "feat: add Apify post scraping for Instagram/Facebook"
```

---

## Task 6: Create CASH analysis helper for the webhook

**Files:**
- Create: `src/app/api/telegram/webhook/cash-analysis.ts`

**Step 1: Write the CASH analysis helper**

Reuses the same GPT-5.2 vision approach from `src/app/api/spy/ads/[id]/analyze/route.ts` but works with the `saved_ads` table.

```typescript
// CASH analysis for saved ads — mirrors spy ad analysis pattern

import { OPENAI_MODEL } from "@/lib/constants";
import { calcOpenAICost } from "@/lib/pricing";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";

const SYSTEM_PROMPT = `You are a creative strategist analyzing competitor ads using the C.A.S.H. framework (Concepts, Angles, Styles, Hooks).

Given a competitor ad's creative content (copy, headline, image), determine its creative DNA.

CONCEPT TYPES (the "C" in CASH — what bucket the core insight falls in):
- avatar_facts: Raw truths about the audience (pain expressions, core wounds, buying triggers)
- market_facts: Competitive landscape intelligence (solutions tried, cultural influences)
- product_facts: Truth about the solution (discovery story, mechanism, proof)
- psychology_toolkit: Techniques to reshape understanding (metaphors, paradoxes)

ANGLES (the "A" in CASH — the psychological entry point):
Story, Contrarian, Expert Crossover, Root Cause, Accidental Discovery, Tribal, Conspiracy, Geographic, New Science, Symptom Reframe, Worldview, Case Study, Before/After, Comparison, Social Proof, Educational, Fear-Based, Aspirational, Curiosity, Problem-Agitate

STYLES (the "S" in CASH — creative execution format):
Product Shot, Lifestyle, UGC-style, Infographic, Before/After, Testimonial, Meme, Screenshot, Text Overlay, Collage, Comparison

AWARENESS LEVELS:
Unaware, Problem Aware, Solution Aware, Product Aware, Most Aware

AD SOURCES (S.T.O.R.M.I.N.G.):
Swipe (competitor), Swipe (adjacent), Template, Organic, Research, Matrix/Coverage, Internal Vector, Wildcard

COPY BLOCKS:
Pain, Promise, Proof, Curiosity, Constraints, Conditions

ADDITIONAL FIELDS:
- "offer_type": what incentive is used (percentage_off, free_shipping, bundle, free_trial, money_back_guarantee, limited_time, or null)
- "asset_type": image, video, or carousel
- "estimated_production": UGC, studio, design-tool, AI-generated, or null

Return a JSON object with exactly these keys:
- "concept_type": one of the concept type values, or null
- "angle": one of the angle values, or null
- "style": one of the style values, or null
- "hooks": array of 1-3 hook lines identified in the ad
- "awareness_level": one of the awareness level values, or null
- "ad_source": null (unknown for captured ads)
- "copy_blocks": array of copy block values used
- "concept_description": 1-2 sentence description of the ad's core concept/strategy
- "offer_type": offer type if any, or null
- "asset_type": image, video, or carousel
- "estimated_production": production style, or null

Be specific and decisive — pick the BEST matching value.`;

/** Run CASH analysis on a saved ad and update the DB. Returns analysis or null. */
export async function runCashAnalysis(
  db: SupabaseClient,
  savedAdId: string,
  mediaUrl: string,
  adCopy: { headline: string | null; body: string | null; brand: string | null } | null,
  userNotes: string | null
): Promise<Record<string, unknown> | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[CASH] OPENAI_API_KEY not set");
    return null;
  }

  try {
    // Build user message parts
    const parts: string[] = [];
    if (adCopy?.brand) parts.push(`Brand: ${adCopy.brand}`);
    if (adCopy?.headline) parts.push(`Headline: ${adCopy.headline}`);
    if (adCopy?.body) parts.push(`Ad copy: ${adCopy.body}`);
    if (userNotes) parts.push(`User notes: ${userNotes}`);
    if (parts.length === 0) parts.push("Analyze this ad image.");

    // Download image and convert to base64
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    let imageDataUrl: string | null = null;
    try {
      const imgRes = await fetch(mediaUrl);
      if (imgRes.ok) {
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        const contentType = imgRes.headers.get("content-type") || "image/jpeg";
        imageDataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
      }
    } catch {
      // Fall back to text-only
    }

    if (imageDataUrl) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: parts.join("\n") },
          { type: "image_url", image_url: { url: imageDataUrl, detail: "low" } },
        ],
      });
    } else {
      messages.push({ role: "user", content: parts.join("\n") });
    }

    const openai = new OpenAI({ apiKey });
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: 1000,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;

    const analysis = JSON.parse(content);

    // Save to DB
    await db
      .from("saved_ads")
      .update({
        cash_analysis: analysis,
        analyzed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", savedAdId);

    // Log usage
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;
    const costUsd = calcOpenAICost(inputTokens, outputTokens);

    await db.from("usage_logs").insert({
      type: "translation",
      page_id: null,
      translation_id: null,
      model: OPENAI_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      metadata: { purpose: "saved_ad_analysis", saved_ad_id: savedAdId },
    });

    return analysis;
  } catch (err) {
    console.error("[CASH] Analysis failed:", err);
    return null;
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/telegram/webhook/cash-analysis.ts
git commit -m "feat: add CASH analysis helper for saved ads"
```

---

## Task 7: Create Saved Ads list API route

**Files:**
- Create: `src/app/api/saved-ads/route.ts`

**Step 1: Write the GET handler**

Follow the same pattern as `src/app/api/spy/ads/route.ts`.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

// GET /api/saved-ads — list saved ads with filters
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));
  const platform = searchParams.get("platform"); // instagram | facebook | unknown
  const isBookmarked = searchParams.get("is_bookmarked");
  const search = searchParams.get("search")?.trim();

  const db = createServerSupabase();

  try {
    let query = db.from("saved_ads").select("*", { count: "exact" });

    if (platform) query = query.eq("source_platform", platform);
    if (isBookmarked === "true") query = query.eq("is_bookmarked", true);
    if (search) {
      query = query.or(
        `headline.ilike.%${search}%,body.ilike.%${search}%,brand_name.ilike.%${search}%,user_notes.ilike.%${search}%`
      );
    }

    query = query.order("created_at", { ascending: false });

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;

    if (error) return safeError(error, "Failed to fetch saved ads");

    return NextResponse.json({
      data: data ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    return safeError(err, "Failed to fetch saved ads");
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/saved-ads/route.ts
git commit -m "feat: add saved ads list API route"
```

---

## Task 8: Create Saved Ads analyze and generate-concepts API routes

**Files:**
- Create: `src/app/api/saved-ads/[id]/analyze/route.ts`
- Create: `src/app/api/saved-ads/[id]/generate-concepts/route.ts`
- Create: `src/app/api/saved-ads/[id]/approve-concept/route.ts`
- Create: `src/app/api/saved-ads/[id]/route.ts` (PATCH for bookmark/notes, DELETE)

**Step 1: Write the analyze route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { runCashAnalysis } from "@/app/api/telegram/webhook/cash-analysis";

export const maxDuration = 60;

// POST /api/saved-ads/[id]/analyze — re-run CASH analysis
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();

  const { data: ad, error } = await db
    .from("saved_ads")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !ad) {
    return safeError(error ?? new Error("Not found"), "Ad not found", 404);
  }

  if (!ad.media_url || ad.media_type !== "image") {
    return NextResponse.json(
      { error: "Only image ads can be analyzed" },
      { status: 400 }
    );
  }

  const analysis = await runCashAnalysis(
    db,
    id,
    ad.media_url,
    { headline: ad.headline, body: ad.body, brand: ad.brand_name },
    ad.user_notes
  );

  if (!analysis) {
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }

  return NextResponse.json({ cash_analysis: analysis });
}
```

**Step 2: Write the generate-concepts route**

Mirror `src/app/api/spy/ads/[id]/generate-concepts/route.ts` but read from `saved_ads`.

```typescript
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase";
import { CLAUDE_MODEL } from "@/lib/constants";
import { calcClaudeCost } from "@/lib/pricing";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import {
  buildConceptSystemPrompt,
  buildConceptUserPrompt,
  parseConceptProposals,
} from "@/lib/concept-generator";
import type { ProductFull, CopywritingGuideline } from "@/types";

export const maxDuration = 60;

// POST /api/saved-ads/[id]/generate-concepts
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const productSlug = body.product;
  const count = Math.min(Math.max(body.count ?? 4, 2), 6);

  if (!productSlug) {
    return NextResponse.json({ error: "product is required" }, { status: 400 });
  }

  const db = createServerSupabase();

  const { data: ad, error: adErr } = await db
    .from("saved_ads")
    .select("*")
    .eq("id", id)
    .single();

  if (adErr || !ad) {
    return safeError(adErr ?? new Error("Not found"), "Ad not found", 404);
  }

  if (!ad.cash_analysis) {
    return NextResponse.json(
      { error: "Ad must be analyzed first (run CASH analysis)" },
      { status: 400 }
    );
  }

  // Fetch product + guidelines
  const { data: product, error: productErr } = await db
    .from("products")
    .select("*")
    .eq("slug", productSlug)
    .single();

  if (productErr || !product) {
    return NextResponse.json({ error: `Product "${productSlug}" not found` }, { status: 404 });
  }

  const { data: guidelinesData } = await db
    .from("copywriting_guidelines")
    .select("*")
    .or(`product_id.eq.${product.id},product_id.is.null`)
    .order("sort_order", { ascending: true });

  const guidelines = (guidelinesData ?? []) as CopywritingGuideline[];
  const productBrief = guidelines.find((g) => g.name === "Product Brief")?.content;

  const systemPrompt = buildConceptSystemPrompt(product as ProductFull, productBrief, guidelines);

  // Build user prompt — adapt spy ad format for saved ad
  const adForPrompt = {
    headline: ad.headline,
    body: ad.body,
    description: null,
    cash_analysis: ad.cash_analysis,
    brand: ad.brand_name ? { name: ad.brand_name, category: null } : null,
    media_type: ad.media_type,
    link_url: ad.destination_url,
    cta_type: null,
  };
  const userPrompt = buildConceptUserPrompt(adForPrompt, count);

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 8000,
      temperature: 0.8,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const content = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
    if (!content) {
      return NextResponse.json({ error: "No response from AI" }, { status: 500 });
    }

    const proposals = parseConceptProposals(content);
    if (proposals.length === 0) {
      return NextResponse.json({ error: "AI returned no valid proposals" }, { status: 500 });
    }

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd = calcClaudeCost(inputTokens, outputTokens);

    await db.from("usage_logs").insert({
      type: "claude_rewrite",
      page_id: null,
      translation_id: null,
      model: CLAUDE_MODEL,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      metadata: { purpose: "concept_generation", saved_ad_id: id, product: productSlug, proposals_count: proposals.length },
    });

    return NextResponse.json({
      proposals,
      cost: { input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: costUsd },
    });
  } catch (err) {
    return safeError(err, "Concept generation failed");
  }
}
```

**Step 3: Write the approve-concept route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

// POST /api/saved-ads/[id]/approve-concept — create image_job from approved proposal
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json();
  const { proposal, product, target_languages, target_ratios } = body;

  if (!proposal || !product) {
    return NextResponse.json({ error: "proposal and product are required" }, { status: 400 });
  }

  if (!proposal.concept_name || !proposal.cash_dna || !Array.isArray(proposal.ad_copy_primary)) {
    return NextResponse.json({ error: "Invalid proposal structure" }, { status: 400 });
  }

  const db = createServerSupabase();

  const { data: ad, error: adErr } = await db
    .from("saved_ads")
    .select("id")
    .eq("id", id)
    .single();

  if (adErr || !ad) {
    return safeError(adErr ?? new Error("Not found"), "Saved ad not found", 404);
  }

  try {
    const { data: lastJob } = await db
      .from("image_jobs")
      .select("concept_number")
      .not("concept_number", "is", null)
      .order("concept_number", { ascending: false })
      .limit(1)
      .single();

    const nextNumber = (lastJob?.concept_number ?? 0) + 1;

    const tags = [...(proposal.suggested_tags ?? []), "saved-ad-generated"];

    const { data: job, error: jobErr } = await db
      .from("image_jobs")
      .insert({
        name: proposal.concept_name,
        product,
        status: "draft",
        target_languages: target_languages ?? ["sv", "da", "no"],
        target_ratios: target_ratios ?? ["1:1"],
        concept_number: nextNumber,
        tags,
        cash_dna: proposal.cash_dna,
        ad_copy_primary: proposal.ad_copy_primary,
        ad_copy_headline: proposal.ad_copy_headline ?? [],
        visual_direction: proposal.visual_direction ?? null,
        source_spy_ad_id: null, // Not from spy_ads
      })
      .select()
      .single();

    if (jobErr || !job) {
      return safeError(jobErr ?? new Error("Failed to create job"), "Failed to create concept");
    }

    return NextResponse.json({ job_id: job.id, concept_number: nextNumber });
  } catch (err) {
    return safeError(err, "Failed to create concept");
  }
}
```

**Step 4: Write the PATCH/DELETE route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";

// PATCH /api/saved-ads/[id] — update bookmark or notes
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.is_bookmarked === "boolean") updates.is_bookmarked = body.is_bookmarked;
  if (typeof body.user_notes === "string") updates.user_notes = body.user_notes;
  if (typeof body.brand_name === "string") updates.brand_name = body.brand_name;

  const db = createServerSupabase();
  const { data, error } = await db
    .from("saved_ads")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return safeError(error, "Update failed");
  return NextResponse.json(data);
}

// DELETE /api/saved-ads/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();
  const { error } = await db.from("saved_ads").delete().eq("id", id);

  if (error) return safeError(error, "Delete failed");
  return NextResponse.json({ ok: true });
}
```

**Step 5: Commit**

```bash
git add src/app/api/saved-ads/
git commit -m "feat: add saved ads CRUD, analyze, and concept generation API routes"
```

---

## Task 9: Add "Saved Ads" to sidebar

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`

**Step 1: Add the Bookmark import and nav item**

Add `Bookmark` to the lucide-react import (line 6). Add a new child to the Ads nav group (after Ad Spy, around line 28):

```typescript
{ href: "/saved-ads", label: "Saved Ads", icon: Bookmark },
```

**Step 2: Commit**

```bash
git add src/components/layout/Sidebar.tsx
git commit -m "feat: add Saved Ads to sidebar navigation"
```

---

## Task 10: Create SavedAdCard component

**Files:**
- Create: `src/components/saved-ads/SavedAdCard.tsx`

**Step 1: Write the card component**

Follow the same pattern as `SpyAdCard.tsx`.

```typescript
"use client";

import { Bookmark, Instagram, Facebook, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SavedAd } from "@/types";

const platformIcons = {
  instagram: Instagram,
  facebook: Facebook,
  unknown: Globe,
};

interface SavedAdCardProps {
  ad: SavedAd;
  isSelected: boolean;
  onClick: () => void;
}

export default function SavedAdCard({ ad, isSelected, onClick }: SavedAdCardProps) {
  const PlatformIcon = platformIcons[ad.source_platform] || Globe;
  const hasAnalysis = !!ad.cash_analysis;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-lg border transition-all hover:shadow-md overflow-hidden",
        isSelected
          ? "border-foreground/30 ring-1 ring-foreground/20 shadow-md"
          : "border-border hover:border-foreground/20"
      )}
    >
      {/* Thumbnail */}
      {ad.media_url ? (
        <div className="aspect-square bg-muted relative overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ad.thumbnail_url || ad.media_url}
            alt={ad.headline || "Saved ad"}
            className="w-full h-full object-cover"
          />
          {/* Platform badge */}
          <div className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm rounded-full p-1">
            <PlatformIcon className="w-3.5 h-3.5" />
          </div>
          {/* Bookmark indicator */}
          {ad.is_bookmarked && (
            <div className="absolute top-2 right-2">
              <Bookmark className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            </div>
          )}
          {/* Analysis badge */}
          {hasAnalysis && (
            <div className="absolute bottom-2 right-2 bg-green-500/90 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
              Analyzed
            </div>
          )}
        </div>
      ) : (
        <div className="aspect-square bg-muted flex items-center justify-center">
          <PlatformIcon className="w-8 h-8 text-muted-foreground" />
        </div>
      )}

      {/* Info */}
      <div className="p-2.5 space-y-1">
        {ad.brand_name && (
          <p className="text-xs font-medium text-foreground truncate">{ad.brand_name}</p>
        )}
        <p className="text-xs text-muted-foreground line-clamp-2">
          {ad.headline || ad.body || ad.user_notes || "No text"}
        </p>
        {ad.cash_analysis && (
          <div className="flex flex-wrap gap-1 mt-1">
            {ad.cash_analysis.angle && (
              <span className="text-[10px] bg-accent px-1.5 py-0.5 rounded">{ad.cash_analysis.angle}</span>
            )}
            {ad.cash_analysis.awareness_level && (
              <span className="text-[10px] bg-accent px-1.5 py-0.5 rounded">{ad.cash_analysis.awareness_level}</span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/saved-ads/SavedAdCard.tsx
git commit -m "feat: add SavedAdCard component"
```

---

## Task 11: Create SavedAdDetail component

**Files:**
- Create: `src/components/saved-ads/SavedAdDetail.tsx`

**Step 1: Write the detail panel**

Follow `SpyAdDetail.tsx` pattern — shows media, ad copy, CASH analysis, and concept generator button. This component will be substantial (~200 lines). Key sections:

- Media display (image or video)
- Ad copy (headline, body)
- Metadata (platform, brand, destination URL, date)
- CASH analysis section with tags (angle, style, awareness level, etc.)
- Bookmark toggle
- Notes textarea
- "Analyze" button (if not yet analyzed, image only)
- "Create Concept from This Ad" button (if analyzed)
- Uses the existing `ConceptGeneratorModal` from spy components but adapted for saved ads API endpoints

The concept generator modal needs to point to `/api/saved-ads/[id]/generate-concepts` and `/api/saved-ads/[id]/approve-concept` instead of the spy ad endpoints. The simplest approach: make `ConceptGeneratorModal` accept an `apiBasePath` prop, or create a thin wrapper.

**Note for implementer:** Read `src/components/spy/SpyAdDetail.tsx` and `src/components/spy/ConceptGeneratorModal.tsx` carefully. The SavedAdDetail should follow the same visual structure. The ConceptGeneratorModal can be reused directly if we pass the correct API endpoint prefix — check if it uses hardcoded `/api/spy/ads/` paths internally and make them configurable via prop.

**Step 2: Commit**

```bash
git add src/components/saved-ads/SavedAdDetail.tsx
git commit -m "feat: add SavedAdDetail component with CASH analysis and concept generation"
```

---

## Task 12: Create SavedAdsDashboard and page

**Files:**
- Create: `src/components/saved-ads/SavedAdsDashboard.tsx`
- Create: `src/app/saved-ads/page.tsx`

**Step 1: Write the dashboard component**

Follow the `SpyDashboard.tsx` pattern — grid of cards on the left, detail panel on the right when selected. Features:

- Grid of `SavedAdCard` components (4 columns)
- Filter bar: platform dropdown (All/Instagram/Facebook), bookmarked toggle, search input
- Pagination (load more button)
- Right panel: `SavedAdDetail` when a card is selected
- Empty state: "No saved ads yet. Send an ad URL or screenshot to your Telegram bot to get started."
- URL param `?id=XXX` support for deep-linking from Telegram bot replies

**Step 2: Write the page**

```typescript
import SavedAdsDashboard from "@/components/saved-ads/SavedAdsDashboard";

export default function SavedAdsPage() {
  return <SavedAdsDashboard />;
}
```

**Step 3: Commit**

```bash
git add src/components/saved-ads/ src/app/saved-ads/
git commit -m "feat: add Saved Ads dashboard page"
```

---

## Task 13: Make ConceptGeneratorModal reusable for saved ads

**Files:**
- Modify: `src/components/spy/ConceptGeneratorModal.tsx`

**Step 1: Check current API paths in ConceptGeneratorModal**

Read the file — it likely hardcodes `/api/spy/ads/${id}/generate-concepts` and `/api/spy/ads/${id}/approve-concept`. Add an optional `apiBasePath` prop that defaults to `/api/spy/ads` so existing spy usage is unchanged, but saved ads can pass `/api/saved-ads`.

The modal currently receives a `spy ad` prop. Make it accept a more generic shape that both `SpyAd` and `SavedAd` satisfy (they share the relevant fields: `id`, `cash_analysis`, `headline`, `body`, `media_url`).

**Step 2: Commit**

```bash
git add src/components/spy/ConceptGeneratorModal.tsx
git commit -m "refactor: make ConceptGeneratorModal reusable for saved ads"
```

---

## Task 14: Set up Telegram bot and register webhook

**Files:**
- No code files — bot creation and webhook registration

**Step 1: Create the bot**

Message @BotFather on Telegram:
- `/newbot`
- Name: "Content Hub"
- Username: something like `content_hub_ads_bot`

**Step 2: Add env vars**

Add to `.env.local`:
```
TELEGRAM_BOT_TOKEN=<token from BotFather>
TELEGRAM_WEBHOOK_SECRET=<generate a random string>
```

Also add to Vercel environment variables.

**Step 3: Register webhook**

After deploying (or for local testing with ngrok):

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<domain>/api/telegram/webhook&secret_token=<SECRET>"
```

**Step 4: Test the bot**

Send a message to the bot on Telegram. Check Vercel logs for webhook hits.

---

## Task 15: Integration testing

**Step 1: Test screenshot flow**

Send a screenshot to the Telegram bot. Verify:
- Bot replies "Analyzing screenshot..."
- Image appears in Supabase Storage under `saved-ads/`
- Row created in `saved_ads` table
- CASH analysis runs and is stored
- Bot replies with analysis summary + Hub link
- Ad appears in Saved Ads page in the Hub

**Step 2: Test URL flow (Instagram)**

Copy an Instagram ad URL and send to the bot. Verify:
- Bot replies "Scraping instagram..."
- Apify actor runs and returns post data
- Media downloaded and stored in Supabase Storage
- Row created with correct headline, body, brand_name, destination_url
- CASH analysis runs
- Bot replies with summary

**Step 3: Test URL flow (Facebook)**

Same as above with a Facebook ad URL.

**Step 4: Test concept generation from Hub**

Open the Saved Ads page → click an analyzed ad → click "Create Concept from This Ad" → select product → verify proposals appear → approve one → verify image_job is created.

**Step 5: Test edge cases**

- Send plain text (no URL, no photo) → should get "Send me an ad URL or screenshot" reply
- Send a non-Instagram/Facebook URL → should still attempt to scrape or save gracefully
- Send multiple URLs → should process the first one
