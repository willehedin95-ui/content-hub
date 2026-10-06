import type { SupabaseClient } from "@supabase/supabase-js";
import { arrange, type Arrangeable } from "@/lib/social-arrange";

const COLS = "id,scheduled_at,kind,format,source,status";
/** Approved posts due within this window keep their time - they may already be announced or checked. */
const LOCK_MS = 24 * 3600_000;

/**
 * Put the whole queue of a workspace in Claude's order (see social-arrange.ts).
 * Runs after every upload and from the "Fördela" button. Drafts and approved
 * posts more than 24 h away move; published, publishing and soon-due approved
 * posts stay where they are.
 */
export async function arrangeQueue(db: SupabaseClient, ws: string, dryRun = false): Promise<{ moved: number; plan: { id: string; scheduled_at: string }[] }> {
  const now = Date.now();
  const soon = new Date(now + 15 * 60_000).toISOString();
  const { data: future } = await db.from("social_posts").select(COLS).eq("workspace_id", ws)
    .in("status", ["draft", "approved", "publishing"]).gte("scheduled_at", soon);
  const { data: past } = await db.from("social_posts").select(COLS).eq("workspace_id", ws)
    .neq("status", "failed").lt("scheduled_at", soon).order("scheduled_at", { ascending: false }).limit(6);
  const rows = (future ?? []) as (Arrangeable & { status: string })[];
  const movable = rows.filter((p) => p.status === "draft" || (p.status === "approved" && new Date(p.scheduled_at).getTime() - now > LOCK_MS));
  const fixed = rows.filter((p) => !movable.includes(p));
  const plan = arrange(movable, fixed, ((past ?? []) as Arrangeable[]).reverse());
  const same = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();
  if (dryRun) return { moved: plan.filter((p) => !same(movable.find((m) => m.id === p.id)!.scheduled_at, p.scheduled_at)).length, plan };
  let moved = 0;
  for (const p of plan) {
    const before = movable.find((x) => x.id === p.id)!;
    if (same(before.scheduled_at, p.scheduled_at)) continue;
    // No unique index on scheduled_at, so posts can swap times directly.
    const { error } = await db.from("social_posts").update({ scheduled_at: p.scheduled_at, updated_at: new Date().toISOString() })
      .eq("id", p.id).in("status", ["draft", "approved"]);
    if (!error) moved++;
  }
  return { moved, plan };
}
