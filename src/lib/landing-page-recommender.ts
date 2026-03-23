/**
 * Auto-assign landing pages to concepts based on:
 * 1. Pain point → page angle match (if provided)
 * 2. ROAS performance data from concept_metrics (best-performing pages first)
 * 3. Most-used page from recent concepts (fallback)
 * 4. Most recently published page (last resort)
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

export async function findBestLandingPage(
  db: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  productSlug: string,
  painPoint?: string
): Promise<string | null> {
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
        .not("published_at", "is", null)
        .order("published_at", { ascending: false })
        .limit(1);

      if (anglePages?.length) {
        return anglePages[0].id;
      }
    }
  }

  // Priority 2: Best ROAS from concept_metrics (30-day window)
  // Aggregate ROAS per landing page across all concepts that used it
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: performanceData } = await db
    .from("concept_metrics")
    .select("image_job_id, roas, spend, purchases")
    .eq("workspace_id", workspaceId)
    .gte("date", thirtyDaysAgo)
    .gt("spend", 0);

  if (performanceData?.length) {
    // Get landing page IDs for these concepts
    const jobIds = [...new Set(performanceData.map((m) => m.image_job_id))];
    const { data: jobs } = await db
      .from("image_jobs")
      .select("id, landing_page_id")
      .in("id", jobIds)
      .not("landing_page_id", "is", null);

    if (jobs?.length) {
      const jobToPage = new Map(jobs.map((j) => [j.id, j.landing_page_id as string]));

      // Aggregate spend + revenue per page
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

      // Verify pages are still published
      const pageIds = [...pageMetrics.keys()];
      const { data: publishedPages } = await db
        .from("pages")
        .select("id")
        .in("id", pageIds)
        .eq("workspace_id", workspaceId)
        .eq("product", productSlug)
        .not("published_at", "is", null);

      const publishedSet = new Set((publishedPages ?? []).map((p) => p.id));

      // Pick page with best ROAS (minimum spend threshold to avoid noise)
      const MIN_SPEND_THRESHOLD = 500; // SEK — need enough data to be meaningful
      let bestPage: string | null = null;
      let bestRoas = 0;
      for (const [pageId, metrics] of pageMetrics) {
        if (!publishedSet.has(pageId)) continue;
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

    let bestPage: string | null = null;
    let bestCount = 0;
    for (const [pid, count] of pageCounts) {
      if (count > bestCount) {
        bestPage = pid;
        bestCount = count;
      }
    }

    if (bestPage) return bestPage;
  }

  // Priority 4: Most recently published page (last resort)
  const { data: pages } = await db
    .from("pages")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("product", productSlug)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(1);

  return pages?.[0]?.id ?? null;
}
