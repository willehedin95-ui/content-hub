import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { writeCaption, type SocialKind } from "@/lib/social-caption";

export const maxDuration = 800;

// POST - write captions for every future draft that has none, in time order
// (each new caption is fed in as "recent" so they don't repeat each other).
export async function POST() {
  const db = createServerSupabase();
  const ws = await getWorkspaceId();
  const { data: w } = await db.from("workspaces").select("settings").eq("id", ws).single();
  const brief = String((((w?.settings as Record<string, unknown>)?.social ?? {}) as Record<string, unknown>).brand_brief ?? "");
  const { data: posts } = await db.from("social_posts").select("*").eq("workspace_id", ws).eq("status", "draft").eq("caption", "").order("scheduled_at");
  const { data: written } = await db.from("social_posts").select("caption").eq("workspace_id", ws).neq("caption", "").order("scheduled_at", { ascending: false }).limit(8);
  const recent = (written ?? []).map((x) => x.caption);
  let done = 0; const errors: string[] = [];
  for (const p of posts ?? []) {
    try {
      const r = await writeCaption({ imageUrls: p.media_urls, kind: p.kind as SocialKind, brief, recent, format: p.format });
      const caption = r.hashtags.length ? `${r.caption}\n\n${r.hashtags.join(" ")}` : r.caption;
      // Only fill if still empty - William may have typed one meanwhile.
      await db.from("social_posts").update({ caption, updated_at: new Date().toISOString() }).eq("id", p.id).eq("caption", "");
      recent.unshift(r.caption); done++;
    } catch (e) { errors.push(e instanceof Error ? e.message : String(e)); }
  }
  return NextResponse.json({ done, total: posts?.length ?? 0, errors });
}
