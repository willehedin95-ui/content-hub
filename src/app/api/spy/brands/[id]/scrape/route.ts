import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { scrapeAndWait, deduplicateAds, normalizeApifyAd } from "@/lib/apify";

export const maxDuration = 300;

// POST /api/spy/brands/[id]/scrape — trigger Apify scrape
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: brandId } = await params;
  if (!isValidUUID(brandId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Get brand
  const { data: brand, error: brandErr } = await db
    .from("spy_brands")
    .select("*")
    .eq("id", brandId)
    .single();

  if (brandErr || !brand) {
    return safeError(brandErr ?? new Error("Not found"), "Brand not found", 404);
  }

  const body = await req.json().catch(() => ({}));
  const maxAdsPerCountry = body.max_ads ?? 100;

  // Countries to scrape — from brand config, default to US
  const countries: string[] = brand.scrape_countries?.length
    ? brand.scrape_countries
    : ["US"];

  try {
    // Base URL with image-only filter
    const baseUrl = brand.ad_library_url.replace(
      /media_type=[^&]*/,
      "media_type=image"
    );

    // Scrape each country separately and merge results
    const allRawItems: Awaited<ReturnType<typeof scrapeAndWait>> = [];

    for (const country of countries) {
      // Replace country param in the URL
      const countryUrl = baseUrl.replace(
        /country=[^&]*/,
        `country=${country}`
      );

      const rawItems = await scrapeAndWait(countryUrl, maxAdsPerCountry);
      allRawItems.push(...rawItems);
    }

    // Deduplicate across all countries (same ad running in multiple countries)
    const maxTotal = maxAdsPerCountry * countries.length;
    const uniqueItems = deduplicateAds(allRawItems, maxTotal);

    // Normalize and upsert
    let newCount = 0;
    let updatedCount = 0;

    for (let i = 0; i < uniqueItems.length; i++) {
      const normalized = normalizeApifyAd(uniqueItems[i], i);

      // Check if ad exists
      const { data: existing } = await db
        .from("spy_ads")
        .select("id")
        .eq("brand_id", brandId)
        .eq("meta_ad_id", normalized.meta_ad_id)
        .maybeSingle();

      if (existing) {
        // Update existing (but don't overwrite user data)
        await db
          .from("spy_ads")
          .update({
            ...normalized,
            last_seen_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        updatedCount++;
      } else {
        // Insert new
        await db.from("spy_ads").insert({
          brand_id: brandId,
          ...normalized,
        });
        newCount++;
      }
    }

    // Don't delete old ads — accumulate over time.
    // Old ads that are no longer active will have is_active=false after update.

    // Update brand stats
    const { count } = await db
      .from("spy_ads")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brandId);

    await db
      .from("spy_brands")
      .update({
        last_fetched_at: new Date().toISOString(),
        ad_count: count ?? 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", brandId);

    return NextResponse.json({
      fetched: allRawItems.length,
      unique: uniqueItems.length,
      countries_scraped: countries,
      new: newCount,
      updated: updatedCount,
      total: count ?? 0,
    });
  } catch (err) {
    return safeError(err, "Scrape failed");
  }
}
