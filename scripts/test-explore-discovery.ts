#!/usr/bin/env npx tsx
/**
 * Test the Explore discovery flow:
 * 1. Fetch ads from GetHookd Explore with user's exact filters
 * 2. Score each with Claude Vision (swipe potential)
 * 3. Insert into discovered_ads as status="pending"
 *
 * Usage: npx tsx scripts/test-explore-discovery.ts [count]
 * Default: 15 ads
 */
import * as fs from "fs";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

// Load .env.local manually
const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=][^=]*)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const val = match[2].trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const WORKSPACE_ID = "c40221e2-96fb-4774-92db-74ec0227b262";
const GETHOOKD_TOKEN = process.env.GETHOOKD_API_TOKEN!;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!GETHOOKD_TOKEN) throw new Error("GETHOOKD_API_TOKEN not set");
if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY not set");

const db = createClient(SUPABASE_URL, SUPABASE_KEY);
const claude = new Anthropic({ apiKey: ANTHROPIC_KEY });

// User's exact Explore filters
const EXPLORE_FILTERS = {
  query: "", // no search terms
  "ad-format": "image",
  performance_scores: "winning", // 5 stars only
  ads_per_brand_limit: 1,
  status: "active", // still running
  "run-time": 30, // 30+ days
  language: "EN", // English
  active_ads_count: 100, // brand has 100+ active ads
  sort_column: "start_date", // "Newest" — fresh winning ads, not ancient legacy ones
  sort_direction: "desc",
};

interface GethookdAd {
  id: number;
  external_id: string;
  display_format: string;
  title: string;
  body: string;
  landing_page: string;
  days_active: number;
  performance_score: number | null;
  performance_score_title: string | null;
  share_url: string;
  brand: { external_id: string; name: string; logo_url: string; active_ads: number };
  media: Array<{ type: string; url: string; resized_url: string | null; thumbnail_url: string }>;
}

async function fetchExploreAds(count: number): Promise<GethookdAd[]> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(EXPLORE_FILTERS)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  params.set("per_page", String(Math.min(count * 2, 100))); // fetch extra since we filter client-side

  const url = `https://app.gethookd.ai/api/v1/explore?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${GETHOOKD_TOKEN}` },
  });

  if (!res.ok) throw new Error(`GetHookd API error: ${res.status} ${await res.text()}`);
  const json = await res.json();

  console.log(`Credits used: ${json.used_credits}, remaining: ${json.remaining_credits}`);
  console.log(`Total matching: ${json.meta?.total ?? "?"}`);

  const ads: GethookdAd[] = json.data ?? [];

  // Client-side filter: brand must have 100+ active ads (API filter is unreliable)
  const filtered = ads.filter((ad) => ad.brand.active_ads >= 100);
  console.log(`After active_ads>=100 filter: ${filtered.length}/${ads.length}`);

  return filtered.slice(0, count);
}

