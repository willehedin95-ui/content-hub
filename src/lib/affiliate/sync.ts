/**
 * Resolve a brand mention to a deep affiliate link (read-side).
 *
 * Reads the affiliate_programs table (populated manually / out-of-band - the weekly network
 * sync cron was removed) and generates a deep link via the network API. Used by blog-autopilot
 * (inject-links) to turn brand mentions into live affiliate links.
 */

import { createServerSupabase } from "../supabase-admin";

/**
 * Resolve a brand mention in article text to a deep affiliate link.
 *
 * Lookup strategy:
 *  1. Match by exact brand_name (case-insensitive) on joined programs
 *  2. If multiple networks have same brand, pick highest commission_rate
 *  3. Use cached deep_link_template when present and no specific destinationUrl
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
