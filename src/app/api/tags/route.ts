import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET() {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const [pagesResult, jobsResult] = await Promise.all([
    db.from("pages").select("tags").eq("workspace_id", workspaceId),
    db.from("image_jobs").select("tags").eq("workspace_id", workspaceId),
  ]);

  const allTags = new Set<string>();
  for (const row of [...(pagesResult.data ?? []), ...(jobsResult.data ?? [])]) {
    for (const tag of (row as { tags: string[] | null }).tags ?? []) {
      allTags.add(tag);
    }
  }

  return NextResponse.json({ tags: Array.from(allTags).sort() });
}
