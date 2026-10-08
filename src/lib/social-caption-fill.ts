import type { SupabaseClient } from "@supabase/supabase-js";
import { writeCaption, type SocialKind } from "@/lib/social-caption";

const WORN = /tio sekunder|det vackraste|inte magi|för din skull/i;

interface Row { id: string; scheduled_at: string; caption: string; status: string }

/**
 * What a caption needs to know about the feed: the brief, the posts around it
 * (so it says something else) and captions William approved (for tone).
 * Approved and published captions are his - he edited every one of them by
 * hand on 2026-10-08 - so they are the style reference, not rules.
 */
export async function loadCaptionContext(db: SupabaseClient, ws: string) {
  const { data: w } = await db.from("workspaces").select("settings").eq("id", ws).single();
  const brief = String((((w?.settings as Record<string, unknown>)?.social ?? {}) as Record<string, unknown>).brand_brief ?? "");
  const { data } = await db.from("social_posts").select("id,scheduled_at,caption,status").eq("workspace_id", ws).neq("status", "failed").order("scheduled_at");
  const rows = (data ?? []) as Row[];
  const approved = rows.filter((r) => (r.status === "approved" || r.status === "posted") && r.caption && !WORN.test(r.caption)).map((r) => r.caption);
  return { brief, rows, approved };
}

/** Captions of the posts just before and after `at` in the feed (not the post itself). */
export function neighbours(rows: Row[], at: string, selfId?: string, before = 8, after = 4): string[] {
  const t = new Date(at).getTime();
  const others = rows.filter((r) => r.id !== selfId && r.caption);
  const prev = others.filter((r) => new Date(r.scheduled_at).getTime() < t).slice(-before).reverse();
  const next = others.filter((r) => new Date(r.scheduled_at).getTime() > t).slice(0, after);
  return [...prev, ...next].map((r) => r.caption);
}

/** A random handful of approved captions, so the tone examples vary between calls. */
export function sampleExamples(approved: string[], n = 10): string[] {
  return [...approved].sort(() => Math.random() - 0.5).slice(0, n);
}

/**
 * Write captions for every future draft that has none, in time order. Used by
 * the "Skriv alla bildtexter" button and automatically after every upload.
 */
export async function fillMissingCaptions(db: SupabaseClient, ws: string): Promise<{ done: number; total: number; errors: string[] }> {
  const ctx = await loadCaptionContext(db, ws);
  const { data: posts } = await db.from("social_posts").select("*").eq("workspace_id", ws).eq("status", "draft").eq("caption", "").order("scheduled_at");
  let done = 0; const errors: string[] = [];
  for (const p of posts ?? []) {
    try {
      const r = await writeCaption({ imageUrls: p.media_urls, kind: p.kind as SocialKind, brief: ctx.brief, recent: neighbours(ctx.rows, p.scheduled_at, p.id), examples: sampleExamples(ctx.approved), format: p.format, scheduledAt: p.scheduled_at });
      const caption = r.hashtags.length ? `${r.caption}\n\n${r.hashtags.join(" ")}` : r.caption;
      // Only fill if still empty - William may have typed one meanwhile.
      await db.from("social_posts").update({ caption, updated_at: new Date().toISOString() }).eq("id", p.id).eq("caption", "");
      // The next draft must see this one as a neighbour.
      const row = ctx.rows.find((x) => x.id === p.id); if (row) row.caption = caption;
      done++;
    } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
  }
  return { done, total: posts?.length ?? 0, errors };
}
