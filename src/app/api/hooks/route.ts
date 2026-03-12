import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

// GET /api/hooks — list hooks with optional filters
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const product = url.searchParams.get("product");
  const status = url.searchParams.get("status");
  const hookType = url.searchParams.get("hook_type");
  const awarenessLevel = url.searchParams.get("awareness_level");
  const source = url.searchParams.get("source");

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  let query = db
    .from("hook_library")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (product) {
    if (product === "universal") {
      query = query.is("product", null);
    } else {
      query = query.eq("product", product);
    }
  }

  if (status) {
    query = query.eq("status", status);
  }

  if (hookType) {
    query = query.eq("hook_type", hookType);
  }

  if (awarenessLevel) {
    query = query.eq("awareness_level", awarenessLevel);
  }

  if (source) {
    query = query.eq("source", source);
  }

  const { data, error } = await query;

  if (error) return safeError(error, "Failed to fetch hooks");

  return NextResponse.json({ hooks: data ?? [] });
}

// POST /api/hooks — create a hook
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  if (!body.hook_text?.trim()) {
    return NextResponse.json(
      { error: "hook_text is required" },
      { status: 400 }
    );
  }

  const hookSource = body.source || "manual";
  const hookType = body.hook_type || "hook";

  // Manual and telegram hooks are pre-approved; auto-generated ones need review
  const hookStatus =
    hookSource === "manual" || hookSource === "telegram"
      ? "approved"
      : "unreviewed";

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await db
    .from("hook_library")
    .insert({
      hook_text: body.hook_text.trim(),
      hook_type: hookType,
      product: body.product || null,
      awareness_level: body.awareness_level || null,
      angle: body.angle || null,
      tags: body.tags || [],
      source: hookSource,
      source_url: body.source_url || null,
      notes: body.notes || null,
      status: hookStatus,
      workspace_id: workspaceId,
    })
    .select()
    .single();

  if (error) {
    // Unique constraint violation — duplicate hook_text
    if (
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { error: "A hook with this text already exists" },
        { status: 409 }
      );
    }
    return safeError(error, "Failed to create hook");
  }

  return NextResponse.json(data, { status: 201 });
}
