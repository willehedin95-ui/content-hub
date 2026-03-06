// import-legacy-se.ts
// Merges orphaned SE Meta ad sets with their existing NO/DK counterparts in the hub.
// Usage: npx tsx scripts/import-legacy-se.ts [--dry-run]

import { readFileSync } from "fs";

// Load .env.local manually (no dotenv dependency) — same pattern as backfill-learnings.ts
const envContent = readFileSync(".env.local", "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const META_TOKEN = process.env.META_SYSTEM_USER_TOKEN!;
const META_AD_ACCOUNT = process.env.META_AD_ACCOUNT_ID!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!META_TOKEN || !META_AD_ACCOUNT) {
  console.error("Missing META_SYSTEM_USER_TOKEN or META_AD_ACCOUNT_ID");
  process.exit(1);
}

const isDryRun = process.argv.includes("--dry-run");

async function main() {
  const db = createClient(SUPABASE_URL, SUPABASE_KEY);

  console.log(isDryRun ? "=== DRY RUN MODE ===" : "=== LIVE MODE ===");
  console.log("");

  // 1. Get all active/paused SE ad sets from Meta (paginate if needed)
  let allAdSets: Array<{
    id: string;
    name: string;
    status: string;
    effective_status: string;
    campaign?: { id: string; name: string };
  }> = [];

  let nextUrl: string | null =
    `https://graph.facebook.com/v22.0/act_${META_AD_ACCOUNT}/adsets?fields=id,name,status,effective_status,campaign{name,id}&filtering=[{"field":"effective_status","operator":"IN","value":["ACTIVE","PAUSED"]}]&limit=200&access_token=${META_TOKEN}`;

  while (nextUrl) {
    const resp: Response = await fetch(nextUrl);
    const data: { data?: typeof allAdSets; paging?: { next?: string }; error?: unknown } =
      await resp.json();

    if (data.error) {
      console.error("Meta API error:", data.error);
      process.exit(1);
    }

    allAdSets = allAdSets.concat(data.data || []);
    nextUrl = data.paging?.next ?? null;
  }

  console.log(`Total ad sets fetched from Meta: ${allAdSets.length}`);

  // Filter for SE ad sets (e.g. "SE #002 | statics | bold text" or "SE#120 | quiz | name")
  const seAdSets = allAdSets.filter(
    (a) => a.name?.startsWith("SE ") || a.name?.match(/^SE#/)
  );

  console.log(`Found ${seAdSets.length} SE ad sets on Meta`);

  // 2. Get already-tracked ad sets from meta_campaigns
  const { data: tracked } = await db
    .from("meta_campaigns")
    .select("meta_adset_id")
    .not("meta_adset_id", "is", null);

  const trackedIds = new Set((tracked ?? []).map((t) => t.meta_adset_id));

  const untracked = seAdSets.filter((a) => !trackedIds.has(a.id));
  console.log(`${untracked.length} SE ad sets are NOT tracked in the hub`);

  if (untracked.length === 0) {
    console.log("\nNothing to import!");
    return;
  }

  // 3. Get all existing image_jobs to match by name
  const { data: existingJobs } = await db
    .from("image_jobs")
    .select("id, name, concept_number, product");

  // Parse concept name from ad set name
  // Examples:
  //   "SE #002 | statics | bold text" -> name="bold text", number=2
  //   "SE#120 | quiz | name"          -> name="name", number=120
  //   "SE #45 | adv | some concept - Copy" -> name="some concept", number=45
  function parseName(adSetName: string): { name: string; number: number | null } {
    const match = adSetName.match(
      /^SE\s*#?(\d+)\s*[|\-]\s*(?:statics|quiz|adv|gpt)\s*[|\-]\s*(.+?)(?:\s*-\s*Copy)?$/i
    );
    if (match) {
      return { name: match[2].trim().toLowerCase(), number: parseInt(match[1]) };
    }
    // Fallback: just use the full name
    return { name: adSetName.toLowerCase(), number: null };
  }

  // Normalize a concept name: lowercase, strip #XXX or RXXX prefix, trim
  function normalize(name: string): string {
    return name
      .toLowerCase()
      .replace(/^#\d+\s*/, "")
      .replace(/^r\d+\s*/, "")
      .trim();
  }

  function findMatch(conceptName: string) {
    return (existingJobs ?? []).find((j) => {
      const jobName = normalize(j.name);
      return (
        jobName === conceptName ||
        jobName.includes(conceptName) ||
        conceptName.includes(jobName)
      );
    });
  }

  // Get SE campaign mapping (for linking meta_campaign_id)
  const { data: campaignMapping } = await db
    .from("meta_campaign_mappings")
    .select("meta_campaign_id")
    .eq("country", "SE")
    .eq("product", "happysleep")
    .single();

  const merged: string[] = [];
  const created: string[] = [];
  const errors: string[] = [];

  for (const adSet of untracked) {
    const parsed = parseName(adSet.name);
    const match = findMatch(parsed.name);

    console.log(`\n${adSet.name} -> parsed: "${parsed.name}" (#${parsed.number})`);
    console.log(
      `  Match: ${match ? `${match.name} (${match.id.slice(0, 8)})` : "NONE"}`
    );

    if (isDryRun) {
      if (match) merged.push(adSet.name);
      else created.push(adSet.name);
      continue;
    }

    try {
      let imageJobId: string;

      if (match) {
        // Merge: add SE as a market under existing concept
        imageJobId = match.id;
        merged.push(adSet.name);
      } else {
        // Create new image_job for legacy concept
        const { data: newJob, error } = await db
          .from("image_jobs")
          .insert({
            name: parsed.name,
            product: "happysleep",
            source: "legacy",
            concept_number: parsed.number,
            status: "completed",
            target_languages: ["sv"],
            target_ratios: ["4:5", "9:16"],
          })
          .select("id")
          .single();

        if (error || !newJob) {
          errors.push(`Failed to create job for ${adSet.name}: ${error?.message}`);
          continue;
        }
        imageJobId = newJob.id;
        created.push(adSet.name);
      }

      // Create or find image_job_markets entry for SE
      const { data: existingMarket } = await db
        .from("image_job_markets")
        .select("id")
        .eq("image_job_id", imageJobId)
        .eq("market", "SE")
        .single();

      let marketId: string;
      if (existingMarket) {
        marketId = existingMarket.id;
      } else {
        const { data: newMarket, error: marketError } = await db
          .from("image_job_markets")
          .insert({
            image_job_id: imageJobId,
            market: "SE",
          })
          .select("id")
          .single();

        if (marketError || !newMarket) {
          errors.push(
            `Failed to create market for ${adSet.name}: ${marketError?.message}`
          );
          continue;
        }
        marketId = newMarket.id;
      }

      // Create meta_campaigns record linking the ad set to the hub
      // Use the actual campaign mapping if available, fall back to the ad set's campaign
      const metaCampaignId =
        campaignMapping?.meta_campaign_id ?? adSet.campaign?.id ?? null;

      const { data: newCampaign, error: campaignError } = await db
        .from("meta_campaigns")
        .insert({
          name: adSet.name,
          product: "happysleep",
          image_job_id: imageJobId,
          meta_campaign_id: metaCampaignId,
          meta_adset_id: adSet.id,
          objective: "OUTCOME_TRAFFIC",
          countries: ["SE"],
          language: "sv",
          daily_budget: 0,
          status: "pushed",
        })
        .select("id")
        .single();

      if (campaignError || !newCampaign) {
        errors.push(
          `Failed to create meta_campaigns for ${adSet.name}: ${campaignError?.message}`
        );
        continue;
      }

      // Link the market entry to the campaign
      await db
        .from("image_job_markets")
        .update({ meta_campaign_id: newCampaign.id })
        .eq("id", marketId);

      // Create lifecycle record (testing or killed based on effective_status)
      const { data: existingLifecycle } = await db
        .from("concept_lifecycle")
        .select("id")
        .eq("image_job_market_id", marketId)
        .is("exited_at", null)
        .single();

      if (!existingLifecycle) {
        await db.from("concept_lifecycle").insert({
          image_job_market_id: marketId,
          stage: adSet.effective_status === "ACTIVE" ? "testing" : "killed",
          entered_at: new Date().toISOString(),
          signal: "legacy_import",
        });
      }

      // Try to get thumbnail from Meta ad creative (best-effort)
      try {
        const adsResp = await fetch(
          `https://graph.facebook.com/v22.0/${adSet.id}/ads?fields=creative{thumbnail_url,image_url}&limit=1&access_token=${META_TOKEN}`
        );
        const adsData = await adsResp.json();
        const thumbnailUrl = adsData.data?.[0]?.creative?.thumbnail_url;
        if (thumbnailUrl) {
          console.log(`  Thumbnail: ${thumbnailUrl.slice(0, 60)}...`);
        }
      } catch {
        // Non-critical
      }

      console.log(`  OK: linked to ${match ? "existing" : "new"} concept`);
    } catch (err) {
      errors.push(`Error processing ${adSet.name}: ${err}`);
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Merged (SE added to existing concept): ${merged.length}`);
  merged.forEach((n) => console.log(`  [merged] ${n}`));
  console.log(`Created (new legacy concept): ${created.length}`);
  created.forEach((n) => console.log(`  [new] ${n}`));
  if (errors.length > 0) {
    console.log(`Errors: ${errors.length}`);
    errors.forEach((e) => console.log(`  [error] ${e}`));
  }
  if (isDryRun) console.log("\n** DRY RUN -- no changes made **");
}

main().catch(console.error);
