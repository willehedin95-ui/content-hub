// Public: serves a published form's config to the embed runtime.
// GET /api/forms/config?workspace=hydro13&slug=kontakt&market=se

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-admin";
import { getFormsCORSHeaders, handleFormsOptions } from "../_cors";
import type { FormRow } from "@/types/forms";

export async function OPTIONS(req: NextRequest) {
  return handleFormsOptions(req.headers.get("origin"));
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");
  const cors = getFormsCORSHeaders(origin);

  const workspaceSlug = (req.nextUrl.searchParams.get("workspace") || "").trim().toLowerCase();
  const slug = (req.nextUrl.searchParams.get("slug") || "").trim().toLowerCase();
  const market = (req.nextUrl.searchParams.get("market") || "se").trim().toLowerCase();
  if (!workspaceSlug || !slug) {
    return NextResponse.json({ error: "Missing workspace/slug" }, { status: 400, headers: cors });
  }

  const supabase = createServerSupabase();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("slug", workspaceSlug)
    .single<{ id: string }>();
  if (!workspace) {
    return NextResponse.json({ error: "Unknown workspace" }, { status: 404, headers: cors });
  }

  const { data: form } = await supabase
    .from("forms")
    .select("id, slug, market, name, config")
    .eq("workspace_id", workspace.id)
    .eq("slug", slug)
    .eq("market", market)
    .eq("status", "published")
    .single<Pick<FormRow, "id" | "slug" | "market" | "name" | "config">>();
  if (!form) {
    return NextResponse.json({ error: "Form not found" }, { status: 404, headers: cors });
  }

  return NextResponse.json(
    { form },
    { headers: { ...cors, "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
  );
}
