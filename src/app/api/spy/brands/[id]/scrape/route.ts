import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { scrapeAndWait, deduplicateAds, normalizeApifyAd } from "@/lib/apify";

export const maxDuration = 120;

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
  const maxAds = body.max_ads ?? 50;

  try {
    // Force image-only filter — videos can't be analyzed by AI
    const scrapeUrl = brand.ad_library_url.replace(
      /media_type=[^&]*/,
      "media_type=image"
    );

    // Run Apify scrape (blocking — waits for results)
    const rawItems = await scrapeAndWait(scrapeUrl, maxAds);

    // Deduplicate
    const uniqueItems = deduplicateAds(rawItems, maxAds);

    // Normalize and upsert
    let newCount = 0;
    let updatedCount = 0;

    // Get existing bookmarked ads so we never delete them
    const { data: bookmarked } = await db
      .from("spy_ads")
      .select("meta_ad_id")
      .eq("brand_id", brandId)
      .eq("is_bookmarked", true);
    const bookmarkedIds = new Set(
      (bookmarked ?? []).map((a: { meta_ad_id: string }) => a.meta_ad_id)
    );

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

    // Remove old non-bookmarked ads that weren't seen in this scrape
    const scrapedIds = uniqueItems.map((item) =>
      (item.adArchiveID ?? item.adArchiveId ?? item.ad_archive_id ?? item.id)?.toString() ?? ""
    ).filter(Boolean);

    if (scrapedIds.length > 0) {
      // Get all current ads for this brand
      const { data: allAds } = await db
        .from("spy_ads")
        .select("id, meta_ad_id, is_bookmarked")
        .eq("brand_id", brandId);

      for (const ad of allAds ?? []) {
        if (!scrapedIds.includes(ad.meta_ad_id) && !ad.is_bookmarked) {
          await db.from("spy_ads").delete().eq("id", ad.id);
        }
      }
    }

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
      fetched: rawItems.length,
      unique: uniqueItems.length,
      new: newCount,
      updated: updatedCount,
      total: count ?? 0,
    });
  } catch (err) {
    return safeError(err, "Scrape failed");
  }
}
