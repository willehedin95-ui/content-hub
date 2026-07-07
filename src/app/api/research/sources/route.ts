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
  const { domain, name, platform, is_own_brand, language, config } = body;
  const validPlatforms = [
    "trustpilot", "manual_import", "reddit", "amazon", "facebook_group",
    "apify_instagram", "apify_facebook", "apify_tiktok",
  ];
  const sourcePlatform = validPlatforms.includes(platform) ? platform : "trustpilot";

  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  // Validate per-platform requirements
  if (sourcePlatform === "trustpilot" && !domain) {
    return NextResponse.json(
      { error: "domain is required for Trustpilot sources" },
      { status: 400 }
    );
  }
  if (sourcePlatform === "reddit" && !domain) {
    return NextResponse.json(
      { error: "Subreddit name or search query is required" },
      { status: 400 }
    );
  }
  if (sourcePlatform === "amazon" && !domain) {
    return NextResponse.json(
      { error: "ASIN or Amazon URL is required" },
      { status: 400 }
    );
  }
  if (sourcePlatform.startsWith("apify_") && !domain) {
    return NextResponse.json(
      { error: "URL(s) or search query is required" },
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

  // Resolve external info for Trustpilot only
  let externalId: string | null = null;
  if (sourcePlatform === "trustpilot") {
    const info = await getBusinessInfo(sourceDomain);
    if (info) {
      externalId = info.id;
    }
  }

  // For Amazon, extract and validate ASIN
  let finalDomain = sourceDomain;
  if (sourcePlatform === "amazon") {
    const { extractAsin } = await import("@/lib/amazon");
    const asin = extractAsin(sourceDomain);
    if (!asin) {
      return NextResponse.json(
        { error: "Could not extract a valid ASIN from the provided URL" },
        { status: 400 }
      );
    }
    finalDomain = asin; // Store just the ASIN
  }

  // For Reddit, clean up subreddit name (strip r/ prefix)
  if (sourcePlatform === "reddit") {
    finalDomain = sourceDomain.replace(/^r\//, "").trim();
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("research_sources")
    .upsert(
      {
        workspace_id: workspaceId,
        platform: sourcePlatform,
        name,
        domain: finalDomain,
        external_id: externalId,
        is_own_brand: is_own_brand ?? false,
        language: language ?? null,
        config: config ?? null,
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

  // Whitelist mutable fields. Spreading the raw body previously allowed
  // overwriting anything, including workspace_id (moving a source into
  // another brand's workspace) and scan-state columns.
  const ALLOWED_PATCH_FIELDS = [
    "name",
    "domain",
    "platform",
    "is_own_brand",
    "language",
    "config",
    "status",
  ] as const;
  const safeUpdates: Record<string, unknown> = {};
  for (const field of ALLOWED_PATCH_FIELDS) {
    if (field in updates) safeUpdates[field] = updates[field];
  }
  if (Object.keys(safeUpdates).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("research_sources")
    .update({ ...safeUpdates, updated_at: new Date().toISOString() })
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
