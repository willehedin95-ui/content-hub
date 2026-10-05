import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

/**
 * POST {ids: string[]} - the posts in the order William wants them published
 * (first = earliest). Their existing times are kept as a set and handed out
 * again in that order, so dragging only changes WHICH post goes in which slot.
 * Only drafts and approved posts can be moved.
 */
export async function POST(req: NextRequest) {
  const db = createServerSupabase();
  const ws = await getWorkspaceId();
  const { ids } = (await req.json().catch(() => ({}))) as { ids?: string[] };
  if (!Array.isArray(ids) || ids.length < 2) return NextResponse.json({ error: "ids required" }, { status: 400 });
  const { data: posts } = await db.from("social_posts").select("id,scheduled_at,status").eq("workspace_id", ws).in("id", ids);
  if (!posts || posts.length !== ids.length) return NextResponse.json({ error: "okända inlägg" }, { status: 404 });
  if (posts.some((p) => p.status !== "draft" && p.status !== "approved")) {
    return NextResponse.json({ error: "publicerade inlägg kan inte flyttas" }, { status: 409 });
  }
  const slots = posts.map((p) => p.scheduled_at).sort();
  const now = new Date().toISOString();
  for (const [i, id] of ids.entries()) {
    const cur = posts.find((p) => p.id === id)!;
    if (cur.scheduled_at === slots[i]) continue;
    const { error } = await db.from("social_posts").update({ scheduled_at: slots[i], updated_at: now }).eq("id", id).eq("workspace_id", ws);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
