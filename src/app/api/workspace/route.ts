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
//
// 2026-04-16: `settings` is now merged atomically via `merge_workspace_settings`
// RPC instead of overwritten, to prevent the same read-modify-write race that
// wiped the halsobladet manifest. See resilience-audit-2026-04-16.md.
// Callers (e.g. SeoSettings.tsx) no longer need to GET+client-merge+PATCH.
export async function PATCH(req: NextRequest) {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();
  const body = await req.json();

  // Only allow updating specific fields
  const allowedFields = ["name", "icon_emoji", "meta_config", "settings", "languages", "markets"];
  const updates: Record<string, unknown> = {};
  let settingsPatch: Record<string, unknown> | null = null;
  for (const key of allowedFields) {
    if (key in body) {
      if (key === "settings") {
        const val = body[key];
        if (!val || typeof val !== "object" || Array.isArray(val)) {
          return NextResponse.json(
            { error: "settings must be a JSON object" },
            { status: 400 }
          );
        }
        settingsPatch = val as Record<string, unknown>;
      } else {
        updates[key] = body[key];
      }
    }
  }

  if (Object.keys(updates).length === 0 && settingsPatch === null) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Atomically merge settings via RPC so two concurrent writers can't clobber.
  if (settingsPatch !== null) {
    const { error: mergeError } = await db.rpc("merge_workspace_settings", {
      p_workspace_id: workspaceId,
      p_settings: settingsPatch,
    });
    if (mergeError) {
      return NextResponse.json({ error: mergeError.message }, { status: 500 });
    }
  }

  // Non-settings fields still use a plain update (no cross-key race risk).
  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    const { error } = await db
      .from("workspaces")
      .update(updates)
      .eq("id", workspaceId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Return the full current workspace row (matches prior contract).
  const { data, error: selectError } = await db
    .from("workspaces")
    .select("*")
    .eq("id", workspaceId)
    .single();

  if (selectError || !data) {
    return NextResponse.json({ error: "Workspace not found after update" }, { status: 500 });
  }

  return NextResponse.json(data);
}
