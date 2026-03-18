import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";

// GET — return current workspace
export async function GET() {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await db
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Mask sensitive tokens before sending to client
  if (data?.meta_config?.system_user_token) {
    const token = data.meta_config.system_user_token;
    data.meta_config.system_user_token = token.slice(0, 6) + "****" + token.slice(-4);
  }

  return NextResponse.json(data);
}

// PATCH — update workspace fields (meta_config, settings, name, etc.)
export async function PATCH(req: NextRequest) {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const body = await req.json();

  // Only allow updating specific fields
  const allowedFields = ["name", "icon_emoji", "meta_config", "settings", "languages", "markets"];
  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from("workspaces")
    .update(updates)
    .eq("id", workspaceId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
