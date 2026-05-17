/**
 * Content decay detection.
 *
 * Detects published articles whose GSC ranking has dropped significantly
 * week-over-week. Decay = position drop of >=5 places AND article now ranks
 * below position 20 (i.e. invisible to users).
 *
 * Why this matters:
 * - Google rates a domain partly on the weakest 20% of content
 * - Decaying articles drag down domain authority for everything else
 * - Refreshing or sunsetting them is cheaper than producing new content
 *
 * Trigger: weekly Monday cron after gsc-sync. Surfaces top decayers via
 * Telegram so operator can decide: refresh (re-run through writer with
 * decay-brief) or sunset (mark as deferred/archived).
 */

import { createServerSupabase } from "./supabase-admin";
import type { Language, GscProperty } from "@/types";
import { buildWorkspacePageFilter, pageMatchesWorkspace } from "./seo-workspace-filter";

export interface DecayedArticle {
  slug: string;
  url: string;
  topQuery: string;
  currentPos: number;
  previousPos: number;
  dropPlaces: number;
  recentImpressions: number;
  recentClicks: number;
}

export async function detectDecay(
  workspaceId: string,
  language: Language,
  opts?: {
    /** Min drop in positions to flag. Default 5. */
    minDrop?: number;
    /** Current position must be at least this deep to flag. Default 20. */
    minCurrentPos?: number;
    /** Days in each comparison window. Default 7. */
    windowDays?: number;
    /** Max decayers to return. Default 10. */
    limit?: number;
  }
): Promise<DecayedArticle[]> {
  const minDrop = opts?.minDrop ?? 5;
  const minCurrentPos = opts?.minCurrentPos ?? 20;
  const windowDays = opts?.windowDays ?? 7;
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

  const today = new Date();
  const recentStart = new Date(today.getTime() - windowDays * 86400_000).toISOString().slice(0, 10);
  const priorStart = new Date(today.getTime() - 2 * windowDays * 86400_000).toISOString().slice(0, 10);
  const priorEnd = recentStart;

  // Aggregate per (page, query): impression-weighted position in each window
  type Agg = {
    page: string;
    query: string;
    recentPos: number;
    recentImpr: number;
    recentClk: number;
    recentWeight: number;
    priorPos: number;
    priorImpr: number;
    priorWeight: number;
  };
  const agg = new Map<string, Agg>();

  for (const prop of langProps) {
    const { data: rows } = await db
      .from("gsc_keywords")
      .select("query, page, impressions, clicks, position, date")
      .eq("property", prop.property)
      .gte("date", priorStart);
    for (const r of rows ?? []) {
      const row = r as { query: string; page: string; impressions: number; clicks: number; position: number; date: string };
      if (prop.is_primary === false && !pageMatchesWorkspace(row.page, prop.property, pageFilter)) {
        continue;
      }
      const key = `${row.page}::${row.query}`;
      let a = agg.get(key);
      if (!a) {
        a = {
          page: row.page,
          query: row.query,
          recentPos: 0, recentImpr: 0, recentClk: 0, recentWeight: 0,
          priorPos: 0, priorImpr: 0, priorWeight: 0,
        };
        agg.set(key, a);
      }
      if (row.date >= recentStart) {
        a.recentImpr += row.impressions || 0;
        a.recentClk += row.clicks || 0;
        a.recentWeight += (row.position || 0) * (row.impressions || 0);
      } else if (row.date >= priorStart && row.date < priorEnd) {
        a.priorImpr += row.impressions || 0;
        a.priorWeight += (row.position || 0) * (row.impressions || 0);
      }
    }
  }

  const candidates: DecayedArticle[] = [];
  for (const a of agg.values()) {
    if (a.recentImpr < 3 || a.priorImpr < 3) continue; // need signal
    const recentPos = a.recentWeight / a.recentImpr;
    const priorPos = a.priorWeight / a.priorImpr;
    const drop = recentPos - priorPos;
    if (drop < minDrop) continue;
    if (recentPos < minCurrentPos) continue;

    // Extract slug from page URL last segment
    let slug = "";
    try {
      const url = new URL(a.page);
      const segments = url.pathname.split("/").filter(Boolean);
      slug = segments[segments.length - 1] || "";
    } catch {
      continue;
    }
    if (!slug) continue;

    candidates.push({
      slug,
      url: a.page,
      topQuery: a.query,
      currentPos: recentPos,
      previousPos: priorPos,
      dropPlaces: drop,
      recentImpressions: a.recentImpr,
      recentClicks: a.recentClk,
    });
  }

  // Dedupe per slug - keep the worst-dropping query per article
  const bySlug = new Map<string, DecayedArticle>();
  for (const c of candidates) {
    const existing = bySlug.get(c.slug);
    if (!existing || c.dropPlaces > existing.dropPlaces) {
      bySlug.set(c.slug, c);
    }
  }

  return Array.from(bySlug.values())
    .sort((a, b) => b.dropPlaces - a.dropPlaces)
    .slice(0, limit);
}
