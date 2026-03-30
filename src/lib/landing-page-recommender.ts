/**
 * Auto-assign landing pages to concepts based on:
 * 1. Ad copy content → page angle match (keyword detection)
 * 2. ROAS performance data from concept_metrics (best-performing pages with matching angle)
 * 3. Most-used page from recent concepts (fallback)
 * 4. Any published landing page for this product (last resort)
 *
 * "Published" = has at least one translation with status='published' in the translations table.
 * The pages table has NO published_at column — publish status lives on translations.
 */

import { createServerSupabase } from "@/lib/supabase-admin";

/**
 * Keyword patterns that map ad copy content → page angles.
 * Order matters: first match wins. More specific patterns first.
 * Includes Swedish, Norwegian, Danish keywords.
 */
const ANGLE_KEYWORDS: Array<{ angle: string; patterns: RegExp }> = [
  {
    angle: "snoring",
    patterns: /snor[kea]|snark|snarke|snurke|apn[eé]|cpap|luftvej|andning|breathing|airway/i,
  },
  {
    angle: "neck_pain",
    patterns: /nacke|nakke|neck|cervical|huvudvärk|hodepine|headache|stel\b|stiv\b|nacksmärt|nakkesmert/i,
  },
];

interface PageWithAngle {
  id: string;
  angle: string | null;
}

/**
 * Detect which page angle best matches the concept's ad copy content.
 * Returns the angle string or null if no strong match.
 */
function detectAngleFromCopy(adCopyPrimary?: string | string[], adCopyHeadline?: string | string[], conceptName?: string): string | null {
  const texts: string[] = [];
  if (adCopyPrimary) {
    if (Array.isArray(adCopyPrimary)) texts.push(...adCopyPrimary);
    else texts.push(adCopyPrimary);
  }
  if (adCopyHeadline) {
    if (Array.isArray(adCopyHeadline)) texts.push(...adCopyHeadline);
    else texts.push(adCopyHeadline);
  }
  if (conceptName) texts.push(conceptName);

  const combined = texts.join(" ");
  if (!combined) return null;

  for (const { angle, patterns } of ANGLE_KEYWORDS) {
    if (patterns.test(combined)) return angle;
  }

  return null;
}

/**
 * Get IDs of pages that have at least one published translation (i.e. deployed to CF Pages).
 */
async function getPublishedPageIds(
  db: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  productSlug: string
): Promise<Set<string>> {
  const { data: pages } = await db
    .from("pages")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("product", productSlug)
    .eq("content_type", "landing_page");

  if (!pages?.length) return new Set();

  const pageIds = pages.map((p) => p.id);

  const { data: publishedTranslations } = await db
    .from("translations")
    .select("page_id")
    .in("page_id", pageIds)
    .eq("status", "published");

  return new Set((publishedTranslations ?? []).map((t) => t.page_id as string));
}

/**
 * Get all published landing pages with their angles for a workspace+product.
 */
async function getPublishedPages(
  db: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  productSlug: string,
  publishedIds: Set<string>
): Promise<PageWithAngle[]> {
  const { data: pages } = await db
    .from("pages")
    .select("id, angle")
    .eq("workspace_id", workspaceId)
    .eq("product", productSlug)
    .eq("content_type", "landing_page")
    .order("created_at", { ascending: false });

  return (pages ?? []).filter((p) => publishedIds.has(p.id)) as PageWithAngle[];
}

export async function findBestLandingPage(
  db: ReturnType<typeof createServerSupabase>,
  workspaceId: string,
  productSlug: string,
  options?: {
    painPoint?: string;
    adCopyPrimary?: string | string[];
    adCopyHeadline?: string | string[];
    conceptName?: string;
  }
): Promise<string | null> {
  const publishedIds = await getPublishedPageIds(db, workspaceId, productSlug);
  if (publishedIds.size === 0) return null;

  const publishedPages = await getPublishedPages(db, workspaceId, productSlug, publishedIds);
  if (publishedPages.length === 0) return null;

  // Priority 1: Match ad copy content to page angle via keyword detection
  const detectedAngle = detectAngleFromCopy(
    options?.adCopyPrimary,
    options?.adCopyHeadline,
    options?.conceptName
  );

  if (detectedAngle) {
    const match = publishedPages.find((p) => p.angle === detectedAngle);
    if (match) return match.id;
  }

  // Priority 2: Best ROAS from concept_metrics (30-day window)
  // If we detected an angle, prefer pages with that angle; otherwise any page
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
      const pageAngleMap = new Map(publishedPages.map((p) => [p.id, p.angle]));

      const pageMetrics = new Map<string, { spend: number; revenue: number }>();
      for (const m of performanceData) {
        const pageId = jobToPage.get(m.image_job_id);
        if (!pageId) continue;
        const existing = pageMetrics.get(pageId) ?? { spend: 0, revenue: 0 };
        existing.spend += (m.spend as number) ?? 0;
        existing.revenue += ((m.roas as number) ?? 0) * ((m.spend as number) ?? 0);
        pageMetrics.set(pageId, existing);
      }

      const MIN_SPEND_THRESHOLD = 500;
      let bestPage: string | null = null;
      let bestRoas = 0;
      for (const [pageId, metrics] of pageMetrics) {
        if (!publishedIds.has(pageId)) continue;
        if (metrics.spend < MIN_SPEND_THRESHOLD) continue;
        // If we detected an angle, only consider pages with matching angle
        if (detectedAngle && pageAngleMap.get(pageId) !== detectedAngle) continue;
        const roas = metrics.spend > 0 ? metrics.revenue / metrics.spend : 0;
        if (roas > bestRoas) {
          bestRoas = roas;
          bestPage = pageId;
        }
      }

      if (bestPage) return bestPage;

      // If angle-filtered ROAS found nothing, try without angle filter
      if (detectedAngle) {
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
  }

  // Priority 3: Most-used page from recent concepts
  const { data: recentJobs } = await db
    .from("image_jobs")
    .select("landing_page_id")
    .eq("workspace_id", workspaceId)
    .eq("product", productSlug)
    .not("landing_page_id", "is", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (recentJobs?.length) {
    const pageCounts = new Map<string, number>();
    for (const j of recentJobs) {
      const pid = j.landing_page_id as string;
      pageCounts.set(pid, (pageCounts.get(pid) ?? 0) + 1);
    }

    const sorted = [...pageCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [pid] of sorted) {
      if (publishedIds.has(pid)) return pid;
    }
  }

  // Priority 4: Any published landing page (last resort)
  return publishedPages[0]?.id ?? null;
}
