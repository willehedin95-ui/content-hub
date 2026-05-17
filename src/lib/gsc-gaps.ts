/**
 * GSC-driven content gap detection.
 *
 * Reads aggregated Google Search Console data for a workspace's properties,
 * identifies queries we're getting impressions on but don't serve well, and
 * turns the best opportunities into `blog_content_plan` rows. The existing
 * autopilot picks them up from the plan like any other article.
 *
 * Two gap categories:
 *   1. NO_ARTICLE — query has impressions but we don't have a dedicated
 *      article. Our homepage or an unrelated post is ranking instead.
 *   2. LOW_RANK — query where our best-matching article ranks positions
 *      5-20; there's runway to improve with a more specific follow-up or
 *      by updating the existing article.
 *
 * We emit NO_ARTICLE as new content plan rows. LOW_RANK is surfaced but
 * not auto-actioned yet (would need an "update existing article" autopilot
 * path, separate concern).
 *
 * Trigger: weekly cron after GSC sync finishes. See
 * `/api/cron/gsc-gap-refresh`.
 */

import { createServerSupabase } from "./supabase-admin";
import { buildWorkspacePageFilter, pageMatchesWorkspace } from "./seo-workspace-filter";
import type { Language, GscProperty } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GapType = "no_article" | "low_rank";

export interface GapKeyword {
  query: string;
  /** Sum of impressions in the analysis window */
  impressions: number;
  /** Sum of clicks in the analysis window */
  clicks: number;
  /** Impression-weighted average position */
  avgPosition: number;
  /** Top page currently receiving impressions for this query (if any) */
  topPage: string | null;
  /** URL-safe slug suggestion for a new article covering this query */
  suggestedSlug: string;
  /** Suggested title (auto-cased Swedish) */
  suggestedTitle: string;
  type: GapType;
  /** Short human-readable rationale for why this query made the list */
  reason: string;
  /** Relative score (higher = better opportunity) */
  score: number;
}

