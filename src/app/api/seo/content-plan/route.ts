import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const { searchParams } = new URL(req.url);
  const language = searchParams.get("language") || "sv";
  const status = searchParams.get("status");

  let query = db
    .from("blog_content_plan")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("language", language)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
