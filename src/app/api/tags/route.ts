import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET() {
  const db = createServerSupabase();

  const [pagesResult, jobsResult] = await Promise.all([
    db.from("pages").select("tags"),
    db.from("image_jobs").select("tags"),
  ]);

  const allTags = new Set<string>();
  for (const row of [...(pagesResult.data ?? []), ...(jobsResult.data ?? [])]) {
    for (const tag of (row as { tags: string[] | null }).tags ?? []) {
      allTags.add(tag);
    }
  }

  return NextResponse.json({ tags: Array.from(allTags).sort() });
}
