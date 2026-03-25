import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { getBusinessInfo } from "@/lib/trustpilot";
import { safeError } from "@/lib/api-error";

export async function GET() {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace" }, { status: 401 });
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("research_sources")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace" }, { status: 401 });
  }

  const body = await req.json();
  const { domain, name, platform, is_own_brand, language } = body;
  const isManual = platform === "manual_import";

  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  if (!isManual && !domain) {
    return NextResponse.json(
      { error: "domain is required for Trustpilot sources" },
      { status: 400 }
    );
  }

  // Auto-generate slug domain for manual sources if not provided
  const sourceDomain =
    domain ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

  // Try to resolve Trustpilot business info (skip for manual imports)
  let externalId: string | null = null;
  if (!isManual) {
    const info = await getBusinessInfo(sourceDomain);
    if (info) {
      externalId = info.id;
    }
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("research_sources")
    .upsert(
      {
        workspace_id: workspaceId,
        platform: isManual ? "manual_import" : "trustpilot",
        name,
        domain: sourceDomain,
        external_id: externalId,
        is_own_brand: is_own_brand ?? false,
        language: language ?? null,
        status: "active",
      },
      { onConflict: "workspace_id,platform,domain" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const workspaceId = await getWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace" }, { status: 401 });
  }

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("research_sources")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  try {
    const workspaceId = await getWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace" }, { status: 401 });
    }

    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const db = createServerSupabase();

    // Verify source belongs to this workspace
    const { data: source } = await db
      .from("research_sources")
      .select("id, name")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .single();

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    // Get nugget IDs for this source (needed to clean up nugget_themes)
    const { data: nuggets } = await db
      .from("research_nuggets")
      .select("id")
      .eq("source_id", id);

    const nuggetIds = (nuggets ?? []).map((n) => n.id);

    // Delete nugget-theme links first
    if (nuggetIds.length > 0) {
      await db
        .from("research_nugget_themes")
        .delete()
        .in("nugget_id", nuggetIds);
    }

    // Delete all nuggets for this source
    const { count: nuggetsRemoved } = await db
      .from("research_nuggets")
      .delete({ count: "exact" })
      .eq("source_id", id);

    // Delete the source itself
    await db.from("research_sources").delete().eq("id", id);

    return NextResponse.json({
      deleted: true,
      nuggets_removed: nuggetsRemoved ?? 0,
    });
  } catch (e) {
    return safeError(e, "Failed to delete source");
  }
}
