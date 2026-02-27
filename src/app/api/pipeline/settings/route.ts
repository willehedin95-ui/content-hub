import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";

export async function GET() {
  const db = createServerSupabase();
  const { data, error } = await db
    .from("pipeline_settings")
    .select("*")
    .order("product")
    .order("country");

  if (error) return safeError(error, "Failed to fetch pipeline settings");
  return NextResponse.json(data ?? []);
}

export async function PUT(req: NextRequest) {
  const { product, country, target_cpa, currency } = await req.json();
  if (!product || !country || target_cpa == null) {
    return NextResponse.json(
      { error: "product, country, and target_cpa are required" },
      { status: 400 }
    );
  }

  const db = createServerSupabase();
  const { data: existing } = await db
    .from("pipeline_settings")
    .select("id")
    .eq("product", product)
    .eq("country", country)
    .single();

  if (existing) {
    const { error } = await db
      .from("pipeline_settings")
      .update({ target_cpa, currency, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return safeError(error, "Failed to update pipeline setting");
  } else {
    const { error } = await db
      .from("pipeline_settings")
      .insert({ product, country, target_cpa, currency: currency || "USD" });
    if (error) return safeError(error, "Failed to create pipeline setting");
  }

  return NextResponse.json({ ok: true });
}
