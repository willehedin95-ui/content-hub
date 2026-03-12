import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

export async function GET() {
  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await db
    .from("market_product_urls")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("country")
    .order("product");

  if (error) {
    return safeError(error, "Failed to fetch market URLs");
  }

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const { product, country, url } = (await req.json()) as {
    product: string;
    country: string;
    url: string;
  };

  if (!product || !country) {
    return NextResponse.json(
      { error: "product and country are required" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();
  const workspaceId = await getWorkspaceId();

  const { data, error } = await db
    .from("market_product_urls")
    .upsert(
      {
        product,
        country,
        url: url || "",
        updated_at: new Date().toISOString(),
        workspace_id: workspaceId,
      },
      { onConflict: "product,country" }
    )
    .select()
    .single();

  if (error) {
    return safeError(error, "Failed to save market URL");
  }

  return NextResponse.json(data);
}
