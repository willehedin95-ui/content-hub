import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
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

/**
 * PUT merges the provided settings into the workspace's existing settings
 * via the Postgres RPC `merge_workspace_settings` (atomic JSONB `||` merge).
 *
 * Why merge instead of overwrite:
 *   - Prevents concurrent writers from clobbering each other's keys.
 *   - 2026-04-16: see resilience-audit. Old behavior was `update({ settings })`
 *     which replaced the entire JSONB blob. Two tabs open = last writer wins.
 *
 * Semantics:
 *   - Shallow merge at top-level keys (`a || b` = right-wins per key).
 *   - Arrays and nested objects on a top-level key are REPLACED (not deep merged).
 *     E.g. sending `{ga4_measurement_ids: {se: "X"}}` replaces the full object.
 *     This matches prior behavior for any single PUT, just without cross-key races.
 *   - To delete a key, use a separate endpoint (not yet implemented - add if needed).
 */
export async function PUT(req: NextRequest) {
  const settings = await req.json();

  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return NextResponse.json(
      { error: "Settings payload must be a JSON object" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await db.rpc("merge_workspace_settings", {
    p_workspace_id: workspaceId,
    p_settings: settings,
  });

  if (error) {
    return safeError(error, "Failed to save settings");
  }

  if (data === null) {
    return NextResponse.json(
      { error: `Workspace ${workspaceId} not found` },
      { status: 404 }
    );
  }

  return NextResponse.json(data);
}
