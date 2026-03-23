/**
 * Auto-assign landing pages to concepts based on product + pain point + usage history.
 *
 * Extracted from swipe-competitor.ts so all concept flows can use it.
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
  // If a specific pain point is selected, try to find a matching published page first
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

  // Fall back to most-used page from recent concepts
  const { data: pushedJobs } = await db
    .from("image_jobs")
    .select("landing_page_id")
    .eq("workspace_id", workspaceId)
    .eq("product", productSlug)
    .not("landing_page_id", "is", null)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!pushedJobs?.length) {
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

  return bestPage;
}
