import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET() {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await db
    .from("meta_campaign_mappings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("product")
    .order("country");

  if (error) {
    return safeError(error, "Failed to fetch campaign mappings");
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const { product, country, meta_campaign_id, meta_campaign_name, template_adset_id, template_adset_name, format } =
    (await req.json()) as {
      product: string;
      country: string;
      meta_campaign_id: string;
      meta_campaign_name?: string;
      template_adset_id?: string;
      template_adset_name?: string;
      format?: string;
    };

  if (!product || !country || !meta_campaign_id) {
    return NextResponse.json(
      { error: "product, country, and meta_campaign_id are required" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await db
    .from("meta_campaign_mappings")
    .upsert(
      {
        workspace_id: workspaceId,
        product,
        country,
        meta_campaign_id,
        meta_campaign_name: meta_campaign_name ?? null,
        template_adset_id: template_adset_id ?? null,
        template_adset_name: template_adset_name ?? null,
        format: format ?? "image",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "product,country,format" }
    )
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to save campaign mapping");
  }

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { error } = await db
    .from("meta_campaign_mappings")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId);

  if (error) {
    return safeError(error, "Failed to delete campaign mapping");
  }

  return NextResponse.json({ ok: true });
}
