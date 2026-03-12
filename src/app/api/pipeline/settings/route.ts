import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";

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
  const { product, country, target_cpa, target_roas, currency, testing_slots } = await req.json();
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

  const updateFields: Record<string, unknown> = {
    target_cpa,
    currency,
    updated_at: new Date().toISOString(),
  };
  if (target_roas !== undefined) {
    updateFields.target_roas = target_roas;
  }
  if (testing_slots !== undefined) {
    updateFields.testing_slots = testing_slots;
  }

  if (existing) {
    const { error } = await db
      .from("pipeline_settings")
      .update(updateFields)
      .eq("id", existing.id);
    if (error) return safeError(error, "Failed to update pipeline setting");
  } else {
    const { error } = await db
      .from("pipeline_settings")
      .insert({
        product,
        country,
        target_cpa,
        target_roas: target_roas ?? null,
        currency: currency || "USD",
        testing_slots: testing_slots ?? 5,
      });
    if (error) return safeError(error, "Failed to create pipeline setting");
  }

  return NextResponse.json({ ok: true });
}
