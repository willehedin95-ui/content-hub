import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { cropFromOriginal } from "@/lib/social-crop";

// POST {id, index, x, y, w, h} - recrop one image of a post from its original.
export async function POST(req: NextRequest) {
  const db = createServerSupabase();
  const ws = await getWorkspaceId();
  const b = await req.json().catch(() => ({}));
  const { id, index } = b as { id?: string; index?: number };
  if (!id || typeof index !== "number") return NextResponse.json({ error: "id och index krävs" }, { status: 400 });
  const { data: post } = await db.from("social_posts").select("*").eq("id", id).eq("workspace_id", ws).single();
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (post.status === "publishing" || post.status === "posted") return NextResponse.json({ error: "inlägget är redan publicerat" }, { status: 409 });
  const originals: string[] = post.original_urls ?? post.media_urls;
  const original = originals[index] ?? post.media_urls[index];
  if (!original) return NextResponse.json({ error: "ingen bild på den platsen" }, { status: 400 });
  try {
    const url = await cropFromOriginal(db, ws, original, { x: b.x, y: b.y, w: b.w, h: b.h });
    const media = [...post.media_urls]; media[index] = url;
    const orig = [...(post.original_urls ?? post.media_urls)];
    const { data, error } = await db.from("social_posts").update({ media_urls: media, original_urls: orig, updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ post: data });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
