import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = createServerSupabase();

  // Fetch the source row
  const { data: source, error: fetchError } = await db
    .from("quizzes")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !source) {
    return NextResponse.json({ error: fetchError?.message ?? "Not found" }, { status: 404 });
  }

  const tsSuffix = Date.now().toString(36).slice(-4);
  const newSlug = `${source.slug}-copy-${tsSuffix}`;

  const { data, error } = await db
    .from("quizzes")
    .insert({
      workspace_id: source.workspace_id,
      market: source.market,
      slug: newSlug,
      name: `${source.name} (copy)`,
      status: "draft",
      data: source.data,
      settings: source.settings,
      published_url: null,
      published_at: null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
