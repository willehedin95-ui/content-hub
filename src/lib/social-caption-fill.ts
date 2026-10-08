import type { SupabaseClient } from "@supabase/supabase-js";
import { writeCaption, type SocialKind } from "@/lib/social-caption";

/**
 * Write captions for every future draft that has none, in time order. Each new
 * caption is fed in as "recent" so they don't repeat each other. Used by the
 * "Skriv alla bildtexter" button and automatically after every upload.
 */
export async function fillMissingCaptions(db: SupabaseClient, ws: string): Promise<{ done: number; total: number; errors: string[] }> {
  const { data: w } = await db.from("workspaces").select("settings").eq("id", ws).single();
  const brief = String((((w?.settings as Record<string, unknown>)?.social ?? {}) as Record<string, unknown>).brand_brief ?? "");
  const { data: posts } = await db.from("social_posts").select("*").eq("workspace_id", ws).eq("status", "draft").eq("caption", "").order("scheduled_at");
  // Every caption already in the feed or the queue, so a new one does not reuse an opening (it only saw 8 before).
  const { data: written } = await db.from("social_posts").select("caption").eq("workspace_id", ws).neq("caption", "").neq("status", "failed").order("scheduled_at", { ascending: false }).limit(40);
  const recent = (written ?? []).map((x) => x.caption);
  let done = 0; const errors: string[] = [];
  for (const p of posts ?? []) {
    try {
      const r = await writeCaption({ imageUrls: p.media_urls, kind: p.kind as SocialKind, brief, recent, format: p.format, scheduledAt: p.scheduled_at });
      const caption = r.hashtags.length ? `${r.caption}\n\n${r.hashtags.join(" ")}` : r.caption;
      // Only fill if still empty - William may have typed one meanwhile.
      await db.from("social_posts").update({ caption, updated_at: new Date().toISOString() }).eq("id", p.id).eq("caption", "");
      recent.unshift(r.caption); done++;
    } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
  }
  return { done, total: posts?.length ?? 0, errors };
}
