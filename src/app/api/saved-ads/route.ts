import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

// GET /api/saved-ads — list saved ads with filtering + pagination
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, parseInt(url.searchParams.get("limit") ?? "50", 10));
  const offset = (page - 1) * limit;

  const platform = url.searchParams.get("platform");
  const bookmarked = url.searchParams.get("is_bookmarked");
  const search = url.searchParams.get("search");

  const db = createServerSupabase();

  // Build query
  let query = db
    .from("saved_ads")
    .select("*", { count: "exact" });

  // Filters
  if (platform && platform !== "all") {
    query = query.eq("source_platform", platform);
  }

  if (bookmarked === "true") {
    query = query.eq("is_bookmarked", true);
  }

  if (search?.trim()) {
    const s = search.trim();
    query = query.or(
      `headline.ilike.%${s}%,body.ilike.%${s}%,brand_name.ilike.%${s}%,user_notes.ilike.%${s}%`
    );
  }

  // Sorting — newest first
  query = query.order("created_at", { ascending: false });

  // Pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) return safeError(error, "Failed to load saved ads");

  return NextResponse.json({
    data: data ?? [],
    total: count ?? 0,
    page,
    limit,
  });
}