export interface DetectGapOptions {
  /** How many days of GSC data to aggregate. Default 30. */
  windowDays?: number;
  /** Minimum total impressions for a query to be considered. Default 10. */
  minImpressions?: number;
  /** Upper bound on returned gaps. Default 20. */
  limit?: number;
  /** Skip queries where we already rank top 4 (they're performing). */
  skipTopRank?: boolean;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export async function detectGapKeywords(
  workspaceId: string,
  language: Language,
  opts: DetectGapOptions = {}
): Promise<GapKeyword[]> {
  const windowDays = opts.windowDays ?? 30;
  const minImpressions = opts.minImpressions ?? 10;
  const limit = opts.limit ?? 20;
  const skipTopRank = opts.skipTopRank !== false;

  const db = createServerSupabase();

  // Which GSC properties does this workspace track for this language?
  const { data: ws } = await db
    .from("workspaces")
    .select("settings")
    .eq("id", workspaceId)
    .single();
  const settings = (ws?.settings ?? {}) as Record<string, unknown>;
  const gscProperties = (settings.gsc_properties as GscProperty[]) ?? [];
  const langProps = gscProperties.filter((p) => p.language === language);
  if (langProps.length === 0) {
    return [];
  }

  // Which pages belong to this workspace? Used to filter shared-property rows.
  const pageFilter = await buildWorkspacePageFilter(db, workspaceId, gscProperties);

  // Already-planned/published slugs to dedupe against
  const { data: existingPlan } = await db
    .from("blog_content_plan")
    .select("slug, primary_keyword")
    .eq("workspace_id", workspaceId)
    .eq("language", language);
  const existingSlugs = new Set((existingPlan ?? []).map((p) => p.slug as string));
  const existingKeywords = new Set(
    (existingPlan ?? [])
      .map((p) => normalizeQuery((p.primary_keyword as string) || ""))
      .filter(Boolean)
  );

  const sinceDate = new Date(Date.now() - windowDays * 86400 * 1000)
    .toISOString()
    .slice(0, 10);

  // Pull raw rows for each property. Workspaces may share properties (see
  // gsc-workspace-filter.ts) — for non-primary shares we post-filter by
  // whether the page slug matches a slug on this workspace's domain.
  const rows: Array<{
    query: string;
    page: string;
    impressions: number;
    clicks: number;
    position: number;
    property: string;
  }> = [];

  for (const prop of langProps) {
    const { data } = await db
      .from("gsc_keywords")
      .select("query, page, impressions, clicks, position, property")
      .eq("property", prop.property)
      .gte("date", sinceDate);
    for (const r of data ?? []) {
      const row = r as typeof rows[number];
      if (prop.is_primary === false && !pageMatchesWorkspace(row.page, prop.property, pageFilter)) {
        continue; // shared property, not our page
      }
      rows.push(row);
    }
  }

  if (rows.length === 0) return [];

  // Aggregate per query: sum impressions/clicks, weighted avg position, and
  // remember the top-impression page for each query.
  type Agg = {
    query: string;
    impressions: number;
    clicks: number;
    weightedPos: number; // sum of position * impressions
    topPage: string;
    topPageImpressions: number;
  };
  const byQuery = new Map<string, Agg>();
  for (const r of rows) {
    const key = normalizeQuery(r.query);
    if (!key) continue;
    let agg = byQuery.get(key);
    if (!agg) {
      agg = {
        query: r.query,
        impressions: 0,
        clicks: 0,
        weightedPos: 0,
        topPage: r.page,
        topPageImpressions: 0,
      };
      byQuery.set(key, agg);
    }
    agg.impressions += r.impressions || 0;
    agg.clicks += r.clicks || 0;
    agg.weightedPos += (r.position || 0) * (r.impressions || 0);
    if (r.impressions > agg.topPageImpressions) {
      agg.topPage = r.page;
      agg.topPageImpressions = r.impressions || 0;
    }
  }

  // Convert to gap candidates with scoring
  const gaps: GapKeyword[] = [];
  for (const agg of byQuery.values()) {
    if (agg.impressions < minImpressions) continue;
    const avgPosition = agg.impressions > 0 ? agg.weightedPos / agg.impressions : 0;
    if (skipTopRank && avgPosition > 0 && avgPosition < 4) continue;

    const normalized = normalizeQuery(agg.query);
    if (existingKeywords.has(normalized)) continue;

    const slug = keywordToSlug(agg.query);
    if (existingSlugs.has(slug)) continue;

    // Classify: is the current top page a real article serving this query?
    // Homepage / category index = "no_article". Article that ranks pos 5-20
    // = "low_rank".
    const path = extractPath(agg.topPage);
    const isHomepage = path === "/" || path === "";
    const pathSegments = path.split("/").filter(Boolean);
    const isArticle = pathSegments.length >= 2; // /category/slug

    let type: GapType;
    let reason: string;
    if (!isArticle || isHomepage) {
      type = "no_article";
      reason = `${agg.impressions} impr, pos ${avgPosition.toFixed(1)} on ${isHomepage ? "homepage" : "category index"}`;
    } else if (avgPosition >= 5 && avgPosition <= 20) {
      type = "low_rank";
      reason = `${agg.impressions} impr, pos ${avgPosition.toFixed(1)} on ${path}`;
    } else {
      continue; // already ranks top 4, or ranks so deep the query is noise
    }

    // Score: impressions weighted by how much improvement is possible.
    // Going from pos 10 -> 3 ~ 5x CTR uplift; from pos 20 -> 3 ~ 10x but
    // harder. Use a soft multiplier that rewards mid-range opportunities.
    const improveMult = avgPosition >= 5 && avgPosition <= 12 ? 1.2 : 1.0;
    const score = agg.impressions * improveMult;

    gaps.push({
      query: agg.query,
      impressions: agg.impressions,
      clicks: agg.clicks,
      avgPosition,
      topPage: agg.topPage,
      suggestedSlug: slug,
      suggestedTitle: keywordToTitle(agg.query),
      type,
      reason,
      score,
    });
  }

  gaps.sort((a, b) => b.score - a.score);
  return gaps.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Insert `no_article` gaps into blog_content_plan so the autopilot picks
 * them up on its next run. `low_rank` gaps are skipped here — they need
 * article updates, not new articles.
 */
export async function addGapsToContentPlan(
  workspaceId: string,
  language: Language,
  gaps: GapKeyword[],
  productSlug: string
): Promise<{ added: number; skipped: number; blocked: number }> {
  const db = createServerSupabase();

  // Honor the workspace's blog_topic_blocklist so we don't auto-discover
  // topics that the product isn't suited for.
  const { data: wsRow } = await db
    .from("workspaces")
    .select("settings")
    .eq("id", workspaceId)
    .single();
  const blocklist = ((): string[] => {
    const raw = (wsRow?.settings as Record<string, unknown> | null | undefined)?.blog_topic_blocklist;
    if (!Array.isArray(raw)) return [];
    return raw.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  })();

  const matchesBlocklist = (text: string): boolean => {
    if (!blocklist.length) return false;
    const lower = text.toLowerCase();
    return blocklist.some((b) => lower.includes(b.toLowerCase()));
  };

  const noArticleGaps = gaps.filter((g) => g.type === "no_article");
  const blockedGaps = noArticleGaps.filter(
    (g) => matchesBlocklist(g.query) || matchesBlocklist(g.suggestedSlug) || matchesBlocklist(g.suggestedTitle)
  );
  if (blockedGaps.length > 0) {
    console.log(
      `[gsc-gaps] Skipped ${blockedGaps.length} blocklisted gaps: ${blockedGaps.map((g) => g.suggestedSlug).join(", ")}`
    );
  }
  const toAdd = noArticleGaps.filter((g) => !blockedGaps.includes(g));

  if (toAdd.length === 0) return { added: 0, skipped: 0, blocked: blockedGaps.length };

  // Assign priorities so GSC-discovered articles land BEFORE the
  // hardcoded content plan. New priorities start just below the lowest
  // priority already in use for this workspace/language.
  const { data: existingMax } = await db
    .from("blog_content_plan")
    .select("priority")
    .eq("workspace_id", workspaceId)
    .eq("language", language)
    .order("priority", { ascending: true })
    .limit(1);
  const minExistingPriority = existingMax?.[0]?.priority ?? 100;
  const startPriority = Math.max(1, minExistingPriority - toAdd.length);

  let added = 0;
  let skipped = 0;
  for (let i = 0; i < toAdd.length; i++) {
    const gap = toAdd[i];
    const category = inferCategoryFromQuery(gap.query, productSlug);
    const { error } = await db.from("blog_content_plan").insert({
      workspace_id: workspaceId,
      language,
      slug: gap.suggestedSlug,
      title: gap.suggestedTitle,
      category,
      template_id: "problem-solution",
      primary_keyword: gap.query,
      secondary_keywords: [],
      word_count: "2500-3500",
      content_brief: `Skriv en komplett guide som svarar på sökfrågan "${gap.query}". Målgruppen söker aktivt efter detta (${gap.impressions} impressions senaste 30 dagar, vår nuvarande position är ${gap.avgPosition.toFixed(1)}). Täck ämnet grundligt med vetenskapligt stöd.`,
      product_slug: productSlug,
      priority: startPriority + i,
      status: "planned",
      source: "gsc_gap",
    });
    if (error) {
      // Likely a uniqueness conflict from a race — count as skip
      skipped++;
      console.warn(`[gsc-gaps] Insert failed for ${gap.suggestedSlug}: ${error.message}`);
    } else {
      added++;
    }
  }

  return { added, skipped, blocked: blockedGaps.length };
}

/**
 * Infer a sensible blog category from a search query + product context.
 *
 * Previously hardcoded as "Kollagen" which is wrong for Hydro13 queries
 * about hud/skin and very wrong for HappySleep queries about sleep.
 *
 * Heuristic: keyword match against known category buckets. Falls back to
 * product-default if no match (collagen for hydro13, sleep for happysleep).
 */
function inferCategoryFromQuery(query: string, productSlug: string): string {
  const q = query.toLowerCase();

  // Sleep/pillow keywords -> HappySleep categories
  if (/snark|snor|sömn|somn|sov|kudde|pude|pute|nack|hovedp|nacke|insomnia/i.test(q)) {
    if (/snark|snor/.test(q)) return "Sömnproblem";
    if (/nack|hovedp|nacke|hodepute/.test(q)) return "Sömnergonomi";
    if (/insomnia|somn|sömn|sov.{0,8}prob/.test(q)) return "Sömnproblem";
    return "Sömnhälsa";
  }

  // Skin/beauty -> Hydro13 sub-category
  if (/hud|skin|rynkor|rynker|cellulit|stretchm/i.test(q)) return "Hud";

  // Joints/hair/nails -> Hydro13 specific buckets
  if (/leder|led|gikt|artros/i.test(q)) return "Leder";
  if (/hår|hair|naglar|negl|hårfall/i.test(q)) return "Hår och naglar";

  // Collagen subtypes
  if (/marint|fisk|bovin/i.test(q)) return "Kollagentyper";
  if (/vegan|växt|vaxt/i.test(q)) return "Alternativ";

  // Comparison content
  if (/vs |eller |jämför|jamfor|skillnad/i.test(q)) return "Jämförelser";

  // Buying/best-of
  if (/bäst|bedst|best|test|guide|köp|kop|kjop/i.test(q)) return "Köpguider";

  // Product-default fallback
  if (productSlug === "hydro13") return "Kollagen";
  if (productSlug === "happysleep") return "Sömnhälsa";
  return "Guider";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeQuery(q: string): string {
  return q
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[!?.,;:]/g, "")
    .replace(/\b(2024|2025|2026|2027)\b/g, "")
    .trim();
}

function keywordToSlug(q: string): string {
  return q
    .toLowerCase()
    .trim()
    .replace(/å|ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/é|è|ê/g, "e")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function keywordToTitle(q: string): string {
  const clean = q.trim();
  // Capitalize first letter; keep rest as-is since queries are user-entered lowercase
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function extractPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname;
  } catch {
    return url;
  }
}
