import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { isValidUUID } from "@/lib/validation";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, ids } = body as {
    action: string;
    ids: string[];
  };

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });
  }

  if (ids.length > 100) {
    return NextResponse.json({ error: "Maximum 100 items per batch" }, { status: 400 });
  }

  if (!ids.every(isValidUUID)) {
    return NextResponse.json({ error: "All ids must be valid UUIDs" }, { status: 400 });
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  if (action === "delete") {
    // Fetch URLs for storage cleanup
    const { data: assets } = await db
      .from("assets")
      .select("url")
      .in("id", ids)
      .eq("workspace_id", workspaceId);

    const { error } = await db.from("assets").delete().in("id", ids).eq("workspace_id", workspaceId);
    if (error) {
      return safeError(error, "Failed to delete assets");
    }

    // Best-effort storage cleanup
    if (assets?.length) {
      const paths = assets
        .map((a) => a.url?.split("/translated-images/")[1])
        .filter(Boolean) as string[];
      if (paths.length > 0) {
        await db.storage.from("translated-images").remove(paths).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true, deleted: ids.length });
  }

  if (action === "update") {
    const { updates } = body as { updates: Record<string, unknown> };
    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    const allowed = ["category", "product", "name"];
    const clean: Record<string, unknown> = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) clean[key] = updates[key];
    }

    if (Object.keys(clean).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data, error } = await db
      .from("assets")
      .update(clean)
      .in("id", ids)
      .eq("workspace_id", workspaceId)
      .select();

    if (error) {
      return safeError(error, "Failed to update assets");
    }

    return NextResponse.json({ ok: true, updated: data });
  }

  if (action === "add_tags") {
    const { tags } = body as { tags: string[] };
    if (!Array.isArray(tags) || tags.length === 0) {
      return NextResponse.json({ error: "tags must be a non-empty array" }, { status: 400 });
    }

    const normalizedTags = tags.map((t: string) => t.trim().toLowerCase()).filter(Boolean);

    // Fetch current tags for each asset
    const { data: assets, error: fetchError } = await db
      .from("assets")
      .select("id, tags")
      .in("id", ids)
      .eq("workspace_id", workspaceId);

    if (fetchError) {
      return safeError(fetchError, "Failed to fetch assets");
    }

    // Update each asset with merged tags
    const results = await Promise.all(
      (assets || []).map(async (asset) => {
        const existing = (asset.tags as string[]) || [];
        const merged = Array.from(new Set([...existing, ...normalizedTags]));
        const { data, error } = await db
          .from("assets")
          .update({ tags: merged })
          .eq("id", asset.id)
          .select()
          .single();
        return { data, error };
      })
    );

    const updated = results.filter((r) => r.data).map((r) => r.data);
    const errors = results.filter((r) => r.error);

    if (errors.length > 0 && updated.length === 0) {
      return NextResponse.json({ error: "Failed to update any assets" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, updated });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
