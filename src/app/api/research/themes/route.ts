import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET() {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace" }, { status: 401 });
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("research_themes")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .order("evidence_count", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
