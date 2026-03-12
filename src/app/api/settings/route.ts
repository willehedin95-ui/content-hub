import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { getWorkspaceId } from "@/lib/workspace";
import { safeError } from "@/lib/api-error";

export async function GET() {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await db
    .from("workspaces")
    .select("settings")
    .eq("id", workspaceId)
    .single();

  if (error) {
    // Fallback to legacy app_settings table
    const { data: legacy } = await db
      .from("app_settings")
      .select("settings")
      .limit(1)
      .single();
    return NextResponse.json(legacy?.settings ?? {});
  }

  return NextResponse.json(data?.settings ?? {});
}

export async function PUT(req: NextRequest) {
  const settings = await req.json();
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { error } = await db
    .from("workspaces")
    .update({ settings, updated_at: new Date().toISOString() })
    .eq("id", workspaceId);

  if (error) {
    return safeError(error, "Failed to save settings");
  }

  return NextResponse.json(settings);
}
