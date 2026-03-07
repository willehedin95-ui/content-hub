/**
 * One-off script: Create 3 Meta video campaigns for HappySleep (SE, NO, DK)
 * with 500 SEK daily budget (CBO) and insert campaign mappings into Supabase.
 *
 * Usage: npx tsx scripts/create-video-campaigns.ts
 */

import { readFileSync } from "fs";

// Load .env.local manually (no dotenv dependency)
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

const META_API_BASE = "https://graph.facebook.com/v22.0";
const TOKEN = process.env.META_SYSTEM_USER_TOKEN!;
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!TOKEN || !AD_ACCOUNT_ID) {
  console.error("Missing META_SYSTEM_USER_TOKEN or META_AD_ACCOUNT_ID in .env.local");
  process.exit(1);
}

interface CampaignDef {
  name: string;
  country: string;
  existingId?: string; // If already created, skip creation
}

// SE was already created in a previous run
const campaigns: CampaignDef[] = [
  { name: "SE - Video Ads - HappySleep", country: "SE", existingId: "120240433475640336" },
  { name: "NO - Video Ads - HappySleep", country: "NO" },
  { name: "DK - Video Ads - HappySleep", country: "DK" },
];

// 500 SEK = 50000 in Meta API "cents" (smallest currency unit)
const DAILY_BUDGET = "50000";

async function metaPost(path: string, body: Record<string, unknown>): Promise<unknown> {
  const url = `${META_API_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error("Meta API error:", JSON.stringify(data, null, 2));
    throw new Error(`Meta API error (${res.status}): ${data?.error?.message ?? "unknown"}`);
  }
  return data;
}

async function metaGet(path: string): Promise<unknown> {
  const url = `${META_API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Meta API error (${res.status}): ${data?.error?.message ?? "unknown"}`);
  }
  return data;
}

async function supabaseInsert(rows: Record<string, unknown>[]): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/meta_campaign_mappings`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(rows),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error("Supabase error:", JSON.stringify(data, null, 2));
    throw new Error(`Supabase error (${res.status})`);
  }
  console.log("Supabase insert result:", JSON.stringify(data, null, 2));
}

async function main() {
  console.log("=== Creating Video Campaigns for HappySleep ===\n");

  const results: Array<{ id: string; name: string; country: string }> = [];

  for (const campaign of campaigns) {
    if (campaign.existingId) {
      console.log(`Skipping ${campaign.name} — already created (id: ${campaign.existingId})`);
      results.push({ id: campaign.existingId, name: campaign.name, country: campaign.country });
      continue;
    }

    console.log(`Creating campaign: ${campaign.name}`);

    // Create campaign with CBO (campaign_budget_optimization) and daily_budget
    const createResult = (await metaPost(`/act_${AD_ACCOUNT_ID}/campaigns`, {
      name: campaign.name,
      objective: "OUTCOME_SALES",
      status: "PAUSED",
      special_ad_categories: [],
      campaign_budget_optimization: true,
      daily_budget: DAILY_BUDGET,
    })) as { id: string };

    console.log(`  Created: id=${createResult.id}`);
    results.push({ id: createResult.id, name: campaign.name, country: campaign.country });
  }

  console.log("\n=== All campaigns ===\n");
  for (const r of results) {
    console.log(`  ${r.country}: ${r.name} (id: ${r.id})`);
  }

  // Verify all campaigns on Meta (read fields)
  console.log("\n=== Verifying campaigns on Meta ===\n");
  for (const r of results) {
    const verification = (await metaGet(
      `/${r.id}?fields=id,name,daily_budget,status,objective`
    )) as { id: string; name: string; daily_budget: string; status: string; objective: string };
    console.log(`  ${r.country}: daily_budget=${verification.daily_budget}, status=${verification.status}, objective=${verification.objective}`);
  }

  // Insert campaign mappings into Supabase
  console.log("\n=== Inserting campaign mappings into Supabase ===\n");

  const mappingRows = results.map((r) => ({
    product: "happysleep",
    country: r.country,
    meta_campaign_id: r.id,
    meta_campaign_name: r.name,
    format: "video",
    template_adset_id: null,
    template_adset_name: null,
  }));

  await supabaseInsert(mappingRows);
  console.log("Campaign mappings inserted successfully.\n");

  console.log("Done!");
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