async function scoreAd(ad: GethookdAd): Promise<{ score: number; reasoning: string }> {
  const imageUrls = ad.media.filter((m) => m.type === "image").map((m) => m.url);
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
      `Brand: ${ad.brand.name} (${ad.brand.active_ads} active ads)`,
      `Format: ${ad.display_format}`,
      `Days active: ${ad.days_active}`,
      `Body preview: ${(ad.body || "").slice(0, 200)}`,
      "",
      "Score 1-10 based on:",
      "- Is the visual format distinctive and reproducible? (split images, before/after, X-ray, handwritten text, medical imagery, native/editorial feel, etc.)",
      "- Is the persuasion structure strong? (clear pain→promise, social proof, curiosity gap, authority positioning)",
      "- Would this format work when adapted to a completely different product?",
      "- Is this a static image ad with clear visual elements (not just a product photo or logo)?",
      "",
      "REJECT (score 1-4) ads that are:",
      "- Just a product photo or lifestyle shot with no persuasion structure",
      "- Brand-specific (relies on brand recognition, not transferable)",
      "- Promotional only (just a discount/sale, no hook or angle)",
      "- Personalized products (custom names, engravings, etc.)",
      "- Purely text-based with no visual interest",
      "- Sexual, suggestive, or overly provocative imagery (lingerie, cleavage-focused, sexualized poses)",
      "",
      "PASS (score 7-10) ads that have:",
      "- A distinctive visual format that catches attention in a feed",
      "- A clear persuasion structure that can be adapted to any product",
      "- Native/editorial/medical/authority visual language",
      "",
      "",
      "Also note whether this is a NATIVE ad (organic-looking, no product visible, creates curiosity/intrigue) or a PRODUCT ad (product prominently featured).",
      "",
      "Respond in JSON only: {\"score\": N, \"reasoning\": \"1-2 sentences. Start with [NATIVE] or [PRODUCT].\"}",
    ].join("\n"),
  });

  try {
    const response = await claude.messages.create({
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
    console.error(`  Scoring failed for ${ad.brand.name}:`, err);
    return { score: 5, reasoning: "Scoring failed — needs manual review" };
  }
}

async function main() {
  const count = parseInt(process.argv[2] || "15");
  console.log(`\n=== Explore Discovery Test ===`);
  console.log(`Fetching ${count} ads with user's exact filters...\n`);

  // Check already-seen ads
  const { data: seenAds } = await db
    .from("discovered_ads")
    .select("gethookd_ad_id")
    .eq("workspace_id", WORKSPACE_ID);
  const seenIds = new Set((seenAds ?? []).map((a) => a.gethookd_ad_id));
  console.log(`Already seen: ${seenIds.size} ads\n`);

  const ads = await fetchExploreAds(count + seenIds.size); // fetch extra to account for seen
  const newAds = ads.filter((ad) => !seenIds.has(ad.id));
  console.log(`New (unseen) ads: ${newAds.length}\n`);

  const toProcess = newAds.slice(0, count);
  let inserted = 0;
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const ad = toProcess[i];
    const imageUrls = ad.media.filter((m) => m.type === "image").map((m) => m.url);

    console.log(`[${i + 1}/${toProcess.length}] ${ad.brand.name} — ${ad.days_active}d active, ${ad.brand.active_ads} brand ads`);
    console.log(`  Title: ${(ad.title || "").slice(0, 60)}`);
    console.log(`  Body: ${(ad.body || "").slice(0, 80)}`);
    console.log(`  Images: ${imageUrls.length}`);

    // Score with Claude Vision
    const score = await scoreAd(ad);
    console.log(`  AI Score: ${score.score}/10 — ${score.reasoning}`);

    // Insert as pending (regardless of score — user will review)
    const { error } = await db.from("discovered_ads").upsert({
      workspace_id: WORKSPACE_ID,
      gethookd_ad_id: ad.id,
      external_id: ad.external_id,
      brand_name: ad.brand.name,
      title: ad.title || "",
      body: ad.body || "",
      landing_page: ad.landing_page || "",
      performance_score: ad.performance_score,
      performance_score_title: ad.performance_score_title,
      days_active: ad.days_active,
      display_format: ad.display_format,
      media_urls: imageUrls,
      source: "explore",
      status: "pending",
      ai_relevance_score: score.score,
      ai_reasoning: score.reasoning,
      ad_type: "image",
      updated_at: new Date().toISOString(),
    }, { onConflict: "workspace_id,gethookd_ad_id" });

    if (error) {
      console.log(`  ERROR inserting: ${error.message}`);
      failed++;
    } else {
      inserted++;
      if (score.score >= 6) passed++;
      console.log(`  ✓ Inserted as pending`);
    }
    console.log();
  }

  console.log(`\n=== Results ===`);
  console.log(`Inserted: ${inserted} ads`);
  console.log(`Passed (score ≥6): ${passed}`);
  console.log(`Low score (< 6): ${inserted - passed}`);
  console.log(`Errors: ${failed}`);
  console.log(`\nOpen the Hub → Ad Spy → Discovered tab to review them.`);
}

main().catch(console.error);
