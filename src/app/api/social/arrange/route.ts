import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { arrange } from "@/lib/social-arrange";

// POST - re-spread all future drafts/approved posts over their own slots by the mix rules.
export async function POST() {
  const db = createServerSupabase();
  const ws = await getWorkspaceId();
  const now = new Date(Date.now() + 15 * 60_000).toISOString();
  const { data: posts } = await db.from("social_posts").select("id,scheduled_at,kind,format").eq("workspace_id", ws)
    .in("status", ["draft", "approved"]).gte("scheduled_at", now);
  if (!posts?.length) return NextResponse.json({ moved: 0 });
  const { data: last } = await db.from("social_posts").select("id,scheduled_at,kind,format").eq("workspace_id", ws)
    .lt("scheduled_at", now).order("scheduled_at", { ascending: false }).limit(1);
  const plan = arrange(posts, last?.[0] ?? null);
  let moved = 0;
  for (const p of plan) {
    const before = posts.find((x) => x.id === p.id)!;
    if (before.scheduled_at === p.scheduled_at) continue;
    // Two-step through a temporary far-future time is not needed: there is no unique index on scheduled_at.
    const { error } = await db.from("social_posts").update({ scheduled_at: p.scheduled_at, updated_at: new Date().toISOString() }).eq("id", p.id);
    if (!error) moved++;
  }
  return NextResponse.json({ moved });
}
