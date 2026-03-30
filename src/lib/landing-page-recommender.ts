/**
 * Auto-assign landing pages to concepts based on:
 * 1. Pain point → page angle match (if provided)
 * 2. ROAS performance data from concept_metrics (best-performing pages first)
 * 3. Most-used page from recent concepts (fallback)
 * 4. Any published landing page for this product (last resort)
 *
 * "Published" = has at least one translation with status='published' in the translations table.
 * The pages table has NO published_at column — publish status lives on translations.
 */

import { createServerSupabase } from "@/lib/supabase-admin";

const PAIN_POINT_TO_PAGE_ANGLE: Record<string, string> = {
  "neck-pain": "neck_pain",
  "snoring": "snoring",
  "back-pain": "neutral",
  "sleep-quality": "neutral",
  "skin-aging": "neutral",
  "hair-nails": "neutral",
  "failed-supplements": "neutral",
  "complete-system": "neutral",
  "general": "neutral",
};

/**
 * Get IDs of pages that have at least one published translation (i.e. deployed to CF Pages).
 */
async function getPublishedPageIds(
  db: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  productSlug: string
): Promise<Set<string>> {
  // Get all landing pages for this workspace+product
  const { data: pages } = await db
    .from("pages")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("product", productSlug)
    .eq("content_type", "landing_page");

  if (!pages?.length) return new Set();

  const pageIds = pages.map((p) => p.id);

  // Check which have published translations
  const { data: publishedTranslations } = await db
    .from("translations")
    .select("page_id")
    .in("page_id", pageIds)
    .eq("status", "published");

  return new Set((publishedTranslations ?? []).map((t) => t.page_id as string));
}

export async function findBestLandingPage(
  db: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  productSlug: string,
  painPoint?: string
): Promise<string | null> {
  const publishedIds = await getPublishedPageIds(db, workspaceId, productSlug);

  // Priority 1: Pain point → page angle match
  if (painPoint && painPoint !== "auto-detect") {
    const pageAngle = PAIN_POINT_TO_PAGE_ANGLE[painPoint];
    if (pageAngle) {
      const { data: anglePages } = await db
        .from("pages")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("product", productSlug)
        .eq("angle", pageAngle)
        .eq("content_type", "landing_page")
        .order("created_at", { ascending: false });

      const match = anglePages?.find((p) => publishedIds.has(p.id));
      if (match) return match.id;
    }
  }

  // Priority 2: Best ROAS from concept_metrics (30-day window)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: performanceData } = await db
    .from("concept_metrics")
    .select("image_job_id, roas, spend, purchases")
    .eq("workspace_id", workspaceId)
    .gte("date", thirtyDaysAgo)
    .gt("spend", 0);

  if (performanceData?.length) {
    const jobIds = [...new Set(performanceData.map((m) => m.image_job_id))];
    const { data: jobs } = await db
      .from("image_jobs")
      .select("id, landing_page_id")
      .in("id", jobIds)
      .not("landing_page_id", "is", null);

    if (jobs?.length) {
      const jobToPage = new Map(jobs.map((j) => [j.id, j.landing_page_id as string]));

      const pageMetrics = new Map<string, { spend: number; revenue: number; concepts: number }>();
      for (const m of performanceData) {
        const pageId = jobToPage.get(m.image_job_id);
        if (!pageId) continue;
        const existing = pageMetrics.get(pageId) ?? { spend: 0, revenue: 0, concepts: 0 };
        existing.spend += (m.spend as number) ?? 0;
        existing.revenue += ((m.roas as number) ?? 0) * ((m.spend as number) ?? 0);
        existing.concepts++;
        pageMetrics.set(pageId, existing);
      }

      const MIN_SPEND_THRESHOLD = 500;
      let bestPage: string | null = null;
      let bestRoas = 0;
      for (const [pageId, metrics] of pageMetrics) {
        if (!publishedIds.has(pageId)) continue;
        if (metrics.spend < MIN_SPEND_THRESHOLD) continue;
        const roas = metrics.spend > 0 ? metrics.revenue / metrics.spend : 0;
        if (roas > bestRoas) {
          bestRoas = roas;
          bestPage = pageId;
        }
      }

      if (bestPage) return bestPage;
    }
  }

  // Priority 3: Most-used page from recent concepts
  const { data: pushedJobs } = await db
    .from("image_jobs")
    .select("landing_page_id")
    .eq("workspace_id", workspaceId)
    .eq("product", productSlug)
    .not("landing_page_id", "is", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (pushedJobs?.length) {
    const pageCounts = new Map<string, number>();
    for (const j of pushedJobs) {
      const pid = j.landing_page_id as string;
      pageCounts.set(pid, (pageCounts.get(pid) ?? 0) + 1);
    }

    // Sort by usage count, pick highest that's still published
    const sorted = [...pageCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [pid] of sorted) {
      if (publishedIds.has(pid)) return pid;
    }
  }

  // Priority 4: Any published landing page (last resort)
  if (publishedIds.size > 0) {
    // Return most recently created published page
    const { data: pages } = await db
      .from("pages")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("product", productSlug)
      .eq("content_type", "landing_page")
      .order("created_at", { ascending: false });

    const match = pages?.find((p) => publishedIds.has(p.id));
    if (match) return match.id;
  }

  return null;
}
