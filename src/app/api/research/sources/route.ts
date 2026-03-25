import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { getBusinessInfo } from "@/lib/trustpilot";

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

  if (!domain || !name) {
    return NextResponse.json(
      { error: "domain and name are required" },
      { status: 400 }
    );
  }

  // Try to resolve Trustpilot business info
  let externalId: string | null = null;
  if ((platform ?? "trustpilot") === "trustpilot") {
    const info = await getBusinessInfo(domain);
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
        platform: platform ?? "trustpilot",
        name,
        domain,
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
