import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET() {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await db
    .from("meta_page_config")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("country");

  if (error) {
    return safeError(error, "Failed to fetch page config");
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const { country, meta_page_id, meta_page_name } = (await req.json()) as {
    country: string;
    meta_page_id: string;
    meta_page_name?: string;
  };

  if (!country || !meta_page_id) {
    return NextResponse.json(
      { error: "country and meta_page_id are required" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await db
    .from("meta_page_config")
    .upsert(
      {
        country,
        workspace_id: workspaceId,
        meta_page_id,
        meta_page_name: meta_page_name ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "country" }
    )
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to save page config");
  }

  return NextResponse.json(data);
}
