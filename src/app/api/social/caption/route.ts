import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { writeCaption, type SocialKind } from "@/lib/social-caption";

export const maxDuration = 120;

// POST {id, hint?} - write a caption for a queued post and save it on the post.
export async function POST(req: NextRequest) {
  const db = createServerSupabase();
  const ws = await getWorkspaceId();
  const { id, hint } = (await req.json().catch(() => ({}))) as { id?: string; hint?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data: post } = await db.from("social_posts").select("*").eq("id", id).eq("workspace_id", ws).single();
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (post.status === "publishing" || post.status === "posted") return NextResponse.json({ error: "inlägget är redan publicerat" }, { status: 409 });
  const { data: w } = await db.from("workspaces").select("settings").eq("id", ws).single();
  const brief = String((((w?.settings as Record<string, unknown>)?.social ?? {}) as Record<string, unknown>).brand_brief ?? "");
  const { data: recent } = await db.from("social_posts").select("caption").eq("workspace_id", ws).neq("id", id).neq("caption", "").order("scheduled_at", { ascending: false }).limit(8);
  try {
    const r = await writeCaption({ imageUrls: post.media_urls, kind: post.kind as SocialKind, brief, recent: (recent ?? []).map((x) => x.caption), hint });
    const caption = r.hashtags.length ? `${r.caption}\n\n${r.hashtags.join(" ")}` : r.caption;
    const { data, error } = await db.from("social_posts").update({ caption, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ post: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
