import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET() {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace" }, { status: 401 });
  }

  const db = createServerSupabase();

  const [nuggetsRes, sourcesRes, themesRes, recentRes, goldRes, topTagsRes] = await Promise.all([
    // Total nuggets
    db
      .from("research_nuggets")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),

    // Sources with counts
    db
      .from("research_sources")
      .select("id, name, domain, platform, total_reviews_fetched, last_scanned_at, status")
      .eq("workspace_id", workspaceId)
      .order("total_reviews_fetched", { ascending: false }),

    // Active themes
    db
      .from("research_themes")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "active"),

    // Nuggets in last 7 days
    db
      .from("research_nuggets")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte(
        "created_at",
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      ),

    // Gold nuggets (significance 8+)
    db
      .from("research_nuggets")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("significance", 8),

    // Top tags (fetch recent nuggets to compute tag frequency)
    db
      .from("research_nuggets")
      .select("tags")
      .eq("workspace_id", workspaceId)
      .gte("significance", 4)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  // Compute top tags from recent nuggets
  const tagCounts: Record<string, number> = {};
  for (const n of topTagsRes.data ?? []) {
    const tags = n.tags as string[] | null;
    if (tags) {
      for (const tag of tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
  }
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([tag, count]) => ({ tag, count }));

  return NextResponse.json({
    totalNuggets: nuggetsRes.count ?? 0,
    totalSources: sourcesRes.data?.length ?? 0,
    totalThemes: themesRes.count ?? 0,
    nuggetsLast7Days: recentRes.count ?? 0,
    goldNuggets: goldRes.count ?? 0,
    topTags,
    sources: sourcesRes.data ?? [],
  });
}
