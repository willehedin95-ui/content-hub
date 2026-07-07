import type { createServerSupabase } from "@/lib/supabase-admin";

type Db = ReturnType<typeof createServerSupabase>;

const STALE_MS = 10 * 60 * 1000;
const STUCK_STATUSES = ["publishing", "translating"];

export interface StaleCheckTranslation {
  id: string;
  status?: string | null;
  updated_at?: string | null;
}

/**
 * Recover translations stuck in "publishing"/"translating" for >10 minutes
 * by flipping them to "error". Extracted from the page detail view
 * (src/app/pages/[id]/page.tsx) so the list view can heal rows too -
 * previously recovery required someone to open that exact page's detail
 * view (audit 2026-07-07, L5).
 *
 * Returns the set of translation ids that were recovered. Callers should
 * patch their local copies (status -> "error") for the returned ids.
 */
export async function recoverStuckTranslations(
  db: Db,
  translations: StaleCheckTranslation[]
): Promise<Set<string>> {
  const now = Date.now();
  const stuckIds = translations
    .filter(
      (t) =>
        t.status &&
        STUCK_STATUSES.includes(t.status) &&
        t.updated_at &&
        now - new Date(t.updated_at).getTime() > STALE_MS
    )
    .map((t) => t.id);

  if (stuckIds.length === 0) return new Set();

  const { error } = await db
    .from("translations")
    .update({
      status: "error",
      publish_error: "Stuck in publishing/translating for over 10 minutes - auto-recovered",
      publish_step: null,
      updated_at: new Date().toISOString(),
    })
    .in("id", stuckIds)
    .in("status", STUCK_STATUSES);

  if (error) {
    console.error(`[stale-translations] recovery update failed: ${error.message}`);
    return new Set();
  }

  return new Set(stuckIds);
}
