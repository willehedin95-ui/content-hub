/**
 * Auto-sunset stale articles.
 *
 * Articles that rank position 30+ after 90+ days of indexing are dragging
 * down domain authority - Google rates domains partly on the weakest 20%
 * of content. Sunsetting them via 410 Gone (or archive status) is cheaper
 * than rewriting and prevents the long tail of dead content from compounding.
 *
 * Detection:
 *  - Published >= 90 days ago
 *  - Average position >= 30 over last 30 days of GSC data
 *  - Total impressions >= 10 (need signal - skip articles Google never showed)
 *
 * Action:
 *  - Mark translation as status='archived' (separate from 'published')
 *  - Telegram alert with refresh/sunset decision needed
 *  - Operator decides: refresh via LOW_RANK update cron, or remove entirely
 *
 * Pure detection - no auto-deletion. Surfacing only.
 */

import { createServerSupabase } from "./supabase-admin";
import type { Language, GscProperty } from "@/types";
import { buildWorkspacePageFilter, pageMatchesWorkspace } from "./seo-workspace-filter";

export interface StaleArticle {
  slug: string;
  url: string;
  publishedAt: string;
  daysSincePublish: number;
  avgPosition: number;
  totalImpressions: number;
  totalClicks: number;
}

export async function detectStaleArticles(
  workspaceId: string,
  language: Language,
  opts?: {
    minDaysOld?: number;
    minPosition?: number;
    minImpressions?: number;
    windowDays?: number;
    limit?: number;
  }
): Promise<StaleArticle[]> {
  const minDaysOld = opts?.minDaysOld ?? 90;
  const minPosition = opts?.minPosition ?? 30;
  const minImpressions = opts?.minImpressions ?? 10;
  const windowDays = opts?.windowDays ?? 30;
  const limit = opts?.limit ?? 10;

  const db = createServerSupabase();

  const { data: ws } = await db
    .from("workspaces")
    .select("settings")
    .eq("id", workspaceId)
    .single();
  const settings = (ws?.settings ?? {}) as Record<string, unknown>;
  const gscProperties = (settings.gsc_properties as GscProperty[]) ?? [];
  const langProps = gscProperties.filter((p) => p.language === language);
  if (langProps.length === 0) return [];

  const pageFilter = await buildWorkspacePageFilter(db, workspaceId, gscProperties);

  // Pull all published articles for workspace+language older than minDaysOld
  const cutoffDate = new Date(Date.now() - minDaysOld * 86400_000).toISOString();
  const { data: pubs } = await db
    .from("translations")
    .select("slug, published_url, published_at, pages!inner(workspace_id, content_type)")
    .eq("language", language)
    .eq("status", "published")
    .eq("pages.workspace_id", workspaceId)
    .eq("pages.content_type", "seo_blog")
    .not("published_url", "is", null)
    .lte("published_at", cutoffDate);
  if (!pubs?.length) return [];

  // Aggregate GSC positions per page URL across the last windowDays
  const sinceDate = new Date(Date.now() - windowDays * 86400_000).toISOString().slice(0, 10);
  type Agg = { impressions: number; clicks: number; weightedPos: number };
  const byPage = new Map<string, Agg>();
  for (const prop of langProps) {
    const { data } = await db
      .from("gsc_keywords")
      .select("page, impressions, clicks, position")
      .eq("property", prop.property)
      .gte("date", sinceDate);
    for (const r of data ?? []) {
      const row = r as { page: string; impressions: number; clicks: number; position: number };
      if (prop.is_primary === false && !pageMatchesWorkspace(row.page, prop.property, pageFilter)) {
        continue;
      }
      const a = byPage.get(row.page) ?? { impressions: 0, clicks: 0, weightedPos: 0 };
      a.impressions += row.impressions || 0;
      a.clicks += row.clicks || 0;
      a.weightedPos += (row.position || 0) * (row.impressions || 0);
      byPage.set(row.page, a);
    }
  }

  const stale: StaleArticle[] = [];
  for (const pub of pubs) {
    const url = pub.published_url as string;
    const agg = byPage.get(url);
    if (!agg || agg.impressions < minImpressions) continue;
    const avgPos = agg.weightedPos / agg.impressions;
    if (avgPos < minPosition) continue;

    const publishedAt = pub.published_at as string;
    const daysSince = Math.floor((Date.now() - new Date(publishedAt).getTime()) / 86400_000);

    stale.push({
      slug: pub.slug as string,
      url,
      publishedAt,
      daysSincePublish: daysSince,
      avgPosition: avgPos,
      totalImpressions: agg.impressions,
      totalClicks: agg.clicks,
    });
  }

  return stale
    .sort((a, b) => b.avgPosition - a.avgPosition)
    .slice(0, limit);
}
