/**
 * Sync affiliate programs from networks into the affiliate_programs table.
 *
 * Strategy:
 *  1. Pull all programmes from Awin (joined + available, SE region)
 *  2. Pull all programs from Adtraction (SE market, all statuses)
 *  3. Upsert into affiliate_programs by (network, advertiser_id)
 *  4. Preserve manually-set fields (deep_link_template, restrictions) on update
 *
 * Manual seed entries (brand_slug, restrictions) survive the sync because we
 * COALESCE rather than overwrite on UPDATE.
 *
 * Trigger: weekly cron. Hand off to ranking logic later (pick best EPC per
 * brand_slug across networks).
 */

import { createServerSupabase } from "../supabase-admin";
import { listProgrammes as listAwin } from "./awin-api";
import { listPrograms as listAdtraction, ADTRACTION_MARKETS } from "./adtraction-api";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export interface SyncResult {
  network: string;
  fetched: number;
  inserted: number;
  updated: number;
  errors: number;
  error?: string;
}

export async function syncAwin(): Promise<SyncResult> {
  const db = createServerSupabase();
  try {
    // Pull joined + not joined for SE
    const [joined, available] = await Promise.all([
      listAwin({ relationship: "joined", countryCode: "SE" }),
      listAwin({ relationship: "notjoined", countryCode: "SE" }),
    ]);
    const all = [...joined, ...available];

    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const p of all) {
      const row = {
        network: "awin",
        advertiser_id: p.advertiserId,
        brand_name: p.name,
        brand_slug: slugify(p.name),
        status: p.status,
        country: p.country || "SE",
        currency: p.currency || "SEK",
        commission_rate: p.commissionRate,
        commission_text: p.commissionText,
        category: p.category || null,
        description: p.description || null,
        default_landing_url: p.domain ? `https://${p.domain.replace(/^https?:\/\//, "")}` : null,
        last_synced: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { error, count } = await db
        .from("affiliate_programs")
        .upsert(row, { onConflict: "network,advertiser_id", count: "exact" });
      if (error) errors++;
      else if (count === 1) inserted++;
      else updated++;
    }

    return { network: "awin", fetched: all.length, inserted, updated, errors };
  } catch (err) {
    return {
      network: "awin",
      fetched: 0,
      inserted: 0,
      updated: 0,
      errors: 1,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function syncAdtraction(): Promise<SyncResult> {
  const db = createServerSupabase();
  try {
    const programs = await listAdtraction({ marketId: ADTRACTION_MARKETS.SE, status: "all" });

    let inserted = 0;
    let updated = 0;
    let errors = 0;

    for (const p of programs) {
      const row = {
        network: "adtraction",
        advertiser_id: p.advertiserId,
        brand_name: p.name,
        brand_slug: slugify(p.name),
        status: p.status,
        country: p.country || "SE",
        currency: p.currency || "SEK",
        commission_rate: p.commissionRate,
        commission_text: p.commissionText,
        epc: p.epc,
        cookie_days: p.cookieDays,
        category: p.category || null,
        description: p.description || null,
        default_landing_url: p.domain || null,
        last_synced: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { error, count } = await db
        .from("affiliate_programs")
        .upsert(row, { onConflict: "network,advertiser_id", count: "exact" });
      if (error) errors++;
      else if (count === 1) inserted++;
      else updated++;
    }

    return { network: "adtraction", fetched: programs.length, inserted, updated, errors };
  } catch (err) {
    return {
      network: "adtraction",
      fetched: 0,
      inserted: 0,
      updated: 0,
      errors: 1,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Resolve a brand mention in article text to a deep affiliate link.
 *
 * Lookup strategy:
 *  1. Match by exact brand_name (case-insensitive) on joined programs
 *  2. If multiple networks have same brand, pick highest commission_rate
 *  3. Cache deep link in deep_link_template (overwritten on next sync if null)
 *
 * Returns null if brand not found or no joined program available.
 */
export async function resolveAffiliateLink(
  brandName: string,
  destinationUrl?: string
): Promise<{ url: string; network: string; advertiserId: string } | null> {
  const db = createServerSupabase();

  const { data } = await db
    .from("affiliate_programs")
    .select("network, advertiser_id, brand_name, status, commission_rate, default_landing_url, deep_link_template")
    .ilike("brand_name", brandName)
    .eq("status", "joined")
    .order("commission_rate", { ascending: false, nullsFirst: false })
    .limit(1);

  const row = data?.[0];
  if (!row) return null;

  // If we have a cached deep_link_template and no specific destinationUrl,
  // use the template as-is. Otherwise generate fresh link via network API.
  if (row.deep_link_template && !destinationUrl) {
    return {
      url: row.deep_link_template as string,
      network: row.network as string,
      advertiserId: row.advertiser_id as string,
    };
  }

  const targetUrl = destinationUrl || (row.default_landing_url as string) || "";
  if (!targetUrl) return null;

  try {
    if (row.network === "awin") {
      const { generateDeepLink } = await import("./awin-api");
      const url = await generateDeepLink({
        advertiserId: row.advertiser_id as string,
        destinationUrl: targetUrl,
      });
      return { url, network: "awin", advertiserId: row.advertiser_id as string };
    }
    if (row.network === "adtraction") {
      const { generateDeepLink } = await import("./adtraction-api");
      const url = await generateDeepLink({
        programId: row.advertiser_id as string,
        destinationUrl: targetUrl,
      });
      return { url, network: "adtraction", advertiserId: row.advertiser_id as string };
    }
  } catch (err) {
    console.warn(`[affiliate-resolve] ${row.network} link generation failed:`, err);
  }

  return null;
}
