import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

// GET /api/spy/ads — list spy ads with filtering + pagination
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, parseInt(url.searchParams.get("limit") ?? "50", 10));
  const offset = (page - 1) * limit;

  const brandId = url.searchParams.get("brand_id");
  const brandIds = url.searchParams.get("brand_ids"); // comma-separated
  const mediaType = url.searchParams.get("media_type");
  const bookmarked = url.searchParams.get("is_bookmarked");
  const sort = url.searchParams.get("sort") ?? "impressions_rank";
  const search = url.searchParams.get("search");

  const db = createServerSupabase();

  // Build query
  let query = db
    .from("spy_ads")
    .select("*, brand:spy_brands(id, name, category)", { count: "exact" });

  // Filters
  if (brandId) {
    query = query.eq("brand_id", brandId);
  } else if (brandIds) {
    const ids = brandIds.split(",").filter(Boolean);
    if (ids.length > 0) {
      query = query.in("brand_id", ids);
    }
  }

  if (mediaType && mediaType !== "all") {
    query = query.eq("media_type", mediaType);
  }

  if (bookmarked === "true") {
    query = query.eq("is_bookmarked", true);
  }

  if (search?.trim()) {
    const s = search.trim();
    query = query.or(`headline.ilike.%${s}%,body.ilike.%${s}%`);
  }

  // Sorting
  switch (sort) {
    case "newest":
      query = query.order("ad_delivery_start_time", {
        ascending: false,
        nullsFirst: false,
      });
      break;
    case "oldest":
      query = query.order("ad_delivery_start_time", { ascending: true });
      break;
    case "impressions_rank":
    default:
      query = query
        .order("impressions_rank", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      break;
  }

  // Pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) return safeError(error, "Failed to load ads");

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    page,
    limit,
  });
}
