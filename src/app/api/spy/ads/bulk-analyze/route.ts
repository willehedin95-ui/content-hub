import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

export const maxDuration = 300;

// POST /api/spy/ads/bulk-analyze — batch CASH analysis for a brand's ads
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const brandId = body.brand_id;
  const limit = Math.min(body.limit ?? 20, 50);

  if (!brandId) {
    return NextResponse.json({ error: "brand_id is required" }, { status: 400 });
  }

  const db = createServerSupabase();

  // Get unanalyzed ads for this brand
  const { data: ads, error } = await db
    .from("spy_ads")
    .select("id")
    .eq("brand_id", brandId)
    .is("cash_analysis", null)
    .order("impressions_rank", { ascending: true })
    .limit(limit);

  if (error) return safeError(error, "Failed to fetch ads");
  if (!ads || ads.length === 0) {
    return NextResponse.json({ analyzed: 0, total: 0 });
  }

  let analyzed = 0;
  const errors: string[] = [];

  for (const ad of ads) {
    try {
      // Call the single-ad analyze endpoint internally
      const res = await fetch(
        new URL(`/api/spy/ads/${ad.id}/analyze`, req.url),
        { method: "POST" }
      );
      if (res.ok) {
        analyzed++;
      } else {
        const data = await res.json().catch(() => ({}));
        errors.push(`${ad.id}: ${data.error || "failed"}`);
      }
    } catch (err) {
      errors.push(`${ad.id}: ${err instanceof Error ? err.message : "unknown"}`);
    }

    // 500ms delay between calls to avoid rate limiting
    if (ads.indexOf(ad) < ads.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return NextResponse.json({
    analyzed,
    total: ads.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
