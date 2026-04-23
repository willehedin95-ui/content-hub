import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const workspaceId = await getWorkspaceId().catch(() => null);
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 401 });
  }

  const db = createServerSupabase();

  // Fetch the source row — must belong to the caller's workspace
  const { data: source, error: fetchError } = await db
    .from("quizzes")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }
    return safeError(fetchError, "Failed to fetch source quiz");
  }

  if (!source) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  const tsSuffix = Date.now().toString(36).slice(-4);
  const newSlug = `${source.slug}-copy-${tsSuffix}`;

  const { data, error } = await db
    .from("quizzes")
    .insert({
      workspace_id: workspaceId,
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

  if (error) return safeError(error, "Failed to duplicate quiz");
  return NextResponse.json(data);
}
