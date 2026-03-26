import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace" }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") ?? "1");
  const perPage = Math.min(parseInt(searchParams.get("perPage") ?? "50"), 100);
  const minSignificance = parseInt(searchParams.get("minSignificance") ?? "1");
  const sourceId = searchParams.get("sourceId");
  const tag = searchParams.get("tag");
  const marketRelevance = searchParams.get("marketRelevance"); // primary | reference
  const sentiment = searchParams.get("sentiment");
  const platform = searchParams.get("platform");
  const search = searchParams.get("search");

  const db = createServerSupabase();

  let query = db
    .from("research_nuggets")
    .select(
      "*, research_sources!inner(name, domain, platform, is_own_brand)",
      { count: "exact" }
    )
    .eq("workspace_id", workspaceId)
    .gte("significance", minSignificance)
    .order("significance", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (sourceId) query = query.eq("source_id", sourceId);
  if (tag) query = query.contains("tags", [tag]);
  if (marketRelevance) query = query.eq("market_relevance", marketRelevance);
  if (sentiment) query = query.eq("sentiment", sentiment);
  if (platform) query = query.eq("research_sources.platform", platform);
  if (search) query = query.or(`review_text.ilike.%${search}%,summary.ilike.%${search}%,review_title.ilike.%${search}%`);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    nuggets: data ?? [],
    total: count ?? 0,
    page,
    perPage,
    totalPages: Math.ceil((count ?? 0) / perPage),
  });
}
